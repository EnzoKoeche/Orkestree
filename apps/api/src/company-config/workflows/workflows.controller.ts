import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import { CompanyMembership, CompanyResource, PermissionAction } from '@prisma/client';
import { CurrentMembership } from '../../auth/decorators/current-membership.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CompanyMemberGuard } from '../../auth/guards/company-member.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ResourcePermissionGuard } from '../../auth/guards/resource-permission.guard';
import { CreateStageAssigneeRuleDto } from './dto/stage-assignee-rule.dto';
import { CreateStageTransitionDto } from './dto/stage-transition.dto';
import { CreateWorkflowStageDto, UpdateWorkflowStageDto } from './dto/workflow-stage.dto';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto/workflow.dto';
import { WorkflowsService } from './workflows.service';

@UseGuards(JwtAuthGuard, CompanyMemberGuard, ResourcePermissionGuard)
@Controller('companies/:companyId/config/workflows')
export class WorkflowsController {
    constructor(private readonly workflowsService: WorkflowsService) { }

    // ── Workflows ─────────────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.VIEW)
    @Get()
    getWorkflows(@Param('companyId') companyId: string) {
        return this.workflowsService.getWorkflows(companyId);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.CREATE)
    @Post()
    createWorkflow(
        @Param('companyId') companyId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Body() dto: CreateWorkflowDto,
    ) {
        return this.workflowsService.createWorkflow(companyId, membership.userId, dto);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.VIEW)
    @Get(':workflowId')
    getWorkflow(
        @Param('companyId') companyId: string,
        @Param('workflowId') workflowId: string,
    ) {
        return this.workflowsService.getWorkflow(companyId, workflowId);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Patch(':workflowId')
    updateWorkflow(
        @Param('companyId') companyId: string,
        @Param('workflowId') workflowId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
        @Body() dto: UpdateWorkflowDto,
    ) {
        return this.workflowsService.updateWorkflow(companyId, workflowId, membership.userId, dto);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Put(':workflowId/set-default')
    setDefaultWorkflow(
        @Param('companyId') companyId: string,
        @Param('workflowId') workflowId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
    ) {
        return this.workflowsService.setDefaultWorkflow(companyId, workflowId, membership.userId);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Delete(':workflowId/deactivate')
    deactivateWorkflow(
        @Param('companyId') companyId: string,
        @Param('workflowId') workflowId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
    ) {
        return this.workflowsService.deactivateWorkflow(companyId, workflowId, membership.userId);
    }

    // ── Workflow Stages ───────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.VIEW)
    @Get(':workflowId/stages')
    getStages(
        @Param('companyId') companyId: string,
        @Param('workflowId') workflowId: string,
    ) {
        return this.workflowsService.getStages(companyId, workflowId);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.CREATE)
    @Post(':workflowId/stages')
    createStage(
        @Param('companyId') companyId: string,
        @Param('workflowId') workflowId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
        @Body() dto: CreateWorkflowStageDto,
    ) {
        return this.workflowsService.createStage(companyId, workflowId, membership.userId, dto);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Patch(':workflowId/stages/:stageId')
    updateStage(
        @Param('companyId') companyId: string,
        @Param('workflowId') workflowId: string,
        @Param('stageId') stageId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
        @Body() dto: UpdateWorkflowStageDto,
    ) {
        return this.workflowsService.updateStage(companyId, workflowId, stageId, membership.userId, dto);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Put(':workflowId/stages/:stageId/set-initial')
    setInitialStage(
        @Param('companyId') companyId: string,
        @Param('workflowId') workflowId: string,
        @Param('stageId') stageId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
    ) {
        return this.workflowsService.setInitialStage(companyId, workflowId, stageId, membership.userId);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Delete(':workflowId/stages/:stageId/deactivate')
    deactivateStage(
        @Param('companyId') companyId: string,
        @Param('workflowId') workflowId: string,
        @Param('stageId') stageId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
    ) {
        return this.workflowsService.deactivateStage(companyId, workflowId, stageId, membership.userId);
    }

    // ── Stage Transitions ─────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.VIEW)
    @Get(':workflowId/transitions')
    getTransitions(
        @Param('companyId') companyId: string,
        @Param('workflowId') workflowId: string,
    ) {
        return this.workflowsService.getTransitions(companyId, workflowId);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.CREATE)
    @Post(':workflowId/transitions')
    createTransition(
        @Param('companyId') companyId: string,
        @Param('workflowId') workflowId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
        @Body() dto: CreateStageTransitionDto,
    ) {
        return this.workflowsService.createTransition(companyId, workflowId, membership.userId, dto);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.DELETE)
    @Delete(':workflowId/transitions/:transitionId')
    deleteTransition(
        @Param('companyId') companyId: string,
        @Param('workflowId') workflowId: string,
        @Param('transitionId') transitionId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
    ) {
        return this.workflowsService.deleteTransition(companyId, workflowId, transitionId, membership.userId);
    }

    // ── Stage Assignee Rules ──────────────────────────────────────────────────

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.CREATE)
    @Post(':workflowId/stages/:stageId/assignee-rules')
    createAssigneeRule(
        @Param('companyId') companyId: string,
        @Param('workflowId') workflowId: string,
        @Param('stageId') stageId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
        @Body() dto: CreateStageAssigneeRuleDto,
    ) {
        return this.workflowsService.createAssigneeRule(
            companyId,
            workflowId,
            stageId,
            membership.userId,
            dto,
        );
    }
}
