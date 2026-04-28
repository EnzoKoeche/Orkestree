import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { CompanyMembership, CompanyResource, PermissionAction } from '@prisma/client';
import { CurrentMembership } from '../../auth/decorators/current-membership.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CompanyMemberGuard } from '../../auth/guards/company-member.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ResourcePermissionGuard } from '../../auth/guards/resource-permission.guard';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
import { ServiceTypesService } from './service-types.service';

@UseGuards(JwtAuthGuard, CompanyMemberGuard, ResourcePermissionGuard)
@Controller('companies/:companyId/config/service-types')
export class ServiceTypesController {
    constructor(private readonly serviceTypesService: ServiceTypesService) { }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.VIEW)
    @Get()
    getServiceTypes(@Param('companyId') companyId: string) {
        return this.serviceTypesService.getServiceTypes(companyId);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.VIEW)
    @Get(':serviceTypeId')
    getServiceType(
        @Param('companyId') companyId: string,
        @Param('serviceTypeId') serviceTypeId: string,
    ) {
        return this.serviceTypesService.getServiceType(companyId, serviceTypeId);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.CREATE)
    @Post()
    createServiceType(
        @Param('companyId') companyId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
        @Body() dto: CreateServiceTypeDto,
    ) {
        return this.serviceTypesService.createServiceType(companyId, membership.userId, dto);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Patch(':serviceTypeId')
    updateServiceType(
        @Param('companyId') companyId: string,
        @Param('serviceTypeId') serviceTypeId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
        @Body() dto: UpdateServiceTypeDto,
    ) {
        return this.serviceTypesService.updateServiceType(companyId, serviceTypeId, membership.userId, dto);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Post(':serviceTypeId/deactivate')
    deactivateServiceType(
        @Param('companyId') companyId: string,
        @Param('serviceTypeId') serviceTypeId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
    ) {
        return this.serviceTypesService.deactivateServiceType(companyId, serviceTypeId, membership.userId);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Post(':serviceTypeId/activate')
    activateServiceType(
        @Param('companyId') companyId: string,
        @Param('serviceTypeId') serviceTypeId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
    ) {
        return this.serviceTypesService.activateServiceType(companyId, serviceTypeId, membership.userId);
    }
}
