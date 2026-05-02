import {
    ConflictException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
    AuditOperation,
    Prisma,
    ProposalStatus,
} from '@prisma/client';
import { ConfigAuditService } from '../../company-config/audit/config-audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
    PROPOSAL_PDF_MAX_BYTES,
    PROPOSAL_PDF_READY_EVENT,
} from './proposal-pdf.constants';
import {
    ProposalPdfRenderer,
    ProposalPdfSnapshot,
} from './proposal-pdf.renderer';
import {
    buildProposalPdfObjectKey,
    PROPOSAL_PDF_STORAGE,
    ProposalPdfStorage,
} from './proposal-pdf.storage';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalPdfService
//
// Owns the end-to-end PDF lifecycle for a single proposal:
//
//   1. Load the proposal in a tenant-safe way (companyId + proposalId).
//   2. Verify the proposal is still APPROVED. If it has moved out of
//      APPROVED (e.g. a future "unapprove" path), skip silently — the job
//      has nothing meaningful to render.
//   3. Skip silently if a PDF already exists for this approval (idempotent
//      replay). The trigger is `approvedAt`: when the persisted
//      pdfGeneratedAt is >= approvedAt and pdfUrl is set, the artifact for
//      this approval already exists.
//   4. Build a client-facing snapshot using EXPLICIT Prisma selects that
//      do not contain internalCost or totalCost. Sensitive monetary fields
//      cannot leak because the renderer's input type doesn't even carry
//      them.
//   5. Render HTML → PDF (Puppeteer, server-side only).
//   6. Upload to storage at a content-addressed key.
//   7. Inside a single transaction:
//      - re-lock the row (FOR UPDATE)
//      - re-check status === APPROVED and approvedAt unchanged
//      - write back pdfUrl and pdfGeneratedAt
//      - emit ConfigAuditLog (UPDATE on Proposal, before/after pdf state)
//   8. ONLY after the transaction commits, emit `proposal.pdf.ready`.
//
// Idempotency is enforced at three layers (defense in depth):
//   A. BullMQ jobId is a stable function of (companyId, proposalId,
//      approvedAtEpochMs). Re-enqueue collapses to a single job.
//   B. Step 3 above short-circuits before doing any rendering work.
//   C. The transactional write-back re-checks approvedAt; if the proposal
//      has been re-approved since the job started (currently impossible,
//      defensive), the stale write is rejected.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Outcome of a single render attempt. The processor returns this verbatim
 * to BullMQ for observability.
 */
export type RenderOutcome =
    | {
        kind: 'rendered';
        proposalId: string;
        companyId: string;
        pdfUrl: string;
        pdfGeneratedAt: Date;
        bytes: number;
        approvedAtEpochMs: number;
    }
    | {
        kind: 'skipped-not-approved';
        proposalId: string;
        currentStatus: ProposalStatus;
    }
    | {
        kind: 'skipped-already-rendered';
        proposalId: string;
        pdfUrl: string;
        pdfGeneratedAt: Date;
    }
    | {
        kind: 'skipped-not-found';
        proposalId: string;
    };

/**
 * Internal projection used by the loader. Explicit select; no internalCost,
 * no totalCost, no notes.
 */
