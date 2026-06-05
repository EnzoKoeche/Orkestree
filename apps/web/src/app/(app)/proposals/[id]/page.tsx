import { ChevronLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { LoadingState } from '@/components/ui/States';
import { proposalsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { getServerSession } from '@/lib/server-session';
import type { ProposalDetail } from '@/types/domain';
import { ProposalDetailHeader } from './_components/ProposalDetailHeader';
import { ProposalHistory } from './_components/ProposalHistory';
import { ProposalItemsTable } from './_components/ProposalItemsTable';
import { ProposalNotes } from './_components/ProposalNotes';

// ─────────────────────────────────────────────────────────────────────────────
// Proposta detail page — Server Component (EPIC A / A1, read-only).
//
// Single fetch: GET /proposals/:id embeds items + statusHistory, so the whole
// page renders from one role-aware payload. Lifecycle actions (send/approve/
// reject/cancel) and DRAFT editing are deliberately out of scope here — they
// land in A4/A3 into the action zones this layout already reserves.
//
// 404 handling mirrors the request detail page: a 404 (proposal absent OR
// CLIENTE row-level isolation hiding it) routes to Next's notFound(); every
// other error renders an explicit, retryable error surface.
// ─────────────────────────────────────────────────────────────────────────────

export default async function ProposalDetailPage({
    params,
}: {
    params: { id: string };
}) {
    const t = await getTranslations('proposals.detail');
    const { token, activeCompanyId } = getServerSession();

    if (!token || !activeCompanyId) {
        return (
            <PageContainer>
                <LoadingState label="Carregando empresa…" />
            </PageContainer>
        );
    }

    let proposal: ProposalDetail;
    try {
        proposal = await proposalsApi.get(activeCompanyId, params.id, {
            tokenOverride: token,
        });
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
            notFound();
        }
        return (
            <PageContainer>
                <BackLink label={t('back')} />
                <div className="mt-6 rounded-md border bg-card p-6 text-center">
                    <h2 className="text-base font-semibold text-destructive">
                        {t('errorTitle')}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {err instanceof ApiError ? err.toUserMessage() : t('errorFallback')}
                    </p>
                </div>
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <BackLink label={t('back')} />

            <div className="mt-4">
                <ProposalDetailHeader proposal={proposal} />
            </div>

            <div className="mt-8 space-y-8">
                <ProposalItemsTable proposal={proposal} />
                <ProposalNotes proposal={proposal} />
                {proposal.statusHistory && proposal.statusHistory.length > 0 ? (
                    <ProposalHistory entries={proposal.statusHistory} />
                ) : null}
            </div>
        </PageContainer>
    );
}

function BackLink({ label }: { label: string }) {
    return (
        <Link
            href="/proposals"
            className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {label}
        </Link>
    );
}
