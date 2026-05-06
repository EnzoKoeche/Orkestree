'use client';

import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// DateCell — operator-friendly relative date with absolute on hover.
//
// Two priorities at once:
//   - skim:  the operator scans 50 rows in 5 seconds. "Hoje", "Ontem", "Há 3 dias"
//            is parseable in 200 ms. "05/05/2026 14:32" is not.
//   - precise: when they need the actual timestamp (audit, dispute, hand-off),
//            hover gives the full local format.
//
// Dates older than 7 days drop the relative form — "há 47 dias" wastes the
// operator's attention budget. They get "5 mai" (current year) or "5 mai 2025"
// (different year), matching how a human would casually refer to it.
//
// Microcopy decision: lowercased month abbreviations ("5 mai", not "5 Mai")
// match Brazilian newspaper convention. Less typographic noise in dense tables.
// ─────────────────────────────────────────────────────────────────────────────

interface DateCellProps {
    /** ISO-8601 string from the API. */
    iso: string;
    className?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatRelative(date: Date): string {
    if (isToday(date)) return 'Hoje';
    if (isYesterday(date)) return 'Ontem';

    const now = Date.now();
    const ageMs = now - date.getTime();
    if (ageMs >= 0 && ageMs <= 7 * DAY_MS) {
        return `há ${formatDistanceToNow(date, { locale: ptBR })}`;
    }

    const sameYear = date.getFullYear() === new Date().getFullYear();
    return format(date, sameYear ? "d 'de' MMM" : "d 'de' MMM yyyy", {
        locale: ptBR,
    });
}

function formatAbsolute(date: Date): string {
    return format(date, "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
}

export function DateCell({ iso, className }: DateCellProps) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return <span className={cn('text-muted-foreground', className)}>—</span>;
    }

    return (
        <TooltipProvider delayDuration={200}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span
                        className={cn(
                            'cursor-default text-sm text-foreground tabular-nums',
                            className,
                        )}
                    >
                        {formatRelative(date)}
                    </span>
                </TooltipTrigger>
                <TooltipContent>{formatAbsolute(date)}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
