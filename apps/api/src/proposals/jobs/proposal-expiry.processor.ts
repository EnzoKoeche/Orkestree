import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ProposalTransitionsService } from '../proposal-transitions.service';
import {
    PROPOSAL_EXPIRY_JOB,
    PROPOSAL_JOBS_QUEUE,
} from './proposal-jobs.constants';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalExpiryProcessor
//
// Thin BullMQ worker that delegates to the proposals foundation's existing
// ProposalTransitionsService.expireDueProposals(batchSize). All DB-level
// safety — SELECT FOR UPDATE SKIP LOCKED batch pick, per-row tx with re-lock,
// status-history + audit writes, and post-commit `proposal.expired` event —
// is owned by the foundation. This processor adds nothing on top except:
//
//   1. Scheduling: the job is invoked by BullMQ on a cron, not by an HTTP
//      handler, so there is no actor membership in the calling context.
//      That is exactly what the foundation method already assumes.
//
//   2. Idempotency:
//        - The repeatable job uses a stable jobId
//          (PROPOSAL_EXPIRY_REPEAT_JOB_ID), so re-adding it on every boot is
//          a no-op in BullMQ.
//        - The DB-side guarantee is also idempotent by construction: the
//          foundation re-checks `status === 'SENT'` and `validUntil <= NOW()`
//          inside each per-row transaction under FOR UPDATE. A row that
//          another worker (or a manual /expire call) already transitioned
//          out of SENT is silently skipped — never double-counted.
//
//   3. Concurrency: multiple API replicas can run this worker in parallel.
//      SKIP LOCKED splits the backlog cleanly between them. The processor's
//      own `concurrency` knob is set to 1 because the foundation already
//      handles the batch internally; raising it would only cause workers in
//      the same process to race for the same SKIP LOCKED rows.
//
// Failure semantics:
//   - If `expireDueProposals` throws (e.g. a Redis blip mid-batch), the job
//     is marked failed and BullMQ retries with exponential backoff per the
//     queue's defaultJobOptions. Already-committed transitions inside that
//     batch stay committed — partial progress is safe because every row is
//     transitioned in its own tx, never in a shared one.
//   - The processor swallows individual per-row errors (the foundation
//     method `.catch(() => null)`s them) so a poisoned proposal cannot
//     block the rest of the batch from progressing.
// ─────────────────────────────────────────────────────────────────────────────

type ExpiryJobPayload = {
    /** Optional override; defaults to the configured batch size. */
    batchSize?: number;
    /** Optional human-readable reason for ad-hoc kicks (audit only). */
    reason?: string;
};

type ExpiryJobResult = {
    expiredCount: number;
    expiredProposalIds: string[];
    batchSize: number;
    durationMs: number;
};

@Processor(PROPOSAL_JOBS_QUEUE, { concurrency: 1 })
export class ProposalExpiryProcessor extends WorkerHost {
    private readonly logger = new Logger(ProposalExpiryProcessor.name);

    constructor(
        private readonly transitionsService: ProposalTransitionsService,
    ) {
        super();
    }

    async process(job: Job<ExpiryJobPayload, ExpiryJobResult>): Promise<ExpiryJobResult> {
        if (job.name !== PROPOSAL_EXPIRY_JOB) {
            // Defensive: the queue is currently single-purpose, but if
            // future jobs land on the same queue we don't want to silently
            // run the expiry sweep for them.
            this.logger.warn(
                `ProposalExpiryProcessor received unknown job "${job.name}" (id=${job.id}); skipping.`,
            );
            return { expiredCount: 0, expiredProposalIds: [], batchSize: 0, durationMs: 0 };
        }

        const batchSize = this.resolveBatchSize(job.data?.batchSize);
        const startedAt = Date.now();

        this.logger.log(
            `Starting proposal expiry sweep (jobId=${job.id ?? 'n/a'}, batchSize=${batchSize}` +
            (job.data?.reason ? `, reason="${job.data.reason}"` : '') +
            `).`,
        );

        // The foundation method does NOT throw on per-row errors — it
        // collects successful expirations and returns them. A throw here
        // means the outer batch-pick query failed, which is a transient
        // infra issue worth retrying.
        const { expired } = await this.transitionsService.expireDueProposals(batchSize);

        const durationMs = Date.now() - startedAt;
        this.logger.log(
            `Proposal expiry sweep finished: expired=${expired.length}, batchSize=${batchSize}, durationMs=${durationMs}.`,
        );

        return {
            expiredCount: expired.length,
            expiredProposalIds: expired,
            batchSize,
            durationMs,
        };
    }

    private resolveBatchSize(override?: number): number {
        if (typeof override === 'number' && Number.isInteger(override) && override > 0) {
            return Math.min(override, 500); // hard ceiling — protects DB from a bad payload
        }
        const fromEnv = Number.parseInt(process.env['PROPOSAL_EXPIRY_BATCH_SIZE'] ?? '', 10);
        if (Number.isInteger(fromEnv) && fromEnv > 0) {
            return Math.min(fromEnv, 500);
        }
        return 50;
    }
}
