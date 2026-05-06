import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// PageContainer keeps every authenticated page on the same horizontal grid:
// 24 px gutters, max 1280 px content width, centred. Components above this
// (AppShell main scroll area) handle vertical chrome; this owns horizontal
// rhythm only.
//
// `max-w-7xl` (1280 px) is the upper limit before list rows grow uncomfortably
// long for the kind of operator screens we're building (mostly tabular data
// + form panels). When a wider canvas is needed (e.g. a Kanban with many
// columns), pages can opt out by not wrapping in PageContainer.
export function PageContainer({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('mx-auto w-full max-w-7xl p-6', className)}>
            {children}
        </div>
    );
}
