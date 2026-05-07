'use client';

import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// ClientsToolbar — type filter + status filter + debounced search.
//
// All three controls are URL-driven so the Server Component above stays the
// source of truth. Selects use router.push (back/forward steps through
// filter changes naturally). Search uses router.replace with a 300ms
// debounce — typing every keystroke into history would be useless noise.
//
// useTransition + isPending dims the toolbar while Next refetches.
//
// Search input keeps a local mirror so typing feels instant; the URL is
// the source of truth for the page render. When URL changes from outside
// (browser nav, "Limpar filtros" click), local state re-syncs via effect.
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_VALUES = ['ALL', 'INDIVIDUAL', 'BUSINESS'] as const;
type TypeFilter = (typeof TYPE_VALUES)[number];

const STATUS_VALUES = ['active', 'inactive', 'all'] as const;
type StatusFilter = (typeof STATUS_VALUES)[number];

const SEARCH_DEBOUNCE_MS = 300;

function isTypeFilter(v: string): v is TypeFilter {
    return (TYPE_VALUES as readonly string[]).includes(v);
}
function isStatusFilter(v: string): v is StatusFilter {
    return (STATUS_VALUES as readonly string[]).includes(v);
}

export function ClientsToolbar() {
    const t = useTranslations('clients.filters');
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    // ── Type ─────────────────────────────────────────────────────────────────
    const type: TypeFilter = (() => {
        const raw = searchParams.get('type');
        return raw && isTypeFilter(raw) ? raw : 'ALL';
    })();

    // ── Status ───────────────────────────────────────────────────────────────
    const status: StatusFilter = (() => {
        const raw = searchParams.get('status');
        return raw && isStatusFilter(raw) ? raw : 'active';
    })();

    // ── Search ──────────────────────────────────────────────────────────────
    const urlSearch = searchParams.get('search') ?? '';
    const [query, setQuery] = useState(urlSearch);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync local back to URL when URL changes from outside (browser nav,
    // clear-filters click). Compare current local with URL: if they differ
    // and the local input isn't currently focused-and-typing, mirror URL.
    // A simpler proxy: just track the URL value and reset local if URL
    // diverges in a way the user didn't initiate.
    useEffect(() => {
        if (urlSearch !== query) {
            // URL changed externally (clear filters, back/forward) — accept it.
            // If user is mid-type, the next keystroke wins. Acceptable for V1.
            setQuery(urlSearch);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlSearch]);

    const hasActiveFilters =
        type !== 'ALL' || status !== 'active' || urlSearch.length > 0;

    function pushParams(mutate: (params: URLSearchParams) => void, replace = false) {
        const next = new URLSearchParams(searchParams.toString());
        mutate(next);
        // Reset page on any filter change.
        next.delete('page');
        const qs = next.toString();
        startTransition(() => {
            const url = qs ? `${pathname}?${qs}` : pathname;
            if (replace) router.replace(url);
            else router.push(url);
        });
    }

    function onTypeChange(v: string) {
        if (!isTypeFilter(v)) return;
        pushParams((p) => {
            if (v === 'ALL') p.delete('type');
            else p.set('type', v);
        });
    }

    function onStatusChange(v: string) {
        if (!isStatusFilter(v)) return;
        pushParams((p) => {
            if (v === 'active') p.delete('status');
            else p.set('status', v);
        });
    }

    function onSearchInput(value: string) {
        setQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            pushParams((p) => {
                const trimmed = value.trim();
                if (trimmed) p.set('search', trimmed);
                else p.delete('search');
            }, true); // replace — typing shouldn't bloat history
        }, SEARCH_DEBOUNCE_MS);
    }

    function onClearFilters() {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setQuery('');
        startTransition(() => {
            router.push(pathname);
        });
    }

    return (
        <div
            className={cn(
                'flex flex-wrap items-center gap-2 transition-opacity',
                isPending && 'opacity-60',
            )}
        >
            <Select value={type} onValueChange={onTypeChange}>
                <SelectTrigger className="h-9 w-[200px]" aria-label={t('typeAll')}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">{t('typeAll')}</SelectItem>
                    <SelectItem value="INDIVIDUAL">{t('typeIndividual')}</SelectItem>
                    <SelectItem value="BUSINESS">{t('typeBusiness')}</SelectItem>
                </SelectContent>
            </Select>

            <Select value={status} onValueChange={onStatusChange}>
                <SelectTrigger className="h-9 w-[140px]" aria-label={t('statusActive')}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="active">{t('statusActive')}</SelectItem>
                    <SelectItem value="inactive">{t('statusInactive')}</SelectItem>
                    <SelectItem value="all">{t('statusAll')}</SelectItem>
                </SelectContent>
            </Select>

            <div className="relative min-w-[240px] flex-1 sm:flex-none sm:basis-[280px]">
                <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <Input
                    type="search"
                    value={query}
                    onChange={(e) => onSearchInput(e.target.value)}
                    placeholder={t('searchPlaceholder')}
                    className="h-9 pl-9 text-base"
                    aria-label={t('searchPlaceholder')}
                />
            </div>

            {hasActiveFilters ? (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearFilters}
                    className="text-muted-foreground hover:text-foreground"
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                    {t('clear')}
                </Button>
            ) : null}
        </div>
    );
}
