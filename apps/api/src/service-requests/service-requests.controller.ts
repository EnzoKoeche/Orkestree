import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { CompanyMembership, CompanyResource, PermissionAction } from '@prisma/client';
import { CurrentMembership } from '../auth/decorators/current-membership.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CompanyMemberGuard } from '../auth/guards/company-member.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResourcePermissionGuard } from '../auth/guards/resource-permission.guard';
import { AssignRequestDto } from './dto/assign-request.dto';
import { CancelRequestDto } from './dto/cancel-request.dto';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { ListServiceRequestsDto } from './dto/list-service-requests.dto';
import { SetFieldValuesDto } from './dto/set-field-value.dto';
import { TransitionStageDto } from './dto/transition-stage.dto';
import { UpdateServiceRequestDto } from './dto/update-service-request.dto';
import { FieldValuesService } from './field-values.service';
import { ServiceRequestsService } from './service-requests.service';
import { StageTransitionsService } from './stage-transitions.service';

@UseGuards(JwtAuthGuard, CompanyMemberGuard, ResourcePermissionGuard)
@Controller('companies/:companyId/requests')
export class ServiceRequestsController {
    constructor(
        private readonly serviceRequestsService: ServiceRequestsService,
        private readonly stageTransitionsService: StageTransitionsService,
        private readonly fieldValuesService: FieldValuesService,
    ) { }

    // ── Service Requests ──────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.REQUEST, PermissionAction.VIEW)
    @Get()
    listServiceRequests(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Query() query: ListServiceRequestsDto,
    ) {
        return this.serviceRequestsService.listServiceRequests(membership, query);
    }

    @RequirePermission(CompanyResource.REQUEST, PermissionAction.CREATE)
    @Post()
    createServiceRequest(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Body() dto: CreateServiceRequestDto,
    ) {
        return this.serviceRequestsService.createServiceRequest(membership, dto);
    }

    @RequirePermission(CompanyResource.REQUEST, PermissionAction.VIEW)
    @Get(':requestId')
    getServiceRequest(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('requestId') requestId: string,
    ) {
        return this.serviceRequestsService.getServiceRequest(membership, requestId);
    }

    @RequirePermission(CompanyResource.REQUEST, PermissionAction.EDIT)
    @Patch(':requestId')
    updateServiceRequest(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('requestId') requestId: string,
        @Body() dto: UpdateServiceRequestDto,
    ) {
        return this.serviceRequestsService.updateServiceRequest(membership, requestId, dto);
    }

    @RequirePermission(CompanyResource.REQUEST, PermissionAction.EDIT)
    @Post(':requestId/cancel')
    cancelServiceRequest(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('requestId') requestId: string,
        @Body() dto: CancelRequestDto,
    ) {
        return this.serviceRequestsService.cancelServiceRequest(membership, requestId, dto);
    }

    // ── Stage Transitions ─────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.REQUEST, PermissionAction.EDIT)
    @Post(':requestId/transition')
    transitionStage(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('requestId') requestId: string,
        @Body() dto: TransitionStageDto,
    ) {
        return this.stageTransitionsService.transitionStage(
            membership.companyId,
            requestId,
            membership,
            dto,
        );
    }

    // ── Assignment ────────────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.REQUEST, PermissionAction.ASSIGN)
    @Post(':requestId/assign')
    assignRequest(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('requestId') requestId: string,
        @Body() dto: AssignRequestDto,
    ) {
        return this.stageTransitionsService.assignRequest(
            membership.companyId,
            requestId,
            membership,
            dto,
        );
    }

    // ── Field Values ──────────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.REQUEST, PermissionAction.VIEW)
    @Get(':requestId/field-values')
    getFieldValues(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('requestId') requestId: string,
    ) {
        // Delegates through serviceRequestsService so that CLIENTE row-level isolation
        // (createdByMembershipId filter) is applied before field values are returned.
        return this.serviceRequestsService.getFieldValues(membership, requestId);
    }

    @RequirePermission(CompanyResource.REQUEST, PermissionAction.EDIT)
    @Put(':requestId/field-values')
    setFieldValues(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('requestId') requestId: string,
        @Body() dto: SetFieldValuesDto,
    ) {
        return this.serviceRequestsService.setFieldValues(membership, requestId, dto.fieldValues);
    }
}
