import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
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
import { CreateProposalDto } from './dto/create-proposal.dto';
import { CreateProposalItemDto } from './dto/create-proposal-item.dto';
import { ListProposalsDto } from './dto/list-proposals.dto';
import { TransitionProposalDto } from './dto/transition-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { UpdateProposalItemDto } from './dto/update-proposal-item.dto';
import { ProposalItemsService } from './proposal-items.service';
import { ProposalTransitionsService } from './proposal-transitions.service';
import { ProposalsService } from './proposals.service';

type ActorMembership = Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>;

@UseGuards(JwtAuthGuard, CompanyMemberGuard, ResourcePermissionGuard)
@Controller('companies/:companyId/proposals')
export class ProposalsController {
    constructor(
        private readonly proposalsService: ProposalsService,
        private readonly itemsService: ProposalItemsService,
        private readonly transitionsService: ProposalTransitionsService,
    ) { }

    // ── Proposals ─────────────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.VIEW)
    @Get()
    listProposals(
        @CurrentMembership() membership: ActorMembership,
        @Query() query: ListProposalsDto,
    ) {
        return this.proposalsService.listProposals(membership, query);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.CREATE)
    @Post()
    createProposal(
        @CurrentMembership() membership: ActorMembership,
        @Body() dto: CreateProposalDto,
    ) {
        return this.proposalsService.createProposal(membership, dto);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.VIEW)
    @Get(':proposalId')
    getProposal(
        @CurrentMembership() membership: ActorMembership,
        @Param('proposalId') proposalId: string,
    ) {
        return this.proposalsService.getProposal(membership, proposalId);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.EDIT)
    @Patch(':proposalId')
    updateProposal(
        @CurrentMembership() membership: ActorMembership,
        @Param('proposalId') proposalId: string,
        @Body() dto: UpdateProposalDto,
    ) {
        return this.proposalsService.updateProposal(membership, proposalId, dto);
    }

    // ── Status Transitions ────────────────────────────────────────────────────
    //
    // Single transition entrypoint. APPROVE/REJECT additionally require the
    // matching PROPOSAL.APPROVE / PROPOSAL.REJECT permission (enforced inside
    // ProposalTransitionsService). PROPOSAL.EDIT is the baseline gate here.

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.EDIT)
    @Post(':proposalId/transition')
    transitionProposal(
        @CurrentMembership() membership: ActorMembership,
        @Param('proposalId') proposalId: string,
        @Body() dto: TransitionProposalDto,
    ) {
        return this.transitionsService.transition(membership, proposalId, dto);
    }

    // ── Items ─────────────────────────────────────────────────────────────────

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.VIEW)
    @Get(':proposalId/items')
    listItems(
        @CurrentMembership() membership: ActorMembership,
        @Param('proposalId') proposalId: string,
    ) {
        return this.itemsService.listItems(membership, proposalId);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.EDIT)
    @Post(':proposalId/items')
    addItem(
        @CurrentMembership() membership: ActorMembership,
        @Param('proposalId') proposalId: string,
        @Body() dto: CreateProposalItemDto,
    ) {
        return this.itemsService.addItem(membership, proposalId, dto);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.EDIT)
    @Patch(':proposalId/items/:itemId')
    updateItem(
        @CurrentMembership() membership: ActorMembership,
        @Param('proposalId') proposalId: string,
        @Param('itemId') itemId: string,
        @Body() dto: UpdateProposalItemDto,
    ) {
        return this.itemsService.updateItem(membership, proposalId, itemId, dto);
    }

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.EDIT)
    @Delete(':proposalId/items/:itemId')
    @HttpCode(204)
    removeItem(
        @CurrentMembership() membership: ActorMembership,
        @Param('proposalId') proposalId: string,
        @Param('itemId') itemId: string,
    ) {
        return this.itemsService.removeItem(membership, proposalId, itemId);
    }
}
