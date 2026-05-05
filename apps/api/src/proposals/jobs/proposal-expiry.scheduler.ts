import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
    PROPOSAL_EXPIRY_JOB,
    PROPOSAL_EXPIRY_REPEAT_JOB_ID,
    PROPOSAL_JOBS_QUEUE,
} from './proposal-jobs.constants';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalExpiryScheduler
//
// Registers the repeatable job at module init. Two design choices worth
// noting:
//
//   1. Idempotent registration. BullMQ's `Queue.add(name, data, { repeat,
//      jobId })` with a stable jobId is the documented way to upsert a
//      repeatable schedule — re-running this method on every boot of every
//      replica produces a single repeatable entry, not N. Without the
//      stable jobId, every boot would silently fan out the schedule.
//
//   2. Cron is read once at boot from PROPOSAL_EXPIRY_CRON (default
//      */5 * * * *). To change the cadence, change the env var and redeploy
//      — the new boot will overwrite the existing repeatable definition
//      because the jobId is stable. We deliberately do NOT auto-clean stale
//      repeatables on every boot; if the cron is renamed, follow up with a
//      manual `Queue.removeRepeatableByKey()` migration.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ProposalExpiryScheduler implements OnModuleInit {
    private readonly logger = new Logger(ProposalExpiryScheduler.name);

    constructor(
        @InjectQueue(PROPOSAL_JOBS_QUEUE) private readonly queue: Queue,
    ) { }

    async onModuleInit(): Promise<void> {
        const cron = this.resolveCron();

        // Pre-clean any prior repeatable that shares our jobId but with a
        // different cron pattern. Without this, changing PROPOSAL_EXPIRY_CRON
        // would leave the old schedule active alongside the new one.
        await this.removeStalePriorSchedule(cron);

        await this.queue.add(
            PROPOSAL_EXPIRY_JOB,
            { reason: 'repeatable-schedule' },
            {
                jobId: PROPOSAL_EXPIRY_REPEAT_JOB_ID,
                repeat: { pattern: cron },
                removeOnComplete: { age: 24 * 60 * 60, count: 100 },
                removeOnFail: { age: 7 * 24 * 60 * 60 },
                attempts: 3,
                backoff: { type: 'exponential', delay: 30_000 },
            },
        );

        this.logger.log(
            `Registered repeatable proposal expiry job (queue=${PROPOSAL_JOBS_QUEUE}, ` +
            `cron="${cron}", jobId=${PROPOSAL_EXPIRY_REPEAT_JOB_ID}).`,
        );
    }

    private resolveCron(): string {
        const fromEnv = process.env['PROPOSAL_EXPIRY_CRON'];
        if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
        return '*/5 * * * *';
    }

    /**
     * Removes any previously-registered repeatable for this job whose cron
     * pattern differs from the one we're about to register. Avoids a state
     * where two schedules co-exist after a cron change.
     */
    private async removeStalePriorSchedule(currentCron: string): Promise<void> {
        const repeatables = await this.queue.getRepeatableJobs();
        for (const r of repeatables) {
            if (r.name !== PROPOSAL_EXPIRY_JOB) continue;
            if (r.pattern === currentCron) continue;
            this.logger.warn(
                `Removing stale repeatable proposal expiry job (pattern="${r.pattern}", ` +
                `key="${r.key}") in favour of new pattern "${currentCron}".`,
            );
            await this.queue.removeRepeatableByKey(r.key);
        }
    }
}
