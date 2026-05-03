'use client';

import { useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/States';
import { useSession, workspaceLabel } from '@/lib/session';
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
//   3. Render the four session phases coherently:
//        loading          → splash while /memberships/me probes the token
//        unauthenticated  → redirect to /sign-in
//        no-workspaces    → static panel + sign-out (no domain UI is reachable)
//        authenticated    → the shell + the page
// ─────────────────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: ReactNode }) {
    const router = useRouter();
    const { snapshot, signOut } = useSession();

    useEffect(() => {
        if (snapshot.phase === 'unauthenticated') {
            router.replace('/sign-in');
        }
    }, [snapshot.phase, router]);

    if (snapshot.phase === 'loading') {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <LoadingState label="Restoring session…" />
            </div>
        );
    }

    if (snapshot.phase === 'unauthenticated') {
        // Redirect effect is in flight; render nothing in the meantime to
        // avoid the "logged-in flash" of authenticated content.
        return null;
    }

    if (snapshot.phase === 'no-workspaces') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-surface-canvas px-4 py-10">
                <div className="w-full max-w-md rounded-lg border border-border bg-surface-base p-6 shadow-card">
                    <h1 className="text-base font-semibold text-ink">No workspaces available</h1>
                    <p className="mt-2 text-sm text-ink-subtle">
                        Your account is signed in but is not an active member of any
                        workspace. Ask an administrator to invite you, then sign in
                        again.
                    </p>
                    <div className="mt-5 flex justify-end">
                        <Button variant="secondary" onClick={signOut}>
                            Sign out
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // Authenticated.
    const active = snapshot.active;
    return (
        <div className="flex min-h-screen">
            <Sidebar
                footer={
                    <div className="space-y-1">
                        <div className="font-semibold text-ink">{workspaceLabel(active)}</div>
                        <div className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                            {active.company.id}
                        </div>
                    </div>
                }
            />
            <div className="flex min-w-0 flex-1 flex-col">
                <Header />
                <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
            </div>
        </div>
    );
}
