import { Skeleton } from '@/components/ui/skeleton';
import { TableBody, TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// TableSkeleton — loading state that preserves the table's column rhythm.
//
// Skeletons (P7: animações invisíveis) beat spinners for tables: the operator
// already knows what's coming because the column headers are visible above
// the loading rows, so the skeleton bars match the eventual content shape and
// the page doesn't shift on hydration.
//
// Per-column widths are intentionally varied so the skeleton doesn't read as
// a uniform stripe — `w-full` everywhere would suggest a different layout
// than the real one. Tweak the `widths` prop when a table has a different
// shape than the requests list (the default).
// ─────────────────────────────────────────────────────────────────────────────

interface TableSkeletonProps {
    /** Number of rows to render. Defaults to 8 — matches the perceived weight
     *  of a half-loaded page without faking density. */
    rows?: number;
    /** Width tokens per column (Tailwind classes). Length determines the
     *  number of cells per row. */
    widths?: string[];
    className?: string;
}

const DEFAULT_WIDTHS = ['w-12', 'w-48', 'w-32', 'w-24', 'w-32', 'w-20', 'w-24'];

export function TableSkeleton({
    rows = 8,
    widths = DEFAULT_WIDTHS,
    className,
}: TableSkeletonProps) {
    return (
        <TableBody className={className}>
            {Array.from({ length: rows }).map((_, rowIdx) => (
                <TableRow key={rowIdx}>
                    {widths.map((w, colIdx) => (
                        <TableCell key={colIdx}>
                            <Skeleton className={cn('h-4', w)} />
                        </TableCell>
                    ))}
                </TableRow>
            ))}
        </TableBody>
    );
}
