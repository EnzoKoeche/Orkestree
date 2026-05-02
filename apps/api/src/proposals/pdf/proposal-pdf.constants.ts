// ─────────────────────────────────────────────────────────────────────────────
// proposal-pdf.constants.ts
//
// Single source of truth for queue / job names and the idempotency-key shape
// used by the proposal PDF pipeline. Imported by the queue registration, the
// processor, and the listener that enqueues the job. Hard-coding these
// strings inline would let producer and consumer drift silently (BullMQ
// matches by exact name).
//
// The PDF queue is intentionally SEPARATE from the proposal-jobs queue used
// by the expiry sweep:
//   - PDF rendering is CPU- / IO-bound (Puppeteer + storage upload) and
//     should be scaled / paused independently of the lifecycle sweep.
//   - A poisoned PDF render that exhausts retries should never block the
//     expiry job from running, and vice versa.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BullMQ queue dedicated to proposal PDF rendering jobs.
 *
 * Held as its own queue (not multiplexed onto `proposals.jobs`) so ops can
 * pause / drain / scale PDF workers without affecting the expiry sweep.
 */
export const PROPOSAL_PDF_QUEUE = 'proposals.pdf';

/**
 * Job name for "render and persist a proposal PDF". Used both as the BullMQ
 * job name and as the prefix for the per-proposal idempotency key.
 */
export const PROPOSAL_PDF_GENERATE_JOB = 'proposal.pdf.generate';

/**
 * Stable, content-addressed idempotency key for a proposal-PDF render.
 *
 * Shape:  proposal.pdf:<companyId>:<proposalId>:APPROVED:<approvedAtEpochMs>
 *
 * Why include `approvedAt` epoch ms?
 *   - APPROVED is a terminal state in the current foundation. Once set,
 *     `approvedAt` is immutable — so the key is stable forever for that
 *     particular approval.
 *   - If a future change ever introduces re-approval (e.g. unapprove → fix →
 *     re-approve), `approvedAt` will tick forward and the key will naturally
 *     differ, producing a fresh PDF instead of silently reusing a stale one.
 *
 * Used as the BullMQ `jobId` so duplicate enqueues for the same approval
 * (event re-fires, listener replays, manual kicks) collapse to a single job.
 */
export function buildProposalPdfJobId(input: {
    companyId: string;
    proposalId: string;
    approvedAtEpochMs: number;
}): string {
    return `proposal.pdf:${input.companyId}:${input.proposalId}:APPROVED:${input.approvedAtEpochMs}`;
}

/**
 * Domain event names. Centralised so listener and emitter never drift.
 */
export const PROPOSAL_APPROVED_EVENT = 'proposal.approved';
export const PROPOSAL_PDF_READY_EVENT = 'proposal.pdf.ready';

/**
 * Storage prefix used by both drivers. Object keys take the form:
 *
 *   <prefix>/<companyId>/<proposalId>/<approvedAtEpochMs>.pdf
 *
 * The approvedAtEpochMs suffix means a re-approval (if ever supported) lands
 * at a new key — the previous PDF is preserved instead of being silently
 * overwritten, which matches the audit-trail expectation for terminal
 * financial documents.
 */
export const PROPOSAL_PDF_STORAGE_PREFIX = 'proposals';

/**
 * Max bytes allowed for a rendered proposal PDF. A blown-up render (image
 * payload bug, runaway template loop) should fail the job with a clear
 * reason rather than uploading a multi-hundred-MB blob. 25 MB is generous
 * for a text-heavy document with a few embedded images.
 */
export const PROPOSAL_PDF_MAX_BYTES = 25 * 1024 * 1024;
