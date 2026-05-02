import { ReactNode } from 'react';
import { ApiError } from '@/lib/http';
import { Button } from './Button';
import { cn } from './cn';

// ─────────────────────────────────────────────────────────────────────────────
// Loading / Empty / Error states
//
// Every list and detail view in the app passes through these three shapes.
// Centralising them makes it impossible for pages to drift on copy or layout
// when something goes wrong.
// ─────────────────────────────────────────────────────────────────────────────

export function LoadingState({
    label = 'Loading…',
    className,
}: {
    label?: string;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex items-center justify-center gap-3 px-6 py-16 text-sm text-ink-subtle',
                className,
            )}
            role="status"
            aria-live="polite"
        >
            <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                aria-hidden
            />
            <span>{label}</span>
        </div>
    );
}

export function EmptyState({
    title,
    description,
    action,
    className,
}: {
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-2 px-6 py-16 text-center',
                className,
            )}
        >
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            {description ? (
                <p className="max-w-md text-sm text-ink-subtle">{description}</p>
            ) : null}
            {action ? <div className="mt-3">{action}</div> : null}
        </div>
    );
}

export function ErrorState({
    error,
    onRetry,
    className,
}: {
    error: ApiError | Error;
    onRetry?: () => void;
    className?: string;
}) {
    const status = error instanceof ApiError ? error.status : null;
    const message =
        error instanceof ApiError ? error.toUserMessage() : error.message || 'Unknown error.';

    let title = 'Something went wrong.';
    if (status === 401) title = 'Authentication required.';
    else if (status === 403) title = 'You do not have access to this resource.';
    else if (status === 404) title = 'Not found.';
    else if (status === 409) title = 'Conflict.';
    else if (status === 503) title = 'Service temporarily unavailable.';

    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
                className,
            )}
            role="alert"
        >
            <h3 className="text-base font-semibold text-state-danger">{title}</h3>
            <p className="max-w-md text-sm text-ink-subtle">{message}</p>
            {onRetry ? (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                    Retry
                </Button>
            ) : null}
        </div>
    );
}
