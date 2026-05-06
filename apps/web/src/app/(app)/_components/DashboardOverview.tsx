import { ArrowRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DateCell } from '@/components/ui/DateCell';
import {
    StatusBadge,
    deriveRequestStatus,
} from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import type {
    Paginated,
    ServiceRequestListItem,
} from '@/types/domain';
import { DashboardGreeting } from './DashboardGreeting';

// ─────────────────────────────────────────────────────────────────────────────
// DashboardOverview — populated dashboard branch.
//
// Three vertically-stacked sections (P2 hierarquia, P6 espaçamento rítmico
// at gap-10 between sections, gap-2 inside the row list):
//
//   - Greeting       (Client island; renders "Olá, {firstName}")
//   - Stat           (focal point — text-4xl tabular-nums semibold; the
//                     number IS the answer to "how am I doing?")
//   - Recent list    (3 row cards, two-line, hover affordance, anchor
//                     elements wired but onClick.preventDefault until
//                     /requests/[id] ships in Sessão 11)
//   - View-all CTA   (ghost link to /requests; only place indigo lives
//                     on this page — the one action surface)
//
// Density (P3): more spacious than /requests. Rows are `py-4` not py-3,
// gap between rows comes from the divider rather than a row-internal gap,
// keeps the rhythm clean. Dashboard breathes.
//
// Color (P5): zero indigo in greeting/stat/rows. Indigo lives ONLY in the
// "Ver todos os pedidos →" link via the link button variant. Rows use
// hover:bg-muted/50 (consistent with the table's row affordance), no
// accent color.
// ─────────────────────────────────────────────────────────────────────────────

interface DashboardOverviewProps {
    data: Paginated<ServiceRequestListItem>;
}

function memberName(m: ServiceRequestListItem['assignedMembership']): string {
    if (!m) return '';
    return `${m.user.firstName} ${m.user.lastName}`.trim() || m.user.firstName;
}

export async function DashboardOverview({ data }: DashboardOverviewProps) {
    const t = await getTranslations('dashboard');
    const { items, total } = data;

    return (
        <div className="flex flex-col gap-10">
            <header className="flex flex-col gap-2">
                <DashboardGreeting />
                <p
                    className="text-4xl font-semibold tabular-nums text-foreground"
                    aria-label={`${total} ${t('statLabel', { count: total })}`}
                >
                    {total}
                    <span className="ml-3 align-middle text-base font-normal text-muted-foreground">
                        {t('statLabel', { count: total })}
                    </span>
                </p>
            </header>

            <section className="flex flex-col gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t('recentTitle')}
                </h2>

                <ul className="overflow-hidden rounded-md border bg-card">
                    {items.map((req, idx) => (
                        <li
                            key={req.id}
                            className={cn(
                                'border-b last:border-b-0',
                                idx === 0 && 'rounded-t-md',
                                idx === items.length - 1 && 'rounded-b-md',
                            )}
                        >
                            <RecentRow req={req} noClientLabel={t('noClient')} stageLabel={t('stage', { name: req.currentStage.name })} />
                        </li>
                    ))}
                </ul>

                <div className="flex justify-end pt-1">
                    <Button asChild variant="link" size="sm" className="px-0">
                        <Link href="/requests">
                            {t('viewAll')}
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </Button>
                </div>
            </section>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// RecentRow — a single dashboard row. Two-line, link-shaped but inert
// (Sessão 11 wires the detail page).
//
// Top line:    #N  ·  Title (truncate)         StatusBadge   DateCell
// Bottom line: Cliente · Etapa: Triagem
//
// Why a <div role="link"> instead of <a onClick={preventDefault}>: this
// component renders inside a Server Component, and onClick handlers can't
// cross the server/client boundary. A div with role="link" + aria-disabled
// keeps screen readers announcing "link, dimmed" without shipping any
// client-side handler. Sessão 11 swaps the div for a next/link <Link href>
// at which point the handler issue dissolves entirely.
//
// Keyboard affordance is preserved via tabIndex + focus-visible styling —
// the row is reachable via Tab today, ready to accept Enter when it stops
// being inert.
// ─────────────────────────────────────────────────────────────────────────────

function RecentRow({
    req,
    noClientLabel,
    stageLabel,
}: {
    req: ServiceRequestListItem;
    noClientLabel: string;
    stageLabel: string;
}) {
    const status = deriveRequestStatus(req);
    const assignee = memberName(req.assignedMembership);

    return (
        <div
            role="link"
            aria-disabled="true"
            tabIndex={0}
            className="flex flex-col gap-1 px-4 py-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none cursor-default"
        >
            <div className="flex items-center gap-3">
                <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                    #{req.number}
                </span>
                <span className="flex-1 truncate text-sm font-medium text-foreground">
                    {req.title}
                </span>
                <StatusBadge status={status} className="shrink-0" />
                <span className="shrink-0">
                    <DateCell iso={req.updatedAt} className="text-xs text-muted-foreground" />
                </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">
                    {req.client ? req.client.name : noClientLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{stageLabel}</span>
                {assignee ? (
                    <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{assignee}</span>
                    </>
                ) : null}
            </div>
        </div>
    );
}
