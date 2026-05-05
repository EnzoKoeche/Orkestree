import {
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
    AuditOperation,
    CompanyMembership,
    CompanyResource,
    MembershipStatus,
    PermissionAction,
    Prisma,
    TaskPriority,
    TaskStatus,
} from '@prisma/client';
import { ConfigAuditService } from '../company-config/audit/config-audit.service';
import { PermissionResolverService } from '../company-config/permissions/permission-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { TransitionTaskDto } from './dto/transition-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

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
    status: true,
    priority: true,
    dueAt: true,
    completedAt: true,
    cancelledAt: true,
    createdAt: true,
    updatedAt: true,
    request: {
        select: { id: true, number: true, title: true },
    },
    assignedMembership: {
        select: MEMBERSHIP_USER_SELECT,
    },
    createdByMembership: {
        select: MEMBERSHIP_USER_SELECT,
    },
} satisfies Prisma.TaskSelect;

const DETAIL_SELECT = {
    ...LIST_SELECT,
    description: true,
} satisfies Prisma.TaskSelect;

// ─────────────────────────────────────────────────────────────────────────────
// TasksService
//
// Owns CRUD, transition, and assignment for Task. State machine is flat:
//   OPEN ↔ IN_PROGRESS
//   OPEN | IN_PROGRESS → DONE       (sets completedAt)
//   DONE → OPEN                      (reopen, clears completedAt)
//   OPEN | IN_PROGRESS → CANCELLED   (sets cancelledAt; terminal)
// DONE → CANCELLED is rejected by design.
//
// Tenant scoping: companyId always comes from the authenticated membership.
// Number generation uses pg_advisory_xact_lock with the ':tasks' namespace
// to avoid contention with request and client number generators.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class TasksService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: ConfigAuditService,
        private readonly permissionResolver: PermissionResolverService,
        private readonly events: EventEmitter2,
    ) { }

    // ── Create ────────────────────────────────────────────────────────────────

    async createTask(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        dto: CreateTaskDto,
    ) {
        const { companyId } = actorMembership;

        // Assigning at creation time requires the ASSIGN permission on top of CREATE.
        if (dto.assignedMembershipId) {
            const canAssign = await this.permissionResolver.isAllowed(
                actorMembership,
                CompanyResource.TASK,
                PermissionAction.ASSIGN,
            );
            if (!canAssign) {
                throw new ForbiddenException(
                    'Assigning a task at creation requires the ASSIGN permission on TASK.',
                );
            }
        }

        const createdTaskId = await this.prisma.$transaction(async (tx) => {
            // Validate request: must belong to company and not be cancelled
            const request = await tx.serviceRequest.findFirst({
                where: { id: dto.requestId, companyId, isCancelled: false },
                select: { id: true },
            });
            if (!request) {
                throw new NotFoundException(
                    'Service request not found or is cancelled.',
                );
            }

            // Validate assignee if provided
            if (dto.assignedMembershipId) {
                const assignee = await tx.companyMembership.findFirst({
                    where: {
                        id: dto.assignedMembershipId,
                        companyId,
                        status: MembershipStatus.ACTIVE,
                    },
                    select: { id: true },
                });
                if (!assignee) {
                    throw new UnprocessableEntityException(
                        'Assignee membership not found or is not an active member of this company.',
                    );
                }
            }

            // Acquire transaction-scoped advisory lock for number generation.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId + ':tasks'})::bigint)`;

            const [maxRow] = await tx.$queryRaw<Array<{ max: number | null }>>`
                SELECT MAX(number)::int AS max
                FROM "Task"
                WHERE "companyId" = ${companyId}
            `;
            const taskNumber = (maxRow?.max ?? 0) + 1;

            const created = await tx.task.create({
                data: {
                    companyId,
                    requestId: dto.requestId,
                    number: taskNumber,
                    title: dto.title,
                    description: dto.description ?? null,
                    priority: dto.priority,
                    dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
                    assignedMembershipId: dto.assignedMembershipId ?? null,
                    createdByMembershipId: actorMembership.id,
                },
                select: { id: true },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.CREATE,
                entityType: 'Task',
                entityId: created.id,
                entityCode: String(taskNumber),
                after: {
                    number: taskNumber,
                    title: dto.title,
                    requestId: dto.requestId,
                    assignedMembershipId: dto.assignedMembershipId ?? null,
                    priority: dto.priority ?? TaskPriority.NORMAL,
                },
            });

            return created.id;
        });

        this.events.emit('task.created', { companyId, taskId: createdTaskId });

        return this.getTask(companyId, createdTaskId);
    }

    // ── Update ────────────────────────────────────────────────────────────────

    async updateTask(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        taskId: string,
        dto: UpdateTaskDto,
    ) {
        const { companyId } = actorMembership;

        if (Object.keys(dto).length === 0) {
            return this.getTask(companyId, taskId);
        }

        await this.prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<
                Array<{
                    id: string;
                    status: TaskStatus;
                    title: string;
                    description: string | null;
                    priority: TaskPriority;
                    dueAt: Date | null;
                }>
            >`
                SELECT id, status, title, description, priority, "dueAt"
                FROM "Task"
                WHERE id = ${taskId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            const existing = rows[0];
            if (!existing) throw new NotFoundException('Task not found.');
            if (existing.status === TaskStatus.CANCELLED) {
                throw new UnprocessableEntityException(
                    'Cannot update a cancelled task.',
                );
            }

            const updateData: Prisma.TaskUpdateInput = {};
            if (dto.title !== undefined) updateData.title = dto.title;
            if (dto.description !== undefined) {
                updateData.description = dto.description ?? null;
            }
            if (dto.priority !== undefined) updateData.priority = dto.priority;
            if (dto.dueAt !== undefined) {
                updateData.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
            }

            await tx.task.update({ where: { id: taskId }, data: updateData });

            const beforeDueAt = existing.dueAt ? existing.dueAt.toISOString() : null;
            const afterDueAt =
                dto.dueAt !== undefined
                    ? dto.dueAt
                        ? new Date(dto.dueAt).toISOString()
                        : null
                    : beforeDueAt;

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.UPDATE,
                entityType: 'Task',
                entityId: taskId,
                before: {
                    title: existing.title,
                    description: existing.description,
                    priority: existing.priority,
                    dueAt: beforeDueAt,
                },
                after: {
                    title: dto.title ?? existing.title,
                    description:
                        dto.description !== undefined
                            ? dto.description ?? null
                            : existing.description,
                    priority: dto.priority ?? existing.priority,
                    dueAt: afterDueAt,
                },
            });
        });

        return this.getTask(companyId, taskId);
    }

    // ── Transition ────────────────────────────────────────────────────────────

    async transitionTask(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        taskId: string,
        dto: TransitionTaskDto,
    ) {
        const { companyId } = actorMembership;

        const result = await this.prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<
                Array<{ id: string; status: TaskStatus }>
            >`
                SELECT id, status
                FROM "Task"
                WHERE id = ${taskId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            const existing = rows[0];
            if (!existing) throw new NotFoundException('Task not found.');

            const fromStatus = existing.status;
            const toStatus = dto.toStatus;

            if (fromStatus === toStatus) {
                throw new UnprocessableEntityException(
                    'Target status is the same as the current status.',
                );
            }
            if (!isLegalTaskTransition(fromStatus, toStatus)) {
                throw new UnprocessableEntityException(
                    `Transition from ${fromStatus} to ${toStatus} is not permitted.`,
                );
            }

            const updateData: Prisma.TaskUpdateInput = { status: toStatus };
            if (toStatus === TaskStatus.DONE) {
                updateData.completedAt = new Date();
            } else if (
                toStatus === TaskStatus.OPEN &&
                fromStatus === TaskStatus.DONE
            ) {
                updateData.completedAt = null;
            } else if (toStatus === TaskStatus.CANCELLED) {
                updateData.cancelledAt = new Date();
            }

            await tx.task.update({ where: { id: taskId }, data: updateData });

            const operation =
                toStatus === TaskStatus.CANCELLED
                    ? AuditOperation.CANCEL
                    : AuditOperation.TRANSITION;

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation,
                entityType: 'Task',
                entityId: taskId,
                before: { status: fromStatus },
                after: { status: toStatus, note: dto.note ?? null },
            });

            return { fromStatus, toStatus };
        });

        const eventName =
            result.toStatus === TaskStatus.CANCELLED
                ? 'task.cancelled'
                : 'task.transitioned';
        this.events.emit(eventName, {
            companyId,
            taskId,
            fromStatus: result.fromStatus,
            toStatus: result.toStatus,
        });

        return this.getTask(companyId, taskId);
    }

    // ── Assign ────────────────────────────────────────────────────────────────

    async assignTask(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        taskId: string,
        membershipId: string,
    ) {
        const { companyId } = actorMembership;

        const changed = await this.prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<
                Array<{
                    id: string;
                    status: TaskStatus;
                    assignedMembershipId: string | null;
                }>
            >`
                SELECT id, status, "assignedMembershipId"
                FROM "Task"
                WHERE id = ${taskId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            const existing = rows[0];
            if (!existing) throw new NotFoundException('Task not found.');
            if (
                existing.status === TaskStatus.CANCELLED ||
                existing.status === TaskStatus.DONE
            ) {
                throw new UnprocessableEntityException(
                    'Cannot assign a task that is cancelled or done.',
                );
            }

            const assignee = await tx.companyMembership.findFirst({
                where: {
                    id: membershipId,
                    companyId,
                    status: MembershipStatus.ACTIVE,
                },
                select: { id: true },
            });
            if (!assignee) {
                throw new UnprocessableEntityException(
                    'Assignee membership not found or is not an active member of this company.',
                );
            }

            if (existing.assignedMembershipId === membershipId) {
                return false;
            }

            const previous = existing.assignedMembershipId;

            await tx.task.update({
                where: { id: taskId },
                data: { assignedMembershipId: membershipId },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.ASSIGN,
                entityType: 'Task',
                entityId: taskId,
                before: { assignedMembershipId: previous },
                after: { assignedMembershipId: membershipId },
            });

            return true;
        });

        if (changed) {
            this.events.emit('task.assigned', {
                companyId,
                taskId,
                membershipId,
            });
        }

        return this.getTask(companyId, taskId);
    }

    // ── Unassign ──────────────────────────────────────────────────────────────

    async unassignTask(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        taskId: string,
    ) {
        const { companyId } = actorMembership;

        const changed = await this.prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<
                Array<{
                    id: string;
                    status: TaskStatus;
                    assignedMembershipId: string | null;
                }>
            >`
                SELECT id, status, "assignedMembershipId"
                FROM "Task"
                WHERE id = ${taskId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            const existing = rows[0];
            if (!existing) throw new NotFoundException('Task not found.');
            if (
                existing.status === TaskStatus.CANCELLED ||
                existing.status === TaskStatus.DONE
            ) {
                throw new UnprocessableEntityException(
                    'Cannot unassign a task that is cancelled or done.',
                );
            }

            if (existing.assignedMembershipId === null) {
                return false;
            }

            const previous = existing.assignedMembershipId;

            await tx.task.update({
                where: { id: taskId },
                data: { assignedMembershipId: null },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.ASSIGN,
                entityType: 'Task',
                entityId: taskId,
                before: { assignedMembershipId: previous },
                after: { assignedMembershipId: null },
            });

            return true;
        });

        if (changed) {
            this.events.emit('task.unassigned', { companyId, taskId });
        }

        return this.getTask(companyId, taskId);
    }

    // ── List ──────────────────────────────────────────────────────────────────

    async listTasks(companyId: string, query: ListTasksDto) {
        const where: Prisma.TaskWhereInput = { companyId };
        if (query.requestId !== undefined) where.requestId = query.requestId;
        if (query.status !== undefined) where.status = query.status;
        if (query.priority !== undefined) where.priority = query.priority;
        if (query.assignedMembershipId !== undefined) {
            where.assignedMembershipId = query.assignedMembershipId;
        }

        return this.prisma.task.findMany({
            where,
            select: LIST_SELECT,
            orderBy: { number: 'desc' },
            take: query.limit ?? 50,
            skip: query.skip ?? 0,
        });
    }

    // ── Get ───────────────────────────────────────────────────────────────────

    async getTask(companyId: string, taskId: string) {
        const task = await this.prisma.task.findFirst({
            where: { id: taskId, companyId },
            select: DETAIL_SELECT,
        });
        if (!task) throw new NotFoundException('Task not found.');
        return task;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// State machine
// ─────────────────────────────────────────────────────────────────────────────

function isLegalTaskTransition(from: TaskStatus, to: TaskStatus): boolean {
    if (from === TaskStatus.OPEN && to === TaskStatus.IN_PROGRESS) return true;
    if (from === TaskStatus.IN_PROGRESS && to === TaskStatus.OPEN) return true;
    if (
        (from === TaskStatus.OPEN || from === TaskStatus.IN_PROGRESS) &&
        to === TaskStatus.DONE
    ) {
        return true;
    }
    if (from === TaskStatus.DONE && to === TaskStatus.OPEN) return true;
    if (
        (from === TaskStatus.OPEN || from === TaskStatus.IN_PROGRESS) &&
        to === TaskStatus.CANCELLED
    ) {
        return true;
    }
    return false;
}
