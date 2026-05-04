import {
    Injectable,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
    AuditOperation,
    CompanyMembership,
    Prisma,
    ProposalStatus,
    Role,
} from '@prisma/client';
import { ConfigAuditService } from '../company-config/audit/config-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { ListProposalsDto } from './dto/list-proposals.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import {
    PROPOSAL_ITEM_CLIENT_SELECT,
    PROPOSAL_ITEM_INTERNAL_SELECT,
    ProposalItemsService,
} from './proposal-items.service';

// ─────────────────────────────────────────────────────────────────────────────
// Response projections
//
// INTERNAL: all proposal columns except companyId. Includes totalCost,
//   internalCost on items, and internal `notes`. Used for OWNER/ADMIN.
// CLIENT:   excludes totalCost, internal `notes`, and cost fields on items.
//   Used for FINANCEIRO, OPERACIONAL, CLIENTE — and the PDF pipeline.
// FieldFilterInterceptor (Mechanism B) is the global defense-in-depth.
// ─────────────────────────────────────────────────────────────────────────────

const MEMBERSHIP_USER_SELECT = {
    id: true,
    user: {
        select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
        },
    },
} satisfies Prisma.CompanyMembershipSelect;

const PROPOSAL_INTERNAL_SELECT = {
    id: true,
    number: true,
    status: true,
    title: true,
    notes: true,
    clientNotes: true,
    discountPct: true,
    discountAmount: true,
    subtotal: true,
    totalPrice: true,
    totalCost: true,
    validUntil: true,
    pdfUrl: true,
    pdfGeneratedAt: true,
    sentAt: true,
    approvedAt: true,
    rejectedAt: true,
    expiredAt: true,
    cancelledAt: true,
    rejectionReason: true,
    cancellationReason: true,
    createdAt: true,
    updatedAt: true,
    serviceRequest: {
        select: { id: true, number: true, title: true },
    },
    client: {
        select: { id: true, number: true, name: true, type: true },
    },
    createdByMembership: { select: MEMBERSHIP_USER_SELECT },
    approvedByMembership: { select: MEMBERSHIP_USER_SELECT },
    rejectedByMembership: { select: MEMBERSHIP_USER_SELECT },
} satisfies Prisma.ProposalSelect;

const PROPOSAL_CLIENT_SELECT = {
    id: true,
    number: true,
    status: true,
    title: true,
    clientNotes: true,
    discountPct: true,
    discountAmount: true,
    subtotal: true,
    totalPrice: true,
    validUntil: true,
    pdfUrl: true,
    pdfGeneratedAt: true,
    sentAt: true,
    approvedAt: true,
    rejectedAt: true,
    expiredAt: true,
    cancelledAt: true,
    rejectionReason: true,
    createdAt: true,
    updatedAt: true,
    serviceRequest: {
        select: { id: true, number: true, title: true },
    },
    client: {
        select: { id: true, number: true, name: true, type: true },
    },
} satisfies Prisma.ProposalSelect;

function proposalSelectForRole(role: Role): Prisma.ProposalSelect {
    return role === Role.OWNER || role === Role.ADMIN
        ? PROPOSAL_INTERNAL_SELECT
        : PROPOSAL_CLIENT_SELECT;
}

function itemSelectForRole(role: Role): Prisma.ProposalItemSelect {
    return role === Role.OWNER || role === Role.ADMIN
        ? PROPOSAL_ITEM_INTERNAL_SELECT
        : PROPOSAL_ITEM_CLIENT_SELECT;
}

