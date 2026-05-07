'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// RequestsToolbar — status filter + clear-filters escape hatch.
//
// Two pieces of interactivity, both URL-driven so the Server Component above
// stays the source of truth for the table:
//
//   - Status select (Ativos / Cancelados): pushes `?status=...` into the URL.
//     Always resets `?page=1` because changing filters with a stale page index
//     is the most reliable way to land on an empty results screen for no
//     reason.
//
//   - "Limpar filtros" link: only shown when the URL has any non-default
//     filter, so the operator can recover from a self-inflicted dead-end with
//     one click. Lives next to the filter, not in the empty state, so it's
//     reachable BEFORE the table empties — the empty-state CTA is a
//     fallback, not the only escape hatch.
//
// "Novo pedido" CTA lives upstream in <NewRequestButton/>, rendered by
// page.tsx in the page header (and in the empty state action slot).
//
// useTransition + isPending dims the toolbar while Next refetches the Server
// Component — visible feedback that the click is doing something.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['active', 'cancelled'] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];

function isStatusOption(v: string): v is StatusOption {
    return (STATUS_OPTIONS as readonly string[]).includes(v);
}

export function RequestsToolbar() {
    const t = useTranslations('requests');
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const status: StatusOption = (() => {
        const raw = searchParams.get('status');
        return raw && isStatusOption(raw) ? raw : 'active';
    })();
    const hasActiveFilters = status !== 'active';

    function pushParams(mutate: (params: URLSearchParams) => void) {
        const next = new URLSearchParams(searchParams.toString());
        mutate(next);
        // Reset page on any filter change — keeps the user on a populated page
        // instead of landing on `page=5` of a list that now has 12 rows.
        next.delete('page');
        const qs = next.toString();
        startTransition(() => {
            router.push(qs ? `${pathname}?${qs}` : pathname);
        });
    }

    return (
        <div
            className={cn(
                'flex flex-wrap items-center justify-between gap-3 transition-opacity',
                isPending && 'opacity-60',
            )}
        >
            <div className="flex flex-wrap items-center gap-2">
                <Select
                    value={status}
                    onValueChange={(v) => {
                        if (!isStatusOption(v)) return;
                        pushParams((p) => {
                            if (v === 'active') p.delete('status');
                            else p.set('status', v);
                        });
                    }}
                >
                    <SelectTrigger
                        className="h-9 w-[180px]"
                        aria-label={t('filters.isCancelled')}
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="active">{t('filters.active')}</SelectItem>
                        <SelectItem value="cancelled">
                            {t('filters.cancelled')}
                        </SelectItem>
                    </SelectContent>
                </Select>

                {hasActiveFilters ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                            startTransition(() => {
                                router.push(pathname);
                            })
                        }
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                        {t('filters.clear')}
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
