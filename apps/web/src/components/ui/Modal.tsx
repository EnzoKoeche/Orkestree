'use client';

import { ReactNode, useEffect } from 'react';
import { Button } from './Button';
import { cn } from './cn';

// ─────────────────────────────────────────────────────────────────────────────
// Modal
//
// One small modal primitive used by the proposal action confirmations. It is
// NOT a generic <Dialog> system: it does not lock body scroll across the
// whole page, does not trap focus to start, and does not support nested
// modals — none of which we need yet. Stays simple until a real use case
// shows up.
// ─────────────────────────────────────────────────────────────────────────────

export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    footer?: ReactNode;
    /** Disable closing via backdrop / Esc — used while a mutation is in flight. */
    busy?: boolean;
    className?: string;
}

export function Modal({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    busy = false,
    className,
}: ModalProps) {
    useEffect(() => {
        if (!open || busy) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, busy, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            onClick={(e) => {
                if (busy) return;
                if (e.target === e.currentTarget) onClose();
            }}
            role="dialog"
            aria-modal="true"
        >
            <div
                className={cn(
                    'w-full max-w-md rounded-lg bg-surface-base shadow-pop',
                    className,
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="border-b border-border px-5 py-4">
                    <h3 className="text-base font-semibold text-ink">{title}</h3>
                    {description ? (
                        <p className="mt-1 text-sm text-ink-subtle">{description}</p>
                    ) : null}
                </div>
                {children !== undefined ? (
                    <div className="px-5 py-4">{children}</div>
                ) : null}
                <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-sunken px-5 py-3">
                    {footer ?? (
                        <Button variant="secondary" onClick={onClose} disabled={busy}>
                            Close
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
