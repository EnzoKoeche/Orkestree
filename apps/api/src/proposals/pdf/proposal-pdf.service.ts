import {
    Injectable,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { CompanyMembership, ProposalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProposalsService } from '../proposals.service';
import { ProposalPdfRenderer, ProposalPdfSnapshot } from './proposal-pdf.renderer';

// ─────────────────────────────────────────────────────────────────────────────
// proposal-pdf.service.ts
//
// On-demand, client-facing proposal PDF. No storage, no queue: the document is
// generated synchronously from a client-safe snapshot and streamed by the
// controller. The proposal is deterministic, so regenerating per download is
// fine at pilot volume and avoids the ephemeral-filesystem / R2 problem on the
// Render free tier.
//
// Security:
//   - Row-level visibility is delegated to ProposalsService.assertCanReadProposal
//     (tenant scope + CLIENTE ownership filter + DRAFT-hidden-for-CLIENTE),
//     keeping the proposal-access rules in one place.
//   - The Prisma select is explicitly client-safe: internalCost, totalCost and
//     internal `notes` are never selected, so they can't reach the renderer
//     (whose snapshot type doesn't carry them either — defence in depth).
//   - PDF is unavailable while DRAFT (the proposal is still being built).
// ─────────────────────────────────────────────────────────────────────────────

type Actor = Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>;

@Injectable()
export class ProposalPdfService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly proposalsService: ProposalsService,
        private readonly renderer: ProposalPdfRenderer,
    ) {}

    async generate(actor: Actor, proposalId: string): Promise<{ buffer: Buffer; filename: string }> {
        // Tenant + row-level visibility (throws NotFound if the actor can't see it).
        await this.proposalsService.assertCanReadProposal(actor, proposalId);

        const proposal = await this.prisma.proposal.findFirst({
            where: { id: proposalId, companyId: actor.companyId },
            select: {
                number: true,
                title: true,
                status: true,
                clientNotes: true,
                discountPct: true,
                discountAmount: true,
                subtotal: true,
                totalPrice: true,
                validUntil: true,
                createdAt: true,
                sentAt: true,
                approvedAt: true,
                company: { select: { legalName: true, tradeName: true, taxId: true } },
                client: { select: { name: true, number: true } },
                items: {
                    select: {
                        description: true,
                        unit: true,
                        quantity: true,
                        unitPrice: true,
                        discountPct: true,
                        subtotal: true,
                    },
                    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                },
            },
        });
        if (!proposal) throw new NotFoundException('Proposal not found.');

        if (proposal.status === ProposalStatus.DRAFT) {
            throw new UnprocessableEntityException(
                'PDF is only available once the proposal has been sent.',
            );
        }

        const snapshot: ProposalPdfSnapshot = {
            company: proposal.company,
            client: proposal.client,
            proposal: {
                number: proposal.number,
                title: proposal.title,
                status: proposal.status,
                clientNotes: proposal.clientNotes,
                discountPct: proposal.discountPct,
                discountAmount: proposal.discountAmount,
                subtotal: proposal.subtotal,
                totalPrice: proposal.totalPrice,
                validUntil: proposal.validUntil,
                createdAt: proposal.createdAt,
                sentAt: proposal.sentAt,
                approvedAt: proposal.approvedAt,
            },
            items: proposal.items,
        };

        const buffer = await this.renderer.render(snapshot);
        return { buffer, filename: `proposta-${proposal.number}.pdf` };
    }
}
