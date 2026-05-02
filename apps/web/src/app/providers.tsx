'use client';

import { ReactNode } from 'react';
import { SessionProvider } from '@/lib/session';
import { ToastProvider } from '@/components/ui/Toast';

// Single client wrapper used by the root layout. Keeps app/layout.tsx as a
// pure server component while still allowing the session + toast contexts to
// run in the browser.
export function Providers({ children }: { children: ReactNode }) {
    return (
        <SessionProvider>
            <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
    );
}
