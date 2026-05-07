import {
    Injectable,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
    AuditOperation,
    CompanyMembership,
    MembershipStatus,
    Prisma,
    Role,
} from '@prisma/client';
import { ConfigAuditService } from '../company-config/audit/config-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { ListServiceRequestsDto } from './dto/list-service-requests.dto';
import { UpdateServiceRequestDto } from './dto/update-service-request.dto';
import { CancelRequestDto } from './dto/cancel-request.dto';
import { SetFieldValueItemDto } from './dto/set-field-value.dto';
import { FieldValuesService } from './field-values.service';
import { StageTransitionsService } from './stage-transitions.service';

// ─────────────────────────────────────────────────────────────────────────────
// Response projections
// ─────────────────────────────────────────────────────────────────────────────

const MEMBERSHIP_USER_SELECT = {
    id: true,
    user: {
        select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
        },
    },
} satisfies Prisma.CompanyMembershipSelect;

const LIST_SELECT = {
    id: true,
    number: true,
    title: true,
    description: true,
    isCancelled: true,
    cancellationReason: true,
    createdAt: true,
    updatedAt: true,
    // FK exposed (not the relation): the detail page resolves valid stage
    // transitions by GETting /config/workflows/:workflowId. Carrying the FK
    // here saves the frontend a serviceType→workflow lookup hop. Not a
    // sensitive field — composite FK (companyId, workflowId) is tenant-scoped
    // and downstream workflow access is permission-gated independently.
    workflowId: true,
    serviceType: {
        select: { id: true, code: true, name: true },
    },
    currentStage: {
        select: { id: true, code: true, name: true, color: true, isFinal: true },
    },
    client: {
        select: { id: true, number: true, name: true, type: true },
    },
    assignedMembership: {
        select: MEMBERSHIP_USER_SELECT,
    },
    createdByMembership: {
        select: MEMBERSHIP_USER_SELECT,
    },
} satisfies Prisma.ServiceRequestSelect;

const DETAIL_SELECT = {
    ...LIST_SELECT,
    stageHistory: {
        select: {
            id: true,
            fromStageId: true,
            note: true,
            createdAt: true,
            toStage: { select: { id: true, code: true, name: true } },
            actorMembership: { select: MEMBERSHIP_USER_SELECT },
        },
        orderBy: { createdAt: 'asc' as const },
    },
    assignments: {
        select: {
            id: true,
            createdAt: true,
            membership: { select: MEMBERSHIP_USER_SELECT },
            assignedByMembership: { select: MEMBERSHIP_USER_SELECT },
        },
        orderBy: { createdAt: 'desc' as const },
    },
} satisfies Prisma.ServiceRequestSelect;

