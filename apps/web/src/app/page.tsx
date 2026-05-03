'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { LoadingState } from '@/components/ui/States';

// Root route. Redirects to either the sign-in page or the default home for
// the authenticated app. The "default home" is the Service Requests list
// for operator-side roles, and the Proposals list for CLIENTE (who has no
// requests view today). We DO NOT decide auth here — the session provider
// owns that. We only branch on the resolved snapshot.
export default function RootPage() {
    const router = useRouter();
    const { snapshot } = useSession();

    useEffect(() => {
        if (snapshot.phase === 'loading') return;
        if (snapshot.phase === 'authenticated') {
            const role = snapshot.active.role;
            router.replace(role === 'CLIENTE' ? '/proposals' : '/requests');
            return;
        }
        // unauthenticated and no-workspaces both land on /sign-in. The
        // sign-in page renders a banner for no-workspaces.
        router.replace('/sign-in');
    }, [snapshot, router]);

    return (
        <div className="flex min-h-screen items-center justify-center">
            <LoadingState label="Loading Orkestree…" />
        </div>
    );
}
