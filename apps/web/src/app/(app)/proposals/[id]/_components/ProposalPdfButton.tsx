'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import type { ProposalStatus } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalPdfButton — downloads the client-facing proposal PDF (A3 / EPIC E).
//
// Just an anchor to the same-origin proxy: the browser ships the HttpOnly
// session cookie automatically, the proxy translates it to Authorization, and
// the backend streams application/pdf with Content-Disposition: attachment —
// so the browser downloads it. No JS fetch / blob juggling needed.
//
// Hidden while DRAFT (the backend 422s a DRAFT PDF anyway — the proposal is
// still being built). Shown for any PROPOSAL.VIEW role once SENT; the backend
// enforces tenant + row-level visibility.
// ─────────────────────────────────────────────────────────────────────────────

export function ProposalPdfButton({
    proposalId,
    status,
}: {
    proposalId: string;
    status: ProposalStatus;
}) {
    const t = useTranslations('proposals.detail.pdf');
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;

    if (status === 'DRAFT' || !companyId) return null;

    const href = `/api/proxy/companies/${encodeURIComponent(companyId)}/proposals/${encodeURIComponent(proposalId)}/pdf`;

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
            <Download aria-hidden="true" />
            {t('download')}
        </a>
    );
}
