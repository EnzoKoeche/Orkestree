import {
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import {
    AuditOperation,
    CompanyMembership,
    Prisma,
    Role,
    TaskStatus,
} from '@prisma/client';
import { ConfigAuditService } from '../company-config/audit/config-audit.service';
import { PrismaService } from '../prisma/prisma.service';

const COMMENT_SELECT = {
    id: true,
    body: true,
    createdAt: true,
    updatedAt: true,
    authorMembership: {
        select: {
            id: true,
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatarUrl: true,
                },
            },
        },
    },
} satisfies Prisma.TaskCommentSelect;

@Injectable()
export class TaskCommentsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: ConfigAuditService,
    ) { }

    async listComments(companyId: string, taskId: string) {
        const task = await this.prisma.task.findFirst({
            where: { id: taskId, companyId },
            select: { id: true },
        });
        if (!task) throw new NotFoundException('Task not found.');

        return this.prisma.taskComment.findMany({
            where: { companyId, taskId },
            select: COMMENT_SELECT,
            orderBy: { createdAt: 'asc' },
        });
    }

    async createComment(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        taskId: string,
        body: string,
    ) {
        const { companyId } = actorMembership;
        let createdId = '';

        await this.prisma.$transaction(async (tx) => {
            const task = await tx.task.findFirst({
                where: { id: taskId, companyId },
                select: { id: true, status: true },
            });
            if (!task) throw new NotFoundException('Task not found.');
            if (task.status === TaskStatus.CANCELLED) {
                throw new UnprocessableEntityException(
                    'Cannot comment on a cancelled task.',
                );
            }

            const created = await tx.taskComment.create({
                data: {
                    companyId,
                    taskId,
                    authorMembershipId: actorMembership.id,
                    body,
                },
                select: { id: true },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.CREATE,
                entityType: 'TaskComment',
                entityId: created.id,
            });

            createdId = created.id;
        });

        return this.prisma.taskComment.findUniqueOrThrow({
            where: { id: createdId },
            select: COMMENT_SELECT,
        });
    }

    async deleteComment(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        taskId: string,
        commentId: string,
    ) {
        const { companyId, role, id: actorMembershipId } = actorMembership;

        await this.prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<
                Array<{ id: string; authorMembershipId: string }>
            >`
                SELECT id, "authorMembershipId"
                FROM "TaskComment"
                WHERE id = ${commentId}
                  AND "companyId" = ${companyId}
                  AND "taskId" = ${taskId}
                FOR UPDATE
            `;

            const existing = rows[0];
            if (!existing) throw new NotFoundException('Comment not found.');

            const isAuthor = existing.authorMembershipId === actorMembershipId;
            const isAdmin = role === Role.OWNER || role === Role.ADMIN;
            if (!isAuthor && !isAdmin) {
                throw new ForbiddenException(
                    'You can only delete your own comments.',
                );
            }

            await tx.taskComment.delete({ where: { id: commentId } });

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.DELETE,
                entityType: 'TaskComment',
                entityId: commentId,
            });
        });
    }
}
