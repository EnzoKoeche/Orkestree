'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { LoadingState } from '@/components/ui/States';
import { useSession } from '@/lib/session';

// AuthGate — defence-in-depth client gate around the (app) group. The
// middleware is the primary line of defence (runs on the server, before
// any React renders), so by the time this mounts an unauthenticated user
// has already been redirected. The gate exists for the edge cases the
// middleware can't catch:
//
//   - localStorage cleared but cookie still alive (manual devtools fiddling)
//   - Cookie expired between request and render
//   - Future server-component data fetch that depends on session shape
//
// While the SessionProvider hydrates from localStorage (~1 tick on first
// paint), we render a centred LoadingState instead of the chrome flashing
// in. That single source of "restoring session…" copy lives in messages
// so the day a second loading surface appears, both share one string.
export function AuthGate({ children }: { children: ReactNode }) {
    const router = useRouter();
    const t = useTranslations('auth');
    const { session, loading } = useSession();

    useEffect(() => {
        if (!loading && !session) {
            router.replace('/login');
        }
    }, [loading, session, router]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <LoadingState label={t('restoring')} />
            </div>
        );
    }

    if (!session) {
        // Effect above is taking us to /login; render nothing in the
        // meantime so we don't flash chrome that's about to disappear.
        return null;
    }

    return <>{children}</>;
}