const PROPOSAL_PDF_LOAD_SELECT = {
    id: true,
    companyId: true,
    number: true,
    status: true,
    title: true,
    clientNotes: true,
    discountPct: true,
    discountAmount: true,
    subtotal: true,
    totalPrice: true,
    validUntil: true,
    approvedAt: true,
    createdAt: true,
    pdfUrl: true,
    pdfGeneratedAt: true,
    // Carried through so the audit row can attribute the action to the
    // creator's userId without a second tx-bound lookup. NOT included in
    // the renderer snapshot.
    createdByMembershipId: true,
    company: {
        select: {
            legalName: true,
            tradeName: true,
            taxId: true,
            addressStreet: true,
            addressNumber: true,
            addressComplement: true,
            addressNeighborhood: true,
            addressCity: true,
            addressState: true,
            addressPostalCode: true,
            addressCountry: true,
        },
    },
    serviceRequest: {
        select: { number: true, title: true },
    },
    client: {
        select: {
            name: true,
            taxId: true,
            email: true,
            phone: true,
        },
    },
    items: {
        select: {
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

/**
 * Strongly-typed shape of the load query. Derived from the select above so
 * a future field addition flows through without a manual type bump.
 */
type LoadedProposal = Prisma.ProposalGetPayload<{
    select: typeof PROPOSAL_PDF_LOAD_SELECT;
}>;

@Injectable()
export class ProposalPdfService {
    private readonly logger = new Logger(ProposalPdfService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly renderer: ProposalPdfRenderer,
        @Inject(PROPOSAL_PDF_STORAGE)
        private readonly storage: ProposalPdfStorage,
        private readonly auditService: ConfigAuditService,
        private readonly events: EventEmitter2,
    ) { }

    /**
     * Render and persist the PDF for a single approved proposal. Driven by
     * the BullMQ processor; no HTTP path. Tenant safety comes from the
     * (companyId, proposalId) tuple in the job payload, both originating
     * from a trusted domain event (`proposal.approved`).
     *
     * Throwing means the job should retry (transient infra problem).
     * Returning a `skipped-*` outcome means the job is logically done and
     * should NOT retry.
     */
    async renderAndPersist(input: {
        companyId: string;
        proposalId: string;
        /**
         * Optional sanity check: if the listener captured approvedAt at
         * enqueue time, we can detect a re-approval mid-flight by
         * comparing it against the persisted value when we re-load.
         */
        expectedApprovedAtEpochMs?: number;
    }): Promise<RenderOutcome> {
        const { companyId, proposalId } = input;

        // ── 1. Tenant-safe load ─────────────────────────────────────────
        const proposal = await this.prisma.proposal.findFirst({
            where: { id: proposalId, companyId },
            select: PROPOSAL_PDF_LOAD_SELECT,
        });

        if (!proposal) {
            this.logger.warn(
                `Proposal ${proposalId} (company ${companyId}) not found at PDF render time; skipping.`,
            );
            return { kind: 'skipped-not-found', proposalId };
        }

        // ── 2. Eligibility re-check ─────────────────────────────────────
        if (proposal.status !== ProposalStatus.APPROVED) {
            this.logger.warn(
                `Proposal ${proposalId} no longer APPROVED (now ${proposal.status}); skipping PDF render.`,
            );
            return {
                kind: 'skipped-not-approved',
                proposalId,
                currentStatus: proposal.status,
            };
        }
        if (!proposal.approvedAt) {
            // Defensive: the foundation always sets approvedAt with the
            // status transition under the same tx, but if a hand-edit ever
            // produced an inconsistent row, refuse rather than guess.
            throw new UnprocessableEntityException(
                `Proposal ${proposalId} is APPROVED but has no approvedAt timestamp.`,
            );
        }

        const approvedAtEpochMs = proposal.approvedAt.getTime();

        // The listener captures approvedAt at the moment the event fired.
        // If a future re-approval flow advances approvedAt, the in-flight
        // job's expected value will differ — skip and let the new
        // event/job render the new artifact.
        if (
            input.expectedApprovedAtEpochMs !== undefined &&
            input.expectedApprovedAtEpochMs !== approvedAtEpochMs
        ) {
            this.logger.warn(
                `Proposal ${proposalId} approvedAt drifted from ${input.expectedApprovedAtEpochMs} ` +
                `to ${approvedAtEpochMs}; skipping stale PDF job.`,
            );
            return {
                kind: 'skipped-not-approved',
                proposalId,
                currentStatus: proposal.status,
            };
        }

        // ── 3. Already rendered? ────────────────────────────────────────
        // pdfGeneratedAt >= approvedAt means the persisted PDF was produced
        // for THIS approval. A re-approval would advance approvedAt past
        // pdfGeneratedAt and force a fresh render.
        if (
            proposal.pdfUrl &&
            proposal.pdfGeneratedAt &&
            proposal.pdfGeneratedAt.getTime() >= approvedAtEpochMs
        ) {
            this.logger.log(
                `Proposal ${proposalId} already has a PDF for approvedAt=${proposal.approvedAt.toISOString()}; skipping.`,
            );
            return {
                kind: 'skipped-already-rendered',
                proposalId,
                pdfUrl: proposal.pdfUrl,
                pdfGeneratedAt: proposal.pdfGeneratedAt,
            };
        }

        // ── 4. Build snapshot (no sensitive monetary fields) ────────────
        const snapshot = this.buildSnapshot(proposal);

        // ── 5. Render HTML → PDF ────────────────────────────────────────
        const html = this.renderer.buildClientFacingHtml(snapshot);
        const pdfBytes = await this.renderer.renderToPdf(html);

        if (pdfBytes.byteLength > PROPOSAL_PDF_MAX_BYTES) {
            throw new UnprocessableEntityException(
                `Rendered proposal PDF exceeded ${PROPOSAL_PDF_MAX_BYTES} bytes ` +
                `(${pdfBytes.byteLength}); refusing to upload.`,
            );
        }

        // ── 6. Upload at content-addressed key ──────────────────────────
        const objectKey = buildProposalPdfObjectKey({
            companyId,
            proposalId,
            approvedAtEpochMs,
        });
        const upload = await this.storage.putPdf(
            objectKey,
            pdfBytes,
            'application/pdf',
        );

        // ── 7. Transactional write-back with re-check ───────────────────
        const persistedAt = new Date();
        let writeBackOutcome: 'wrote' | 'skipped-status' | 'skipped-reapproval' = 'wrote';

        await this.prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<
                Array<{
                    id: string;
                    status: ProposalStatus;
                    number: number;
                    approvedAt: Date | null;
                    pdfUrl: string | null;
                    pdfGeneratedAt: Date | null;
                }>
            >`
                SELECT id, status, number, "approvedAt", "pdfUrl", "pdfGeneratedAt"
                FROM "Proposal"
                WHERE id = ${proposalId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;
            const locked = rows[0];
            if (!locked) {
                // Deleted between load and write-back. The upload is now
                // an orphan; storage TTL/lifecycle policy is the cleanup
                // path. Log and skip.
                this.logger.warn(
                    `Proposal ${proposalId} disappeared between render and write-back; ` +
                    `uploaded object ${objectKey} is now orphaned.`,
                );
                throw new NotFoundException('Proposal disappeared mid-render.');
            }

            if (locked.status !== ProposalStatus.APPROVED) {
                // Status moved out of APPROVED while we were rendering.
                // Don't write back — the PDF is for an approval that no
                // longer holds.
                writeBackOutcome = 'skipped-status';
                return;
            }
            if (
                !locked.approvedAt ||
                locked.approvedAt.getTime() !== approvedAtEpochMs
            ) {
                // Re-approval landed mid-flight. Our PDF is stale.
                writeBackOutcome = 'skipped-reapproval';
                return;
            }
            // Race: another worker already wrote back for this same
            // approval. Object key is identical (content-addressed), so
            // the storage upload above was an idempotent overwrite.
            // Treat as already-rendered.
            if (
                locked.pdfUrl &&
                locked.pdfGeneratedAt &&
                locked.pdfGeneratedAt.getTime() >= approvedAtEpochMs
            ) {
                writeBackOutcome = 'skipped-status';
                return;
            }

            await tx.proposal.update({
                where: { id: proposalId },
                data: {
                    pdfUrl: upload.url,
                    pdfGeneratedAt: persistedAt,
                },
            });

            // Audit. The PDF worker has no actor membership of its own
            // (system-driven, not HTTP-driven). We attribute the action
            // to the proposal's creator userId — same pattern used by
            // ProposalTransitionsService.expireDueProposals, so the audit
            // log reads consistently across automated proposal events.
            const creator = await tx.companyMembership.findUnique({
                where: { id: proposal.createdByMembershipId },
                select: { userId: true },
            });

            if (creator) {
                await this.auditService.write(tx, {
                    companyId,
                    actorId: creator.userId,
                    operation: AuditOperation.UPDATE,
                    entityType: 'Proposal',
                    entityId: proposalId,
                    entityCode: String(locked.number),
                    before: {
                        pdfUrl: locked.pdfUrl,
                        pdfGeneratedAt: locked.pdfGeneratedAt?.toISOString() ?? null,
                    },
                    after: {
                        pdfUrl: upload.url,
                        pdfGeneratedAt: persistedAt.toISOString(),
                        objectKey: upload.objectKey,
                        bytes: upload.bytes,
                        automated: true,
                        cause: 'proposal.pdf.generate',
                    },
                });
            }
        });

        if (writeBackOutcome === 'skipped-status') {
            return {
                kind: 'skipped-not-approved',
                proposalId,
                currentStatus: ProposalStatus.APPROVED, // best effort
            };
        }
        if (writeBackOutcome === 'skipped-reapproval') {
            return {
                kind: 'skipped-not-approved',
                proposalId,
                currentStatus: ProposalStatus.APPROVED,
            };
        }

        // ── 8. Post-commit event ────────────────────────────────────────
        this.events.emit(PROPOSAL_PDF_READY_EVENT, {
            companyId,
            proposalId,
            pdfUrl: upload.url,
            pdfGeneratedAt: persistedAt.toISOString(),
            approvedAtEpochMs,
        });

        return {
            kind: 'rendered',
            proposalId,
            companyId,
            pdfUrl: upload.url,
            pdfGeneratedAt: persistedAt,
            bytes: upload.bytes,
            approvedAtEpochMs,
        };
    }

    // ── Internal: snapshot construction ─────────────────────────────────

    private buildSnapshot(loaded: LoadedProposal): ProposalPdfSnapshot {
        // Defensive narrowing: this method runs only after the eligibility
        // check confirmed APPROVED, so `approvedAt` is non-null.
        if (loaded.status !== ProposalStatus.APPROVED || !loaded.approvedAt) {
            throw new UnprocessableEntityException(
                'Internal error: snapshot built from non-APPROVED proposal.',
            );
        }

        const c = loaded.company;
        const addressLine = [
            [c.addressStreet, c.addressNumber].filter(Boolean).join(', '),
            c.addressComplement,
            c.addressNeighborhood,
            [c.addressCity, c.addressState].filter(Boolean).join('/'),
            c.addressPostalCode,
            c.addressCountry,
        ]
            .filter((p) => p && p.length > 0)
            .join(' · ');

        return {
            proposal: {
                id: loaded.id,
                number: loaded.number,
                title: loaded.title,
                status: 'APPROVED',
                clientNotes: loaded.clientNotes,
                discountPct: loaded.discountPct,
                discountAmount: loaded.discountAmount,
                subtotal: loaded.subtotal,
                totalPrice: loaded.totalPrice,
                validUntil: loaded.validUntil,
                approvedAt: loaded.approvedAt,
                createdAt: loaded.createdAt,
            },
            company: {
                legalName: c.legalName,
                tradeName: c.tradeName,
                taxId: c.taxId,
                addressLine,
            },
            serviceRequest: {
                number: loaded.serviceRequest.number,
                title: loaded.serviceRequest.title,
            },
            client: loaded.client
                ? {
                    name: loaded.client.name,
                    taxId: loaded.client.taxId,
                    email: loaded.client.email,
                    phone: loaded.client.phone,
                }
                : null,
            items: loaded.items.map((it) => ({
                description: it.description,
                unit: it.unit,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                discountPct: it.discountPct,
                subtotal: it.subtotal,
                sortOrder: it.sortOrder,
            })),
        };
    }

    /**
     * Surface ConflictException to the BullMQ worker as a non-retryable
     * outcome. Currently unused but kept here so future callers know the
     * intended mapping; the worker's catch path uses this.
     */
    static isNonRetryable(err: unknown): boolean {
        return (
            err instanceof NotFoundException ||
            err instanceof ConflictException ||
            err instanceof UnprocessableEntityException
        );
    }
}
he BullMQ worker as a non-retryable
     * outcome. Currently unused but kept here so future callers know the
     * intended mapping; the worker's catch path uses this.
     */
    static isNonRetryable(err: unknown): boolean {
        return (
            err instanceof NotFoundException ||
            err instanceof ConflictException ||
            err instanceof UnprocessableEntityException
        );
    }
}
       err instanceof UnprocessableEntityException
        );
    }
}
he BullMQ worker as a non-retryable
     * outcome. Currently unused but kept here so future callers know the
     * intended mapping; the worker's catch path uses this.
     */
    static isNonRetryable(err: unknown): boolean {
        return (
            err instanceof NotFoundException ||
            err instanceof ConflictException ||
            err instanceof UnprocessableEntityException
        );
    }
}
