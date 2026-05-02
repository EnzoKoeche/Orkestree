import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
    AuditOperation,
    CompanyMembership,
    CompanyResource,
    PermissionAction,
    Prisma,
    ProposalStatus,
} from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ConfigAuditService } from '../company-config/audit/config-audit.service';
import { PermissionResolverService } from '../company-config/permissions/permission-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import {
    ApproveProposalDto,
    CancelProposalDto,
    RejectProposalDto,
    SendProposalDto,
} from './dto/transition-proposal.dto';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalTransitionsService
//
// Owns the proposal status state machine. Each public method opens its own
// transaction, locks the row with SELECT FOR UPDATE, validates the source
// state, applies the transition, writes ProposalStatusHistory and a
// ConfigAuditLog entry, then captures the event payload to emit AFTER the
// commit.
//
// State machine (terminal states are leaves):
//
//   DRAFT  ─send→  SENT
//   DRAFT  ─cancel→ CANCELLED              (no rejection in DRAFT)
//   SENT   ─approve→ APPROVED              (terminal)
//   SENT   ─reject→  REJECTED              (terminal)
//   SENT   ─expire→ EXPIRED                (called by a future job, exposed
//                                           internally as expireDueProposals)
//   SENT   ─cancel→ CANCELLED              (terminal)
//   APPROVED / REJECTED / EXPIRED / CANCELLED: terminal — no transitions out.
//
// Permission gating: the controller's @RequirePermission already enforces
// the resource-action grant (PROPOSAL.PUBLISH for send, PROPOSAL.APPROVE for
// approve, etc.). The service additionally re-checks via PermissionResolver
// for the approve/reject paths to mirror StageTransitionsService's
// requiresApproval safety net.
//
// Concurrency notes:
//   - The udx_one_approved_proposal_per_request unique index is the hard
//     guarantee against two proposals on the same request being approved
//     concurrently. P2002 from this index is mapped to a 409 ConflictException.
//   - expireDueProposals uses SELECT … FOR UPDATE SKIP LOCKED so a worker
//     can be parallelised cleanly when the BullMQ job is wired up later.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ProposalTransitionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly permissionResolver: PermissionResolverService,
        private readonly auditService: ConfigAuditService,
        private readonly events: EventEmitter2,
    ) { }

    // ── DRAFT → SENT ─────────────────────────────────────────────────────────

    async sendProposal(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'role' | 'userId'>,
        proposalId: string,
        dto: SendProposalDto,
    ) {
        const { companyId } = actorMembership;
        let eventEmitted = false;

        await this.prisma.$transaction(async (tx) => {
            const proposal = await this.lockProposal(tx, companyId, proposalId);

            if (proposal.status !== ProposalStatus.DRAFT) {
                throw new UnprocessableEntityException(
                    `Only DRAFT proposals can be sent (current status: ${proposal.status}).`,
                );
            }

            // Defence-in-depth: a proposal whose linked request was cancelled
            // between create and send must not be sent. The request is
            // re-read inside the same tx without a lock — the race window is
            // closed by the request's own cancellation flow which sets
            // isCancelled = true under SELECT FOR UPDATE.
            const request = await tx.serviceRequest.findFirst({
                where: { id: proposal.serviceRequestId, companyId },
                select: { isCancelled: true },
            });
            if (!request) {
                throw new NotFoundException('Linked service request no longer exists.');
            }
            if (request.isCancelled) {
                throw new UnprocessableEntityException(
                    'Cannot send a proposal whose service request has been cancelled.',
                );
            }

            // Reject sending an empty proposal — operations would not gain
            // anything from a zero-value proposal and the typical caller bug
            // is "forgot to add items".
            const itemCount = await tx.proposalItem.count({
                where: { companyId, proposalId },
            });
            if (itemCount === 0) {
                throw new UnprocessableEntityException(
                    'Cannot send a proposal with no items.',
                );
            }

            const now = new Date();
            await tx.proposal.update({
                where: { id: proposalId },
                data: {
                    status: ProposalStatus.SENT,
                    sentAt: now,
                },
            });

            await tx.proposalStatusHistory.create({
                data: {
                    companyId,
                    proposalId,
                    fromStatus: ProposalStatus.DRAFT,
                    toStatus: ProposalStatus.SENT,
                    actorMembershipId: actorMembership.id,
                    note: dto.note ?? null,
                },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.TRANSITION,
                entityType: 'Proposal',
                entityId: proposalId,
                entityCode: String(proposal.number),
                before: { status: ProposalStatus.DRAFT },
                after: {
                    status: ProposalStatus.SENT,
                    sentAt: now.toISOString(),
                    note: dto.note ?? null,
                },
            });

            eventEmitted = true;
        });

        if (eventEmitted) {
            this.events.emit('proposal.sent', { companyId, proposalId });
        }
    }

    // ── SENT → APPROVED ──────────────────────────────────────────────────────

    async approveProposal(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'role' | 'userId'>,
        proposalId: string,
        dto: ApproveProposalDto,
    ) {
        const { companyId } = actorMembership;
        let eventEmitted = false;

        // In-service permission re-check. Mirrors StageTransitionsService's
        // requiresApproval gate: the controller's @RequirePermission gives
        // EDIT/PUBLISH-style access; APPROVE is the explicit gate for terminal
        // financial commitment.
        const canApprove = await this.permissionResolver.isAllowed(
            actorMembership,
            CompanyResource.PROPOSAL,
            PermissionAction.APPROVE,
        );
        if (!canApprove) {
            throw new ForbiddenException(
                'Approving a proposal requires the APPROVE permission on PROPOSAL.',
            );
        }

        await this.prisma
            .$transaction(async (tx) => {
                const proposal = await this.lockProposal(tx, companyId, proposalId);

                if (proposal.status !== ProposalStatus.SENT) {
                    throw new UnprocessableEntityException(
                        `Only SENT proposals can be approved (current status: ${proposal.status}).`,
                    );
                }

                const now = new Date();
                await tx.proposal.update({
                    where: { id: proposalId },
                    data: {
                        status: ProposalStatus.APPROVED,
                        approvedAt: now,
                        approvedByMembershipId: actorMembership.id,
                    },
                });

                await tx.proposalStatusHistory.create({
                    data: {
                        companyId,
                        proposalId,
                        fromStatus: ProposalStatus.SENT,
                        toStatus: ProposalStatus.APPROVED,
                        actorMembershipId: actorMembership.id,
                        note: dto.note ?? null,
                    },
                });

                await this.auditService.write(tx, {
                    companyId,
                    actorId: actorMembership.userId,
                    operation: AuditOperation.TRANSITION,
                    entityType: 'Proposal',
                    entityId: proposalId,
                    entityCode: String(proposal.number),
                    before: { status: ProposalStatus.SENT },
                    after: {
                        status: ProposalStatus.APPROVED,
                        approvedAt: now.toISOString(),
                        approvedByMembershipId: actorMembership.id,
                        note: dto.note ?? null,
                    },
                });

                eventEmitted = true;
            })
            .catch((e: unknown) => {
                // udx_one_approved_proposal_per_request: another proposal on
                // the same request is already APPROVED.
                if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
                    throw new ConflictException(
                        'Another proposal on this service request is already approved.',
                    );
                }
                throw e;
            });

        if (eventEmitted) {
            this.events.emit('proposal.approved', { companyId, proposalId });
        }
    }

    // ── SENT → REJECTED ──────────────────────────────────────────────────────

    async rejectProposal(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'role' | 'userId'>,
        proposalId: string,
        dto: RejectProposalDto,
    ) {
        const { companyId } = actorMembership;
        let eventEmitted = false;

        const canReject = await this.permissionResolver.isAllowed(
            actorMembership,
            CompanyResource.PROPOSAL,
            PermissionAction.REJECT,
        );
        if (!canReject) {
            throw new ForbiddenException(
                'Rejecting a proposal requires the REJECT permission on PROPOSAL.',
            );
        }

        await this.prisma.$transaction(async (tx) => {
            const proposal = await this.lockProposal(tx, companyId, proposalId);

            if (proposal.status !== ProposalStatus.SENT) {
                throw new UnprocessableEntityException(
                    `Only SENT proposals can be rejected (current status: ${proposal.status}).`,
                );
            }

            const now = new Date();
            await tx.proposal.update({
                where: { id: proposalId },
                data: {
                    status: ProposalStatus.REJECTED,
                    rejectedAt: now,
                    rejectedByMembershipId: actorMembership.id,
                    rejectionReason: dto.reason ?? null,
                },
            });

            await tx.proposalStatusHistory.create({
                data: {
                    companyId,
                    proposalId,
                    fromStatus: ProposalStatus.SENT,
                    toStatus: ProposalStatus.REJECTED,
                    actorMembershipId: actorMembership.id,
                    note: dto.note ?? null,
                },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.TRANSITION,
                entityType: 'Proposal',
                entityId: proposalId,
                entityCode: String(proposal.number),
                before: { status: ProposalStatus.SENT },
                after: {
                    status: ProposalStatus.REJECTED,
                    rejectedAt: now.toISOString(),
                    rejectedByMembershipId: actorMembership.id,
                    rejectionReason: dto.reason ?? null,
                    note: dto.note ?? null,
                },
            });

            eventEmitted = true;
        });

        if (eventEmitted) {
            this.events.emit('proposal.rejected', { companyId, proposalId });
        }
    }

    // ── DRAFT|SENT → CANCELLED ───────────────────────────────────────────────

    async cancelProposal(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'role' | 'userId'>,
        proposalId: string,
        dto: CancelProposalDto,
    ) {
        const { companyId } = actorMembership;
        let eventEmitted = false;

        await this.prisma.$transaction(async (tx) => {
            const proposal = await this.lockProposal(tx, companyId, proposalId);

            // Idempotency: silent no-op if already cancelled.
            if (proposal.status === ProposalStatus.CANCELLED) return;

            if (
                proposal.status !== ProposalStatus.DRAFT &&
                proposal.status !== ProposalStatus.SENT
            ) {
                throw new UnprocessableEntityException(
                    `Only DRAFT or SENT proposals can be cancelled (current status: ${proposal.status}).`,
                );
            }

            const now = new Date();
            const fromStatus = proposal.status;

            await tx.proposal.update({
                where: { id: proposalId },
                data: {
                    status: ProposalStatus.CANCELLED,
                    cancelledAt: now,
                    cancellationReason: dto.reason ?? null,
                },
            });

            await tx.proposalStatusHistory.create({
                data: {
                    companyId,
                    proposalId,
                    fromStatus,
                    toStatus: ProposalStatus.CANCELLED,
                    actorMembershipId: actorMembership.id,
                    note: dto.note ?? null,
                },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.CANCEL,
                entityType: 'Proposal',
                entityId: proposalId,
                entityCode: String(proposal.number),
                before: { status: fromStatus },
                after: {
                    status: ProposalStatus.CANCELLED,
                    cancelledAt: now.toISOString(),
                    cancellationReason: dto.reason ?? null,
                    note: dto.note ?? null,
                },
            });

            eventEmitted = true;
        });

        if (eventEmitted) {
            this.events.emit('proposal.cancelled', { companyId, proposalId });
        }
    }

    // ── SENT → EXPIRED (worker-initiated) ────────────────────────────────────

    /**
     * Single-proposal expire path. Public so a controller endpoint can drive
     * a manual "mark as expired" if needed; the natural caller is
     * expireDueProposals (worker).
     */
    async expireProposal(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'role' | 'userId'>,
        proposalId: string,
    ) {
        const { companyId } = actorMembership;
        let eventEmitted = false;

        await this.prisma.$transaction(async (tx) => {
            const proposal = await this.lockProposal(tx, companyId, proposalId);

            if (proposal.status !== ProposalStatus.SENT) {
                throw new UnprocessableEntityException(
                    `Only SENT proposals can be expired (current status: ${proposal.status}).`,
                );
            }
            if (!proposal.validUntil) {
                throw new UnprocessableEntityException(
                    'Proposal has no validUntil date and cannot be expired.',
                );
            }
            if (proposal.validUntil > new Date()) {
                throw new UnprocessableEntityException(
                    'Proposal validUntil is in the future; cannot expire yet.',
                );
            }

            const now = new Date();
            await tx.proposal.update({
                where: { id: proposalId },
                data: {
                    status: ProposalStatus.EXPIRED,
                    expiredAt: now,
                },
            });

            await tx.proposalStatusHistory.create({
                data: {
                    companyId,
                    proposalId,
                    fromStatus: ProposalStatus.SENT,
                    toStatus: ProposalStatus.EXPIRED,
                    actorMembershipId: actorMembership.id,
                    note: null,
                },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.TRANSITION,
                entityType: 'Proposal',
                entityId: proposalId,
                entityCode: String(proposal.number),
                before: { status: ProposalStatus.SENT },
                after: {
                    status: ProposalStatus.EXPIRED,
                    expiredAt: now.toISOString(),
                },
            });

            eventEmitted = true;
        });

        if (eventEmitted) {
            this.events.emit('proposal.expired', { companyId, proposalId });
        }
    }

    /**
     * Bulk expire path — picks SENT proposals whose validUntil is in the past
     * and transitions each to EXPIRED in its own transaction. Designed to be
     * called by a BullMQ job. SKIP LOCKED prevents two workers from
     * processing the same proposal.
     *
     * Returns the list of expired proposalIds for caller logging.
     *
     * Note: this path is exposed for the future expiry-job module. It is NOT
     * wired to any HTTP endpoint — bulk operations don't carry an actor
     * membership.
     */
    async expireDueProposals(batchSize = 50): Promise<{ expired: string[] }> {
        const expired: string[] = [];

        // Stage 1: pick a batch of due ids under SKIP LOCKED so concurrent
        // workers don't fight over the same rows.
        const due = await this.prisma.$queryRaw<
            Array<{ id: string; companyId: string; number: number }>
        >`
            SELECT id, "companyId", number
            FROM "Proposal"
            WHERE status = 'SENT'
              AND "validUntil" IS NOT NULL
              AND "validUntil" <= NOW()
            ORDER BY "validUntil" ASC
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED
        `;

        // Stage 2: each proposal gets its own transaction. We re-lock inside
        // the new tx because the SKIP LOCKED hold above ends with this query.
        for (const row of due) {
            const eventPayload = await this.prisma
                .$transaction(async (tx) => {
                    const proposal = await this.lockProposal(tx, row.companyId, row.id);
                    if (
                        proposal.status !== ProposalStatus.SENT ||
                        !proposal.validUntil ||
                        proposal.validUntil > new Date()
                    ) {
                        return null; // raced with another path; skip
                    }

                    const now = new Date();
                    await tx.proposal.update({
                        where: { id: row.id },
                        data: { status: ProposalStatus.EXPIRED, expiredAt: now },
                    });

                    // Worker has no actor membership; record actor as the
                    // proposal creator so the history row remains FK-valid.
                    await tx.proposalStatusHistory.create({
                        data: {
                            companyId: row.companyId,
                            proposalId: row.id,
                            fromStatus: ProposalStatus.SENT,
                            toStatus: ProposalStatus.EXPIRED,
                            actorMembershipId: proposal.createdByMembershipId,
                            note: 'Auto-expired by system worker',
                        },
                    });

                    // ConfigAuditLog requires actorId (a global userId). Use
                    // the creator's userId for the same reason.
                    const creator = await tx.companyMembership.findUnique({
                        where: { id: proposal.createdByMembershipId },
                        select: { userId: true },
                    });
                    if (creator) {
                        await this.auditService.write(tx, {
                            companyId: row.companyId,
                            actorId: creator.userId,
                            operation: AuditOperation.TRANSITION,
                            entityType: 'Proposal',
                            entityId: row.id,
                            entityCode: String(row.number),
                            before: { status: ProposalStatus.SENT },
                            after: {
                                status: ProposalStatus.EXPIRED,
                                expiredAt: now.toISOString(),
                                automated: true,
                            },
                        });
                    }

                    return { proposalId: row.id, companyId: row.companyId };
                })
                .catch(() => null);

            if (eventPayload) {
                expired.push(eventPayload.proposalId);
                this.events.emit('proposal.expired', eventPayload);
            }
        }

        return { expired };
    }

    // ── Internal: lock + load proposal ───────────────────────────────────────

    private async lockProposal(
        tx: Prisma.TransactionClient,
        companyId: string,
        proposalId: string,
    ): Promise<{
        id: string;
        status: ProposalStatus;
        number: number;
        serviceRequestId: string;
        validUntil: Date | null;
        createdByMembershipId: string;
    }> {
        const rows = await tx.$queryRaw<
            Array<{
                id: string;
                status: ProposalStatus;
                number: number;
                serviceRequestId: string;
                validUntil: Date | null;
                createdByMembershipId: string;
            }>
        >`
            SELECT id, status, number, "serviceRequestId", "validUntil",
                   "createdByMembershipId"
            FROM "Proposal"
            WHERE id = ${proposalId} AND "companyId" = ${companyId}
            FOR UPDATE
        `;
        const proposal = rows[0];
        if (!proposal) throw new NotFoundException('Proposal not found.');
        return proposal;
    }
}
