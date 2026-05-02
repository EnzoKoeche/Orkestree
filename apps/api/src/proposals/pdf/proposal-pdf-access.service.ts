import {
    ConflictException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { CompanyMembership, Prisma, ProposalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProposalsService } from '../proposals.service';
import {
    buildProposalPdfObjectKey,
    PROPOSAL_PDF_STORAGE,
    ProposalPdfStorage,
    ReadAccess,
} from './proposal-pdf.storage';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalPdfAccessService
//
// Read-side counterpart to ProposalPdfService. Authorises a caller to read
// the rendered PDF for a proposal, rebuilds the canonical storage object
// key SERVER-SIDE from the (companyId, proposalId, approvedAt) tuple, and
// asks the storage driver to open authorised access (stream | redirect).
//
// Non-negotiables enforced here:
//
//   1. companyId is taken EXCLUSIVELY from the authenticated membership
//      (passed in by the controller via @CurrentMembership). The path
//      param is matched against it but never trusted as the source.
//
//   2. Row-level visibility delegates to
//      ProposalsService.assertCanReadProposal — the SAME helper used by
//      every other proposal read path. This guarantees:
//        - CLIENTE row filter (must own the linked ServiceRequest)
//        - DRAFT hidden from CLIENTE
//        - identical NotFoundException ⇒ no existence oracle
//
//   3. Domain services are NOT modified. This service composes the
//      foundation reader, the storage driver, and the same explicit
//      Prisma select projections used elsewhere; it does not re-implement
//      visibility logic.
//
//   4. Storage object key is REBUILT from server-controlled fields
//      (Proposal.companyId, Proposal.id, Proposal.approvedAt). The
//      persisted Proposal.pdfUrl is NEVER parsed for read access — that
//      column is effectively a stale public hint, while the canonical
//      key derivation is deterministic and cannot be poisoned by a
//      future write bug.
//
//   5. Tenant isolation: every Prisma where clause is scoped by
//      (companyId, id), and the rebuilt key embeds companyId, so a
//      caller from company A can never reach company B's PDF even on a
//      hypothetical id collision.
//
//   6. No existence oracle: missing proposal AND row-level-blocked
//      proposal both surface as 404 "Proposal not found." Distinct from
//      the 409 returned when the proposal IS visible but the PDF has
//      not been rendered yet.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Explicit projection for the access path. Intentionally narrow:
 * everything needed to authorise + rebuild the storage key, and nothing
 * that would leak sensitive fields if the snapshot were logged. No
 * `internalCost`, no `totalCost`, no `notes`, no items.
 */
const PROPOSAL_PDF_ACCESS_SELECT = {
    id: true,
    companyId: true,
    status: true,
    approvedAt: true,
    pdfUrl: true,
    pdfGeneratedAt: true,
} satisfies Prisma.ProposalSelect;

type AccessRow = Prisma.ProposalGetPayload<{
    select: typeof PROPOSAL_PDF_ACCESS_SELECT;
}>;

/**
 * Successful access result. Discriminates between drivers WITHOUT
 * leaking driver identity to the controller — the controller branches
 * on `kind` only.
 */
export type ProposalPdfAccessResult = {
    proposalId: string;
    pdfGeneratedAt: Date;
    bytes: number | null;
    /** Suggested filename for Content-Disposition. */
    filename: string;
    access: ReadAccess;
};

@Injectable()
export class ProposalPdfAccessService {
    private readonly logger = new Logger(ProposalPdfAccessService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly proposalsService: ProposalsService,
        @Inject(PROPOSAL_PDF_STORAGE)
        private readonly storage: ProposalPdfStorage,
    ) { }

    /**
     * Resolve a PDF read request to either:
     *   - a `ReadAccess` (stream | redirect) when the caller is
     *     authorised AND the PDF has been rendered, OR
     *   - throws a domain exception that the controller maps 1:1 to an
     *     HTTP status:
     *       NotFoundException            → 404 (proposal hidden / missing)
     *       ConflictException            → 409 (proposal exists, no PDF yet)
     *       ServiceUnavailableException  → 503 (storage transient error)
     *
     * The `pathCompanyId` argument is the value from the URL — it is
     * cross-checked against the authenticated membership's companyId
     * as defence-in-depth (the CompanyMemberGuard already validates
     * the URL companyId resolves to a real membership for the user,
     * but a future guard refactor must not silently break tenancy).
     */
    async resolveAccess(
        actorMembership: Pick<
            CompanyMembership,
            'id' | 'companyId' | 'userId' | 'role'
        >,
        pathCompanyId: string,
        proposalId: string,
    ): Promise<ProposalPdfAccessResult> {
        // ── 1. companyId from auth, never from payload ───────────────────
        // The controller's CompanyMemberGuard guarantees these match,
        // but we re-assert here so an accidental controller change can
        // never leak cross-tenant. If they differ we collapse to the
        // same 404 a row-level miss would produce — no oracle.
        if (pathCompanyId !== actorMembership.companyId) {
            throw new NotFoundException('Proposal not found.');
        }

        // ── 2. Row-level visibility (same as proposal reads) ─────────────
        // assertCanReadProposal:
        //   - tenant scope (companyId)
        //   - CLIENTE: must own the linked ServiceRequest
        //   - CLIENTE: DRAFT is filtered out
        //   - throws NotFoundException on miss (identical to GET /:id)
        await this.proposalsService.assertCanReadProposal(
            actorMembership,
            proposalId,
        );

        // ── 3. Load the projection needed to rebuild the storage key ─────
        // findFirst with a (companyId, id) filter — explicit Prisma
        // select, no spread of the standard projections. We just got
        // through the visibility check, so a miss here is an integrity
        // anomaly (concurrent delete) and surfaces as 404.
        const row = await this.prisma.proposal.findFirst({
            where: {
                id: proposalId,
                companyId: actorMembership.companyId,
            },
            select: PROPOSAL_PDF_ACCESS_SELECT,
        });
        if (!row) {
            throw new NotFoundException('Proposal not found.');
        }

        // ── 4. PDF eligibility: terminal status + populated columns ──────
        // The PDF pipeline only emits artefacts for APPROVED proposals.
        // A request for a non-APPROVED proposal returns 409 (visible but
        // no PDF), NOT 404 — we already confirmed the caller can read
        // the row, so hiding existence at this point would be misleading.
        if (
            row.status !== ProposalStatus.APPROVED ||
            !row.approvedAt ||
            !row.pdfUrl ||
            !row.pdfGeneratedAt
        ) {
            throw new ConflictException(
                'Proposal PDF is not available yet. The PDF is generated automatically after approval; please retry shortly.',
            );
        }

        // ── 5. Rebuild the canonical object key SERVER-SIDE ──────────────
        // We deliberately do NOT parse row.pdfUrl. The key is a pure
        // function of (companyId, proposalId, approvedAtEpochMs), all
        // of which are server-controlled fields. This makes the read
        // path immune to:
        //   - a future bug that wrote a wrong pdfUrl
        //   - any operator-supplied PROPOSAL_PDF_S3_PUBLIC_BASE_URL
        //   - URL-encoding / rewriting at the ingress
        const objectKey = buildProposalPdfObjectKey({
            companyId: row.companyId,
            proposalId: row.id,
            approvedAtEpochMs: row.approvedAt.getTime(),
        });

        // ── 6. Hand off to the storage driver ────────────────────────────
        const result = await this.storage.readObject(objectKey);
        if (!result.ok) {
            if (result.error.kind === 'not-found') {
                // The DB says we generated a PDF, but the bytes are gone
                // (manual deletion, lifecycle policy, restored DB ahead
                // of restored bucket, ...). Treat as 409 rather than
                // 404 so the caller knows the proposal is fine — the
                // artefact just needs to be regenerated. Logged as a
                // warning so ops can spot orphaned metadata.
                this.logger.warn(
                    `PDF metadata present but object missing for ` +
                    `companyId=${row.companyId} proposalId=${row.id} ` +
                    `key=${objectKey}; surfacing 409 to caller.`,
                );
                throw new ConflictException(
                    'Proposal PDF metadata is present but the file is unavailable in storage. Please retry shortly.',
                );
            }
            // Transient or driver-internal error.
            this.logger.error(
                `Storage error reading PDF for ` +
                `companyId=${row.companyId} proposalId=${row.id}: ` +
                `${result.error.cause.message}`,
            );
            throw new ServiceUnavailableException(
                'Proposal PDF storage is temporarily unavailable.',
            );
        }

        const filename = this.buildFilename(row);

        return {
            proposalId: row.id,
            pdfGeneratedAt: row.pdfGeneratedAt,
            bytes:
                result.access.kind === 'stream' ? result.access.bytes : null,
            filename,
            access: result.access,
        };
    }

    /**
     * Build a stable, sanitised filename for Content-Disposition. Avoids
     * leaking proposal numbers in a way that would surprise the caller —
     * we use the proposal id since it's already in the URL.
     *
     * Kept private and free of i18n: the human label is rendered inside
     * the PDF itself; the filename is just an identifier.
     */
    private buildFilename(row: AccessRow): string {
        // proposalId is a cuid (alphanumeric); safe for a filename.
        return `proposal-${row.id}.pdf`;
    }
}