// ─────────────────────────────────────────────────────────────────────────────
// ProposalsService
//
// Owns creation, update, list, and get of Proposals.
// Item mutations live in ProposalItemsService.
// Status transitions live in ProposalTransitionsService.
//
// Tenant scoping: every query filters by companyId from membership.
// CLIENTE row-level filter:
//   - The proposal's parent ServiceRequest.createdByMembershipId must match
//     the calling membership.id (mirrors ServiceRequestsService).
//   - Proposals in DRAFT are never visible to CLIENTE.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ProposalsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly itemsService: ProposalItemsService,
        private readonly auditService: ConfigAuditService,
        private readonly events: EventEmitter2,
    ) { }

    // ── Create ────────────────────────────────────────────────────────────────

    async createProposal(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        dto: CreateProposalDto,
    ) {
        const { companyId } = actorMembership;
        let createdProposalId: string | null = null;

        await this.prisma.$transaction(async (tx) => {
            // ── 1. Validate parent ServiceRequest (active, same tenant)
            const request = await tx.serviceRequest.findFirst({
                where: { id: dto.serviceRequestId, companyId },
                select: { id: true, isCancelled: true, clientId: true },
            });
            if (!request) {
                throw new NotFoundException('Service request not found.');
            }
            if (request.isCancelled) {
                throw new UnprocessableEntityException(
                    'Cannot create a proposal for a cancelled service request.',
                );
            }

            // ── 2. Reject incompatible discount inputs
            if (dto.discountPct !== undefined && dto.discountAmount !== undefined) {
                throw new UnprocessableEntityException(
                    'Provide either discountPct or discountAmount, not both.',
                );
            }

            // ── 3. Advisory lock keyed by (companyId, 'proposals') to serialize
            //       proposal-number generation without contending with other
            //       sequential-number flows in the same company.
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId + ':proposals'})::bigint)`;

            // ── 4. Generate sequential proposal number
            const [maxRow] = await tx.$queryRaw<Array<{ max: number | null }>>`
                SELECT MAX(number)::int AS max
                FROM "Proposal"
                WHERE "companyId" = ${companyId}
            `;
            const proposalNumber = (maxRow?.max ?? 0) + 1;

            // ── 5. Create the Proposal row in DRAFT
            const created = await tx.proposal.create({
                data: {
                    companyId,
                    serviceRequestId: dto.serviceRequestId,
                    clientId: request.clientId ?? null,
                    number: proposalNumber,
                    status: ProposalStatus.DRAFT,
                    title: dto.title,
                    notes: dto.notes ?? null,
                    clientNotes: dto.clientNotes ?? null,
                    discountPct:
                        dto.discountPct !== undefined ? new Prisma.Decimal(dto.discountPct) : null,
                    discountAmount:
                        dto.discountAmount !== undefined
                            ? new Prisma.Decimal(dto.discountAmount)
                            : null,
                    validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
                    createdByMembershipId: actorMembership.id,
                },
                select: { id: true },
            });

            // ── 6. Create initial items (if any) and recompute totals
            if (dto.items && dto.items.length > 0) {
                for (const item of dto.items) {
                    await this.itemsService.createInitialItem(tx, companyId, created.id, item);
                }
            }
            await this.itemsService.recomputeProposalTotals(tx, companyId, created.id);

            // ── 7. Initial DRAFT placement in status history
            await tx.proposalStatusHistory.create({
                data: {
                    companyId,
                    proposalId: created.id,
                    fromStatus: null,
                    toStatus: ProposalStatus.DRAFT,
                    actorMembershipId: actorMembership.id,
                    note: null,
                },
            });

            // ── 8. Audit log
            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.CREATE,
                entityType: 'Proposal',
                entityId: created.id,
                entityCode: String(proposalNumber),
                after: {
                    number: proposalNumber,
                    serviceRequestId: dto.serviceRequestId,
                    clientId: request.clientId ?? null,
                    title: dto.title,
                    status: ProposalStatus.DRAFT,
                },
            });

            createdProposalId = created.id;
        });

        if (createdProposalId) {
            this.events.emit('proposal.created', { companyId, proposalId: createdProposalId });
        }

        return this.getProposal(actorMembership, createdProposalId!);
    }

    // ── Update ────────────────────────────────────────────────────────────────

    async updateProposal(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
        dto: UpdateProposalDto,
    ) {
        const { companyId } = actorMembership;

        if (Object.keys(dto).length === 0) {
            return this.getProposal(actorMembership, proposalId);
        }

        if (dto.discountPct !== undefined && dto.discountAmount !== undefined) {
            throw new UnprocessableEntityException(
                'Provide either discountPct or discountAmount, not both.',
            );
        }

        await this.prisma.$transaction(async (tx) => {
            // Lock the row and verify DRAFT status atomically.
            const [existing] = await tx.$queryRaw<
                Array<{
                    id: string;
                    status: ProposalStatus;
                    title: string;
                    notes: string | null;
                    clientNotes: string | null;
                    discountPct: Prisma.Decimal | null;
                    discountAmount: Prisma.Decimal | null;
                    validUntil: Date | null;
                }>
            >`
                SELECT id, status, title, notes, "clientNotes",
                       "discountPct", "discountAmount", "validUntil"
                FROM "Proposal"
                WHERE id = ${proposalId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            if (!existing) throw new NotFoundException('Proposal not found.');
            if (existing.status !== ProposalStatus.DRAFT) {
                throw new UnprocessableEntityException(
                    'Only DRAFT proposals can be edited.',
                );
            }

            const updateData: Prisma.ProposalUpdateInput = {};
            if (dto.title !== undefined) updateData.title = dto.title;
            if (dto.notes !== undefined) updateData.notes = dto.notes ?? null;
            if (dto.clientNotes !== undefined) updateData.clientNotes = dto.clientNotes ?? null;

            // Discount inputs are mutually exclusive: setting one clears the other,
            // so totals stay consistent with the user's most recent intent.
            if (dto.discountPct !== undefined) {
                updateData.discountPct =
                    dto.discountPct === null ? null : new Prisma.Decimal(dto.discountPct);
                updateData.discountAmount = null;
            }
            if (dto.discountAmount !== undefined) {
                updateData.discountAmount =
                    dto.discountAmount === null ? null : new Prisma.Decimal(dto.discountAmount);
                updateData.discountPct = null;
            }
            if (dto.validUntil !== undefined) {
                updateData.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
            }

            await tx.proposal.update({ where: { id: proposalId }, data: updateData });

            // Recompute totals if discount inputs changed.
            if (dto.discountPct !== undefined || dto.discountAmount !== undefined) {
                await this.itemsService.recomputeProposalTotals(tx, companyId, proposalId);
            }

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.UPDATE,
                entityType: 'Proposal',
                entityId: proposalId,
                before: {
                    title: existing.title,
                    notes: existing.notes,
                    clientNotes: existing.clientNotes,
                    discountPct: existing.discountPct?.toString() ?? null,
                    discountAmount: existing.discountAmount?.toString() ?? null,
                    validUntil: existing.validUntil?.toISOString() ?? null,
                },
                after: {
                    title: dto.title ?? existing.title,
                    notes: dto.notes !== undefined ? dto.notes : existing.notes,
                    clientNotes:
                        dto.clientNotes !== undefined ? dto.clientNotes : existing.clientNotes,
                    discountPct:
                        dto.discountPct !== undefined
                            ? dto.discountPct
                            : existing.discountPct?.toString() ?? null,
                    discountAmount:
                        dto.discountAmount !== undefined
                            ? dto.discountAmount
                            : existing.discountAmount?.toString() ?? null,
                    validUntil:
                        dto.validUntil !== undefined
                            ? dto.validUntil
                            : existing.validUntil?.toISOString() ?? null,
                },
            });
        });

        return this.getProposal(actorMembership, proposalId);
    }

    // ── List ──────────────────────────────────────────────────────────────────

    async listProposals(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        query: ListProposalsDto,
    ) {
        const { companyId } = actorMembership;

        const where: Prisma.ProposalWhereInput = { companyId };

        if (query.status !== undefined) where.status = query.status;
        if (query.serviceRequestId !== undefined) where.serviceRequestId = query.serviceRequestId;
        if (query.clientId !== undefined) where.clientId = query.clientId;

        // CLIENTE row-level filter:
        //   - only proposals on requests they created
        //   - DRAFT proposals are hidden
        if (actorMembership.role === Role.CLIENTE) {
            where.serviceRequest = { createdByMembershipId: actorMembership.id };
            if (query.status !== undefined && query.status === ProposalStatus.DRAFT) {
                return [];
            }
            where.status = where.status ?? { not: ProposalStatus.DRAFT };
        }

        const select = proposalSelectForRole(actorMembership.role);

        return this.prisma.proposal.findMany({
            where,
            select,
            orderBy: { number: 'desc' },
            take: query.limit ?? 50,
            skip: query.skip ?? 0,
        });
    }

    // ── Get ───────────────────────────────────────────────────────────────────

    async getProposal(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
    ) {
        const { companyId } = actorMembership;

        const where: Prisma.ProposalWhereInput = { id: proposalId, companyId };

        if (actorMembership.role === Role.CLIENTE) {
            where.serviceRequest = { createdByMembershipId: actorMembership.id };
            where.status = { not: ProposalStatus.DRAFT };
        }

        const select = proposalSelectForRole(actorMembership.role);
        const itemSelect = itemSelectForRole(actorMembership.role);

        const proposal = await this.prisma.proposal.findFirst({
            where,
            select: {
                ...select,
                items: {
                    select: itemSelect,
                    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
                },
            },
        });

        if (!proposal) throw new NotFoundException('Proposal not found.');
        return proposal;
    }
}
