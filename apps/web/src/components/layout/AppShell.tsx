import type { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

// AppShell wraps every authenticated route. It is intentionally a server
// component — Sidebar (uses usePathname) and Header (uses DropdownMenu) carry
// their own `'use client'` boundaries, so the shell itself stays free of
// hydration cost beyond what those two components need.
//
// Layout: viewport-tall flex row. Sidebar is fixed-width (240 px); the right
// column flexes and stacks Header (sticky 56 px) on top of a scrolling
// <main>. The <main> owns the only scroll surface so the chrome (sidebar +
// header) always stays put on long pages.
export function AppShell({ children }: { children: ReactNode }) {
    return (
        <div className="flex h-screen w-full overflow-hidden">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
                <Header />
                <main className="flex-1 overflow-y-auto bg-background">{children}</main>
            </div>
        </div>
    );
}