// ─────────────────────────────────────────────────────────────────────────────
// ServiceRequestsService
//
// Owns creation, update, cancellation, list, and get of ServiceRequests.
// Stage transitions and assignment changes are delegated to StageTransitionsService.
// Field value read/write is delegated to FieldValuesService.
//
// Tenant scoping: all queries include companyId from membership, never from params.
// Row-level filtering for CLIENTE: list and get further filter by
// createdByMembershipId = membership.id.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ServiceRequestsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly fieldValuesService: FieldValuesService,
        private readonly stageTransitionsService: StageTransitionsService,
        private readonly auditService: ConfigAuditService,
        private readonly events: EventEmitter2,
    ) { }

    // ── Create ────────────────────────────────────────────────────────────────

    async createServiceRequest(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        dto: CreateServiceRequestDto,
    ) {
        const { companyId } = actorMembership;
        let createdRequestId: string | null = null;

        await this.prisma.$transaction(async (tx) => {
            // ── 1. Validate serviceType (must be active, must belong to company)
            const serviceType = await tx.serviceType.findFirst({
                where: { id: dto.serviceTypeId, companyId, isActive: true },
                select: { id: true, workflowId: true },
            });
            if (!serviceType) {
                throw new NotFoundException('Service type not found or is not active.');
            }

            // ── 1b. Validate client if provided (must be active, must belong to company)
            if (dto.clientId) {
                const client = await tx.client.findFirst({
                    where: { id: dto.clientId, companyId, isActive: true },
                    select: { id: true },
                });
                if (!client) {
                    throw new NotFoundException('Client not found or is not active.');
                }
            }

            // ── 2. Resolve workflow
            let workflowId = serviceType.workflowId;
            if (!workflowId) {
                const defaultWorkflow = await tx.workflow.findFirst({
                    where: { companyId, isDefault: true, isActive: true },
                    select: { id: true },
                });
                if (!defaultWorkflow) {
                    throw new UnprocessableEntityException(
                        'No active default workflow is configured for this company.',
                    );
                }
                workflowId = defaultWorkflow.id;
            }

            // ── 3. Find the initial stage
            const initialStage = await tx.workflowStage.findFirst({
                where: { workflowId, isInitial: true, isActive: true },
                select: { id: true, code: true },
            });
            if (!initialStage) {
                throw new UnprocessableEntityException(
                    'The resolved workflow has no active initial stage.',
                );
            }

            // ── 4. Validate field values (before acquiring the advisory lock to
            //       avoid holding the lock during potentially slow DB reads)
            const items = dto.fieldValues ?? [];
            await this.fieldValuesService.validateAndLoad(
                tx,
                companyId,
                dto.serviceTypeId,
                items,
            );

            // ── 5. Acquire a transaction-scoped advisory lock keyed by companyId.
            //       Serializes request number generation for this company.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId})::bigint)`;

            // ── 6. Generate sequential request number
            const [maxRow] = await tx.$queryRaw<Array<{ max: number | null }>>`
                SELECT MAX(number)::int AS max
                FROM "ServiceRequest"
                WHERE "companyId" = ${companyId}
            `;
            const requestNumber = (maxRow?.max ?? 0) + 1;

            // ── 7. Create the ServiceRequest row
            const created = await tx.serviceRequest.create({
                data: {
                    companyId,
                    number: requestNumber,
                    serviceTypeId: dto.serviceTypeId,
                    workflowId,
                    currentStageId: initialStage.id,
                    clientId: dto.clientId ?? null,
                    title: dto.title,
                    description: dto.description ?? null,
                    createdByMembershipId: actorMembership.id,
                    assignedMembershipId: null,
                },
                select: { id: true },
            });

            // ── 8. Write field values
            if (items.length > 0) {
                await this.fieldValuesService.writeFieldValues(
                    tx,
                    companyId,
                    created.id,
                    items,
                );
            }

            // ── 9. Write initial stage history (fromStageId = null → initial placement)
            await tx.requestStageHistory.create({
                data: {
                    companyId,
                    requestId: created.id,
                    fromStageId: null,
                    toStageId: initialStage.id,
                    actorMembershipId: actorMembership.id,
                    note: null,
                },
            });

            // ── 10. Apply assignee rule for the initial stage
            const assigneeMembershipId =
                await this.stageTransitionsService.resolveAssigneeRule(
                    tx,
                    companyId,
                    initialStage.id,
                );
            if (assigneeMembershipId) {
                await tx.serviceRequest.update({
                    where: { id: created.id },
                    data: { assignedMembershipId: assigneeMembershipId },
                });
                await tx.requestAssignment.create({
                    data: {
                        companyId,
                        requestId: created.id,
                        membershipId: assigneeMembershipId,
                        assignedByMembershipId: actorMembership.id,
                    },
                });
            }

            // ── 11. Write audit log
            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.CREATE,
                entityType: 'ServiceRequest',
                entityId: created.id,
                after: {
                    number: requestNumber,
                    title: dto.title,
                    serviceTypeId: dto.serviceTypeId,
                    workflowId,
                    currentStageId: initialStage.id,
                    assignedMembershipId: assigneeMembershipId ?? null,
                },
            });

            createdRequestId = created.id;
        });

        if (createdRequestId) {
            this.events.emit('request.created', { companyId, requestId: createdRequestId });
        }

        return this.getServiceRequest(actorMembership, createdRequestId!);
    }

    // ── Update ────────────────────────────────────────────────────────────────

    async updateServiceRequest(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        requestId: string,
        dto: UpdateServiceRequestDto,
    ) {
        const { companyId } = actorMembership;

        if (Object.keys(dto).length === 0) {
            return this.getServiceRequest(actorMembership, requestId);
        }

        await this.prisma.$transaction(async (tx) => {
            // Lock the row for the duration of this transaction so a concurrent
            // cancel cannot commit between our state check and the update, and so
            // the before-snapshot reflects the value we are actually overwriting.
            const [existing] = await tx.$queryRaw<
                Array<{ id: string; isCancelled: boolean; title: string; description: string | null }>
            >`
                SELECT id, "isCancelled", title, description
                FROM "ServiceRequest"
                WHERE id = ${requestId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            if (!existing) throw new NotFoundException('Service request not found.');
            if (existing.isCancelled) {
                throw new UnprocessableEntityException('Cannot update a cancelled service request.');
            }

            const updateData: Prisma.ServiceRequestUpdateInput = {};
            if (dto.title !== undefined) updateData.title = dto.title;
            if (dto.description !== undefined) updateData.description = dto.description;

            await tx.serviceRequest.update({
                where: { id: requestId },
                data: updateData,
            });

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.UPDATE,
                entityType: 'ServiceRequest',
                entityId: requestId,
                before: { title: existing.title, description: existing.description },
                after: {
                    title: dto.title ?? existing.title,
                    description: dto.description ?? existing.description,
                },
            });
        });

        return this.getServiceRequest(actorMembership, requestId);
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    async cancelServiceRequest(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        requestId: string,
        dto: CancelRequestDto,
    ) {
        const { companyId } = actorMembership;
        let eventEmitted = false;

        await this.prisma.$transaction(async (tx) => {
            const [request] = await tx.$queryRaw<
                Array<{ id: string; isCancelled: boolean; currentStageId: string }>
            >`
                SELECT id, "isCancelled", "currentStageId"
                FROM "ServiceRequest"
                WHERE id = ${requestId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            if (!request) throw new NotFoundException('Service request not found.');

            // Idempotent: already cancelled
            if (request.isCancelled) return;

            await tx.serviceRequest.update({
                where: { id: requestId },
                data: {
                    isCancelled: true,
                    cancellationReason: dto.reason ?? null,
                },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.CANCEL,
                entityType: 'ServiceRequest',
                entityId: requestId,
                before: { isCancelled: false },
                after: {
                    isCancelled: true,
                    cancellationReason: dto.reason ?? null,
                },
            });

            eventEmitted = true;
        });

        if (eventEmitted) {
            this.events.emit('request.cancelled', { companyId, requestId });
        }

        return this.getServiceRequest(actorMembership, requestId);
    }

    // ── List ──────────────────────────────────────────────────────────────────

    async listServiceRequests(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        query: ListServiceRequestsDto,
    ) {
        const { companyId } = actorMembership;

        const where: Prisma.ServiceRequestWhereInput = { companyId };

        // Row-level restriction: CLIENTE can only see their own requests
        if (actorMembership.role === Role.CLIENTE) {
            where.createdByMembershipId = actorMembership.id;
        }

        if (query.stageId !== undefined) where.currentStageId = query.stageId;
        if (query.serviceTypeId !== undefined) where.serviceTypeId = query.serviceTypeId;
        if (query.assignedMembershipId !== undefined) {
            where.assignedMembershipId = query.assignedMembershipId;
        }
        if (query.isCancelled !== undefined) where.isCancelled = query.isCancelled;

        const limit = query.limit ?? 50;
        const skip = query.skip ?? 0;

        // findMany + count in a single transaction so that pagination math stays
        // consistent under concurrent writes: page N and total never disagree.
        const [items, total] = await this.prisma.$transaction([
            this.prisma.serviceRequest.findMany({
                where,
                select: LIST_SELECT,
                orderBy: { number: 'desc' },
                take: limit,
                skip,
            }),
            this.prisma.serviceRequest.count({ where }),
        ]);

        return { items, total, limit, skip };
    }

    // ── Get ───────────────────────────────────────────────────────────────────

    async getServiceRequest(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        requestId: string,
    ) {
        const { companyId } = actorMembership;

        const where: Prisma.ServiceRequestWhereInput = { id: requestId, companyId };

        // Row-level restriction: CLIENTE can only see their own requests
        if (actorMembership.role === Role.CLIENTE) {
            where.createdByMembershipId = actorMembership.id;
        }

        const request = await this.prisma.serviceRequest.findFirst({
            where,
            select: DETAIL_SELECT,
        });

        if (!request) throw new NotFoundException('Service request not found.');
        return request;
    }

    // ── Get Field Values ──────────────────────────────────────────────────────

    async getFieldValues(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        requestId: string,
    ) {
        // Verify existence and apply CLIENTE row-level isolation before returning
        // field values. Throws NotFoundException for inaccessible requests.
        await this.getServiceRequest(actorMembership, requestId);
        return this.fieldValuesService.getFieldValues(actorMembership.companyId, requestId);
    }

    // ── Set Field Values ──────────────────────────────────────────────────────

    async setFieldValues(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        requestId: string,
        items: SetFieldValueItemDto[],
    ) {
        const { companyId } = actorMembership;

        // CLIENTE row-level isolation: if the caller cannot read the request they
        // cannot write field values on it either.
        if (actorMembership.role === Role.CLIENTE) {
            await this.getServiceRequest(actorMembership, requestId);
        }

        await this.prisma.$transaction(async (tx) => {
            // Lock the row so a concurrent cancel cannot commit between our
            // state check and the field-value upserts.
            const [request] = await tx.$queryRaw<
                Array<{ id: string; isCancelled: boolean; serviceTypeId: string }>
            >`
                SELECT id, "isCancelled", "serviceTypeId"
                FROM "ServiceRequest"
                WHERE id = ${requestId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            if (!request) throw new NotFoundException('Service request not found.');
            if (request.isCancelled) {
                throw new UnprocessableEntityException(
                    'Cannot update field values on a cancelled service request.',
                );
            }

            await this.fieldValuesService.validateAndLoad(
                tx,
                companyId,
                request.serviceTypeId,
                items,
            );
            await this.fieldValuesService.writeFieldValues(tx, companyId, requestId, items);
        });

        return this.fieldValuesService.getFieldValues(companyId, requestId);
    }
}
