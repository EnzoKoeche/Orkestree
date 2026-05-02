import {
    Injectable,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, ProposalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProposalItemDto } from './dto/create-proposal-item.dto';
import { UpdateProposalItemDto } from './dto/update-proposal-item.dto';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalItemsService
//
// Owns the proposal-item CRUD surface and is the single canonical source of
// pricing arithmetic for a proposal. Three rules drive the design:
//
//  1. Mutations are rejected unless the parent Proposal is in DRAFT. Status
//     is re-checked under SELECT FOR UPDATE inside every mutation tx so that
//     a concurrent SEND/APPROVE/CANCEL committed between the caller's read
//     and our write cannot leave a DRAFT-only edit applied to a sealed
//     proposal.
//
//  2. All computed totals (item.subtotal, proposal.subtotal,
//     proposal.totalPrice, proposal.totalCost) are derived here from raw
//     numeric inputs. Client-supplied totals are never trusted — see
//     Create/UpdateProposalItemDto, neither of which exposes a subtotal
//     field.
//
//  3. Decimal math goes through Prisma.Decimal at every step. Floating-point
//     intermediates would silently lose precision at scale.
//
// recomputeProposalTotals is exposed so ProposalsService can call it when a
// proposal-level field that affects totals (discountPct, discountAmount) is
// changed without going through an item endpoint.
// ─────────────────────────────────────────────────────────────────────────────

