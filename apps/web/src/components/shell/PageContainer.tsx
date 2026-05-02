import { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

// ─────────────────────────────────────────────────────────────────────────────
// PageContainer — consistent inner layout for every authenticated page.
//
// Provides:
//   - max-width gutter (so 27" displays don't get 1500px-wide tables)
//   - vertical rhythm
//   - optional page-level header bar (title + actions)
// ─────────────────────────────────────────────────────────────────────────────

export function PageContainer({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('mx-auto w-full max-w-7xl px-6 py-6', className)}>
            {children}
        </div>
    );
}

export function PageHeader({
    title,
    description,
    actions,
    breadcrumb,
}: {
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    breadcrumb?: ReactNode;
}) {
    return (
        <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
                {breadcrumb ? (
                    <div className="mb-1 text-xs text-ink-subtle">{breadcrumb}</div>
                ) : null}
                <h1 className="truncate text-xl font-semibold text-ink">{title}</h1>
                {description ? (
                    <p className="mt-1 text-sm text-ink-subtle">{description}</p>
                ) : null}
            </div>
            {actions ? (
                <div className="flex shrink-0 items-center gap-2">{actions}</div>
            ) : null}
        </div>
    );
}
