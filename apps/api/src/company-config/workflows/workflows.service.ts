import {
    ConflictException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createId } from '@paralleldrive/cuid2';
import {
    AssignmentType,
    AuditOperation,
    CompanyMembership,
    MembershipStatus,
    Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigAuditService } from '../audit/config-audit.service';
import { CreateStageAssigneeRuleDto } from './dto/stage-assignee-rule.dto';
import { CreateStageTransitionDto } from './dto/stage-transition.dto';
import {
    CreateWorkflowStageDto,
    UpdateWorkflowStageDto,
} from './dto/workflow-stage.dto';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto/workflow.dto';

@Injectable()
export class WorkflowsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: ConfigAuditService,
        private readonly events: EventEmitter2,
    ) { }

    // ── Workflows ─────────────────────────────────────────────────────────────

    async createWorkflow(
        companyId: string,
        actorId: string,
        dto: CreateWorkflowDto,
    ) {
        return this.prisma.$transaction(async (tx) => {
            // If isDefault = true, swap the existing default inside the same transaction.
            if (dto.isDefault) {
                await this.clearDefaultWorkflow(tx, companyId);
            }

            const workflow = await tx.workflow.create({
                data: {
                    companyId,
                    code: dto.code,
                    name: dto.name,
                    description: dto.description,
                    isDefault: dto.isDefault ?? false,
                },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.CREATE,
                entityType: 'Workflow',
                entityId: workflow.id,
                entityCode: workflow.code,
                after: { code: workflow.code, name: workflow.name, isDefault: workflow.isDefault },
            });

            return workflow;
        });
    }

    async getWorkflows(companyId: string) {
        return this.prisma.workflow.findMany({
            where: { companyId },
            include: { stages: { orderBy: { sortOrder: 'asc' } } },
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        });
    }

    async getWorkflow(companyId: string, workflowId: string) {
        const workflow = await this.prisma.workflow.findFirst({
            where: { id: workflowId, companyId },
            include: {
                stages: { orderBy: { sortOrder: 'asc' } },
                transitions: true,
            },
        });
        if (!workflow) throw new NotFoundException('Workflow not found.');
        return workflow;
    }

    async updateWorkflow(
        companyId: string,
        workflowId: string,
        actorId: string,
        dto: UpdateWorkflowDto,
    ) {
        return this.prisma.$transaction(async (tx) => {
            const before = await tx.workflow.findFirst({
                where: { id: workflowId, companyId },
                select: { id: true, name: true, description: true },
            });
            if (!before) throw new NotFoundException('Workflow not found.');

            const updated = await tx.workflow.update({
                where: { id: workflowId },
                // Explicit mapping prevents accidental passthrough of undeclared fields
                // if the DTO is later extended (e.g., someone adds isDefault to UpdateWorkflowDto).
                data: {
                    name: dto.name,
                    description: dto.description,
                },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.UPDATE,
                entityType: 'Workflow',
                entityId: workflowId,
                before: { name: before.name, description: before.description },
                after: { name: updated.name, description: updated.description },
            });

            return updated;
        });
    }

    async setDefaultWorkflow(
        companyId: string,
        workflowId: string,
        actorId: string,
    ) {
        const workflow = await this.prisma.$transaction(async (tx) => {
            // Lock and clear current default before setting the new one.
            // Prevents concurrent calls from producing two simultaneous defaults.
            await this.clearDefaultWorkflow(tx, companyId);

            const updated = await tx.workflow.update({
                where: { id: workflowId, companyId },
                data: { isDefault: true },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.UPDATE,
                entityType: 'Workflow',
                entityId: workflowId,
                entityCode: updated.code,
                before: { isDefault: false },
                after: { isDefault: true },
            });

            return updated;
        });

        // Runs only after the transaction commits successfully.
        this.events.emit('config.workflow.default.changed', { companyId, workflowId });
        return workflow;
    }

    async deactivateWorkflow(
        companyId: string,
        workflowId: string,
        actorId: string,
    ) {
        let deactivated = false;
        await this.prisma.$transaction(async (tx) => {
            // Lock the workflow row before any checks.
            const rows = await tx.$queryRaw<Array<{ id: string; code: string; isActive: boolean; isDefault: boolean }>>`
        SELECT id, code, "isActive", "isDefault"
        FROM "Workflow"
        WHERE id = ${workflowId} AND "companyId" = ${companyId}
        FOR UPDATE
      `;
            if (rows.length === 0) throw new NotFoundException('Workflow not found.');
            const workflow = rows[0];
            if (!workflow.isActive) return; // idempotent — do not set deactivated flag

            if (workflow.isDefault) {
                throw new ConflictException(
                    'Cannot deactivate the default workflow. Set a different workflow as default first.',
                );
            }

            // Pre-write check: active service types referencing this workflow.
            const [{ count: stCount }] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "ServiceType"
        WHERE "workflowId" = ${workflowId} AND "isActive" = true
      `;
            if (stCount > 0n) {
                throw new ConflictException(
                    `${stCount} active service type(s) use this workflow. Reassign them before deactivating.`,
                );
            }

            await tx.workflow.update({
                where: { id: workflowId },
                data: { isActive: false },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.DEACTIVATE,
                entityType: 'Workflow',
                entityId: workflowId,
                entityCode: workflow.code,
                before: { isActive: true },
                after: { isActive: false },
            });

            deactivated = true;
        });

        // Emit only when the workflow actually transitioned from active to inactive.
        if (deactivated) {
            this.events.emit('config.workflow.deactivated', { companyId, workflowId });
        }
    }

    // ── Workflow Stages ───────────────────────────────────────────────────────

    async createStage(
        companyId: string,
        workflowId: string,
        actorId: string,
        dto: CreateWorkflowStageDto,
    ) {
        const stage = await this.prisma.$transaction(async (tx) => {
            // Validate inside the transaction so a concurrent workflow deactivation
            // cannot race past this check before the stage row is written.
            const workflowExists = await tx.workflow.findFirst({
                where: { id: workflowId, companyId, isActive: true },
                select: { id: true },
            });
            if (!workflowExists) throw new NotFoundException('Workflow not found.');

            if (dto.isInitial) {
                await this.clearInitialStage(tx, workflowId);
            }

            const created = await tx.workflowStage.create({
                data: {
                    companyId,
                    workflowId,
                    code: dto.code,
                    name: dto.name,
                    description: dto.description,
                    color: dto.color,
                    sortOrder: dto.sortOrder,
                    isInitial: dto.isInitial ?? false,
                    isFinal: dto.isFinal ?? false,
                },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.CREATE,
                entityType: 'WorkflowStage',
                entityId: created.id,
                entityCode: created.code,
                after: { code: created.code, name: created.name, sortOrder: created.sortOrder, isInitial: created.isInitial, isFinal: created.isFinal },
            });

            return created;
        });

        // Runs only after the transaction commits successfully.
        this.events.emit('config.workflow.stage.created', { companyId, workflowId, stageId: stage.id });
        return stage;
    }

    async getStages(companyId: string, workflowId: string) {
        await this.assertWorkflowExists(companyId, workflowId);
        return this.prisma.workflowStage.findMany({
            where: { workflowId, companyId },
            select: {
                id: true,
                code: true,
                name: true,
                description: true,
                color: true,
                sortOrder: true,
                isInitial: true,
                isFinal: true,
                isActive: true,
                assigneeRules: {
                    select: {
                        id: true,
                        assignmentType: true,
                        role: true,
                        isActive: true,
                        // Only expose the membership's role — never userId, status, or other internals.
                        membership: { select: { id: true, role: true } },
                    },
                },
            },
            orderBy: { sortOrder: 'asc' },
        });
    }

    async updateStage(
        companyId: string,
        workflowId: string,
        stageId: string,
        actorId: string,
        dto: UpdateWorkflowStageDto,
    ) {
        const updated = await this.prisma.$transaction(async (tx) => {
            const before = await tx.workflowStage.findFirst({
                where: { id: stageId, workflowId, companyId },
                select: { id: true, name: true, description: true, color: true, sortOrder: true, isFinal: true },
            });
            if (!before) throw new NotFoundException('Stage not found.');

            const result = await tx.workflowStage.update({
                where: { id: stageId },
                // Explicit mapping prevents accidental passthrough of undeclared fields.
                data: {
                    name: dto.name,
                    description: dto.description,
                    color: dto.color,
                    sortOrder: dto.sortOrder,
                    isFinal: dto.isFinal,
                },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.UPDATE,
                entityType: 'WorkflowStage',
                entityId: stageId,
                before: { name: before.name, color: before.color, sortOrder: before.sortOrder },
                after: { name: result.name, color: result.color, sortOrder: result.sortOrder },
            });

            return result;
        });

        // Runs only after the transaction commits successfully.
        this.events.emit('config.workflow.stage.updated', { companyId, workflowId, stageId });
        return updated;
    }

    async setInitialStage(
        companyId: string,
        workflowId: string,
        stageId: string,
        actorId: string,
    ) {
        return this.prisma.$transaction(async (tx) => {
            await this.clearInitialStage(tx, workflowId);

            const stage = await tx.workflowStage.update({
                where: { id: stageId, companyId, workflowId },
                data: { isInitial: true },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.UPDATE,
                entityType: 'WorkflowStage',
                entityId: stageId,
                entityCode: stage.code,
                before: { isInitial: false },
                after: { isInitial: true },
            });

            return stage;
        });
    }

    async deactivateStage(
        companyId: string,
        workflowId: string,
        stageId: string,
        actorId: string,
    ) {
        await this.prisma.$transaction(async (tx) => {
            // Lock the stage row. This serializes concurrent deactivation attempts
            // and prevents a concurrent request-creation from seeing isActive = true
            // while deactivation is in progress.
            const rows = await tx.$queryRaw<Array<{ id: string; code: string; isActive: boolean; isInitial: boolean }>>`
        SELECT id, code, "isActive", "isInitial"
        FROM "WorkflowStage"
        WHERE id = ${stageId} AND "workflowId" = ${workflowId} AND "companyId" = ${companyId}
        FOR UPDATE
      `;
            if (rows.length === 0) throw new NotFoundException('Stage not found.');
            const stage = rows[0];
            if (!stage.isActive) return; // idempotent

            if (stage.isInitial) {
                throw new ConflictException(
                    'Cannot deactivate the initial stage. Set a different stage as initial first.',
                );
            }

            // Pre-write business rule check: must be inside the transaction after the lock.
            // This check runs after acquiring the stage lock so no concurrent request
            // creation can place a new request here before this transaction commits.
            const [{ count }] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "Request"
        WHERE "currentStageId" = ${stageId}
          AND status NOT IN ('CLOSED', 'CANCELLED')
      `;
            if (count > 0n) {
                throw new ConflictException(
                    `Stage has ${count} active request(s). Reassign them before deactivating.`,
                );
            }

            await tx.workflowStage.update({
                where: { id: stageId },
                data: { isActive: false },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.DEACTIVATE,
                entityType: 'WorkflowStage',
                entityId: stageId,
                entityCode: stage.code,
                before: { isActive: true },
                after: { isActive: false },
            });
        });

        // Post-commit: cache invalidation only.
        this.events.emit('config.workflow.stage.deactivated', { companyId, workflowId, stageId });
    }

    // ── Stage Transitions ─────────────────────────────────────────────────────

    async createTransition(
        companyId: string,
        workflowId: string,
        actorId: string,
        dto: CreateStageTransitionDto,
    ) {
        // Pure input validation — no DB access needed.
        if (dto.fromStageId === dto.toStageId) {
            throw new ConflictException('A stage cannot transition to itself.');
        }

        const transition = await this.prisma.$transaction(async (tx) => {
            // Validate workflow and both stages inside the transaction so concurrent
            // deactivations cannot race past these checks before the transition is written.
            const workflowExists = await tx.workflow.findFirst({
                where: { id: workflowId, companyId, isActive: true },
                select: { id: true },
            });
            if (!workflowExists) throw new NotFoundException('Workflow not found.');

            // The composite FKs enforce cross-workflow integrity at DB level; this
            // count provides a developer-friendly error for the common mistake.
            const stageCount = await tx.workflowStage.count({
                where: {
                    workflowId,
                    companyId,
                    id: { in: [dto.fromStageId, dto.toStageId] },
                    isActive: true,
                },
            });
            if (stageCount !== 2) {
                throw new NotFoundException(
                    'One or both stages not found in this workflow, or they are inactive.',
                );
            }

            const created = await tx.stageTransition.create({
                data: {
                    companyId,
                    workflowId,
                    fromStageId: dto.fromStageId,
                    toStageId: dto.toStageId,
                    requiresApproval: dto.requiresApproval ?? false,
                },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.CREATE,
                entityType: 'StageTransition',
                entityId: created.id,
                after: {
                    fromStageId: dto.fromStageId,
                    toStageId: dto.toStageId,
                    requiresApproval: created.requiresApproval,
                },
            });

            return created;
        });

        // Runs only after the transaction commits successfully.
        this.events.emit('config.workflow.transitions.changed', { companyId, workflowId });
        return transition;
    }

    async getTransitions(companyId: string, workflowId: string) {
        await this.assertWorkflowExists(companyId, workflowId);
        return this.prisma.stageTransition.findMany({
            where: { workflowId, companyId },
            select: {
                id: true,
                requiresApproval: true,
                fromStage: { select: { id: true, code: true, name: true, color: true, sortOrder: true, isInitial: true, isFinal: true, isActive: true } },
                toStage: { select: { id: true, code: true, name: true, color: true, sortOrder: true, isInitial: true, isFinal: true, isActive: true } },
            },
        });
    }

    async deleteTransition(
        companyId: string,
        workflowId: string,
        transitionId: string,
        actorId: string,
    ) {
        await this.prisma.$transaction(async (tx) => {
            // Step 1: Lock the target transition row to serialize concurrent deletes
            // of the same transition and prevent phantom reads on the row itself.
            const rows = await tx.$queryRaw<
                Array<{ id: string; fromStageId: string; toStageId: string; requiresApproval: boolean }>
            >`
        SELECT id, "fromStageId", "toStageId", "requiresApproval"
        FROM "StageTransition"
        WHERE id = ${transitionId} AND "workflowId" = ${workflowId} AND "companyId" = ${companyId}
        FOR UPDATE
      `;
            if (rows.length === 0) throw new NotFoundException('Transition not found.');
            const transition = rows[0];

            // Step 2: Lock the source stage row.
            // This operation acquires locks in transition → stage order (T → S).
            // No other code path holds a stage lock and then acquires a transition row lock,
            // so no deadlock cycle is possible: deactivateStage locks only the target stage
            // row and never acquires a transition row lock; createTransition acquires no row
            // lock on stages at all. Holding the stage lock here serializes concurrent
            // deleteTransition calls that share the same fromStage, making the outbound count
            // below safe against phantom rows.
            // NOTE: createTransition does not acquire a stage lock, so the count below does
            // not guard against a concurrent insert — only against concurrent deletes.
            await tx.$queryRaw`
        SELECT id FROM "WorkflowStage"
        WHERE id = ${transition.fromStageId} AND "companyId" = ${companyId}
        FOR UPDATE
      `;

            // Step 3: Count remaining outbound transitions without locking siblings.
            // The stage lock above serializes concurrent deleteTransition calls from the
            // same fromStage, making a plain count safe here.
            const [{ count: outboundCount }] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "StageTransition"
        WHERE "workflowId" = ${workflowId}
          AND "fromStageId" = ${transition.fromStageId}
          AND id <> ${transitionId}
      `;

            if (outboundCount === 0n) {
                // This is the last outbound edge from this stage. Block if active requests
                // are sitting here — they would have no valid forward path after deletion.
                const [{ count: requestCount }] = await tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM "Request"
          WHERE "currentStageId" = ${transition.fromStageId}
            AND status NOT IN ('CLOSED', 'CANCELLED')
        `;
                if (requestCount > 0n) {
                    throw new ConflictException(
                        `Removing this transition would strand ${requestCount} active request(s) in the source stage with no valid forward path.`,
                    );
                }
            }

            await tx.stageTransition.delete({ where: { id: transitionId } });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.DELETE,
                entityType: 'StageTransition',
                entityId: transitionId,
                before: {
                    fromStageId: transition.fromStageId,
                    toStageId: transition.toStageId,
                    requiresApproval: transition.requiresApproval,
                },
            });
        });

        // Runs only after the transaction commits successfully.
        this.events.emit('config.workflow.transitions.changed', { companyId, workflowId });
    }

    // ── Stage Assignee Rules ──────────────────────────────────────────────────

    async createAssigneeRule(
        companyId: string,
        workflowId: string,
        stageId: string,
        actorId: string,
        dto: CreateStageAssigneeRuleDto,
    ) {
        await this.assertStageExists(companyId, workflowId, stageId);

        return this.prisma.$transaction(async (tx) => {
            const rule = await tx.stageAssigneeRule.create({
                data: {
                    companyId,
                    stageId,
                    assignmentType: dto.assignmentType,
                    role: dto.role,
                    membershipId: dto.membershipId,
                },
            });

            // Create the round-robin cursor immediately for ROUND_ROBIN rules.
            // The cursor starts with lastMembershipId = null (no assignment made yet).
            if (dto.assignmentType === AssignmentType.ROUND_ROBIN) {
                await tx.roundRobinCursor.create({
                    data: {
                        companyId,
                        ruleId: rule.id,
                        lastMembershipId: null,
                    },
                });
            }

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.CREATE,
                entityType: 'StageAssigneeRule',
                entityId: rule.id,
                after: { stageId, assignmentType: dto.assignmentType, role: dto.role, membershipId: dto.membershipId },
            });

            return rule;
        });
    }

    async resolveRoundRobinAssignee(
        companyId: string,
        ruleId: string,
        eligibleRole?: string,
    ): Promise<Pick<CompanyMembership, 'id' | 'userId' | 'role'> | null> {
        return this.prisma.$transaction(async (tx) => {
            // Acquire exclusive lock on the cursor row to serialize concurrent
            // assignment attempts. The second concurrent transaction blocks here
            // until the first commits, then reads the already-advanced cursor.
            const cursorRows = await tx.$queryRaw<
                Array<{ id: string; lastMembershipId: string | null }>
            >`
        SELECT id, "lastMembershipId"
        FROM "RoundRobinCursor"
        WHERE "ruleId" = ${ruleId}
        FOR UPDATE
      `;

            if (cursorRows.length === 0) {
                // Cursor must be created atomically with the StageAssigneeRule in
                // createAssigneeRule. A missing cursor means data integrity was violated
                // (e.g., direct DB manipulation or a failed earlier migration).
                // Repair the cursor so subsequent calls work, then throw so the
                // caller receives an explicit error instead of a silent null that
                // looks identical to an empty eligible-member pool.
                await tx.$executeRaw`
          INSERT INTO "RoundRobinCursor" (id, "companyId", "ruleId", "lastMembershipId", "updatedAt")
          VALUES (${createId()}, ${companyId}, ${ruleId}, NULL, NOW())
          ON CONFLICT ("ruleId") DO NOTHING
        `;
                throw new InternalServerErrorException(
                    `RoundRobinCursor missing for rule ${ruleId}. State has been repaired. Retry the operation.`,
                );
            }

            const cursor = cursorRows[0];

            // Fetch current active membership pool with stable ordering.
            const pool = await tx.companyMembership.findMany({
                where: {
                    companyId,
                    status: MembershipStatus.ACTIVE,
                    ...(eligibleRole ? { role: eligibleRole as never } : {}),
                },
                select: { id: true, userId: true, role: true },
                orderBy: { createdAt: 'asc' }, // stable ordering is required for deterministic round-robin
            });

            if (pool.length === 0) {
                // No eligible members. Fall back to MANUAL — caller handles this.
                return null;
            }

            // Find the current cursor position.
            // If lastMembershipId is null or refers to a deactivated member,
            // findIndex returns -1, which causes the next assignment to be pool[0].
            const lastIndex = cursor.lastMembershipId
                ? pool.findIndex((m) => m.id === cursor.lastMembershipId)
                : -1;

            const nextMember = pool[(lastIndex + 1) % pool.length];

            // Advance cursor inside the same transaction.
            await tx.$executeRaw`
        UPDATE "RoundRobinCursor"
        SET "lastMembershipId" = ${nextMember.id}, "updatedAt" = NOW()
        WHERE "ruleId" = ${ruleId}
      `;

            return nextMember;
        });
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async assertWorkflowExists(
        companyId: string,
        workflowId: string,
    ): Promise<void> {
        const exists = await this.prisma.workflow.findFirst({
            where: { id: workflowId, companyId },
            select: { id: true },
        });
        if (!exists) throw new NotFoundException('Workflow not found.');
    }

    private async assertStageExists(
        companyId: string,
        workflowId: string,
        stageId: string,
    ): Promise<void> {
        const exists = await this.prisma.workflowStage.findFirst({
            where: { id: stageId, workflowId, companyId },
            select: { id: true },
        });
        if (!exists) throw new NotFoundException('Stage not found.');
    }

    private async clearDefaultWorkflow(
        tx: Prisma.TransactionClient,
        companyId: string,
    ): Promise<void> {
        // SELECT FOR UPDATE on the current default row to prevent concurrent
        // "set default" calls from both reading isDefault=false before either commits.
        await tx.$executeRaw`
      UPDATE "Workflow"
      SET "isDefault" = false
      WHERE "companyId" = ${companyId} AND "isDefault" = true
    `;
    }

    private async clearInitialStage(
        tx: Prisma.TransactionClient,
        workflowId: string,
    ): Promise<void> {
        await tx.$executeRaw`
      UPDATE "WorkflowStage"
      SET "isInitial" = false
      WHERE "workflowId" = ${workflowId} AND "isInitial" = true
    `;
    }
}