const ITEM_SELECT = {
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

@Injectable()
export class ProposalItemsService {
    constructor(private readonly prisma: PrismaService) { }

    // ── Reads ────────────────────────────────────────────────────────────────

    /**
     * List items for a proposal. Tenant scoping by companyId is required.
     * Caller is responsible for verifying the proposal is visible to the
     * actor (see ProposalsService.getProposal which performs row-level checks).
     */
    async listItems(companyId: string, proposalId: string) {
        return this.prisma.proposalItem.findMany({
            where: { companyId, proposalId },
            select: ITEM_SELECT,
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
    }

    // ── Item create / update / delete (all DRAFT-only) ───────────────────────

    /**
     * Adds a single item to a DRAFT proposal and recomputes proposal totals.
     * Returns the new item id (caller refetches the full proposal projection).
     */
    async addItem(
        companyId: string,
        proposalId: string,
        dto: CreateProposalItemDto,
    ): Promise<{ id: string }> {
        let createdId = '';

        await this.prisma.$transaction(async (tx) => {
            await this.assertDraftLocked(tx, companyId, proposalId);

            const subtotal = computeItemSubtotal({
                quantity: dto.quantity,
                unitPrice: dto.unitPrice,
                discountPct: dto.discountPct ?? null,
            });

            const created = await tx.proposalItem.create({
                data: {
                    companyId,
                    proposalId,
                    description: dto.description,
                    unit: dto.unit ?? null,
                    quantity: new Prisma.Decimal(dto.quantity),
                    unitPrice: new Prisma.Decimal(dto.unitPrice),
                    discountPct:
                        dto.discountPct === undefined || dto.discountPct === null
                            ? null
                            : new Prisma.Decimal(dto.discountPct),
                    internalCost:
                        dto.internalCost === undefined || dto.internalCost === null
                            ? null
                            : new Prisma.Decimal(dto.internalCost),
                    subtotal,
                    sortOrder: dto.sortOrder ?? 0,
                },
                select: { id: true },
            });

            await this.recomputeProposalTotals(tx, companyId, proposalId);
            createdId = created.id;
        });

        return { id: createdId };
    }

    /**
     * Updates a single item on a DRAFT proposal and recomputes proposal totals.
     * Empty bodies are rejected to avoid silent no-ops.
     */
    async updateItem(
        companyId: string,
        proposalId: string,
        itemId: string,
        dto: UpdateProposalItemDto,
    ): Promise<void> {
        if (Object.keys(dto).length === 0) {
            throw new UnprocessableEntityException('No fields provided to update.');
        }

        await this.prisma.$transaction(async (tx) => {
            await this.assertDraftLocked(tx, companyId, proposalId);

            // Lock the item row with a tenant- and parent-scoped read so we
            // cannot accidentally update an item belonging to a different
            // proposal in the same company. Three-column predicate is the
            // tenant safety net even though Prisma's update() will accept id
            // alone afterwards.
            const rows = await tx.$queryRaw<
                Array<{
                    id: string;
                    quantity: string;
                    unitPrice: string;
                    discountPct: string | null;
                    internalCost: string | null;
                }>
            >`
                SELECT id,
                       "quantity"::text     AS "quantity",
                       "unitPrice"::text    AS "unitPrice",
                       "discountPct"::text  AS "discountPct",
                       "internalCost"::text AS "internalCost"
                FROM "ProposalItem"
                WHERE id = ${itemId}
                  AND "companyId" = ${companyId}
                  AND "proposalId" = ${proposalId}
                FOR UPDATE
            `;

            const existing = rows[0];
            if (!existing) throw new NotFoundException('Proposal item not found.');

            const nextQuantity = dto.quantity ?? Number(existing.quantity);
            const nextUnitPrice = dto.unitPrice ?? Number(existing.unitPrice);
            const nextDiscountPct =
                dto.discountPct === undefined
                    ? existing.discountPct === null
                        ? null
                        : Number(existing.discountPct)
                    : dto.discountPct;

            const subtotal = computeItemSubtotal({
                quantity: nextQuantity,
                unitPrice: nextUnitPrice,
                discountPct: nextDiscountPct,
            });

            const data: Prisma.ProposalItemUpdateInput = { subtotal };
            if (dto.description !== undefined) data.description = dto.description;
            if (dto.unit !== undefined) data.unit = dto.unit;
            if (dto.quantity !== undefined) data.quantity = new Prisma.Decimal(dto.quantity);
            if (dto.unitPrice !== undefined) data.unitPrice = new Prisma.Decimal(dto.unitPrice);
            if (dto.discountPct !== undefined) {
                data.discountPct =
                    dto.discountPct === null ? null : new Prisma.Decimal(dto.discountPct);
            }
            if (dto.internalCost !== undefined) {
                data.internalCost =
                    dto.internalCost === null ? null : new Prisma.Decimal(dto.internalCost);
            }
            if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

            // The SELECT FOR UPDATE above already verified tenant + parent
            // scoping; Prisma's where: { id } is safe here.
            await tx.proposalItem.update({
                where: { id: itemId },
                data,
            });

            await this.recomputeProposalTotals(tx, companyId, proposalId);
        });
    }

    /**
     * Removes a single item from a DRAFT proposal and recomputes totals.
     */
    async removeItem(
        companyId: string,
        proposalId: string,
        itemId: string,
    ): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            await this.assertDraftLocked(tx, companyId, proposalId);

            const rows = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT id
                FROM "ProposalItem"
                WHERE id = ${itemId}
                  AND "companyId" = ${companyId}
                  AND "proposalId" = ${proposalId}
                FOR UPDATE
            `;
            const existing = rows[0];
            if (!existing) throw new NotFoundException('Proposal item not found.');

            await tx.proposalItem.delete({ where: { id: itemId } });
            await this.recomputeProposalTotals(tx, companyId, proposalId);
        });
    }

    // ── Bulk creation during proposal create ─────────────────────────────────

    /**
     * Bulk-inserts initial items inside the open creation transaction.
     * Caller is ProposalsService.createProposal which has already validated
     * tenant scoping and holds (or has just written) the parent Proposal row.
     *
     * Does NOT recompute totals — the caller invokes recomputeProposalTotals
     * once after this returns so a single recompute covers all items.
     */
    async bulkCreateInTx(
        tx: Prisma.TransactionClient,
        companyId: string,
        proposalId: string,
        items: CreateProposalItemDto[],
    ): Promise<void> {
        if (items.length === 0) return;

        await tx.proposalItem.createMany({
            data: items.map((item) => ({
                companyId,
                proposalId,
                description: item.description,
                unit: item.unit ?? null,
                quantity: new Prisma.Decimal(item.quantity),
                unitPrice: new Prisma.Decimal(item.unitPrice),
                discountPct:
                    item.discountPct === undefined || item.discountPct === null
                        ? null
                        : new Prisma.Decimal(item.discountPct),
                internalCost:
                    item.internalCost === undefined || item.internalCost === null
                        ? null
                        : new Prisma.Decimal(item.internalCost),
                subtotal: computeItemSubtotal({
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    discountPct: item.discountPct ?? null,
                }),
                sortOrder: item.sortOrder ?? 0,
            })),
        });
    }

    // ── Recompute proposal totals ────────────────────────────────────────────

    /**
     * Recomputes Proposal.subtotal, Proposal.totalPrice, and Proposal.totalCost
     * from the current set of items and the stored discount fields.
     *
     * Must be called within an open transaction that already holds the parent
     * proposal row locked (assertDraftLocked or the caller's own SELECT
     * FOR UPDATE). This guarantees no concurrent item write can interleave
     * between "read items" and "write totals".
     *
     * Public so ProposalsService can call it after changing discountPct /
     * discountAmount on a DRAFT proposal.
     */
    async recomputeProposalTotals(
        tx: Prisma.TransactionClient,
        companyId: string,
        proposalId: string,
    ): Promise<void> {
        const items = await tx.proposalItem.findMany({
            where: { companyId, proposalId },
            select: { quantity: true, subtotal: true, internalCost: true },
        });

        const subtotal = items.reduce(
            (acc, item) => acc.plus(item.subtotal),
            new Prisma.Decimal(0),
        );

        const totalCost = items.reduce((acc, item) => {
            if (item.internalCost === null) return acc;
            return acc.plus(item.internalCost.mul(item.quantity));
        }, new Prisma.Decimal(0));

        // Read the parent proposal's discount fields. The caller has already
        // locked this row, so no race is possible.
        const proposal = await tx.proposal.findUnique({
            where: { id: proposalId },
            select: { discountPct: true, discountAmount: true },
        });
        if (!proposal) {
            // Should be unreachable — assertDraftLocked already ran.
            throw new NotFoundException('Proposal not found.');
        }

        const totalPrice = computeTotalPrice({
            subtotal,
            discountPct: proposal.discountPct,
            discountAmount: proposal.discountAmount,
        });

        await tx.proposal.update({
            where: { id: proposalId },
            data: {
                subtotal: roundMoney(subtotal),
                totalPrice: roundMoney(totalPrice),
                totalCost: roundMoney(totalCost),
            },
        });
    }

    // ── Internal: assert DRAFT under lock ────────────────────────────────────

    /**
     * Locks the parent Proposal row and asserts it is in DRAFT status.
     * Returns nothing on success; throws on missing or non-DRAFT.
     */
    private async assertDraftLocked(
        tx: Prisma.TransactionClient,
        companyId: string,
        proposalId: string,
    ): Promise<void> {
        const rows = await tx.$queryRaw<Array<{ id: string; status: ProposalStatus }>>`
            SELECT id, status
            FROM "Proposal"
            WHERE id = ${proposalId} AND "companyId" = ${companyId}
            FOR UPDATE
        `;
        const proposal = rows[0];
        if (!proposal) throw new NotFoundException('Proposal not found.');

        if (proposal.status !== ProposalStatus.DRAFT) {
            throw new UnprocessableEntityException(
                `Proposal items can only be modified while the proposal is in DRAFT (current status: ${proposal.status}).`,
            );
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure pricing helpers — no Prisma dependency, deterministic.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * item.subtotal = quantity × unitPrice × (1 − discountPct/100).
 * Rounded to 2 decimal places to match the Decimal(12, 2) column scale.
 */
function computeItemSubtotal(input: {
    quantity: number | string | Prisma.Decimal;
    unitPrice: number | string | Prisma.Decimal;
    discountPct: number | string | Prisma.Decimal | null;
}): Prisma.Decimal {
    const quantity = new Prisma.Decimal(input.quantity);
    const unitPrice = new Prisma.Decimal(input.unitPrice);
    const gross = quantity.mul(unitPrice);

    if (input.discountPct === null || input.discountPct === undefined) {
        return roundMoney(gross);
    }
    const pct = new Prisma.Decimal(input.discountPct);
    const factor = new Prisma.Decimal(100).minus(pct).div(100);
    return roundMoney(gross.mul(factor));
}

/**
 * proposal.totalPrice = subtotal − effectiveDiscount.
 *  - If discountPct is set: effectiveDiscount = subtotal × pct / 100.
 *  - Else if discountAmount is set: effectiveDiscount = min(discountAmount, subtotal).
 *  - Else: 0.
 *
 * The min() clamp prevents a negative totalPrice when a stale discountAmount
 * exceeds the recomputed subtotal after items shrink. The DB CHECK
 * `chk_proposal_total_price_nonneg` is a hard floor; this clamp is the
 * graceful UX equivalent.
 */
function computeTotalPrice(input: {
    subtotal: Prisma.Decimal;
    discountPct: Prisma.Decimal | null;
    discountAmount: Prisma.Decimal | null;
}): Prisma.Decimal {
    const { subtotal, discountPct, discountAmount } = input;

    if (discountPct !== null) {
        const effective = subtotal.mul(discountPct).div(100);
        return subtotal.minus(effective);
    }
    if (discountAmount !== null) {
        const clamped = Prisma.Decimal.min(discountAmount, subtotal);
        return subtotal.minus(clamped);
    }
    return subtotal;
}

/**
 * Round to 2 decimal places, half-up. Matches Decimal(12, 2) column scale.
 */
function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
    return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
