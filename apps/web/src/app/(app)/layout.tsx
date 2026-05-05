import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';

// All routes inside the `(app)` route group share the AppShell chrome
// (sidebar + header). Authentication gating lives in middleware.ts (added
// in Phase 5), not here — keeping this layout pure UX scaffolding lets
// route-group siblings like `(auth)/login` use a different layout without
// fighting redirects.
export default function AppLayout({ children }: { children: ReactNode }) {
    return <AppShell>{children}</AppShell>;
}
