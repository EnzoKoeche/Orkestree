import { ChevronLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LoadingState } from '@/components/ui/States';
import { PageContainer } from '@/components/layout/PageContainer';
import { proposalsApi, requestsApi, tasksApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { getServerSession } from '@/lib/server-session';
import type {
    AvailableTransition,
    ProposalListItem,
    RequestFieldValue,
    ServiceRequestDetail,
    TaskListItem,
} from '@/types/domain';
import { RequestDetailHeader } from './_components/RequestDetailHeader';
import { RequestTabs } from './_components/RequestTabs';
import { DetailsTab } from './_components/tabs/DetailsTab';
import { HistoryTab } from './_components/tabs/HistoryTab';
import { ProposalsTab } from './_components/tabs/ProposalsTab';
import { TasksTab } from './_components/tabs/TasksTab';
import { WorkflowTab } from './_components/tabs/WorkflowTab';

// ─────────────────────────────────────────────────────────────────────────────
// Pedido detail page — Server Component.
//
// Single fetch fan-out (request + fieldValues + tasks in parallel) feeds four
// tabs that are all server-rendered. Tab nav is the only client island —
// `RequestTabs` reads ?tab from the URL and pushes new values via router.
//
// Why all-tabs-server-rendered up front: switching tabs is the single most
// common interaction on this page, and the data per tab is tiny. Trading a
// slightly bigger first payload for instant tab switches is the right call
// for an operator console where context-switching cost dwarfs render cost.
//
// 404 handling: if the request fetch comes back 404 (request truly absent OR
// CLIENTE row-level isolation hides it), we use Next's notFound() so the
// stock 404 surface kicks in. All other errors render an explicit error
// state so the operator can retry without losing context.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_TABS = ['details', 'workflow', 'tasks', 'proposals', 'history'] as const;
type TabKey = (typeof VALID_TABS)[number];

interface SearchParams {
    tab?: string;
}

function parseTab(raw: string | undefined): TabKey {
    return (VALID_TABS as readonly string[]).includes(raw ?? '')
        ? (raw as TabKey)
        : 'details';
}

export default async function RequestDetailPage({
    params,
    searchParams,
}: {
    params: { id: string };
    searchParams: SearchParams;
}) {
    const t = await getTranslations('requests.detail');
    const { token, activeCompanyId } = getServerSession();

    if (!token || !activeCompanyId) {
        return (
            <PageContainer>
                <LoadingState label="Carregando empresa…" />
            </PageContainer>
        );
    }

    const tab = parseTab(searchParams.tab);

    // Fetch fan-out. Tasks are best-effort: a tasks-endpoint failure should
    // not block the rest of the page (operator may still need to read details
    // or move stages while the tasks subsystem is degraded). Catch and treat
    // as empty list, the tab itself shows the empty state.
    let detail: ServiceRequestDetail;
    let fieldValues: RequestFieldValue[];
    let tasks: TaskListItem[];
    let proposals: ProposalListItem[];
    let availableTransitions: AvailableTransition[];

    try {
        [detail, fieldValues, tasks, proposals, availableTransitions] = await Promise.all([
            requestsApi.get(activeCompanyId, params.id, { tokenOverride: token }),
            requestsApi.getFieldValues(activeCompanyId, params.id, { tokenOverride: token }),
            tasksApi
                .list(
                    activeCompanyId,
                    { requestId: params.id, limit: 100 },
                    { tokenOverride: token },
                )
                .catch(() => [] as TaskListItem[]),
            // Best-effort: same degradation tolerance as tasks. A proposals
            // endpoint failure shows the tab's empty state rather than blocking
            // the whole page.
            proposalsApi
                .list(
                    activeCompanyId,
                    { serviceRequestId: params.id, limit: 50 },
                    { tokenOverride: token },
                )
                .catch(() => [] as ProposalListItem[]),
            // Best-effort: viewers without REQUEST.EDIT (FINANCEIRO, CLIENTE)
            // get a 403 here. The TransitionMenu's role gate hides itself for
            // those roles anyway, so an empty array is the right fallback —
            // never surfaces as an error to the user.
            requestsApi
                .getAvailableTransitions(activeCompanyId, params.id, {
                    tokenOverride: token,
                })
                .catch(() => [] as AvailableTransition[]),
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
                <RequestDetailHeader
                    request={detail}
                    availableTransitions={availableTransitions}
                />
            </div>

            <div className="mt-6">
                <RequestTabs
                    activeTab={tab}
                    labels={{
                        details: t('tabs.details'),
                        workflow: t('tabs.workflow'),
                        tasks: t('tabs.tasks'),
                        proposals: t('tabs.proposals'),
                        history: t('tabs.history'),
                    }}
                    details={<DetailsTab request={detail} fieldValues={fieldValues} />}
                    workflow={<WorkflowTab request={detail} />}
                    tasks={<TasksTab tasks={tasks} request={detail} />}
                    proposals={<ProposalsTab proposals={proposals} request={detail} />}
                    history={<HistoryTab request={detail} />}
                />
            </div>
        </PageContainer>
    );
}

function BackLink({ label }: { label: string }) {
    return (
        <Link
            href="/requests"
            className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {label}
        </Link>
    );
}
