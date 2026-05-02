import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import {
    PROPOSAL_PDF_GENERATE_JOB,
    PROPOSAL_PDF_QUEUE,
} from './proposal-pdf.constants';
import {
    ProposalPdfService,
    RenderOutcome,
} from './proposal-pdf.service';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalPdfProcessor
//
// BullMQ worker that drives ProposalPdfService.renderAndPersist for jobs
// enqueued on the dedicated `proposals.pdf` queue.
//
// What this processor adds on top of the service:
//
//   1. Job-name guard: if a future job lands on the same queue, this
//      worker refuses to handle it rather than silently running the PDF
//      pipeline for an unrelated payload.
//
//   2. Concurrency knob: PDF rendering is CPU- and memory-bound (Puppeteer
//      page in this process). The default is a small per-process value
//      (2) so a single replica doesn't spawn N concurrent headless
//      Chromium pages and OOM. Operators horizontally scale by adding
//      replicas, not by raising in-process concurrency past what one
//      browser can comfortably hold.
//
//   3. Retry classification: domain-level "skip" outcomes (proposal moved
//      out of APPROVED, deleted, already rendered) are returned as
//      successful job results — NOT thrown — because they are logical
//      no-ops, not infrastructure failures. Only thrown errors are
//      retried by BullMQ. Permanent service-level errors are wrapped in
//      `UnrecoverableError` so BullMQ skips remaining attempts.
//
//   4. Payload shape contract: the processor accepts only
//      { companyId, proposalId, approvedAtEpochMs? }. companyId comes
//      from the trusted domain event (the listener), never from an HTTP
//      payload. The processor re-validates structurally and throws
//      `UnrecoverableError` on a malformed payload so BullMQ does not
//      burn retries on garbage.
// ─────────────────────────────────────────────────────────────────────────────

export type ProposalPdfJobPayload = {
    companyId: string;
    proposalId: string;
    /**
     * Epoch ms of `Proposal.approvedAt` at the moment the listener
     * captured the event. Used by the service for a re-approval drift
     * check. Optional for backward compatibility with manual kicks.
     */
    approvedAtEpochMs?: number;
    /**
     * Optional human-readable reason (audit only). e.g. "manual-rerender"
     * for an ad-hoc admin re-render endpoint.
     */
    reason?: string;
};

export type ProposalPdfJobResult = RenderOutcome & {
    durationMs: number;
};

@Processor(PROPOSAL_PDF_QUEUE, {
    concurrency: resolveConcurrency(),
})
export class ProposalPdfProcessor extends WorkerHost {
    private readonly logger = new Logger(ProposalPdfProcessor.name);

    constructor(private readonly pdfService: ProposalPdfService) {
        super();
    }

    async process(
        job: Job<ProposalPdfJobPayload, ProposalPdfJobResult>,
    ): Promise<ProposalPdfJobResult> {
        if (job.name !== PROPOSAL_PDF_GENERATE_JOB) {
            this.logger.warn(
                `ProposalPdfProcessor received unknown job "${job.name}" ` +
                `(id=${job.id}); refusing to process.`,
            );
            // Throwing UnrecoverableError tells BullMQ not to retry —
            // a wrong-name job will never become right by retrying.
            throw new UnrecoverableError(
                `Unknown job name on ${PROPOSAL_PDF_QUEUE}: ${job.name}`,
            );
        }

        const payload = this.validatePayload(job.data);
        const startedAt = Date.now();

        this.logger.log(
            `Starting proposal PDF render ` +
            `(jobId=${job.id ?? 'n/a'}, companyId=${payload.companyId}, ` +
            `proposalId=${payload.proposalId}` +
            (payload.reason ? `, reason="${payload.reason}"` : '') +
            `).`,
        );

        try {
            const outcome = await this.pdfService.renderAndPersist({
                companyId: payload.companyId,
                proposalId: payload.proposalId,
                expectedApprovedAtEpochMs: payload.approvedAtEpochMs,
            });

            const durationMs = Date.now() - startedAt;
            this.logger.log(
                `Proposal PDF job finished: kind=${outcome.kind}, ` +
                `proposalId=${payload.proposalId}, durationMs=${durationMs}.`,
            );
            return { ...outcome, durationMs };
        } catch (err) {
            // Non-retryable domain errors → wrap so BullMQ stops retrying.
            // Anything else (Puppeteer crash, S3 5xx, Postgres connection
            // blip) bubbles untouched and BullMQ retries with backoff.
            if (ProposalPdfService.isNonRetryable(err)) {
                this.logger.warn(
                    `Non-retryable PDF error for proposal ${payload.proposalId}: ` +
                    `${(err as Error).message}`,
                );
                throw new UnrecoverableError((err as Error).message);
            }
            this.logger.error(
                `PDF render failed for proposal ${payload.proposalId} ` +
                `(will retry): ${(err as Error).message}`,
            );
            throw err;
        }
    }

    /**
     * Validates the inbound payload structurally. Anything malformed is
     * non-retryable — no amount of waiting will turn `companyId: null`
     * into a real id. Throwing `UnrecoverableError` keeps the queue
     * healthy.
     */
    private validatePayload(
        raw: ProposalPdfJobPayload | undefined,
    ): ProposalPdfJobPayload {
        if (!raw || typeof raw !== 'object') {
            throw new UnrecoverableError('PDF job payload missing or not an object.');
        }
        if (typeof raw.companyId !== 'string' || raw.companyId.length === 0) {
            throw new UnrecoverableError('PDF job payload missing companyId.');
        }
        if (typeof raw.proposalId !== 'string' || raw.proposalId.length === 0) {
            throw new UnrecoverableError('PDF job payload missing proposalId.');
        }
        if (
            raw.approvedAtEpochMs !== undefined &&
            (typeof raw.approvedAtEpochMs !== 'number' ||
                !Number.isFinite(raw.approvedAtEpochMs))
        ) {
            throw new UnrecoverableError(
                'PDF job payload approvedAtEpochMs must be a finite number.',
            );
        }
        return raw;
    }
}

function resolveConcurrency(): number {
    const fromEnv = Number.parseInt(
        process.env['PROPOSAL_PDF_CONCURRENCY'] ?? '',
        10,
    );
    if (Number.isInteger(fromEnv) && fromEnv > 0) {
        // Hard ceiling: more than 8 concurrent Chromium pages in one
        // process is almost always a misconfiguration. Operators who
        // truly need it can lift this, but the default ceiling
        // protects against a fat-fingered env.
        return Math.min(fromEnv, 8);
    }
    return 2;
}
