import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/layout/AuthGate';

// All routes inside the `(app)` route group share the AppShell chrome
// (sidebar + header) and live behind the AuthGate.
//
// AuthGate is defence-in-depth — middleware.ts already redirects
// unauthenticated traffic on the server before any React renders. The
// gate catches the edge cases the middleware can't see (localStorage
// cleared via devtools, cookie expired between request and render) and
// also gives the SessionProvider a hydration boundary so the chrome
// doesn't flash in before the session is restored from localStorage.
export default function AppLayout({ children }: { children: ReactNode }) {
    return (
        <AuthGate>
            <AppShell>{children}</AppShell>
        </AuthGate>
    );
}
