'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar — internal operator navigation
//
// Static link list for now. We don't gate items by role on the client because
// the backend will return 403 anyway, and showing-then-blocking links is
// worse UX than just letting an operator confirm what they can't do server-
// side. When we get a /memberships/me endpoint we can hide entries that the
// caller's permission set definitively denies.
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
    href: string;
    label: string;
    /** Match this path AND any sub-path (e.g. /requests/abc). */
    matchPrefix?: string;
}

const NAV: NavItem[] = [
    { href: '/requests', label: 'Service Requests', matchPrefix: '/requests' },
    { href: '/clients', label: 'Clients', matchPrefix: '/clients' },
    { href: '/proposals', label: 'Proposals', matchPrefix: '/proposals' },
];

function isActive(pathname: string, item: NavItem): boolean {
    if (item.matchPrefix) {
        return pathname === item.matchPrefix || pathname.startsWith(item.matchPrefix + '/');
    }
    return pathname === item.href;
}

export function Sidebar({ footer }: { footer?: ReactNode }) {
    const pathname = usePathname() ?? '/';
    return (
        <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface-base">
            <div className="flex h-14 items-center gap-2 border-b border-border px-5">
                <span className="inline-block h-6 w-6 rounded-md bg-accent" aria-hidden />
                <span className="text-sm font-semibold tracking-tight text-ink">
                    Orkestree
                </span>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-4">
                <ul className="space-y-0.5">
                    {NAV.map((item) => {
                        const active = isActive(pathname, item);
                        return (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    className={cn(
                                        'block rounded-md px-3 py-2 text-sm transition focus-ring',
                                        active
                                            ? 'bg-surface-sunken font-semibold text-ink'
                                            : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                                    )}
                                >
                                    {item.label}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>
            {footer ? (
                <div className="border-t border-border p-3 text-xs text-ink-subtle">
                    {footer}
                </div>
            ) : null}
        </aside>
    );
}
