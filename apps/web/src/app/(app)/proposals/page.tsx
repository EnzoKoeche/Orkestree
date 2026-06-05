import { FileText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { DateCell } from '@/components/ui/DateCell';
import { EmptyTable } from '@/components/ui/EmptyTable';
import { ProposalStatusBadge } from '@/components/ui/ProposalStatusBadge';
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
import { proposalsApi } from '@/lib/api';
import { formatBRL } from '@/lib/format';
import { ApiError } from '@/lib/http';
import { getServerSession } from '@/lib/server-session';
import type { ProposalListItem } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// Propostas page — Server Component.
//
// Flat list of every proposal in the active company (role-aware on the
// backend: CLIENTE only sees their own non-DRAFT proposals). No create button
// here — a proposal is always anchored to a service request, so it's created
// from the pedido's "Propostas" tab. The empty state points there.
//
// V1 sem paginação/filtro: GET /proposals returns a bare array (no total
// count yet — TASK-AUDIT-8). Fetch first 100 and render all; add filters +
// pagination when a real dataset needs it.
// ─────────────────────────────────────────────────────────────────────────────

const FETCH_LIMIT = 100;

export default async function ProposalsPage() {
    const t = await getTranslations('proposals.list');
    const { token, activeCompanyId } = getServerSession();

    if (!token || !activeCompanyId) {
        return (
            <PageContainer>
                <LoadingState label="Carregando empresa…" />
            </PageContainer>
        );
    }

    let proposals: ProposalListItem[];
    try {
        proposals = await proposalsApi.list(
            activeCompanyId,
            { limit: FETCH_LIMIT },
            { tokenOverride: token },
        );
    } catch (err) {
        return (
            <PageContainer>
                <Header t={t} />
                <div className="mt-6 rounded-md border bg-card p-6 text-center">
                    <h3 className="text-base font-semibold text-destructive">
                        {t('errorTitle')}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {err instanceof ApiError ? err.toUserMessage() : t('errorFallback')}
                    </p>
                </div>
            </PageContainer>
        );
    }

    const isEmpty = proposals.length === 0;

    return (
        <PageContainer>
            <Header t={t} />

            <div className="mt-6 overflow-hidden rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[80px]">{t('columns.number')}</TableHead>
                            <TableHead>{t('columns.title')}</TableHead>
                            <TableHead className="w-[120px]">{t('columns.status')}</TableHead>
                            <TableHead>{t('columns.client')}</TableHead>
                            <TableHead className="w-[150px] text-right">
                                {t('columns.total')}
                            </TableHead>
                            <TableHead className="w-[130px]">{t('columns.validUntil')}</TableHead>
                            <TableHead className="w-[130px]">{t('columns.updatedAt')}</TableHead>
                        </TableRow>
                    </TableHeader>

                    {isEmpty ? (
                        <TableBody>
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={7} className="p-0">
                                    <EmptyTable
                                        icon={FileText}
                                        title={t('empty.title')}
                                        description={t('empty.description')}
                                    />
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    ) : (
                        <TableBody>
                            {proposals.map((p) => (
                                <TableRow key={p.id} className="relative focus-within:bg-muted/50">
                                    <TableCell className="font-medium tabular-nums text-muted-foreground">
                                        #{p.number}
                                    </TableCell>
                                    <TableCell className="font-medium text-foreground">
                                        <Link
                                            href={`/proposals/${p.id}`}
                                            className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        >
                                            <span className="block max-w-md truncate">{p.title}</span>
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <ProposalStatusBadge status={p.status} />
                                    </TableCell>
                                    <TableCell className="text-sm text-foreground">
                                        {p.client?.name ?? (
                                            <span className="text-muted-foreground">
                                                {t('noClient')}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                                        {formatBRL(p.totalPrice)}
                                    </TableCell>
                                    <TableCell>
                                        {p.validUntil ? (
                                            <DateCell iso={p.validUntil} />
                                        ) : (
                                            <span className="text-sm text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <DateCell iso={p.updatedAt} />
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

async function Header({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
    return (
        <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
    );
}
