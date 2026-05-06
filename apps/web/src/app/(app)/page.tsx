import { getTranslations } from 'next-intl/server';
import { PageContainer } from '@/components/layout/PageContainer';
import { LoadingState } from '@/components/ui/States';
import { requestsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { getServerSession } from '@/lib/server-session';
import type {
    Paginated,
    ServiceRequestListItem,
} from '@/types/domain';
import { DashboardEmpty } from './_components/DashboardEmpty';
import { DashboardOverview } from './_components/DashboardOverview';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard root — Server Component.
//
// Single fetch against /requests with limit=3 gives us both halves of the
// view: `total` powers the headline stat, `items` powers the recent list.
// No status filter — the dashboard shows the operator's whole inventory,
// and the StatusBadge differentiates state per row. Cancellations belong
// in the picture; hiding them would make the dashboard lie.
//
// Branch:
//   - total === 0           → DashboardEmpty (preserves original copy)
//   - total > 0             → DashboardOverview
//   - cookie not yet set    → LoadingState (first-login deep link;
//                               SessionProvider's router.refresh() catches us
//                               on the next tick)
//   - API error             → inline error block, page chrome intact
//
// Workspace switch behaviour comes for free: setActiveCompany in
// lib/session.tsx already calls router.refresh(), so this Server Component
// re-fetches with the new tenant cookie automatically.
// ─────────────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
    const t = await getTranslations('dashboard');
    const { token, activeCompanyId } = getServerSession();

    if (!token || !activeCompanyId) {
        return (
            <PageContainer>
                <LoadingState label={t('loading')} />
            </PageContainer>
        );
    }

    let data: Paginated<ServiceRequestListItem>;
    try {
        data = await requestsApi.list(
            activeCompanyId,
            { limit: 3 },
            { tokenOverride: token },
        );
    } catch (err) {
        return (
            <PageContainer>
                <div className="rounded-md border bg-card p-6 text-center">
                    <h3 className="text-base font-semibold text-destructive">
                        {t('errorTitle')}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {err instanceof ApiError
                            ? err.toUserMessage()
                            : t('errorFallback')}
                    </p>
                </div>
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            {data.total === 0 ? (
                <DashboardEmpty />
            ) : (
                <DashboardOverview data={data} />
            )}
        </PageContainer>
    );
}
