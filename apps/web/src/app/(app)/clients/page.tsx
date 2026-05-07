import { Building2, User, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { DateCell } from '@/components/ui/DateCell';
import { EmptyTable } from '@/components/ui/EmptyTable';
import { LoadingState } from '@/components/ui/States';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { PageContainer } from '@/components/layout/PageContainer';
import { clientsApi } from '@/lib/api';
import { formatTaxId } from '@/lib/format';
import { ApiError } from '@/lib/http';
import { getServerSession } from '@/lib/server-session';
import { cn } from '@/lib/utils';
import type { ClientListItem, ClientType } from '@/types/domain';
import { ClientsToolbar } from './_components/ClientsToolbar';
import { NewClientButton } from './_components/NewClientButton';

// ─────────────────────────────────────────────────────────────────────────────
// Clientes page — Server Component.
//
// Source-of-truth for filter state lives in the URL (?type, ?status,
// ?search). The page parses them, fetches the matching slice, and renders
// the table. Toolbar (client island) just pushes new params and lets this
// component re-fetch.
//
// V1 sem paginação real: fetch primeiros 100 e mostra todos. Backend max é
// 100; clientes raramente passam disso pra empresa pequeno-médio. Adicionar
// paginação derived só quando dataset real exigir.
//
// Status filter default = 'active' (mesma escolha de /requests com
// isCancelled=false): operador trabalha com ativos por padrão; inativos
// são histórico opt-in.
// ─────────────────────────────────────────────────────────────────────────────

const FETCH_LIMIT = 100;

type StatusOption = 'active' | 'inactive' | 'all';
const STATUS_OPTIONS: readonly StatusOption[] = ['active', 'inactive', 'all'];

interface SearchParams {
    type?: string;
    status?: string;
    search?: string;
}

interface ParsedParams {
    type?: ClientType;
    isActive?: boolean;
    status: StatusOption;
    search?: string;
    /** True when the URL has any non-default filter applied. Drives the
     *  empty-state branch (noResults vs noClients). */
    hasFilters: boolean;
}

function parseSearchParams(sp: SearchParams): ParsedParams {
    const type: ClientType | undefined =
        sp.type === 'INDIVIDUAL' ? 'INDIVIDUAL' : sp.type === 'BUSINESS' ? 'BUSINESS' : undefined;

    const rawStatus = (STATUS_OPTIONS as readonly string[]).includes(sp.status ?? '')
        ? (sp.status as StatusOption)
        : 'active';

    const isActive: boolean | undefined =
        rawStatus === 'active' ? true : rawStatus === 'inactive' ? false : undefined;

    const search = sp.search?.trim() || undefined;

    const hasFilters = type !== undefined || rawStatus !== 'active' || search !== undefined;

    return { type, isActive, status: rawStatus, search, hasFilters };
}

export default async function ClientsPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const t = await getTranslations('clients');
    const { token, activeCompanyId } = getServerSession();

    if (!token || !activeCompanyId) {
        return (
            <PageContainer>
                <LoadingState label="Carregando empresa…" />
            </PageContainer>
        );
    }

    const params = parseSearchParams(searchParams);

    let clients: ClientListItem[];
    try {
        clients = await clientsApi.list(
            activeCompanyId,
            {
                type: params.type,
                isActive: params.isActive,
                search: params.search,
                limit: FETCH_LIMIT,
            },
            { tokenOverride: token },
        );
    } catch (err) {
        return (
            <PageContainer>
                <Header />
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

    const isEmpty = clients.length === 0;
    const showNoResults = isEmpty && params.hasFilters;
    const showNoClients = isEmpty && !params.hasFilters;

    return (
        <PageContainer>
            <Header />

            <div className="mt-6">
                <ClientsToolbar />
            </div>

            <div className="mt-4 overflow-hidden rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[88px]">{t('columns.number')}</TableHead>
                            <TableHead>{t('columns.name')}</TableHead>
                            <TableHead className="w-[120px]">{t('columns.type')}</TableHead>
                            <TableHead className="w-[160px]">{t('columns.taxId')}</TableHead>
                            <TableHead>{t('columns.contact')}</TableHead>
                            <TableHead className="w-[110px]">{t('columns.status')}</TableHead>
                            <TableHead className="w-[140px]">
                                {t('columns.createdAt')}
                            </TableHead>
                        </TableRow>
                    </TableHeader>

                    {isEmpty ? (
                        <TableBody>
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={7} className="p-0">
                                    {showNoClients ? (
                                        <EmptyTable
                                            icon={Users}
                                            title={t('empty.noClients.title')}
                                            description={t('empty.noClients.description')}
                                            action={<NewClientButton />}
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
                            {clients.map((c) => (
                                // Stretched-link pattern: row is `relative`, the name cell holds
                                // a Link whose ::after pseudo fills inset-0 of the row. Same
                                // approach as /requests rows. Single anchor per row, valid HTML,
                                // Server Component-safe (sem onClick).
                                <TableRow
                                    key={c.id}
                                    className="relative focus-within:bg-muted/50"
                                >
                                    <TableCell className="font-medium tabular-nums text-muted-foreground">
                                        C-{c.number}
                                    </TableCell>
                                    <TableCell className="font-medium text-foreground">
                                        <Link
                                            href={`/clients/${c.id}`}
                                            className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        >
                                            {c.name}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <ClientTypeCell type={c.type} t={t} />
                                    </TableCell>
                                    <TableCell className="text-sm tabular-nums text-foreground">
                                        {c.taxId ? (
                                            formatTaxId(c.taxId)
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm text-foreground">
                                        {c.email || c.phone ? (
                                            <span className="block truncate">
                                                {c.email ?? c.phone}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground">
                                                {t('noContact')}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <ClientStatusBadge isActive={c.isActive} t={t} />
                                    </TableCell>
                                    <TableCell>
                                        <DateCell iso={c.createdAt} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    )}
                </Table>
            </div>
        </PageContainer>
    );
}

async function Header() {
    const t = await getTranslations('clients');
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
                <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
            </div>
            <NewClientButton />
        </div>
    );
}

// ── Type cell (icon + short label) ──────────────────────────────────────────

function ClientTypeCell({
    type,
    t,
}: {
    type: ClientType;
    t: (key: string) => string;
}) {
    const isPF = type === 'INDIVIDUAL';
    const Icon = isPF ? User : Building2;
    const label = isPF
        ? t('type.individualShort')
        : t('type.businessShort');
    const fullLabel = isPF ? t('type.individual') : t('type.business');

    return (
        <span
            className="inline-flex items-center gap-1.5 text-sm text-foreground"
            title={fullLabel}
        >
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>{label}</span>
        </span>
    );
}

// ── Status badge — neutral pair (active / inactive) ─────────────────────────
//
// Distinct from /requests StatusBadge: deactivation is reversible (operator
// can reactivate), so red is wrong — that's reserved for irreversible
// destructive actions (cancel pedido). Inactive uses muted/grayed treatment
// to read as "out of use" without alarm.

function ClientStatusBadge({
    isActive,
    t,
}: {
    isActive: boolean;
    t: (key: string) => string;
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1',
                isActive
                    ? 'bg-secondary text-secondary-foreground ring-border'
                    : 'bg-muted text-muted-foreground ring-border',
            )}
        >
            {isActive ? t('status.active') : t('status.inactive')}
        </span>
    );
}

