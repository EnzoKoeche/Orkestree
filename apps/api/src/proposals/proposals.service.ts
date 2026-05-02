import {
    ConflictException,
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
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ConfigAuditService } from '../company-config/audit/config-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { ListProposalsDto } from './dto/list-proposals.dto';
import { SetProposalFieldValueItemDto } from './dto/set-proposal-field-value.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { ProposalFieldValuesService } from './proposal-field-values.service';
import { ProposalItemsService } from './proposal-items.service';

// ─────────────────────────────────────────────────────────────────────────────
// Response projections
//
// Two select shapes:
//   - PRIVILEGED_*  : OWNER / ADMIN — includes totalCost and item.internalCost.
//   - STANDARD_*    : everyone else — strips totalCost and item.internalCost
//                     at the Prisma layer (Mechanism A).
//
// FieldFilterInterceptor (Mechanism B) adds a defense-in-depth pass over the
// HTTP response based on SENSITIVE_FIELD_REGISTRY. The two layers cooperate:
// Mechanism A prevents the data from being fetched in the first place;
// Mechanism B catches anything that slips through (e.g. an ad-hoc raw query).
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

const PROPOSAL_LIST_SELECT_STANDARD = {
    id: true,
    number: true,
    status: true,
    title: true,
    subtotal: true,
    totalPrice: true,
    discountPct: true,
    discountAmount: true,
    validUntil: true,
    sentAt: true,
    approvedAt: true,
    rejectedAt: true,
    expiredAt: true,
    cancelledAt: true,
    createdAt: true,
    updatedAt: true,
    serviceRequest: {
        select: { id: true, number: true, title: true },
    },
    client: {
        select: { id: true, number: true, name: true, type: true },
    },
    createdByMembership: {
        select: MEMBERSHIP_USER_SELECT,
    },
} satisfies Prisma.ProposalSelect;

const PROPOSAL_LIST_SELECT_PRIVILEGED = {
    ...PROPOSAL_LIST_SELECT_STANDARD,
    totalCost: true,
} satisfies Prisma.ProposalSelect;

const PROPOSAL_DETAIL_SELECT_STANDARD = {
    ...PROPOSAL_LIST_SELECT_STANDARD,
    notes: true,
    clientNotes: true,
    pdfUrl: true,
    pdfGeneratedAt: true,
    rejectionReason: true,
    cancellationReason: true,
    approvedByMembership: { select: MEMBERSHIP_USER_SELECT },
    rejectedByMembership: { select: MEMBERSHIP_USER_SELECT },
    items: {
        select: {
            id: true,
            description: true,
            unit: true,
            quantity: true,
            unitPrice: true,
            discountPct: true,
            subtotal: true,
            sortOrder: true,
        },
        orderBy: [
            { sortOrder: 'asc' as const },
            { createdAt: 'asc' as const },
        ],
    },
    statusHistory: {
        select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            note: true,
            createdAt: true,
            actorMembership: { select: MEMBERSHIP_USER_SELECT },
        },
        orderBy: { createdAt: 'asc' as const },
    },
} satisfies Prisma.ProposalSelect;

const PROPOSAL_DETAIL_SELECT_PRIVILEGED = {
    ...PROPOSAL_DETAIL_SELECT_STANDARD,
    totalCost: true,
    items: {
        select: {
            id: true,
            description: true,
            unit: true,
            quantity: true,
            unitPrice: true,
            discountPct: true,
            internalCost: true,
            subtotal: true,
            sortOrder: true,
        },
        orderBy: [
            { sortOrder: 'asc' as const },
            { createdAt: 'asc' as const },
        ],
    },
} satisfies Prisma.ProposalSelect;

// CLIENTE only ever sees a strict external subset of the proposal: no notes
// (internal), no audit history, no internal cost, no rejection reason. They
// also never see DRAFT proposals — that's enforced by the row-level filter
// in resolveListWhere / resolveGetWhere.
const PROPOSAL_LIST_SELECT_CLIENT = {
    id: true,
    number: true,
    status: true,
    title: true,
    subtotal: true,
    totalPrice: true,
    discountPct: true,
    discountAmount: true,
    validUntil: true,
    sentAt: true,
    approvedAt: true,
    rejectedAt: true,
    expiredAt: true,
    createdAt: true,
    updatedAt: true,
    serviceRequest: {
        select: { id: true, number: true, title: true },
    },
} satisfies Prisma.ProposalSelect;

