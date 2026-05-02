import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ProposalsModule } from '../proposals.module';
import { ProposalExpiryProcessor } from './proposal-expiry.processor';
import { ProposalExpiryScheduler } from './proposal-expiry.scheduler';
import { PROPOSAL_JOBS_QUEUE } from './proposal-jobs.constants';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalJobsModule
//
// Owns the BullMQ queue dedicated to proposal lifecycle background work and
// the worker that processes it. Kept as a sibling sub-module of
// ProposalsModule rather than baked into the foundation so the foundation
// stays free of any queue / Redis dependency — the foundation is HTTP-pure
// and unit-testable without a Redis instance.
//
// Wiring:
//   - BullModule.registerQueue declares the queue inside this module's
//     scope; @InjectQueue(PROPOSAL_JOBS_QUEUE) resolves to it for both the
//     scheduler (producer) and the processor (consumer).
//   - ProposalsModule is imported (not re-declared) so the processor can
//     consume ProposalTransitionsService via the foundation's exported
//     binding. We never re-instantiate transition services in this module.
//   - The Redis connection is provided once at the application root via
//     BullModule.forRoot(...) in AppModule. registerQueue here only
//     references the queue name; it inherits the root connection.
// ─────────────────────────────────────────────────────────────────────────────

@Module({
    imports: [
        ProposalsModule,
        BullModule.registerQueue({
            name: PROPOSAL_JOBS_QUEUE,
            defaultJobOptions: {
                // Per-job defaults; the scheduler can override these for the
                // repeatable schedule. Keep both producer paths consistent.
                attempts: 3,
                backoff: { type: 'exponential', delay: 30_000 },
                removeOnComplete: { age: 24 * 60 * 60, count: 100 },
                removeOnFail: { age: 7 * 24 * 60 * 60 },
            },
        }),
    ],
    providers: [ProposalExpiryProcessor, ProposalExpiryScheduler],
})
export class ProposalJobsModule { }
