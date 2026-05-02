import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ProposalStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
    buildProposalPdfJobId,
    PROPOSAL_APPROVED_EVENT,
    PROPOSAL_PDF_GENERATE_JOB,
    PROPOSAL_PDF_QUEUE,
} from './proposal-pdf.constants';
import { ProposalPdfJobPayload } from './proposal-pdf.processor';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalPdfListener
//
// Bridges the domain event `proposal.approved` to the PDF queue.
//
// Trigger choice — proposal.approved ONLY (NOT proposal.sent).
//
//   APPROVED is the only proposal state where:
//     - items, discounts, and totals are frozen (no further mutation is
//       allowed — DRAFT is the only writable status in the foundation);
//     - the document carries legal weight (signed-off price the client
//       can act on);
//     - approvedAt is set exactly once and never advances afterwards in
//       the current foundation, which gives us a stable idempotency key.
//
//   SENT, in contrast, is a transient state. A proposal can move SENT →
//   APPROVED, SENT → REJECTED, SENT → CANCELLED, or SENT → EXPIRED.
//   Generating a PDF on SENT would either:
//     a) waste work on a proposal that gets rejected/cancelled minutes
//        later, or
//     b) expose a "preview" PDF whose totals can technically still
//        change if the foundation is ever extended to allow SENT-edit.
//
//   Per the explicit instruction: trigger from APPROVED unless the repo
//   already shows a stronger reason to use SENT. The repo currently has
//   no such signal — items / discounts / field values are DRAFT-only,
//   the SENT state has no PDF-bearing semantics in the foundation, and
//   the controller exposes no /sent-pdf path. So APPROVED-only it is.
//
// Tenant safety:
//
//   `proposal.approved` is emitted by ProposalTransitionsService.approveProposal
//   AFTER the transaction commits. The companyId in the payload is the
//   one held under SELECT FOR UPDATE inside that transaction — it is
//   never a value provided by an HTTP client. The listener trusts it
//   on that basis (this is the "trusted domain event" axis named in the
//   engineering rules).
//
//   Defence-in-depth: the listener still re-loads the proposal under
//   its own (companyId, proposalId) tuple to capture approvedAt, which
//   incidentally re-validates that the row exists in that tenant before
//   anything is enqueued.
//
// Idempotency:
//
//   The job's BullMQ jobId is `buildProposalPdfJobId(...)` keyed on
//   approvedAt's epoch ms. BullMQ deduplicates by jobId, so:
//
//     - Re-firing `proposal.approved` for the same approval (event-bus
//       retry, listener replay, manual admin re-emit) collapses to one
//       enqueue.
//     - A re-approval (if ever introduced) advances approvedAt and
//       therefore the jobId, so a fresh PDF is rendered without
//       overwriting the previous one in storage (object key is
//       content-addressed by the same epoch ms).
// ─────────────────────────────────────────────────────────────────────────────

type ProposalApprovedEventPayload = {
    companyId: string;
    proposalId: string;
};

@Injectable()
export class ProposalPdfListener {
    private readonly logger = new Logger(ProposalPdfListener.name);

    constructor(
        @InjectQueue(PROPOSAL_PDF_QUEUE) private readonly queue: Queue,
        private readonly prisma: PrismaService,
    ) { }

    @OnEvent(PROPOSAL_APPROVED_EVENT, { async: true, promisify: true })
    async onProposalApproved(
        payload: ProposalApprovedEventPayload,
    ): Promise<void> {
        // The event is emitted post-commit by the transitions service. We
        // still validate the payload defensively — an in-process listener
        // bug should not produce a poisoned PDF job.
        if (
            !payload ||
            typeof payload.companyId !== 'string' ||
            typeof payload.proposalId !== 'string' ||
            payload.companyId.length === 0 ||
            payload.proposalId.length === 0
        ) {
            this.logger.warn(
                `Ignoring proposal.approved event with malformed payload: ${JSON.stringify(payload)}`,
            );
            return;
        }

        if ((process.env['PROPOSAL_PDF_ENABLED'] ?? 'true').toLowerCase() === 'false') {
            // Explicit kill switch for environments that don't want
            // Puppeteer running (e.g. CI pipelines, low-memory dev pods).
            this.logger.log(
                `PROPOSAL_PDF_ENABLED=false — skipping PDF enqueue for proposal ${payload.proposalId}.`,
            );
            return;
        }

        // Re-load the row to capture approvedAt. This is a tenant-scoped
        // read by (companyId, id); if the row is gone or no longer
        // APPROVED (impossible in the current foundation; defensive),
        // we skip enqueueing rather than producing a job that the
        // worker will only skip later.
        const proposal = await this.prisma.proposal.findFirst({
            where: { id: payload.proposalId, companyId: payload.companyId },
            select: { id: true, status: true, approvedAt: true },
        });

        if (!proposal) {
            this.logger.warn(
                `proposal.approved received for missing proposal ` +
                `${payload.proposalId} in company ${payload.companyId}; ignoring.`,
            );
            return;
        }
        if (proposal.status !== ProposalStatus.APPROVED || !proposal.approvedAt) {
            this.logger.warn(
                `proposal.approved received for proposal ${payload.proposalId} ` +
                `but status is ${proposal.status} (approvedAt=${proposal.approvedAt?.toISOString() ?? 'null'}); ignoring.`,
            );
            return;
        }

        const approvedAtEpochMs = proposal.approvedAt.getTime();
        const jobId = buildProposalPdfJobId({
            companyId: payload.companyId,
            proposalId: payload.proposalId,
            approvedAtEpochMs,
        });

        const jobPayload: ProposalPdfJobPayload = {
            companyId: payload.companyId,
            proposalId: payload.proposalId,
            approvedAtEpochMs,
            reason: 'proposal.approved',
        };

        // BullMQ.add is idempotent for the same jobId: if a job with this
        // id already exists (active, waiting, completed within the
        // retention window), the second add is a no-op and returns the
        // existing job. That is exactly the contract we want.
        const job = await this.queue.add(
            PROPOSAL_PDF_GENERATE_JOB,
            jobPayload,
            {
                jobId,
                // PDF-specific overrides on top of the queue defaults
                // declared in ProposalPdfModule. We keep them aligned
                // here for the ad-hoc kick path that may want to reuse
                // them later.
                attempts: 5,
                backoff: { type: 'exponential', delay: 60_000 },
                removeOnComplete: { age: 24 * 60 * 60, count: 200 },
                removeOnFail: { age: 14 * 24 * 60 * 60 },
            },
        );

        this.logger.log(
            `Enqueued proposal PDF render (jobId=${job.id}, ` +
            `proposalId=${payload.proposalId}, companyId=${payload.companyId}, ` +
            `approvedAtEpochMs=${approvedAtEpochMs}).`,
        );
    }
}
