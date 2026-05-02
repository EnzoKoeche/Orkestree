import { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';

// Route group `(app)` houses every authenticated screen. The grouping
// parens keep the path prefix-free (e.g. /requests stays /requests, not
// /app/requests) while still letting us share a layout that gates auth.
export default function AppLayout({ children }: { children: ReactNode }) {
    return <AppShell>{children}</AppShell>;
}
