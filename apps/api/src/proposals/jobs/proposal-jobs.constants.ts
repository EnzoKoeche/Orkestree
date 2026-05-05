// ─────────────────────────────────────────────────────────────────────────────
// proposal-jobs.constants.ts
//
// Single source of truth for queue / job names and the repeatable-job key.
// Imported by the queue registration, the processor, and the bootstrap that
// schedules the repeatable job. Hard-coding these strings inline would make
// it easy to drift between producer and consumer and silently break the
// schedule (BullMQ matches by exact name).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BullMQ queue dedicated to proposal lifecycle background jobs.
 *
 * The queue is intentionally proposal-scoped (not a generic "jobs" queue) so
 * that operational concerns — pause / drain / metrics — can be acted on
 * without affecting unrelated workloads (PDFs, email, chat) when those land.
 */
export const PROPOSAL_JOBS_QUEUE = 'proposals.jobs';

/**
 * Job name for the periodic "expire SENT proposals past validUntil" sweep.
 * Used both as the BullMQ job name and as the repeatable-job identifier
 * (jobId) so that re-deploying the API never produces duplicate schedules.
 */
export const PROPOSAL_EXPIRY_JOB = 'proposal.expiry.sweep';

/**
 * Stable jobId for the repeatable schedule. BullMQ uses this to deduplicate
 * the repeatable definition: re-adding the same { name, repeat, jobId } is a
 * no-op. Without a stable jobId, every API boot would register a new
 * repeatable entry and the schedule would silently fan out.
 */
export const PROPOSAL_EXPIRY_REPEAT_JOB_ID = 'proposal.expiry.sweep:repeatable';
