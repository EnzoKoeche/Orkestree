import { ClipboardList, Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { DateCell } from '@/components/ui/DateCell';
import { EmptyTable } from '@/components/ui/EmptyTable';
import { LoadingState } from '@/components/ui/States';
import {
    StatusBadge,
    deriveRequestStatus,
} from '@/components/ui/StatusBadge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageContainer } from '@/components/layout/PageContainer';
import { requestsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { getServerSession } from '@/lib/server-session';
import type {
    Paginated,
    ServiceRequestListItem,
} from '@/types/domain';
import { RequestsPagination } from './_components/RequestsPagination';
import { RequestsToolbar } from './_components/RequestsToolbar';

// ─────────────────────────────────────────────────────────────────────────────
// Pedidos page — Server Component.
//
// Single source of truth for the list view's wire state lives in the URL
// (?status, ?page, ?pageSize). The page reads them, fetches the matching
// slice from the API with the JWT + active company id from cookies, and
// renders the table. Interactivity (filter changes, page nav) lives in
// _components/* Client Components that just push new params and let this
// component re-fetch.
//
// Why server-rendered the data: matches the "fast first paint, then
// interactive" expectation operators have for an internal tool. No
// client-side data fetcher to ship; no spinner-on-mount; back/forward
// nav re-renders from the URL with no client state to reconcile.
//
// Why cookies(), not props: token + active company come from cookies the
// SessionProvider writes client-side (lib/http.ts). Reading via
// getServerSession() means TASK-AUDIT-3 (HttpOnly migration) is a flag
// flip — the server-side path is already canonical.
// ─────────────────────────────────────────────────────────────────────────────

interface SearchParams {
    status?: string;
    page?: string;
    pageSize?: string;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 10;

interface ParsedParams {
    status: 'active' | 'cancelled';
    isCancelled: boolean;
    page: number;
    pageSize: number;
    skip: number;
    /** True when the current URL has any non-default filter applied. Drives
     *  the empty-state branch (noResults vs noRequests). */
    hasFilters: boolean;
}

function parseSearchParams(sp: SearchParams): ParsedParams {
    const status: 'active' | 'cancelled' =
        sp.status === 'cancelled' ? 'cancelled' : 'active';
    const isCancelled = status === 'cancelled';

    const rawPageSize = parseInt(sp.pageSize ?? '', 10);
    const pageSize = Number.isFinite(rawPageSize)
        ? Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, rawPageSize))
        : DEFAULT_PAGE_SIZE;

    const rawPage = parseInt(sp.page ?? '', 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

    return {
        status,
        isCancelled,
        page,
        pageSize,
        skip: (page - 1) * pageSize,
        hasFilters: status !== 'active',
    };
}

function memberName(m: ServiceRequestListItem['assignedMembership']): string {
    if (!m) return '';
    return `${m.user.firstName} ${m.user.lastName}`.trim() || m.user.firstName;
}

export default async function RequestsPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const t = await getTranslations('requests');
    const { token, activeCompanyId } = getServerSession();

    // SessionProvider writes the active-company cookie on first /memberships/me
    // resolve. If the operator deep-linked here on first ever login, the cookie
    // isn't set yet — render a placeholder; the provider's router.refresh()
    // will re-render with the cookie present.
    if (!token || !activeCompanyId) {
        return (
            <PageContainer>
                <LoadingState label="Carregando empresa…" />
            </PageContainer>
        );
    }

    const params = parseSearchParams(searchParams);

    let data: Paginated<ServiceRequestListItem>;
    try {
        data = await requestsApi.list(
            activeCompanyId,
            {
                isCancelled: params.isCancelled,
                limit: params.pageSize,
                skip: params.skip,
            },
            { tokenOverride: token },
        );
    } catch (err) {
        return (
            <PageContainer>
                <Header />
                <div className="mt-6 rounded-md border bg-card p-6 text-center">
                    <h3 className="text-base font-semibold text-destructive">
                        Não foi possível carregar os pedidos
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {err instanceof ApiError
                            ? err.toUserMessage()
                            : 'Tente novamente em instantes.'}
                    </p>
                </div>
            </PageContainer>
        );
    }

    const isEmpty = data.items.length === 0;
    const showNoResults = isEmpty && params.hasFilters;
    const showNoRequests = isEmpty && !params.hasFilters;

    return (
        <PageContainer>
            <Header />

            <div className="mt-6">
                <RequestsToolbar />
            </div>

            <div className="mt-4 overflow-hidden rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[88px]">{t('columns.number')}</TableHead>
                            <TableHead>{t('columns.title')}</TableHead>
                            <TableHead>{t('columns.client')}</TableHead>
                            <TableHead>{t('columns.stage')}</TableHead>
                            <TableHead>{t('columns.status')}</TableHead>
                            <TableHead>{t('columns.assignee')}</TableHead>
                            <TableHead className="w-[140px]">
                                {t('columns.createdAt')}
                            </TableHead>
                        </TableRow>
                    </TableHeader>

                    {isEmpty ? (
                        <TableBody>
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={7} className="p-0">
                                    {showNoRequests ? (
                                        <EmptyTable
                                            icon={ClipboardList}
                                            title={t('empty.noRequests.title')}
                                            description={t('empty.noRequests.description')}
                                            action={
                                                <TooltipProvider delayDuration={200}>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span tabIndex={0}>
                                                                <Button disabled aria-disabled="true">
                                                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                                                    {t('newRequest')}
                                                                </Button>
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            Disponível em breve
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            }
                                        />
                                    ) : showNoResults ? (
                                        <EmptyTable
                                            title={t('empty.noResults.title')}
                                            description={t('empty.noResults.description')}
                                        />
                                    ) : null}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    ) : (
                        <TableBody>
                            {data.items.map((req) => (
                                // Stretched-link pattern: the row is `relative`, the title cell holds
                                // a `<Link>` whose `::after` pseudo-element fills `inset-0` of the
                                // row so the entire row reacts to clicks. Wrapping <TableRow> in
                                // <Link> would produce invalid <a><tr></tr></a> markup. Single
                                // anchor per row keeps the screen-reader story clean ("Manutenção
                                // mensal — agosto, link"); the row's `focus-within` bg gives the
                                // visible focus signal on Tab while the Link itself owns the focus
                                // ring around the title text.
                                <TableRow
                                    key={req.id}
                                    className="relative focus-within:bg-muted/50"
                                >
                                    <TableCell className="font-medium tabular-nums text-muted-foreground">
                                        #{req.number}
                                    </TableCell>
                                    <TableCell className="font-medium text-foreground">
                                        <Link
                                            href={`/requests/${req.id}`}
                                            className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        >
                                            {req.title}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="text-foreground">
                                        {req.client ? (
                                            req.client.name
                                        ) : (
                                            <span className="text-muted-foreground">
                                                {t('noClient')}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm text-foreground">
                                            {req.currentStage.name}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge status={deriveRequestStatus(req)} />
                                    </TableCell>
                                    <TableCell className="text-sm text-foreground">
                                        {req.assignedMembership ? (
                                            memberName(req.assignedMembership)
                                        ) : (
                                            <span className="text-muted-foreground">
                                                {t('noAssignee')}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <DateCell iso={req.createdAt} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    )}
                </Table>

                {data.total > 0 ? (
                    <Suspense fallback={null}>
                        <RequestsPagination
                            page={params.page}
                            pageSize={params.pageSize}
                            total={data.total}
                        />
                    </Suspense>
                ) : null}
            </div>
        </PageContainer>
    );
}

async function Header() {
    const t = await getTranslations('requests');
    return (
        <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
    );
}
