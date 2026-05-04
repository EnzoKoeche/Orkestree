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
import { TransitionProposalDto } from './dto/transition-proposal.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Allowed manual transitions.
//
// EXPIRED is intentionally absent: it is set only by the proposal-expiry
// background job, never via the API. The DTO already constrains toStatus to
// ProposalStatus, so the rejection here is the second line of defense.
//
// CANCELLED is reachable from any non-terminal state.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Readonly<Record<ProposalStatus, ReadonlyArray<ProposalStatus>>> = {
    [ProposalStatus.DRAFT]: [ProposalStatus.SENT, ProposalStatus.CANCELLED],
    [ProposalStatus.SENT]: [
        ProposalStatus.APPROVED,
        ProposalStatus.REJECTED,
        ProposalStatus.CANCELLED,
    ],
    [ProposalStatus.APPROVED]: [],
    [ProposalStatus.REJECTED]: [],
    [ProposalStatus.EXPIRED]: [],
    [ProposalStatus.CANCELLED]: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// ProposalTransitionsService
//
// Single entrypoint for proposal status changes via the API. The route maps
// to send / approve / reject / cancel based on dto.toStatus.
//
// Locking: SELECT FOR UPDATE on the Proposal row before any state check.
// Ordering: domain events are emitted only after the transaction commits.
//
// Concurrency on APPROVED:
//   The DB has a partial unique index on serviceRequestId WHERE status='APPROVED'
//   (at most one approved proposal per request). A P2002 from the index is
//   mapped to 409 ConflictException so the second approver gets a clean error.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ProposalTransitionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly permissionResolver: PermissionResolverService,
        private readonly auditService: ConfigAuditService,
        private readonly events: EventEmitter2,
    ) { }

    async transition(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        proposalId: string,
        dto: TransitionProposalDto,
    ): Promise<{ proposalId: string; fromStatus: ProposalStatus; toStatus: ProposalStatus }> {
        const { companyId } = actorMembership;
        const { toStatus } = dto;

        // EXPIRED is reserved for the expiry job — never reachable via API.
        if (toStatus === ProposalStatus.EXPIRED) {
            throw new UnprocessableEntityException(
                'EXPIRED is set automatically by the expiry job; it cannot be requested via API.',
            );
        }

        // DRAFT cannot be a target; proposals start in DRAFT and never return to it.
        if (toStatus === ProposalStatus.DRAFT) {
            throw new UnprocessableEntityException('Cannot transition back to DRAFT.');
        }

        // Extra-permission gates beyond PROPOSAL.EDIT (which the controller enforces).
        if (toStatus === ProposalStatus.APPROVED) {
            const allowed = await this.permissionResolver.isAllowed(
                actorMembership,
                CompanyResource.PROPOSAL,
                PermissionAction.APPROVE,
            );
            if (!allowed) {
                throw new ForbiddenException(
                    'Approving a proposal requires PROPOSAL.APPROVE permission.',
                );
            }
        }
        if (toStatus === ProposalStatus.REJECTED) {
            const allowed = await this.permissionResolver.isAllowed(
                actorMembership,
                CompanyResource.PROPOSAL,
                PermissionAction.REJECT,
            );
            if (!allowed) {
                throw new ForbiddenException(
                    'Rejecting a proposal requires PROPOSAL.REJECT permission.',
                );
            }
        }

        const result = await this.prisma
            .$transaction(async (tx) => {
                const [proposal] = await tx.$queryRaw<
                    Array<{
                        id: string;
                        status: ProposalStatus;
                        serviceRequestId: string;
                        validUntil: Date | null;
                    }>
                >`
                    SELECT id, status, "serviceRequestId", "validUntil"
                    FROM "Proposal"
                    WHERE id = ${proposalId} AND "companyId" = ${companyId}
                    FOR UPDATE
                `;

                if (!proposal) throw new NotFoundException('Proposal not found.');

                const fromStatus = proposal.status;

                // Idempotency guard: explicit "no-op" rejection is clearer than
                // silently writing duplicate history rows.
                if (fromStatus === toStatus) {
                    throw new UnprocessableEntityException(
                        `Proposal is already in ${toStatus}.`,
                    );
                }

                if (!ALLOWED_TRANSITIONS[fromStatus]?.includes(toStatus)) {
                    throw new UnprocessableEntityException(
                        `Transition from ${fromStatus} to ${toStatus} is not permitted.`,
                    );
                }

                // SENT requires at least one item — sending an empty proposal is
                // almost always a bug; catch it before the client gets a doc.
                if (toStatus === ProposalStatus.SENT) {
                    const [{ count }] = await tx.$queryRaw<Array<{ count: bigint }>>`
                        SELECT COUNT(*)::bigint AS count
                        FROM "ProposalItem"
                        WHERE "proposalId" = ${proposalId} AND "companyId" = ${companyId}
                    `;
                    if (count === BigInt(0)) {
                        throw new UnprocessableEntityException(
                            'A proposal must have at least one item before it can be sent.',
                        );
                    }
                }

                const updateData: Prisma.ProposalUpdateInput = { status: toStatus };
                const now = new Date();

                switch (toStatus) {
                    case ProposalStatus.SENT:
                        updateData.sentAt = now;
                        break;
                    case ProposalStatus.APPROVED:
                        updateData.approvedAt = now;
                        updateData.approvedByMembership = {
                            connect: { id: actorMembership.id },
                        };
                        break;
                    case ProposalStatus.REJECTED:
                        updateData.rejectedAt = now;
                        updateData.rejectedByMembership = {
                            connect: { id: actorMembership.id },
                        };
                        if (dto.rejectionReason !== undefined) {
                            updateData.rejectionReason = dto.rejectionReason;
                        }
                        break;
                    case ProposalStatus.CANCELLED:
                        updateData.cancelledAt = now;
                        if (dto.cancellationReason !== undefined) {
                            updateData.cancellationReason = dto.cancellationReason;
                        }
                        break;
                    default:
                        break;
                }

                await tx.proposal.update({ where: { id: proposalId }, data: updateData });

                await tx.proposalStatusHistory.create({
                    data: {
                        companyId,
                        proposalId,
                        fromStatus,
                        toStatus,
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
                    before: { status: fromStatus },
                    after: {
                        status: toStatus,
                        note: dto.note ?? null,
                        rejectionReason: dto.rejectionReason ?? null,
                        cancellationReason: dto.cancellationReason ?? null,
                    },
                });

                return { proposalId, fromStatus, toStatus };
            })
            .catch((e: unknown) => {
                if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
                    throw new ConflictException(
                        'Another proposal for this service request is already APPROVED.',
                    );
                }
                throw e;
            });

        this.events.emit('proposal.transitioned', { companyId, ...result });
        return result;
    }
}
