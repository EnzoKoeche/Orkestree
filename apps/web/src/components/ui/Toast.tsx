'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Toast system — minimal, dependency-free
//
// Used for mutation feedback (proposal sent / approved / rejected / cancelled).
// Lives at the top of the AppShell tree so any client component can fire one.
// ─────────────────────────────────────────────────────────────────────────────

import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { cn } from './cn';

type Tone = 'success' | 'danger' | 'info';

interface Toast {
    id: number;
    tone: Tone;
    message: string;
}

interface ToastContextValue {
    show: (message: string, tone?: Tone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const show = useCallback((message: string, tone: Tone = 'info') => {
        setToasts((prev) => [...prev, { id: Date.now() + Math.random(), tone, message }]);
    }, []);

    return (
        <ToastContext.Provider value={{ show }}>
            {children}
            <ToastViewport toasts={toasts} onExpire={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast() must be used inside <ToastProvider>.');
    }
    return ctx;
}

function ToastViewport({
    toasts,
    onExpire,
}: {
    toasts: Toast[];
    onExpire: (id: number) => void;
}) {
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2">
            {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} onExpire={onExpire} />
            ))}
        </div>
    );
}

function ToastItem({
    toast,
    onExpire,
}: {
    toast: Toast;
    onExpire: (id: number) => void;
}) {
    useEffect(() => {
        const handle = setTimeout(() => onExpire(toast.id), 4500);
        return () => clearTimeout(handle);
    }, [toast.id, onExpire]);

    const tone =
        toast.tone === 'success'
            ? 'border-state-success bg-state-success-bg text-state-success'
            : toast.tone === 'danger'
                ? 'border-state-danger bg-state-danger-bg text-state-danger'
                : 'border-state-info bg-state-info-bg text-state-info';

    return (
        <div
            role="status"
            className={cn(
                'pointer-events-auto rounded-md border px-4 py-2 text-sm shadow-pop',
                tone,
            )}
        >
            {toast.message}
        </div>
    );
}
