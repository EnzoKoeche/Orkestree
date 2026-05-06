'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// RequestsPagination — URL-driven page nav for the requests list.
//
// Anchors-as-buttons: each link writes the next page index to the URL via
// router.push, so:
//   - Bookmarking page 3 actually returns to page 3.
//   - Browser back/forward step through pagination history naturally.
//   - The Server Component re-fetches with the new skip/limit transparently.
//
// "Mostrando X-Y de Z" microcopy on the left replaces the abstract page
// counter — operators care about how many of the total they're seeing,
// not about an opaque "Page 2/7". Tabular-nums keeps the digits aligned
// when they tick over.
// ─────────────────────────────────────────────────────────────────────────────

interface RequestsPaginationProps {
    page: number;
    pageSize: number;
    total: number;
}

export function RequestsPagination({
    page,
    pageSize,
    total,
}: RequestsPaginationProps) {
    const t = useTranslations('pagination');
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);

    const canPrev = page > 1;
    const canNext = page < totalPages;

    function go(nextPage: number) {
        const next = new URLSearchParams(searchParams.toString());
        if (nextPage === 1) next.delete('page');
        else next.set('page', String(nextPage));
        const qs = next.toString();
        startTransition(() => {
            router.push(qs ? `${pathname}?${qs}` : pathname);
        });
    }

    return (
        <div
            className={cn(
                'flex flex-wrap items-center justify-between gap-3 border-t px-3 py-3 text-sm text-muted-foreground transition-opacity',
                isPending && 'opacity-60',
            )}
        >
            <p className="tabular-nums">
                {t('showing', { from, to, total })}
            </p>

            <Pagination className="m-0 w-auto">
                <PaginationContent>
                    <PaginationItem>
                        <PaginationPrevious
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                if (canPrev) go(page - 1);
                            }}
                            aria-disabled={!canPrev}
                            className={cn(
                                !canPrev && 'pointer-events-none opacity-50',
                            )}
                        />
                    </PaginationItem>
                    <PaginationItem>
                        <PaginationLink
                            href="#"
                            onClick={(e) => e.preventDefault()}
                            isActive
                            className="cursor-default"
                        >
                            {page}
                        </PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                        <PaginationNext
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                if (canNext) go(page + 1);
                            }}
                            aria-disabled={!canNext}
                            className={cn(
                                !canNext && 'pointer-events-none opacity-50',
                            )}
                        />
                    </PaginationItem>
                </PaginationContent>
            </Pagination>
        </div>
    );
}
