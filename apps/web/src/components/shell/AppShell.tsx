'use client';

import { useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useSession } from '@/lib/session';
import { LoadingState } from '@/components/ui/States';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

// ─────────────────────────────────────────────────────────────────────────────
// AppShell
//
// Wraps every authenticated route. Responsibilities:
//
//   1. Gate access — redirect to /sign-in when there is no session. This is
//      a UX gate, NOT a security boundary: every API call is independently
//      authenticated server-side. A user who deletes localStorage and reloads
//      lands here, which is the expected behaviour.
//
//   2. Render the persistent shell (sidebar + header) so navigations between
//      list / detail screens don't unmount it.
//
//   3. Show a loading splash while the session hook hydrates from
//      localStorage on first paint, to avoid the "logged-in flash" of
//      authenticated content followed by a redirect.
// ─────────────────────────────────────────────────────────────────────────────

export function AppShell({
    children,
    headerTitle,
    headerSubtitle,
}: {
    children: ReactNode;
    headerTitle?: string;
    headerSubtitle?: string;
}) {
    const router = useRouter();
    const { session, loading } = useSession();

    useEffect(() => {
        if (!loading && !session) {
            router.replace('/sign-in');
        }
    }, [loading, session, router]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <LoadingState label="Restoring session…" />
            </div>
        );
    }

    if (!session) {
        // Effect above is taking us to /sign-in; render nothing in the meantime.
        return null;
    }

    return (
        <div className="flex min-h-screen">
            <Sidebar
                footer={
                    <div className="space-y-1">
                        <div className="font-semibold text-ink">
                            {session.workspaceLabel ?? 'Workspace'}
                        </div>
                        <div className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                            {session.companyId}
                        </div>
                    </div>
                }
            />
            <div className="flex min-w-0 flex-1 flex-col">
                <Header title={headerTitle} subtitle={headerSubtitle} />
                <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
            </div>
        </div>
    );
}
