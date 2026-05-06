import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Loading / Empty / Error states
//
// Single source of truth for the three shapes every list and detail view in
// the app needs. Centralising them makes it impossible for pages to drift on
// copy or layout when something goes wrong.
//
// Microcopy is in PT-BR with hardcoded strings as placeholders — Fase 4 will
// route these through messages/pt.json once next-intl is wired.
//
// ErrorState accepts a structural shape (`{ message, status? }`) instead of
// importing ApiError from @/lib/http, because lib/http lands in Fase 5. When
// it does, ApiError will satisfy this shape directly without changes here.
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorLike {
    message: string;
    status?: number | null;
}

export function LoadingState({
    label = 'Carregando…',
    className,
}: {
    label?: string;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex items-center justify-center gap-3 px-6 py-16 text-sm text-muted-foreground',
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
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {description ? (
                <p className="max-w-md text-sm text-muted-foreground">{description}</p>
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
    error: ErrorLike;
    onRetry?: () => void;
    className?: string;
}) {
    const status = error.status ?? null;

    let title = 'Algo deu errado.';
    if (status === 401) title = 'Sua sessão expirou. Entre novamente.';
    else if (status === 403) title = 'Você não tem permissão para essa ação.';
    else if (status === 404) title = 'Não encontramos o que você procura.';
    else if (status === 409) title = 'Esse item já foi alterado por outra pessoa.';
    else if (status === 503) title = 'Serviço temporariamente indisponível.';

    const message =
        error.message?.trim() ||
        'Tente de novo em alguns segundos. Se persistir, recarregue a página.';

    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
                className,
            )}
            role="alert"
        >
            <h3 className="text-base font-semibold text-destructive">{title}</h3>
            <p className="max-w-md text-sm text-muted-foreground">{message}</p>
            {onRetry ? (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                    Tentar novamente
                </Button>
            ) : null}
        </div>
    );
}
