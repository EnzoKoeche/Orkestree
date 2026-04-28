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
import { CurrentMembership } from '../../auth/decorators/current-membership.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CompanyMemberGuard } from '../../auth/guards/company-member.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ResourcePermissionGuard } from '../../auth/guards/resource-permission.guard';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldOptionDto } from './dto/create-custom-field-option.dto';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { ListCustomFieldsDto } from './dto/list-custom-fields.dto';
import { UpdateCustomFieldOptionDto } from './dto/update-custom-field-option.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

@UseGuards(JwtAuthGuard, CompanyMemberGuard, ResourcePermissionGuard)
@Controller('companies/:companyId/config/custom-fields')
export class CustomFieldsController {
    constructor(private readonly customFieldsService: CustomFieldsService) { }

    // ── Field endpoints ───────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.VIEW)
    @Get()
    listCustomFields(
        @Param('companyId') companyId: string,
        @Query() query: ListCustomFieldsDto,
    ) {
        return this.customFieldsService.listCustomFields(companyId, query);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.VIEW)
    @Get(':fieldId')
    getCustomField(
        @Param('companyId') companyId: string,
        @Param('fieldId') fieldId: string,
    ) {
        return this.customFieldsService.getCustomField(companyId, fieldId);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.CREATE)
    @Post()
    createCustomField(
        @Param('companyId') companyId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
        @Body() dto: CreateCustomFieldDto,
    ) {
        return this.customFieldsService.createCustomField(companyId, membership.userId, dto);
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Patch(':fieldId')
    updateCustomField(
        @Param('companyId') companyId: string,
        @Param('fieldId') fieldId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
        @Body() dto: UpdateCustomFieldDto,
    ) {
        return this.customFieldsService.updateCustomField(
            companyId,
            fieldId,
            membership.userId,
            dto,
        );
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Post(':fieldId/deactivate')
    deactivateCustomField(
        @Param('companyId') companyId: string,
        @Param('fieldId') fieldId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
    ) {
        return this.customFieldsService.deactivateCustomField(
            companyId,
            fieldId,
            membership.userId,
        );
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Post(':fieldId/activate')
    activateCustomField(
        @Param('companyId') companyId: string,
        @Param('fieldId') fieldId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
    ) {
        return this.customFieldsService.activateCustomField(
            companyId,
            fieldId,
            membership.userId,
        );
    }

    // ── Field option endpoints ────────────────────────────────────────────────

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Post(':fieldId/options')
    addOption(
        @Param('companyId') companyId: string,
        @Param('fieldId') fieldId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
        @Body() dto: CreateCustomFieldOptionDto,
    ) {
        return this.customFieldsService.addOption(
            companyId,
            fieldId,
            membership.userId,
            dto,
        );
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Patch(':fieldId/options/:optionId')
    updateOption(
        @Param('companyId') companyId: string,
        @Param('fieldId') fieldId: string,
        @Param('optionId') optionId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
        @Body() dto: UpdateCustomFieldOptionDto,
    ) {
        return this.customFieldsService.updateOption(
            companyId,
            fieldId,
            optionId,
            membership.userId,
            dto,
        );
    }

    @RequirePermission(CompanyResource.COMPANY_CONFIG, PermissionAction.EDIT)
    @Delete(':fieldId/options/:optionId')
    deleteOption(
        @Param('companyId') companyId: string,
        @Param('fieldId') fieldId: string,
        @Param('optionId') optionId: string,
        @CurrentMembership() membership: Pick<CompanyMembership, 'userId'>,
    ) {
        return this.customFieldsService.deleteOption(
            companyId,
            fieldId,
            optionId,
            membership.userId,
        );
    }
}
