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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsDto } from './dto/list-clients.dto';
import { SetClientFieldValuesDto } from './dto/set-client-field-value.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@UseGuards(JwtAuthGuard, CompanyMemberGuard, ResourcePermissionGuard)
@Controller('companies/:companyId/clients')
export class ClientsController {
    constructor(private readonly clientsService: ClientsService) { }

    // ── Clients ───────────────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.CLIENT, PermissionAction.VIEW)
    @Get()
    listClients(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Query() query: ListClientsDto,
    ) {
        return this.clientsService.listClients(membership.companyId, query);
    }

    @RequirePermission(CompanyResource.CLIENT, PermissionAction.CREATE)
    @Post()
    createClient(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Body() dto: CreateClientDto,
    ) {
        return this.clientsService.createClient(membership, dto);
    }

    @RequirePermission(CompanyResource.CLIENT, PermissionAction.VIEW)
    @Get(':clientId')
    getClient(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('clientId') clientId: string,
    ) {
        return this.clientsService.getClient(membership.companyId, clientId);
    }

    @RequirePermission(CompanyResource.CLIENT, PermissionAction.EDIT)
    @Patch(':clientId')
    updateClient(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('clientId') clientId: string,
        @Body() dto: UpdateClientDto,
    ) {
        return this.clientsService.updateClient(membership, clientId, dto);
    }

    @RequirePermission(CompanyResource.CLIENT, PermissionAction.DELETE)
    @Post(':clientId/deactivate')
    deactivateClient(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('clientId') clientId: string,
    ) {
        return this.clientsService.deactivateClient(membership, clientId);
    }

    @RequirePermission(CompanyResource.CLIENT, PermissionAction.EDIT)
    @Post(':clientId/reactivate')
    reactivateClient(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('clientId') clientId: string,
    ) {
        return this.clientsService.reactivateClient(membership, clientId);
    }

    // ── Field values ──────────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.CLIENT, PermissionAction.VIEW)
    @Get(':clientId/field-values')
    getFieldValues(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('clientId') clientId: string,
    ) {
        return this.clientsService.getFieldValues(membership.companyId, clientId);
    }

    @RequirePermission(CompanyResource.CLIENT, PermissionAction.EDIT)
    @Put(':clientId/field-values')
    setFieldValues(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('clientId') clientId: string,
        @Body() dto: SetClientFieldValuesDto,
    ) {
        return this.clientsService.setFieldValues(membership, clientId, dto.items);
    }
}
