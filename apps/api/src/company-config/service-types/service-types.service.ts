import {
    Injectable,
    NotFoundException
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditOperation, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigAuditService } from '../audit/config-audit.service';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Explicit select used on all read paths.
// companyId is internal tenant data and must not appear in any response.
// ─────────────────────────────────────────────────────────────────────────────

const LIST_SELECT = {
    id: true,
    code: true,
    name: true,
    description: true,
    workflowId: true,
    sortOrder: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    workflow: {
        select: { id: true, code: true, name: true, isActive: true },
    },
} satisfies Prisma.ServiceTypeSelect;

const DETAIL_SELECT = {
    ...LIST_SELECT,
    customFields: {
        select: {
            id: true,
            code: true,
            label: true,
            type: true,
            isRequired: true,
            isActive: true,
            sortOrder: true,
        },
        orderBy: { sortOrder: 'asc' as const },
    },
} satisfies Prisma.ServiceTypeSelect;

@Injectable()
export class ServiceTypesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: ConfigAuditService,
        private readonly events: EventEmitter2,
    ) { }

    // ── Queries ───────────────────────────────────────────────────────────────

    async getServiceTypes(companyId: string) {
        return this.prisma.serviceType.findMany({
            where: { companyId },
            select: LIST_SELECT,
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });
    }

    async getServiceType(companyId: string, serviceTypeId: string) {
        const serviceType = await this.prisma.serviceType.findFirst({
            where: { id: serviceTypeId, companyId },
            select: DETAIL_SELECT,
        });
        if (!serviceType) throw new NotFoundException('Service type not found.');
        return serviceType;
    }

    // ── Commands ──────────────────────────────────────────────────────────────

    async createServiceType(
        companyId: string,
        actorId: string,
        dto: CreateServiceTypeDto,
    ) {
        const serviceType = await this.prisma.$transaction(async (tx) => {
            // Validate the optional workflowId inside the transaction so a concurrent
            // workflow deactivation cannot race past this check before the row is written.
            if (dto.workflowId !== undefined) {
                await this.assertWorkflowActive(tx, companyId, dto.workflowId);
            }

            const created = await tx.serviceType.create({
                data: {
                    companyId,
                    code: dto.code,
                    name: dto.name,
                    description: dto.description,
                    workflowId: dto.workflowId ?? null,
                    sortOrder: dto.sortOrder ?? 0,
                },
                select: LIST_SELECT,
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.CREATE,
                entityType: 'ServiceType',
                entityId: created.id,
                entityCode: created.code,
                after: {
                    code: created.code,
                    name: created.name,
                    workflowId: created.workflowId,
                    sortOrder: created.sortOrder,
                },
            });

            return created;
        });

        this.events.emit('config.service-type.created', { companyId, serviceTypeId: serviceType.id });
        return serviceType;
    }

    async updateServiceType(
        companyId: string,
        serviceTypeId: string,
        actorId: string,
        dto: UpdateServiceTypeDto,
    ) {
        const serviceType = await this.prisma.$transaction(async (tx) => {
            const before = await tx.serviceType.findFirst({
                where: { id: serviceTypeId, companyId },
                select: { id: true, code: true, name: true, description: true, workflowId: true, sortOrder: true, isActive: true },
            });
            if (!before) throw new NotFoundException('Service type not found.');

            // Validate the optional workflowId when it is explicitly set to a non-null value.
            if (dto.workflowId !== undefined && dto.workflowId !== null) {
                await this.assertWorkflowActive(tx, companyId, dto.workflowId);
            }

            const updated = await tx.serviceType.update({
                where: { id: serviceTypeId },
                // Explicit mapping prevents accidental passthrough of undeclared fields.
                data: {
                    name: dto.name,
                    description: dto.description,
                    // Explicit undefined check: null clears the workflowId; undefined leaves it unchanged.
                    ...(dto.workflowId !== undefined ? { workflowId: dto.workflowId } : {}),
                    sortOrder: dto.sortOrder,
                },
                select: LIST_SELECT,
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.UPDATE,
                entityType: 'ServiceType',
                entityId: serviceTypeId,
                entityCode: before.code,
                before: {
                    name: before.name,
                    description: before.description,
                    workflowId: before.workflowId,
                    sortOrder: before.sortOrder,
                },
                after: {
                    name: updated.name,
                    description: updated.description,
                    workflowId: updated.workflowId,
                    sortOrder: updated.sortOrder,
                },
            });

            return updated;
        });

        this.events.emit('config.service-type.updated', { companyId, serviceTypeId });
        return serviceType;
    }

    async deactivateServiceType(
        companyId: string,
        serviceTypeId: string,
        actorId: string,
    ) {
        let deactivated = false;

        await this.prisma.$transaction(async (tx) => {
            // Lock the row to serialize concurrent deactivation attempts and prevent
            // a concurrent Request creation from reading isActive = true while
            // deactivation is in progress.
            const rows = await tx.$queryRaw<
                Array<{ id: string; code: string; isActive: boolean }>
            >`
        SELECT id, code, "isActive"
        FROM "ServiceType"
        WHERE id = ${serviceTypeId} AND "companyId" = ${companyId}
        FOR UPDATE
      `;
            if (rows.length === 0) throw new NotFoundException('Service type not found.');
            const current = rows[0];
            if (!current.isActive) return; // idempotent — already inactive

            // DEFERRED: guard against open Request rows referencing this service type.
            // Once the Request model exists, add:
            //   SELECT COUNT(*)::bigint FROM "Request"
            //   WHERE "serviceTypeId" = serviceTypeId AND status NOT IN ('CLOSED', 'CANCELLED')
            // and throw ConflictException if count > 0.

            await tx.serviceType.update({
                where: { id: serviceTypeId },
                data: { isActive: false },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.DEACTIVATE,
                entityType: 'ServiceType',
                entityId: serviceTypeId,
                entityCode: current.code,
                before: { isActive: true },
                after: { isActive: false },
            });

            deactivated = true;
        });

        if (deactivated) {
            this.events.emit('config.service-type.deactivated', { companyId, serviceTypeId });
        }
    }

    async activateServiceType(
        companyId: string,
        serviceTypeId: string,
        actorId: string,
    ): Promise<void> {
        let activated = false;

        await this.prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<
                Array<{ id: string; code: string; isActive: boolean; workflowId: string | null }>
            >`
        SELECT id, code, "isActive", "workflowId"
        FROM "ServiceType"
        WHERE id = ${serviceTypeId} AND "companyId" = ${companyId}
        FOR UPDATE
      `;
            if (rows.length === 0) throw new NotFoundException('Service type not found.');
            const current = rows[0];
            if (current.isActive) return; // idempotent — already active

            // If the service type references a workflow that has since been deactivated,
            // clear the workflowId so the service type falls back to the company default.
            // The cleared workflowId is captured in the audit log so operators can trace it.
            let resolvedWorkflowId: string | null = current.workflowId;
            if (current.workflowId !== null) {
                const workflowStillActive = await tx.workflow.findFirst({
                    where: { id: current.workflowId, companyId, isActive: true },
                    select: { id: true },
                });
                if (!workflowStillActive) {
                    resolvedWorkflowId = null;
                }
            }

            const updated = await tx.serviceType.update({
                where: { id: serviceTypeId },
                data: { isActive: true, workflowId: resolvedWorkflowId },
                select: LIST_SELECT,
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.ACTIVATE,
                entityType: 'ServiceType',
                entityId: serviceTypeId,
                entityCode: current.code,
                before: { isActive: false, workflowId: current.workflowId },
                after: { isActive: true, workflowId: resolvedWorkflowId },
            });

            activated = true;
        });

        if (activated) {
            this.events.emit('config.service-type.activated', { companyId, serviceTypeId });
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async assertWorkflowActive(
        tx: Prisma.TransactionClient,
        companyId: string,
        workflowId: string,
    ): Promise<void> {
        const workflow = await tx.workflow.findFirst({
            where: { id: workflowId, companyId, isActive: true },
            select: { id: true },
        });
        if (!workflow) {
            throw new NotFoundException(
                'Workflow not found in this company, or it is inactive.',
            );
        }
    }
}
