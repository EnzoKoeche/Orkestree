import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// EmptyTable — empty-state shell sized to sit INSIDE a table layout.
//
// Different contract from EmptyState (in States.tsx):
//   - EmptyState   : full-page or section-level. Big, centred, page-wide.
//   - EmptyTable   : drops into a `<TableCell colSpan={...}>` so the table
//                    chrome (header, borders) stays intact and the operator's
//                    eye doesn't have to retrain on a different layout when a
//                    filter happens to return zero rows.
//
// Use case: list rendered no rows because the filter is too narrow, OR
// (separately) because the company has zero requests yet. Caller decides which
// copy to pass — the component is shape-only.
//
// Visual restraint (P5): muted icon, no indigo, no destructive color. The
// operator hasn't done anything wrong; the absence isn't an event.
// ─────────────────────────────────────────────────────────────────────────────

interface EmptyTableProps {
    icon?: LucideIcon;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}

export function EmptyTable({
    icon: Icon,
    title,
    description,
    action,
    className,
}: EmptyTableProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-2 px-6 py-16 text-center',
                className,
            )}
        >
            {Icon ? (
                <Icon
                    className="mb-2 h-10 w-10 text-muted-foreground/50"
                    strokeWidth={1.5}
                    aria-hidden="true"
                />
            ) : null}
            <h3 className="text-base font-medium text-foreground">{title}</h3>
            {description ? (
                <p className="max-w-md text-sm text-muted-foreground">{description}</p>
            ) : null}
            {action ? <div className="mt-3">{action}</div> : null}
        </div>
    );
}
