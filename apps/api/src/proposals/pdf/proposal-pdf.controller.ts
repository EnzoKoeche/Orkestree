import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { CompanyMembership, CompanyResource, PermissionAction } from '@prisma/client';
import { CurrentMembership } from '../../auth/decorators/current-membership.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CompanyMemberGuard } from '../../auth/guards/company-member.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ResourcePermissionGuard } from '../../auth/guards/resource-permission.guard';
import { ProposalPdfService } from './proposal-pdf.service';

// Minimal shape of the Express response we use — avoids a direct dependency on
// @types/express (NestJS owns the platform adapter; we only need set + end).
interface PdfResponse {
    set(headers: Record<string, string>): void;
    end(data: Buffer): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// proposal-pdf.controller.ts
//
// GET /companies/:companyId/proposals/:proposalId/pdf
//
// Streams the client-facing proposal PDF (application/pdf, attachment). Same
// guard stack and PROPOSAL.VIEW permission as the rest of the proposals
// surface; row-level visibility (CLIENTE filter) and the DRAFT gate live in
// ProposalPdfService. CLIENTE may download their own proposal's PDF — that's
// the point.
//
// Uses raw @Res() (not passthrough) so the binary response bypasses the global
// JSON-shaping interceptors entirely; nothing should try to serialize a PDF.
// ─────────────────────────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard, CompanyMemberGuard, ResourcePermissionGuard)
@Controller('companies/:companyId/proposals')
export class ProposalPdfController {
    constructor(private readonly pdfService: ProposalPdfService) {}

    @RequirePermission(CompanyResource.PROPOSAL, PermissionAction.VIEW)
    @Get(':proposalId/pdf')
    async getPdf(
        @CurrentMembership()
        membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        @Param('proposalId') proposalId: string,
        @Res() res: PdfResponse,
    ): Promise<void> {
        const { buffer, filename } = await this.pdfService.generate(membership, proposalId);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': buffer.length.toString(),
            'Cache-Control': 'private, no-store',
        });
        res.end(buffer);
    }
}
