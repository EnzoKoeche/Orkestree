'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { proposalsApi } from '@/lib/api';
import { ApiError, openAuthenticatedDownload } from '@/lib/http';
import { ProposalDetail } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalPdfButton
//
// Surfaces the GET /companies/:companyId/proposals/:id/pdf endpoint.
//
// Backend response contract (apps/api/src/proposals/pdf/proposal-pdf.controller.ts):
//   200 OK   — local driver: PDF bytes streamed
//   302      — s3 driver: redirect to presigned URL (fetch follows it)
//   404      — proposal hidden / not found (visibility error)
//   409      — proposal exists but PDF not yet rendered, OR object missing
//   503      — storage transient error
//
// We disable the button when the proposal is not APPROVED or `pdfGeneratedAt`
// is still null — that's the conservative client-side hint. The actual
// authoritative status is the backend's response, which we surface as a
// toast on failure.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    proposal: Pick<ProposalDetail, 'id' | 'number' | 'status' | 'pdfUrl' | 'pdfGeneratedAt'>;
    companyId: string;
}

export function ProposalPdfButton({ proposal, companyId }: Props) {
    const toast = useToast();
    const [busy, setBusy] = useState(false);

    const ready =
        proposal.status === 'APPROVED' &&
        Boolean(proposal.pdfGeneratedAt) &&
        Boolean(proposal.pdfUrl);

    async function onClick() {
        setBusy(true);
        try {
            await openAuthenticatedDownload(
                proposalsApi.pdfPath(companyId, proposal.id),
                `proposal-${proposal.number}.pdf`,
            );
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.status === 409) {
                    toast.show('PDF is not ready yet. Please retry shortly.', 'info');
                    return;
                }
                if (err.status === 503) {
                    toast.show('PDF storage is temporarily unavailable.', 'danger');
                    return;
                }
                if (err.status === 404) {
                    toast.show('Proposal not found.', 'danger');
                    return;
                }
                toast.show(err.toUserMessage(), 'danger');
                return;
            }
            toast.show('Could not download the PDF.', 'danger');
        } finally {
            setBusy(false);
        }
    }

    if (!ready) {
        return (
            <Button variant="secondary" disabled>
                {proposal.status === 'APPROVED'
                    ? 'PDF rendering…'
                    : 'PDF available after approval'}
            </Button>
        );
    }

    return (
        <Button variant="secondary" onClick={onClick} loading={busy}>
            Download PDF
        </Button>
    );
}
