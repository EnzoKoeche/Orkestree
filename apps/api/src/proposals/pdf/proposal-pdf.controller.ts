import {
    Controller,
    Get,
    Head,
    Header,
    Param,
    Query,
    Res,
    UseGuards,
} from '@nestjs/common';
import {
    CompanyMembership,
    CompanyResource,
    PermissionAction,
} from '@prisma/client';
import { Response } from 'express';
import { CurrentMembership } from '../../auth/decorators/current-membership.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CompanyMemberGuard } from '../../auth/guards/company-member.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ResourcePermissionGuard } from '../../auth/guards/resource-permission.guard';
import { ProposalPdfAccessService } from './proposal-pdf-access.service';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalPdfController
//
// Read-only endpoint surface for the rendered proposal PDF. Lives in the
// PDF module (NOT in ProposalsController) so:
//
//   - ProposalsModule stays free of the storage abstraction.
//   - The dependency direction matches the rest of the PDF module:
//       ProposalPdfModule  →  ProposalsModule  (foundation reader)
//                          →  storage driver
//     The reverse import (ProposalsModule → ProposalPdfModule) would
//     introduce a cycle, since the PDF module already imports the
//     foundation to reuse ProposalsService.assertCanReadProposal.
//
// Routing note: NestJS happily mounts controllers from different modules
// under overlapping path prefixes. The route below sits alongside the
// existing /companies/:companyId/proposals/:proposalId/* endpoints
// declared by ProposalsController without conflict.
//
// Guards & permission semantics (mirrors ProposalsController exactly):
//
//   JwtAuthGuard               → caller is authenticated
//   CompanyMemberGuard         → caller has an active membership in
//                                the path's companyId; attaches it
//                                to the request as `companyMembership`
//   ResourcePermissionGuard    → caller has PROPOSAL.VIEW on that
//                                membership's role
//   assertCanReadProposal      → ROW-level filter (CLIENTE ownership,
//                                DRAFT hidden) re-applied inside the
//                                access service — same helper used by
//                                GET /:proposalId, so visibility is
//                                guaranteed to match.
// ─────────────────────────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard, CompanyMemberGuard, ResourcePermissionGuard)
@Controller('companies/:companyId/proposals/:proposalId/pdf')
export class ProposalPdfController {
    constructor(
        private readonly accessService: ProposalPdfAccessService,
    ) { }

    /**
     * GET /companies/:companyId/proposals/:proposalId/pdf
     *
     * Returns the rendered PDF for an APPROVED proposal:
     *
     *   - Local storage driver → streams the bytes through the API
     *     with `Content-Type: application/pdf`. The path-style URL
     *     persisted on Proposal.pdfUrl is NEVER served directly by
     *     the API; this endpoint is the only authorised read path.
     *
     *   - S3 / R2 driver → 302 redirects the caller to a short-lived
     *     presigned URL. The presigned URL grants read access for at
     *     most PROPOSAL_PDF_S3_READ_TTL_SECONDS (default 300s, hard
     *     cap 3600s). This is faster, scales bandwidth out of the
     *     API process, and never lets the API see the bytes again
     *     after the initial render.
     *
     * Query params:
     *   - `download=true` switches Content-Disposition from `inline`
     *     to `attachment` (browser save dialog). The default is
     *     `inline` so the PDF renders in-browser when possible.
     *
     * Response status:
     *   200 OK              — local driver, streamed
     *   302 Found           — S3 driver, redirect to presigned URL
     *   404 Not Found       — proposal hidden / does not exist
     *   409 Conflict        — proposal exists but PDF not yet rendered,
     *                         OR metadata present but storage object
     *                         missing (orphaned)
     *   503 Service Unavailable — storage transient error
     *
     * Cache-Control: `private, no-store` is set on every response. The
     * proposal PDF contains confidential pricing; even though the URL
     * is per-tenant, intermediary proxies must not cache it. For the
     * S3 redirect path the bucket-level CacheControl on the object
     * itself (set at upload) governs CDN caching of the bytes.
     */
    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.VIEW)
    @Header('Cache-Control', 'private, no-store')
    @Get()
    async getPdf(
        @CurrentMembership()
        membership: Pick<
            CompanyMembership,
            'id' | 'companyId' | 'userId' | 'role'
        >,
        @Param('companyId') companyId: string,
        @Param('proposalId') proposalId: string,
        @Query('download') download: string | undefined,
        @Res() res: Response,
    ): Promise<void> {
        const result = await this.accessService.resolveAccess(
            membership,
            companyId,
            proposalId,
        );

        const dispositionType =
            String(download).toLowerCase() === 'true' ? 'attachment' : 'inline';

        if (result.access.kind === 'redirect') {
            // S3 / R2: hand the caller a short-lived presigned URL.
            // We do NOT proxy bytes through the API — the redirect
            // URL embeds the disposition / content-type via the
            // ResponseContent* signed params already wired in the
            // S3 driver. We still set Content-Disposition on the
            // 302 itself for clients that read headers from the
            // intermediate response.
            res.setHeader(
                'Content-Disposition',
                `${dispositionType}; filename="${result.filename}"`,
            );
            res.redirect(302, result.access.url);
            return;
        }

        // Local driver: stream the bytes. The driver returns a fresh
        // Readable per call; we pipe directly into the response so
        // memory usage stays bounded regardless of file size.
        res.status(200);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', String(result.access.bytes));
        res.setHeader('Last-Modified', result.access.lastModified.toUTCString());
        res.setHeader(
            'Content-Disposition',
            `${dispositionType}; filename="${result.filename}"`,
        );

        // Defensive: if the client disconnects mid-transfer, destroy
        // the read stream so the file descriptor is released. Without
        // this, a long-poll / canceled download could leak FDs under
        // load.
        res.on('close', () => {
            if (!result.access || result.access.kind !== 'stream') return;
            if (!result.access.body.destroyed) {
                result.access.body.destroy();
            }
        });

        result.access.body.pipe(res);
    }

    /**
     * HEAD /companies/:companyId/proposals/:proposalId/pdf
     *
     * Lightweight readiness probe. Returns the same status codes as
     * GET but never includes a body and never issues a redirect — even
     * for the S3 driver, where we'd otherwise leak the presigned URL
     * to a client that did not actually want to download.
     *
     * Use case: a frontend polling for "PDF ready yet?" after approval
     * without cycling through 409 responses on every retry.
     *
     * Returns 200 when the PDF exists and the caller may read it; 404
     * when hidden / missing; 409 when not ready; 503 on storage error.
     * Body is always empty.
     */
    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.VIEW)
    @Header('Cache-Control', 'private, no-store')
    @Head()
    async headPdf(
        @CurrentMembership()
        membership: Pick<
            CompanyMembership,
            'id' | 'companyId' | 'userId' | 'role'
        >,
        @Param('companyId') companyId: string,
        @Param('proposalId') proposalId: string,
        @Res() res: Response,
    ): Promise<void> {
        const result = await this.accessService.resolveAccess(
            membership,
            companyId,
            proposalId,
        );

        // Release any opened stream — HEAD must not consume bytes.
        if (result.access.kind === 'stream' && !result.access.body.destroyed) {
            result.access.body.destroy();
        }

        res.status(200);
        res.setHeader('Content-Type', 'application/pdf');
        if (result.access.kind === 'stream') {
            res.setHeader('Content-Length', String(result.access.bytes));
            res.setHeader(
                'Last-Modified',
                result.access.lastModified.toUTCString(),
            );
        }
        res.setHeader('X-Proposal-Pdf-Generated-At', result.pdfGeneratedAt.toISOString());
        res.end();
    }
}