const PROPOSAL_DETAIL_SELECT_CLIENT = {
    ...PROPOSAL_LIST_SELECT_CLIENT,
    clientNotes: true,
    pdfUrl: true,
    items: {
        select: {
            id: true,
            description: true,
            unit: true,
            quantity: true,
            unitPrice: true,
            discountPct: true,
            subtotal: true,
            sortOrder: true,
        },
        orderBy: [
            { sortOrder: 'asc' as const },
            { createdAt: 'asc' as const },
        ],
    },
} satisfies Prisma.ProposalSelect;

// ─────────────────────────────────────────────────────────────────────────────
// ProposalsService
//
// Owns proposal create / update / list / get / field-values. Lifecycle
// transitions (send / approve / reject / cancel / expire) live in
// ProposalTransitionsService for separation of concerns and to mirror the
// service-requests / stage-transitions split.
//
// Tenant safety: every query receives companyId from the authenticated
// membership; no payload field overrides it.
//
// CLIENTE row-level visibility:
//   - List/get is filtered to proposals whose linked ServiceRequest was
//     created by the same membership.
//   - DRAFT proposals are hidden from CLIENTE (they are internal until SENT).
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ProposalsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly itemsService: ProposalItemsService,
        private readonly fieldValuesService: ProposalFieldValuesService,
        private readonly auditService: ConfigAuditService,
        private readonly events: EventEmitter2,
    ) { }

    // ── Create ───────────────────────────────────────────────────────────────

    async createProposal(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        dto: CreateProposalDto,
    ) {
        const { companyId } = actorMembership;
        let createdProposalId: string | null = null;

        await this.prisma.$transaction(async (tx) => {
            // ── 1. Validate the ServiceRequest is visible, in this company,
            //       and not cancelled. CLIENTE row-level isolation: a client
            //       cannot anchor a proposal to a request they do not own.
            const requestWhere: Prisma.ServiceRequestWhereInput = {
                id: dto.serviceRequestId,
                companyId,
                isCancelled: false,
            };
            if (actorMembership.role === Role.CLIENTE) {
                requestWhere.createdByMembershipId = actorMembership.id;
            }

            const request = await tx.serviceRequest.findFirst({
                where: requestWhere,
                select: { id: true, clientId: true, isCancelled: true },
            });
            if (!request) {
                throw new NotFoundException(
                    'Service request not found, is cancelled, or is not visible.',
                );
            }

            // ── 2. Field values are intentionally NOT accepted at creation
            //       time. PROPOSAL custom-field values are written via the
            //       dedicated PUT /:proposalId/field-values endpoint, which
            //       runs after the proposal id exists. This mirrors the
            //       create → set-fields → send flow used by service-requests
            //       and avoids a partial-failure window where a proposal
            //       row exists but its required fields cannot be persisted.

            // ── 3. Advisory lock keyed by company:proposals to serialize
            //       proposal number generation without contending with
            //       request / client / task generators.
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId + ':proposals'})::bigint)`;

            // ── 4. Generate sequential proposal number.
            const [maxRow] = await tx.$queryRaw<Array<{ max: number | null }>>`
                SELECT MAX(number)::int AS max
                FROM "Proposal"
                WHERE "companyId" = ${companyId}
            `;
            const proposalNumber = (maxRow?.max ?? 0) + 1;

            // ── 5. Create the Proposal row in DRAFT, with totals set to zero.
            //       Totals are recomputed once items have been written.
            const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
            const created = await tx.proposal.create({
                data: {
                    companyId,
                    serviceRequestId: dto.serviceRequestId,
                    // Anchor the client at creation time. Stored independently
                    // so future request-edits do not silently re-anchor old
                    // proposals.
                    clientId: request.clientId ?? null,
                    number: proposalNumber,
                    status: ProposalStatus.DRAFT,
                    title: dto.title,
                    notes: null,
                    clientNotes: dto.clientNotes ?? null,
                    discountPct: null,
                    discountAmount: null,
                    subtotal: new Prisma.Decimal(0),
                    totalPrice: new Prisma.Decimal(0),
                    totalCost: new Prisma.Decimal(0),
                    validUntil,
                    createdByMembershipId: actorMembership.id,
                },
                select: { id: true },
            });

            // ── 6. Bulk-insert initial items (if any) and recompute totals.
            const initialItems = dto.items ?? [];
            if (initialItems.length > 0) {
                await this.itemsService.bulkCreateInTx(tx, companyId, created.id, initialItems);
                await this.itemsService.recomputeProposalTotals(tx, companyId, created.id);
            }

            // ── 7. Append initial status history (fromStatus = null → initial).
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

            // ── 8. Audit log.
            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.CREATE,
                entityType: 'Proposal',
                entityId: created.id,
                entityCode: String(proposalNumber),
                after: {
                    number: proposalNumber,
                    status: ProposalStatus.DRAFT,
                    serviceRequestId: dto.serviceRequestId,
                    clientId: request.clientId ?? null,
                    title: dto.title,
                    initialItemCount: initialItems.length,
                },
            });

            createdProposalId = created.id;
        });

        if (createdProposalId) {
            this.events.emit('proposal.created', {
                companyId,
                proposalId: createdProposalId,
            });
        }

        return this.getProposal(actorMembership, createdProposalId!);
    }

    // ── Update (DRAFT-only metadata + discounts) ─────────────────────────────

    async updateProposal(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
        dto: UpdateProposalDto,
    ) {
        const { companyId } = actorMembership;

        if (Object.keys(dto).length === 0) {
            return this.getProposal(actorMembership, proposalId);
        }

        // CLIENTE has no edit permission on proposals, but if a future role
        // override granted it we still want row-level isolation enforced
        // before any state mutation.
        if (actorMembership.role === Role.CLIENTE) {
            await this.assertCanReadProposal(actorMembership, proposalId);
        }

        // Mutual-exclusion validation for discount fields. The DB CHECK
        // chk_proposal_discount_exclusive is the hard floor; this is the
        // user-friendly 422.
        if (
            dto.discountPct !== undefined &&
            dto.discountPct !== null &&
            dto.discountAmount !== undefined &&
            dto.discountAmount !== null
        ) {
            throw new UnprocessableEntityException(
                'discountPct and discountAmount are mutually exclusive.',
            );
        }

        let totalsAffected = false;

        await this.prisma.$transaction(async (tx) => {
            // Lock the row. Read existing values for the "before" audit
            // snapshot and to detect when totals must be recomputed.
            const rows = await tx.$queryRaw<
                Array<{
                    id: string;
                    status: ProposalStatus;
                    title: string;
                    notes: string | null;
                    clientNotes: string | null;
                    discountPct: string | null;
                    discountAmount: string | null;
                    validUntil: Date | null;
                }>
            >`
                SELECT id, status, title, notes, "clientNotes",
                       "discountPct"::text    AS "discountPct",
                       "discountAmount"::text AS "discountAmount",
                       "validUntil"
                FROM "Proposal"
                WHERE id = ${proposalId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;
            const existing = rows[0];
            if (!existing) throw new NotFoundException('Proposal not found.');

            if (existing.status !== ProposalStatus.DRAFT) {
                throw new UnprocessableEntityException(
                    `Proposal can only be updated while in DRAFT (current status: ${existing.status}).`,
                );
            }

            // Cross-field rule: when only one side of the discount pair is
            // provided in the DTO, the other must be cleared simultaneously
            // to honour mutual exclusion against the stored value.
            if (
                dto.discountPct !== undefined &&
                dto.discountPct !== null &&
                existing.discountAmount !== null &&
                dto.discountAmount === undefined
            ) {
                throw new UnprocessableEntityException(
                    'Setting discountPct requires clearing discountAmount in the same request (send "discountAmount": null).',
                );
            }
            if (
                dto.discountAmount !== undefined &&
                dto.discountAmount !== null &&
                existing.discountPct !== null &&
                dto.discountPct === undefined
            ) {
                throw new UnprocessableEntityException(
                    'Setting discountAmount requires clearing discountPct in the same request (send "discountPct": null).',
                );
            }

            const data: Prisma.ProposalUpdateInput = {};
            if (dto.title !== undefined) data.title = dto.title;
            if (dto.notes !== undefined) data.notes = dto.notes;
            if (dto.clientNotes !== undefined) data.clientNotes = dto.clientNotes;
            if (dto.validUntil !== undefined) {
                data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
            }

            if (dto.discountPct !== undefined) {
                data.discountPct =
                    dto.discountPct === null ? null : new Prisma.Decimal(dto.discountPct);
                totalsAffected = true;
            }
            if (dto.discountAmount !== undefined) {
                data.discountAmount =
                    dto.discountAmount === null ? null : new Prisma.Decimal(dto.discountAmount);
                totalsAffected = true;
            }

            await tx.proposal.update({ where: { id: proposalId }, data });

            if (totalsAffected) {
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
                    discountPct: existing.discountPct,
                    discountAmount: existing.discountAmount,
                    validUntil: existing.validUntil,
                },
                after: {
                    title: dto.title ?? existing.title,
                    notes: dto.notes !== undefined ? dto.notes : existing.notes,
                    clientNotes:
                        dto.clientNotes !== undefined ? dto.clientNotes : existing.clientNotes,
                    discountPct:
                        dto.discountPct !== undefined ? dto.discountPct : existing.discountPct,
                    discountAmount:
                        dto.discountAmount !== undefined ? dto.discountAmount : existing.discountAmount,
                    validUntil:
                        dto.validUntil !== undefined
                            ? dto.validUntil
                                ? new Date(dto.validUntil)
                                : null
                            : existing.validUntil,
                },
            });
        }).catch((e: unknown) => {
            // The DB CHECK chk_proposal_discount_exclusive is a final safety
            // net: if a logic regression let both fields slip through, this
            // surfaces a 422 instead of a 500.
            if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new ConflictException('Concurrent modification of this proposal.');
            }
            throw e;
        });

        if (totalsAffected) {
            this.events.emit('proposal.items.changed', {
                companyId,
                proposalId,
                cause: 'discount-update',
            });
        }

        return this.getProposal(actorMembership, proposalId);
    }

    // ── List ─────────────────────────────────────────────────────────────────

    async listProposals(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        query: ListProposalsDto,
    ) {
        const where = await this.resolveListWhere(actorMembership, query);
        const select = this.selectForList(actorMembership.role);

        return this.prisma.proposal.findMany({
            where,
            select,
            orderBy: [{ number: 'desc' }],
            take: query.limit ?? 50,
            skip: query.skip ?? 0,
        });
    }

    // ── Get ──────────────────────────────────────────────────────────────────

    async getProposal(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
    ) {
        const where = await this.resolveGetWhere(actorMembership, proposalId);
        const select = this.selectForDetail(actorMembership.role);

        const proposal = await this.prisma.proposal.findFirst({ where, select });
        if (!proposal) throw new NotFoundException('Proposal not found.');
        return proposal;
    }

    // ── Field values ─────────────────────────────────────────────────────────

    async getFieldValues(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
    ) {
        // Existence + tenant + row-level visibility check before delegating.
        await this.assertCanReadProposal(actorMembership, proposalId);
        return this.fieldValuesService.getFieldValues(actorMembership.companyId, proposalId);
    }

    async setFieldValues(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
        items: SetProposalFieldValueItemDto[],
    ) {
        const { companyId } = actorMembership;

        if (actorMembership.role === Role.CLIENTE) {
            // Defense-in-depth: even though CLIENTE lacks PROPOSAL.EDIT by
            // default, never let row-level isolation be bypassed.
            await this.assertCanReadProposal(actorMembership, proposalId);
        }

        await this.prisma.$transaction(async (tx) => {
            // Lock + DRAFT gate (mirrors the items service).
            const rows = await tx.$queryRaw<Array<{ id: string; status: ProposalStatus }>>`
                SELECT id, status
                FROM "Proposal"
                WHERE id = ${proposalId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;
            const existing = rows[0];
            if (!existing) throw new NotFoundException('Proposal not found.');
            if (existing.status !== ProposalStatus.DRAFT) {
                throw new UnprocessableEntityException(
                    `Proposal field values can only be modified while the proposal is in DRAFT (current status: ${existing.status}).`,
                );
            }

            // Deduplicate by customFieldId — last occurrence wins. Mirrors
            // ClientsService.setFieldValues so two items targeting the same
            // field cannot trigger concurrent upserts with non-deterministic
            // results.
            const dedupedItems = [...new Map(items.map((i) => [i.customFieldId, i])).values()];

            await this.fieldValuesService.validateAndLoad(tx, companyId, dedupedItems);
            await this.fieldValuesService.writeFieldValues(tx, companyId, proposalId, dedupedItems);

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.UPDATE,
                entityType: 'ProposalFieldValues',
                entityId: proposalId,
            });
        });

        return this.fieldValuesService.getFieldValues(companyId, proposalId);
    }

    // ── Items convenience read (delegates) ───────────────────────────────────

    /**
     * Lists items for a proposal with the role-appropriate projection.
     * The transitions/items endpoints under /proposals/:id/items use this
     * after performing their own visibility check.
     */
    async listItemsForProposal(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
    ) {
        await this.assertCanReadProposal(actorMembership, proposalId);
        // The interceptor (Mechanism B) will strip internalCost for non-PRIVILEGED
        // roles. We additionally exclude it from the select for non-PRIVILEGED
        // callers to avoid loading the column (Mechanism A).
        const includeInternalCost =
            actorMembership.role === Role.OWNER || actorMembership.role === Role.ADMIN;

        return this.prisma.proposalItem.findMany({
            where: { companyId: actorMembership.companyId, proposalId },
            select: {
                id: true,
                description: true,
                unit: true,
                quantity: true,
                unitPrice: true,
                discountPct: true,
                subtotal: true,
                sortOrder: true,
                createdAt: true,
                updatedAt: true,
                ...(includeInternalCost ? { internalCost: true } : {}),
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
    }

    // ── Internal: visibility / projection helpers ────────────────────────────

    /**
     * Throws NotFoundException if the actor cannot read the proposal.
     * Used by endpoints that bypass the standard get() (e.g. setFieldValues,
     * item endpoints) but must still respect row-level isolation.
     */
    private async assertCanReadProposal(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
    ): Promise<void> {
        const where = await this.resolveGetWhere(actorMembership, proposalId);
        const exists = await this.prisma.proposal.findFirst({
            where,
            select: { id: true },
        });
        if (!exists) throw new NotFoundException('Proposal not found.');
    }

    private async resolveListWhere(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        query: ListProposalsDto,
    ): Promise<Prisma.ProposalWhereInput> {
        const where: Prisma.ProposalWhereInput = { companyId: actorMembership.companyId };

        if (query.serviceRequestId !== undefined) where.serviceRequestId = query.serviceRequestId;
        if (query.clientId !== undefined) where.clientId = query.clientId;
        if (query.status !== undefined) where.status = query.status;

        if (actorMembership.role === Role.CLIENTE) {
            // CLIENTE sees only proposals attached to a service request they
            // own AND only proposals that have left DRAFT.
            where.serviceRequest = { createdByMembershipId: actorMembership.id };
            where.status = { not: ProposalStatus.DRAFT };
            // Allow further filtering by status only if the requested status
            // is not DRAFT.
            if (query.status === ProposalStatus.DRAFT) {
                // Force an empty result by intersecting with an impossible id.
                where.id = '__cliente-cannot-see-drafts__';
            } else if (query.status !== undefined) {
                where.status = query.status;
            }
        }

        return where;
    }

    private async resolveGetWhere(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
    ): Promise<Prisma.ProposalWhereInput> {
        const where: Prisma.ProposalWhereInput = {
            id: proposalId,
            companyId: actorMembership.companyId,
        };

        if (actorMembership.role === Role.CLIENTE) {
            where.serviceRequest = { createdByMembershipId: actorMembership.id };
            where.status = { not: ProposalStatus.DRAFT };
        }

        return where;
    }

    private selectForList(role: Role): Prisma.ProposalSelect {
        if (role === Role.CLIENTE) return PROPOSAL_LIST_SELECT_CLIENT;
        if (role === Role.OWNER || role === Role.ADMIN) {
            return PROPOSAL_LIST_SELECT_PRIVILEGED;
        }
        return PROPOSAL_LIST_SELECT_STANDARD;
    }

    private selectForDetail(role: Role): Prisma.ProposalSelect {
        if (role === Role.CLIENTE) return PROPOSAL_DETAIL_SELECT_CLIENT;
        if (role === Role.OWNER || role === Role.ADMIN) {
            return PROPOSAL_DETAIL_SELECT_PRIVILEGED;
        }
        return PROPOSAL_DETAIL_SELECT_STANDARD;
    }
}
