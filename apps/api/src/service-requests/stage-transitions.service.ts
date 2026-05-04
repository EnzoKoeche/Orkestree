import {
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
    AssignmentType,
    AuditOperation,
    CompanyMembership,
    CompanyResource,
    MembershipStatus,
    PermissionAction,
    Prisma,
} from '@prisma/client';
import { ConfigAuditService } from '../company-config/audit/config-audit.service';
import { PermissionResolverService } from '../company-config/permissions/permission-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignRequestDto } from './dto/assign-request.dto';
import { TransitionStageDto } from './dto/transition-stage.dto';

// ─────────────────────────────────────────────────────────────────────────────
// StageTransitionsService
//
// Owns the state-machine logic for ServiceRequest stage transitions and
// manual assignment changes. Each public method owns its own transaction.
//
// Assignee rule resolution is extracted into resolveAssigneeRule so it can
// also be called by ServiceRequestsService during request creation.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class StageTransitionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly permissionResolver: PermissionResolverService,
        private readonly auditService: ConfigAuditService,
        private readonly events: EventEmitter2,
    ) { }

    // ── Stage Transition ──────────────────────────────────────────────────────

    async transitionStage(
        companyId: string,
        requestId: string,
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'role' | 'userId'>,
        dto: TransitionStageDto,
    ) {
        const eventPayload = await this.prisma.$transaction(async (tx) => {
            // Lock the request row for the duration of this transaction
            const [request] = await tx.$queryRaw<
                Array<{
                    id: string;
                    currentStageId: string;
                    workflowId: string;
                    isCancelled: boolean;
                }>
            >`
                SELECT id, "currentStageId", "workflowId", "isCancelled"
                FROM "ServiceRequest"
                WHERE id = ${requestId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            if (!request) throw new NotFoundException('Service request not found.');
            if (request.isCancelled) {
                throw new UnprocessableEntityException(
                    'Cannot transition a cancelled service request.',
                );
            }
            if (request.currentStageId === dto.toStageId) {
                throw new UnprocessableEntityException(
                    'Target stage is the same as the current stage.',
                );
            }

            // Verify the transition is declared in the workflow
            const transition = await tx.stageTransition.findFirst({
                where: {
                    workflowId: request.workflowId,
                    fromStageId: request.currentStageId,
                    toStageId: dto.toStageId,
                },
                select: { id: true, requiresApproval: true },
            });

            if (!transition) {
                throw new UnprocessableEntityException(
                    'This stage transition is not permitted by the workflow configuration.',
                );
            }

            // If the transition requires approval, the actor must have APPROVE permission
            if (transition.requiresApproval) {
                const canApprove = await this.permissionResolver.isAllowed(
                    actorMembership,
                    CompanyResource.REQUEST,
                    PermissionAction.APPROVE,
                );
                if (!canApprove) {
                    throw new ForbiddenException(
                        'Approving this transition requires the APPROVE permission on REQUEST.',
                    );
                }
            }

            // Verify the target stage exists and is active
            const toStage = await tx.workflowStage.findFirst({
                where: { id: dto.toStageId, workflowId: request.workflowId, isActive: true },
                select: { id: true, code: true },
            });
            if (!toStage) {
                throw new UnprocessableEntityException(
                    'Target stage not found or is inactive.',
                );
            }

            const fromStageId = request.currentStageId;

            // Update the request's current stage
            await tx.serviceRequest.update({
                where: { id: requestId },
                data: { currentStageId: dto.toStageId },
            });

            // Append stage history record
            await tx.requestStageHistory.create({
                data: {
                    companyId,
                    requestId,
                    fromStageId,
                    toStageId: dto.toStageId,
                    actorMembershipId: actorMembership.id,
                    note: dto.note ?? null,
                },
            });

            // Resolve assignee rule for the new stage and apply if one is found
            const newAssigneeMembershipId = await this.resolveAssigneeRule(
                tx,
                companyId,
                dto.toStageId,
            );
            if (newAssigneeMembershipId !== null) {
                await tx.serviceRequest.update({
                    where: { id: requestId },
                    data: { assignedMembershipId: newAssigneeMembershipId },
                });
                await tx.requestAssignment.create({
                    data: {
                        companyId,
                        requestId,
                        membershipId: newAssigneeMembershipId,
                        assignedByMembershipId: actorMembership.id,
                    },
                });
            }

            // Audit log (TRANSITION operation)
            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.TRANSITION,
                entityType: 'ServiceRequest',
                entityId: requestId,
                before: { stageId: fromStageId },
                after: { stageId: dto.toStageId, note: dto.note ?? null },
            });

            return { requestId, fromStageId, toStageId: dto.toStageId };
        });

        this.events.emit('request.transitioned', { companyId, ...eventPayload });
    }

    // ── Manual Assignment ─────────────────────────────────────────────────────

    async assignRequest(
        companyId: string,
        requestId: string,
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'role' | 'userId'>,
        dto: AssignRequestDto,
    ) {
        let eventEmitted = false;

        await this.prisma.$transaction(async (tx) => {
            // Lock the request row
            const [request] = await tx.$queryRaw<
                Array<{ id: string; isCancelled: boolean; assignedMembershipId: string | null }>
            >`
                SELECT id, "isCancelled", "assignedMembershipId"
                FROM "ServiceRequest"
                WHERE id = ${requestId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            if (!request) throw new NotFoundException('Service request not found.');
            if (request.isCancelled) {
                throw new UnprocessableEntityException(
                    'Cannot assign a cancelled service request.',
                );
            }

            // Verify the target membership is active within this company
            const targetMembership = await tx.companyMembership.findFirst({
                where: {
                    id: dto.membershipId,
                    companyId,
                    status: MembershipStatus.ACTIVE,
                },
                select: { id: true },
            });
            if (!targetMembership) {
                throw new UnprocessableEntityException(
                    'Target membership not found or is not an active member of this company.',
                );
            }

            // Idempotency: skip if already assigned to the same member
            if (request.assignedMembershipId === dto.membershipId) {
                return;
            }

            const previousAssigneeMembershipId = request.assignedMembershipId;

            await tx.serviceRequest.update({
                where: { id: requestId },
                data: { assignedMembershipId: dto.membershipId },
            });

            await tx.requestAssignment.create({
                data: {
                    companyId,
                    requestId,
                    membershipId: dto.membershipId,
                    assignedByMembershipId: actorMembership.id,
                },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.ASSIGN,
                entityType: 'ServiceRequest',
                entityId: requestId,
                before: { assignedMembershipId: previousAssigneeMembershipId },
                after: { assignedMembershipId: dto.membershipId },
            });

            eventEmitted = true;
        });

        if (eventEmitted) {
            this.events.emit('request.assigned', {
                companyId,
                requestId,
                membershipId: dto.membershipId,
            });
        }
    }

    // ── Assignee Rule Resolution ──────────────────────────────────────────────
    //
    // Resolves the automatic assignee for a stage based on its StageAssigneeRule.
    // Returns a membershipId string if an assignee was determined, null otherwise.
    // Must be called inside an open Prisma transaction.

    async resolveAssigneeRule(
        tx: Prisma.TransactionClient,
        companyId: string,
        stageId: string,
    ): Promise<string | null> {
        const rule = await tx.stageAssigneeRule.findFirst({
            where: { companyId, stageId, isActive: true },
            select: {
                id: true,
                assignmentType: true,
                role: true,
                membershipId: true,
            },
        });

        if (!rule) return null;

        switch (rule.assignmentType) {
            case AssignmentType.MANUAL:
                return null;

            case AssignmentType.USER: {
                if (!rule.membershipId) return null;
                // Verify the designated member is still active
                const member = await tx.companyMembership.findFirst({
                    where: {
                        id: rule.membershipId,
                        companyId,
                        status: MembershipStatus.ACTIVE,
                    },
                    select: { id: true },
                });
                return member?.id ?? null;
            }

            case AssignmentType.ROLE: {
                if (!rule.role) return null;
                // Pick the first active member with the configured role
                const member = await tx.companyMembership.findFirst({
                    where: {
                        companyId,
                        role: rule.role,
                        status: MembershipStatus.ACTIVE,
                    },
                    select: { id: true },
                    orderBy: { createdAt: 'asc' },
                });
                return member?.id ?? null;
            }

            case AssignmentType.ROUND_ROBIN: {
                return this.resolveRoundRobin(tx, companyId, rule.id, rule.role);
            }
        }

        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Round-robin resolution.
    //
    // Locks the cursor row with SELECT FOR UPDATE to prevent concurrent
    // transitions from reading the same cursor position.
    // Falls back to null (no assignment) if the eligible pool is empty.
    // ─────────────────────────────────────────────────────────────────────────

    private async resolveRoundRobin(
        tx: Prisma.TransactionClient,
        companyId: string,
        ruleId: string,
        role: string | null,
    ): Promise<string | null> {
        // Lock cursor row for this transaction
        const [cursorRow] = await tx.$queryRaw<
            Array<{ id: string; lastMembershipId: string | null }>
        >`
            SELECT id, "lastMembershipId"
            FROM "RoundRobinCursor"
            WHERE "ruleId" = ${ruleId}
            FOR UPDATE
        `;

        // Build eligible pool: active members with the rule's role (if set),
        // or all active members if no role filter (role = null means any role)
        const pool = await tx.companyMembership.findMany({
            where: {
                companyId,
                status: MembershipStatus.ACTIVE,
                ...(role ? { role: role as any } : {}),
            },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
        });

        if (pool.length === 0) return null;

        let nextIndex = 0;
        if (cursorRow?.lastMembershipId) {
            const lastIndex = pool.findIndex((m) => m.id === cursorRow.lastMembershipId);
            nextIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % pool.length;
        }

        const nextMember = pool[nextIndex];

        if (cursorRow) {
            await tx.roundRobinCursor.update({
                where: { id: cursorRow.id },
                data: { lastMembershipId: nextMember.id },
            });
        } else {
            await tx.roundRobinCursor.create({
                data: {
                    companyId,
                    ruleId,
                    lastMembershipId: nextMember.id,
                },
            });
        }

        return nextMember.id;
    }
}
