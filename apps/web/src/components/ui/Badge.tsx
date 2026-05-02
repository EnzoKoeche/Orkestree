import { ReactNode } from 'react';
import { cn } from './cn';

// ─────────────────────────────────────────────────────────────────────────────
// Badge
//
// Status pill used by lists and detail headers. Tones map to the four
// semantic colors set up in tailwind.config.ts. Keep new tones out — if a
// status doesn't fit one of these, it doesn't belong in a badge.
// ─────────────────────────────────────────────────────────────────────────────

export type BadgeTone =
    | 'neutral'
    | 'info'
    | 'success'
    | 'warning'
    | 'danger';

interface BadgeProps {
    tone?: BadgeTone;
    children: ReactNode;
    className?: string;
    /** Render a small leading dot — useful for status badges. */
    dot?: boolean;
}

const TONE_CLS: Record<BadgeTone, { bg: string; fg: string; dot: string }> = {
    neutral: {
        bg: 'bg-state-neutral-bg',
        fg: 'text-state-neutral',
        dot: 'bg-state-neutral',
    },
    info: { bg: 'bg-state-info-bg', fg: 'text-state-info', dot: 'bg-state-info' },
    success: {
        bg: 'bg-state-success-bg',
        fg: 'text-state-success',
        dot: 'bg-state-success',
    },
    warning: {
        bg: 'bg-state-warning-bg',
        fg: 'text-state-warning',
        dot: 'bg-state-warning',
    },
    danger: {
        bg: 'bg-state-danger-bg',
        fg: 'text-state-danger',
        dot: 'bg-state-danger',
    },
};

export function Badge({ tone = 'neutral', children, className, dot }: BadgeProps) {
    const t = TONE_CLS[tone];
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                t.bg,
                t.fg,
                className,
            )}
        >
            {dot ? (
                <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} aria-hidden />
            ) : null}
            {children}
        </span>
    );
}
