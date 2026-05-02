import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CompanyMembership, CompanyResource, PermissionAction } from '@prisma/client';
import { CurrentMembership } from '../auth/decorators/current-membership.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CompanyMemberGuard } from '../auth/guards/company-member.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResourcePermissionGuard } from '../auth/guards/resource-permission.guard';
import { CreateProposalItemDto } from './dto/create-proposal-item.dto';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { ListProposalsDto } from './dto/list-proposals.dto';
import { SetProposalFieldValuesDto } from './dto/set-proposal-field-value.dto';
import {
    ApproveProposalDto,
    CancelProposalDto,
    RejectProposalDto,
    SendProposalDto,
} from './dto/transition-proposal.dto';
import { UpdateProposalItemDto } from './dto/update-proposal-item.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { ProposalItemsService } from './proposal-items.service';
import { ProposalTransitionsService } from './proposal-transitions.service';
import { ProposalsService } from './proposals.service';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalsController
//
// Routes are tenant-scoped under /companies/:companyId/proposals — the
// CompanyMemberGuard resolves the authenticated membership for that company
// and attaches it to the request as `companyMembership`.
//
// Permission semantics (matches permission.defaults.ts):
//   VIEW    : list / get / get items / get field values
//   CREATE  : create proposal
//   EDIT    : update / add-item / update-item / remove-item / set-field-values
//             / cancel
//   PUBLISH : send (DRAFT → SENT)
//   APPROVE : approve (SENT → APPROVED) — also re-checked in service
//   REJECT  : reject  (SENT → REJECTED) — also re-checked in service
// ─────────────────────────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard, CompanyMemberGuard, ResourcePermissionGuard)
@Controller('companies/:companyId/proposals')
export class ProposalsController {
    constructor(
        private readonly proposalsService: ProposalsService,
        private readonly itemsService: ProposalItemsService,
        private readonly transitionsService: ProposalTransitionsService,
        private readonly events: EventEmitter2,
    ) { }

    // ── Proposal CRUD ────────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.VIEW)
    @Get()
    listProposals(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Query() query: ListProposalsDto,
    ) {
        return this.proposalsService.listProposals(membership, query);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.CREATE)
    @Post()
    createProposal(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Body() dto: CreateProposalDto,
    ) {
        return this.proposalsService.createProposal(membership, dto);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.VIEW)
    @Get(':proposalId')
    getProposal(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('proposalId') proposalId: string,
    ) {
        return this.proposalsService.getProposal(membership, proposalId);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.EDIT)
    @Patch(':proposalId')
    updateProposal(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('proposalId') proposalId: string,
        @Body() dto: UpdateProposalDto,
    ) {
        return this.proposalsService.updateProposal(membership, proposalId, dto);
    }

    // ── Lifecycle transitions ────────────────────────────────────────────────

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.PUBLISH)
    @Post(':proposalId/send')
    sendProposal(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('proposalId') proposalId: string,
        @Body() dto: SendProposalDto,
    ) {
        return this.transitionsService.sendProposal(membership, proposalId, dto);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.APPROVE)
    @Post(':proposalId/approve')
    approveProposal(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('proposalId') proposalId: string,
        @Body() dto: ApproveProposalDto,
    ) {
        return this.transitionsService.approveProposal(membership, proposalId, dto);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.REJECT)
    @Post(':proposalId/reject')
    rejectProposal(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('proposalId') proposalId: string,
        @Body() dto: RejectProposalDto,
    ) {
        return this.transitionsService.rejectProposal(membership, proposalId, dto);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.EDIT)
    @Post(':proposalId/cancel')
    cancelProposal(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('proposalId') proposalId: string,
        @Body() dto: CancelProposalDto,
    ) {
        return this.transitionsService.cancelProposal(membership, proposalId, dto);
    }

    // ── Items ────────────────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.VIEW)
    @Get(':proposalId/items')
    listItems(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('proposalId') proposalId: string,
    ) {
        return this.proposalsService.listItemsForProposal(membership, proposalId);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.EDIT)
    @Post(':proposalId/items')
    async addItem(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('proposalId') proposalId: string,
        @Body() dto: CreateProposalItemDto,
    ) {
        // Verify visibility before delegating; itemsService.addItem validates
        // tenant + DRAFT under FOR UPDATE but cannot apply CLIENTE row-level
        // isolation on its own.
        await this.proposalsService.getProposal(membership, proposalId);
        await this.itemsService.addItem(membership.companyId, proposalId, dto);
        this.emitItemsChanged(membership.companyId, proposalId);
        return this.proposalsService.getProposal(membership, proposalId);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.EDIT)
    @Patch(':proposalId/items/:itemId')
    async updateItem(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('proposalId') proposalId: string,
        @Param('itemId') itemId: string,
        @Body() dto: UpdateProposalItemDto,
    ) {
        await this.proposalsService.getProposal(membership, proposalId);
        await this.itemsService.updateItem(membership.companyId, proposalId, itemId, dto);
        this.emitItemsChanged(membership.companyId, proposalId);
        return this.proposalsService.getProposal(membership, proposalId);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.EDIT)
    @Delete(':proposalId/items/:itemId')
    async removeItem(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('proposalId') proposalId: string,
        @Param('itemId') itemId: string,
    ) {
        await this.proposalsService.getProposal(membership, proposalId);
        await this.itemsService.removeItem(membership.companyId, proposalId, itemId);
        this.emitItemsChanged(membership.companyId, proposalId);
        return this.proposalsService.getProposal(membership, proposalId);
    }

    // ── Field values ─────────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.VIEW)
    @Get(':proposalId/field-values')
    getFieldValues(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('proposalId') proposalId: string,
    ) {
        return this.proposalsService.getFieldValues(membership, proposalId);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.EDIT)
    @Put(':proposalId/field-values')
    setFieldValues(
        @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('proposalId') proposalId: string,
        @Body() dto: SetProposalFieldValuesDto,
    ) {
        return this.proposalsService.setFieldValues(membership, proposalId, dto.fieldValues);
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    /**
     * Emit proposal.items.changed after an item mutation has already returned
     * (i.e. the underlying transaction has committed). Centralised here so
     * every item endpoint emits the same event shape.
     */
    private emitItemsChanged(companyId: string, proposalId: string): void {
        this.events.emit('proposal.items.changed', {
            companyId,
            proposalId,
            cause: 'item-mutation',
        });
    }
}
