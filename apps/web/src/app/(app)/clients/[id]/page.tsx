import { ChevronLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LoadingState } from '@/components/ui/States';
import { PageContainer } from '@/components/layout/PageContainer';
import { clientsApi, requestsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { getServerSession } from '@/lib/server-session';
import type {
    ClientDetail,
    ClientFieldValue,
    Paginated,
    ServiceRequestListItem,
} from '@/types/domain';
import { ClientDetailHeader } from './_components/ClientDetailHeader';
import { ClientTabs } from './_components/ClientTabs';
import { DetailsTab } from './_components/tabs/DetailsTab';
import { RequestsTab } from './_components/tabs/RequestsTab';

// ─────────────────────────────────────────────────────────────────────────────
// Cliente detail page — Server Component.
//
// Single fetch fan-out: client detail + custom field values + the client's
// requests (via Xa's clientId filter). All three feed two server-rendered
// tabs (Detalhes / Pedidos). Tab nav is the only client island; URL is the
// source of truth (?tab=).
//
// 404 handling mirrors /requests/[id]: ApiError 404 → notFound(); other
// errors render an explicit error block so the operator can retry.
//
// Field values + requests are best-effort: a degraded subsystem on either
// shouldn't block the page from rendering the rest. Their tabs handle
// empty arrays gracefully.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_TABS = ['details', 'requests'] as const;
type TabKey = (typeof VALID_TABS)[number];

interface SearchParams {
    tab?: string;
}

function parseTab(raw: string | undefined): TabKey {
    return (VALID_TABS as readonly string[]).includes(raw ?? '')
        ? (raw as TabKey)
        : 'details';
}

const REQUESTS_FETCH_LIMIT = 50;

export default async function ClientDetailPage({
    params,
    searchParams,
}: {
    params: { id: string };
    searchParams: SearchParams;
}) {
    const t = await getTranslations('clients.detail');
    const { token, activeCompanyId } = getServerSession();

    if (!token || !activeCompanyId) {
        return (
            <PageContainer>
                <LoadingState label="Carregando empresa…" />
            </PageContainer>
        );
    }

    const tab = parseTab(searchParams.tab);

    let detail: ClientDetail;
    let fieldValues: ClientFieldValue[];
    let requests: Paginated<ServiceRequestListItem>;

    try {
        [detail, fieldValues, requests] = await Promise.all([
            clientsApi.get(activeCompanyId, params.id, { tokenOverride: token }),
            clientsApi
                .getFieldValues(activeCompanyId, params.id, { tokenOverride: token })
                .catch(() => [] as ClientFieldValue[]),
            requestsApi
                .list(
                    activeCompanyId,
                    { clientId: params.id, limit: REQUESTS_FETCH_LIMIT },
                    { tokenOverride: token },
                )
                .catch(
                    () =>
                        ({ items: [], total: 0, limit: REQUESTS_FETCH_LIMIT, skip: 0 }) satisfies Paginated<ServiceRequestListItem>,
                ),
        ]);
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
            notFound();
        }
        return (
            <PageContainer>
                <BackLink label={t('back')} />
                <div className="mt-6 rounded-md border bg-card p-6 text-center">
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
            <BackLink label={t('back')} />

            <div className="mt-4">
                <ClientDetailHeader client={detail} />
            </div>

            <div className="mt-6">
                <ClientTabs
                    activeTab={tab}
                    labels={{
                        details: t('tabs.details'),
                        requests: t('tabs.requests'),
                    }}
                    details={
                        <DetailsTab client={detail} fieldValues={fieldValues} />
                    }
                    requests={<RequestsTab requests={requests.items} />}
                />
            </div>
        </PageContainer>
    );
}

function BackLink({ label }: { label: string }) {
    return (
        <Link
            href="/clients"
            className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {label}
        </Link>
    );
}
