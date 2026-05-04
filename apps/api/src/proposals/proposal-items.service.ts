import {
    Injectable,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import {
    AuditOperation,
    CompanyMembership,
    Prisma,
    ProposalStatus,
    Role,
} from '@prisma/client';
import { ConfigAuditService } from '../company-config/audit/config-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProposalItemDto } from './dto/create-proposal-item.dto';
import { UpdateProposalItemDto } from './dto/update-proposal-item.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Response projections
//
// INTERNAL: includes internalCost (PRIVILEGED roles only via Mechanism A).
// CLIENT:   excludes internalCost; safe for non-privileged roles and PDFs.
// FieldFilterInterceptor (Mechanism B) is the defense-in-depth for any leak.
// ─────────────────────────────────────────────────────────────────────────────

export const PROPOSAL_ITEM_INTERNAL_SELECT = {
    id: true,
    description: true,
    unit: true,
    quantity: true,
    unitPrice: true,
    discountPct: true,
    internalCost: true,
    subtotal: true,
    sortOrder: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.ProposalItemSelect;

export const PROPOSAL_ITEM_CLIENT_SELECT = {
    id: true,
    description: true,
    unit: true,
    quantity: true,
    unitPrice: true,
    discountPct: true,
    subtotal: true,
    sortOrder: true,
} satisfies Prisma.ProposalItemSelect;

// ─────────────────────────────────────────────────────────────────────────────
// ProposalItemsService
//
// Owns line-item mutations on a Proposal. All mutations are DRAFT-only and
// recompute Proposal totals atomically inside the same transaction.
//
// Tenant scoping: every query/update filters by companyId from membership.
// Locking: every mutation locks the parent Proposal FOR UPDATE before
// validating status, then locks the item row FOR UPDATE on update/remove.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ProposalItemsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: ConfigAuditService,
    ) { }

    // ── Add Item ──────────────────────────────────────────────────────────────

    async addItem(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
        dto: CreateProposalItemDto,
    ) {
        const { companyId } = actorMembership;

        const created = await this.prisma.$transaction(async (tx) => {
            await this.lockDraftProposal(tx, companyId, proposalId);

            const itemSubtotal = computeItemSubtotal(
                dto.quantity,
                dto.unitPrice,
                dto.discountPct ?? null,
            );

            const item = await tx.proposalItem.create({
                data: {
                    companyId,
                    proposalId,
                    description: dto.description,
                    unit: dto.unit ?? null,
                    quantity: new Prisma.Decimal(dto.quantity),
                    unitPrice: new Prisma.Decimal(dto.unitPrice),
                    discountPct:
                        dto.discountPct !== undefined && dto.discountPct !== null
                            ? new Prisma.Decimal(dto.discountPct)
                            : null,
                    internalCost:
                        dto.internalCost !== undefined && dto.internalCost !== null
                            ? new Prisma.Decimal(dto.internalCost)
                            : null,
                    subtotal: itemSubtotal,
                    sortOrder: dto.sortOrder ?? 0,
                },
                select: { id: true },
            });

            await this.recomputeProposalTotals(tx, companyId, proposalId);

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.CREATE,
                entityType: 'ProposalItem',
                entityId: item.id,
                after: {
                    proposalId,
                    description: dto.description,
                    quantity: dto.quantity,
                    unitPrice: dto.unitPrice,
                    discountPct: dto.discountPct ?? null,
                    sortOrder: dto.sortOrder ?? 0,
                },
            });

            return item;
        });

        return this.getItem(actorMembership, proposalId, created.id);
    }

    // ── Update Item ───────────────────────────────────────────────────────────

    async updateItem(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
        itemId: string,
        dto: UpdateProposalItemDto,
    ) {
        const { companyId } = actorMembership;

        if (Object.keys(dto).length === 0) {
            return this.getItem(actorMembership, proposalId, itemId);
        }

        await this.prisma.$transaction(async (tx) => {
            await this.lockDraftProposal(tx, companyId, proposalId);

            const [existing] = await tx.$queryRaw<
                Array<{
                    id: string;
                    quantity: Prisma.Decimal;
                    unitPrice: Prisma.Decimal;
                    discountPct: Prisma.Decimal | null;
                    internalCost: Prisma.Decimal | null;
                }>
            >`
                SELECT id, quantity, "unitPrice", "discountPct", "internalCost"
                FROM "ProposalItem"
                WHERE id = ${itemId}
                  AND "proposalId" = ${proposalId}
                  AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            if (!existing) throw new NotFoundException('Proposal item not found.');

            const nextQuantity =
                dto.quantity !== undefined ? new Prisma.Decimal(dto.quantity) : existing.quantity;
            const nextUnitPrice =
                dto.unitPrice !== undefined ? new Prisma.Decimal(dto.unitPrice) : existing.unitPrice;
            const nextDiscountPct =
                dto.discountPct !== undefined
                    ? dto.discountPct === null
                        ? null
                        : new Prisma.Decimal(dto.discountPct)
                    : existing.discountPct;

            const updateData: Prisma.ProposalItemUpdateInput = {};

            if (dto.description !== undefined) updateData.description = dto.description;
            if (dto.unit !== undefined) updateData.unit = dto.unit ?? null;
            if (dto.quantity !== undefined) updateData.quantity = nextQuantity;
            if (dto.unitPrice !== undefined) updateData.unitPrice = nextUnitPrice;
            if (dto.discountPct !== undefined) updateData.discountPct = nextDiscountPct;
            if (dto.internalCost !== undefined) {
                updateData.internalCost =
                    dto.internalCost === null ? null : new Prisma.Decimal(dto.internalCost);
            }
            if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;

            // Recompute subtotal whenever any pricing input changed
            if (
                dto.quantity !== undefined ||
                dto.unitPrice !== undefined ||
                dto.discountPct !== undefined
            ) {
                updateData.subtotal = computeItemSubtotalFromDecimal(
                    nextQuantity,
                    nextUnitPrice,
                    nextDiscountPct,
                );
            }

            await tx.proposalItem.update({ where: { id: itemId }, data: updateData });

            await this.recomputeProposalTotals(tx, companyId, proposalId);

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.UPDATE,
                entityType: 'ProposalItem',
                entityId: itemId,
                before: {
                    quantity: existing.quantity.toString(),
                    unitPrice: existing.unitPrice.toString(),
                    discountPct: existing.discountPct?.toString() ?? null,
                },
                after: {
                    quantity: nextQuantity.toString(),
                    unitPrice: nextUnitPrice.toString(),
                    discountPct: nextDiscountPct?.toString() ?? null,
                },
            });
        });

        return this.getItem(actorMembership, proposalId, itemId);
    }

    // ── Remove Item ───────────────────────────────────────────────────────────

    async removeItem(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
        itemId: string,
    ) {
        const { companyId } = actorMembership;

        await this.prisma.$transaction(async (tx) => {
            await this.lockDraftProposal(tx, companyId, proposalId);

            const [existing] = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT id
                FROM "ProposalItem"
                WHERE id = ${itemId}
                  AND "proposalId" = ${proposalId}
                  AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            if (!existing) throw new NotFoundException('Proposal item not found.');

            await tx.proposalItem.delete({ where: { id: itemId } });

            await this.recomputeProposalTotals(tx, companyId, proposalId);

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.DELETE,
                entityType: 'ProposalItem',
                entityId: itemId,
                before: { proposalId },
            });
        });
    }

    // ── List Items ────────────────────────────────────────────────────────────

    async listItems(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
    ) {
        const { companyId } = actorMembership;
        const select = selectForRole(actorMembership.role);

        return this.prisma.proposalItem.findMany({
            where: { companyId, proposalId },
            select,
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
    }

    // ── Get Item ──────────────────────────────────────────────────────────────

    async getItem(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
        itemId: string,
    ) {
        const { companyId } = actorMembership;
        const select = selectForRole(actorMembership.role);

        const item = await this.prisma.proposalItem.findFirst({
            where: { id: itemId, proposalId, companyId },
            select,
        });
        if (!item) throw new NotFoundException('Proposal item not found.');
        return item;
    }

    // ── Public helpers (used by ProposalsService for initial creation) ────────

    async createInitialItem(
        tx: Prisma.TransactionClient,
        companyId: string,
        proposalId: string,
        dto: CreateProposalItemDto,
    ): Promise<void> {
        await tx.proposalItem.create({
            data: {
                companyId,
                proposalId,
                description: dto.description,
                unit: dto.unit ?? null,
                quantity: new Prisma.Decimal(dto.quantity),
                unitPrice: new Prisma.Decimal(dto.unitPrice),
                discountPct:
                    dto.discountPct !== undefined && dto.discountPct !== null
                        ? new Prisma.Decimal(dto.discountPct)
                        : null,
                internalCost:
                    dto.internalCost !== undefined && dto.internalCost !== null
                        ? new Prisma.Decimal(dto.internalCost)
                        : null,
                subtotal: computeItemSubtotal(
                    dto.quantity,
                    dto.unitPrice,
                    dto.discountPct ?? null,
                ),
                sortOrder: dto.sortOrder ?? 0,
            },
        });
    }

    // Recomputes Proposal.subtotal, totalPrice, and totalCost from current items.
    // Caller is responsible for having locked the Proposal row beforehand.
    async recomputeProposalTotals(
        tx: Prisma.TransactionClient,
        companyId: string,
        proposalId: string,
    ): Promise<{ subtotal: Prisma.Decimal; totalPrice: Prisma.Decimal; totalCost: Prisma.Decimal }> {
        const items = await tx.proposalItem.findMany({
            where: { companyId, proposalId },
            select: { quantity: true, internalCost: true, subtotal: true },
        });

        let subtotal = new Prisma.Decimal(0);
        let totalCost = new Prisma.Decimal(0);

        for (const it of items) {
            subtotal = subtotal.plus(it.subtotal);
            if (it.internalCost) {
                totalCost = totalCost.plus(it.internalCost.mul(it.quantity));
            }
        }

        const proposal = await tx.proposal.findUnique({
            where: { id: proposalId },
            select: { discountPct: true, discountAmount: true },
        });

        let effectiveDiscount = new Prisma.Decimal(0);
        if (proposal) {
            if (proposal.discountAmount) {
                effectiveDiscount = proposal.discountAmount;
            } else if (proposal.discountPct) {
                effectiveDiscount = subtotal.mul(proposal.discountPct).div(100);
            }
        }

        let totalPrice = subtotal.minus(effectiveDiscount);
        if (totalPrice.lt(0)) totalPrice = new Prisma.Decimal(0);

        // Round to 2 decimals to match column scale
        subtotal = roundToScale(subtotal, 2);
        totalPrice = roundToScale(totalPrice, 2);
        totalCost = roundToScale(totalCost, 2);

        await tx.proposal.update({
            where: { id: proposalId },
            data: { subtotal, totalPrice, totalCost },
        });

        return { subtotal, totalPrice, totalCost };
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private async lockDraftProposal(
        tx: Prisma.TransactionClient,
        companyId: string,
        proposalId: string,
    ): Promise<void> {
        const [proposal] = await tx.$queryRaw<
            Array<{ id: string; status: ProposalStatus }>
        >`
            SELECT id, status
            FROM "Proposal"
            WHERE id = ${proposalId} AND "companyId" = ${companyId}
            FOR UPDATE
        `;

        if (!proposal) throw new NotFoundException('Proposal not found.');
        if (proposal.status !== ProposalStatus.DRAFT) {
            throw new UnprocessableEntityException(
                'Proposal items can only be modified while the proposal is in DRAFT.',
            );
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function selectForRole(role: Role): Prisma.ProposalItemSelect {
    return role === Role.OWNER || role === Role.ADMIN
        ? PROPOSAL_ITEM_INTERNAL_SELECT
        : PROPOSAL_ITEM_CLIENT_SELECT;
}

function computeItemSubtotal(
    quantity: number,
    unitPrice: number,
    discountPct: number | null,
): Prisma.Decimal {
    return computeItemSubtotalFromDecimal(
        new Prisma.Decimal(quantity),
        new Prisma.Decimal(unitPrice),
        discountPct === null ? null : new Prisma.Decimal(discountPct),
    );
}

function computeItemSubtotalFromDecimal(
    quantity: Prisma.Decimal,
    unitPrice: Prisma.Decimal,
    discountPct: Prisma.Decimal | null,
): Prisma.Decimal {
    const gross = quantity.mul(unitPrice);
    const factor = discountPct
        ? new Prisma.Decimal(1).minus(discountPct.div(100))
        : new Prisma.Decimal(1);
    let net = gross.mul(factor);
    if (net.lt(0)) net = new Prisma.Decimal(0);
    return roundToScale(net, 2);
}

function roundToScale(value: Prisma.Decimal, scale: number): Prisma.Decimal {
    // Banker's rounding via Decimal.js; default is ROUND_HALF_EVEN, which is
    // safe for currency totals and consistent across recomputations.
    return value.toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_EVEN);
}
