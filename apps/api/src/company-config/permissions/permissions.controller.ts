import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { CompanyMembership, CompanyResource, PermissionAction } from '@prisma/client';
import { CurrentMembership } from '../../auth/decorators/current-membership.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CompanyMemberGuard } from '../../auth/guards/company-member.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ResourcePermissionGuard } from '../../auth/guards/resource-permission.guard';
import {
    SetRoleFieldPermissionDto,
    SetUserFieldPermissionOverrideDto,
} from './dto/set-field-permission.dto';
import { SetRolePermissionDto } from './dto/set-role-permission.dto';
import { SetUserPermissionOverrideDto } from './dto/set-user-permission-override.dto';
import { PermissionsService } from './permissions.service';

@UseGuards(JwtAuthGuard, CompanyMemberGuard, ResourcePermissionGuard)
@Controller('companies/:companyId/config/permissions')
export class PermissionsController {
    constructor(private readonly permissionsService: PermissionsService) { }

    // ── Role Permissions ──────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.VIEW)
    @Get('roles')
    getRolePermissions(@Param('companyId') companyId: string) {
        return this.permissionsService.getRolePermissions(companyId);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Put('roles')
    setRolePermission(
        @Param('companyId') companyId: string,
        @Body() dto: SetRolePermissionDto,
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
    ) {
        return this.permissionsService.setRolePermission(companyId, membership.userId, dto);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Delete('roles/:id')
    deleteRolePermission(
        @Param('companyId') companyId: string,
        @Param('id') id: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
    ) {
        return this.permissionsService.deleteRolePermission(companyId, id, membership.userId);
    }

    // ── User Permission Overrides ─────────────────────────────────────────────

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.VIEW)
    @Get('user-overrides')
    getUserPermissionOverrides(
        @Param('companyId') companyId: string,
        @Query('membershipId') membershipId: string,
    ) {
        return this.permissionsService.getUserPermissionOverrides(companyId, membershipId);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Put('user-overrides')
    setUserPermissionOverride(
        @Param('companyId') companyId: string,
        @Body() dto: SetUserPermissionOverrideDto,
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
    ) {
        return this.permissionsService.setUserPermissionOverride(companyId, membership.userId, dto);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Delete('user-overrides/:id')
    deleteUserPermissionOverride(
        @Param('companyId') companyId: string,
        @Param('id') id: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
    ) {
        return this.permissionsService.deleteUserPermissionOverride(companyId, id, membership.userId);
    }

    // ── Role Field Permissions ────────────────────────────────────────────────

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.VIEW)
    @Get('fields/roles')
    getRoleFieldPermissions(@Param('companyId') companyId: string) {
        return this.permissionsService.getRoleFieldPermissions(companyId);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Put('fields/roles')
    setRoleFieldPermission(
        @Param('companyId') companyId: string,
        @Body() dto: SetRoleFieldPermissionDto,
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
    ) {
        return this.permissionsService.setRoleFieldPermission(companyId, membership.userId, dto);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Delete('fields/roles/:id')
    deleteRoleFieldPermission(
        @Param('companyId') companyId: string,
        @Param('id') id: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
    ) {
        return this.permissionsService.deleteRoleFieldPermission(companyId, id, membership.userId);
    }

    // ── User Field Permission Overrides ───────────────────────────────────────

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.VIEW)
    @Get('fields/user-overrides')
    getUserFieldPermissionOverrides(
        @Param('companyId') companyId: string,
        @Query('membershipId') membershipId: string,
    ) {
        return this.permissionsService.getUserFieldPermissionOverrides(companyId, membershipId);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Put('fields/user-overrides')
    setUserFieldPermissionOverride(
        @Param('companyId') companyId: string,
        @Body() dto: SetUserFieldPermissionOverrideDto,
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
    ) {
        return this.permissionsService.setUserFieldPermissionOverride(companyId, membership.userId, dto);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Delete('fields/user-overrides/:id')
    deleteUserFieldPermissionOverride(
        @Param('companyId') companyId: string,
        @Param('id') id: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
    ) {
        return this.permissionsService.deleteUserFieldPermissionOverride(companyId, id, membership.userId);
    }
}
