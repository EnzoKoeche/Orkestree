import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { CompanyMembership, CompanyResource, PermissionAction } from '@prisma/client';
import { CurrentMembership } from '../auth/decorators/current-membership.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CompanyMemberGuard } from '../auth/guards/company-member.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResourcePermissionGuard } from '../auth/guards/resource-permission.guard';
import { AssignTaskDto } from './dto/assign-task.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { TransitionTaskDto } from './dto/transition-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskCommentsService } from './task-comments.service';
import { TasksService } from './tasks.service';

@UseGuards(JwtAuthGuard, CompanyMemberGuard, ResourcePermissionGuard)
@Controller('companies/:companyId/tasks')
export class TasksController {
    constructor(
        private readonly tasksService: TasksService,
        private readonly commentsService: TaskCommentsService,
    ) { }

    // ── Tasks ─────────────────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.TASK, PermissionAction.VIEW)
    @Get()
    listTasks(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Query() query: ListTasksDto,
    ) {
        return this.tasksService.listTasks(membership.companyId, query);
    }

    @RequirePermission(CompanyResource.TASK, PermissionAction.CREATE)
    @Post()
    createTask(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Body() dto: CreateTaskDto,
    ) {
        return this.tasksService.createTask(membership, dto);
    }

    @RequirePermission(CompanyResource.TASK, PermissionAction.VIEW)
    @Get(':taskId')
    getTask(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('taskId') taskId: string,
    ) {
        return this.tasksService.getTask(membership.companyId, taskId);
    }

    @RequirePermission(CompanyResource.TASK, PermissionAction.EDIT)
    @Patch(':taskId')
    updateTask(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('taskId') taskId: string,
        @Body() dto: UpdateTaskDto,
    ) {
        return this.tasksService.updateTask(membership, taskId, dto);
    }

    @RequirePermission(CompanyResource.TASK, PermissionAction.EDIT)
    @Post(':taskId/transition')
    transitionTask(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('taskId') taskId: string,
        @Body() dto: TransitionTaskDto,
    ) {
        return this.tasksService.transitionTask(membership, taskId, dto);
    }

    @RequirePermission(CompanyResource.TASK, PermissionAction.ASSIGN)
    @Post(':taskId/assign')
    assignTask(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('taskId') taskId: string,
        @Body() dto: AssignTaskDto,
    ) {
        return this.tasksService.assignTask(membership, taskId, dto.membershipId);
    }

    @RequirePermission(CompanyResource.TASK, PermissionAction.ASSIGN)
    @Post(':taskId/unassign')
    unassignTask(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('taskId') taskId: string,
    ) {
        return this.tasksService.unassignTask(membership, taskId);
    }

    // ── Comments ──────────────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.TASK, PermissionAction.VIEW)
    @Get(':taskId/comments')
    listComments(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('taskId') taskId: string,
    ) {
        return this.commentsService.listComments(membership.companyId, taskId);
    }

    @RequirePermission(CompanyResource.TASK, PermissionAction.EDIT)
    @Post(':taskId/comments')
    createComment(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('taskId') taskId: string,
        @Body() dto: CreateCommentDto,
    ) {
        return this.commentsService.createComment(membership, taskId, dto.body);
    }

    @RequirePermission(CompanyResource.TASK, PermissionAction.EDIT)
    @Delete(':taskId/comments/:commentId')
    deleteComment(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('taskId') taskId: string,
        @Param('commentId') commentId: string,
    ) {
        return this.commentsService.deleteComment(membership, taskId, commentId);
    }
}
