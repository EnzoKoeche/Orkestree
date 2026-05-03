'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { useSession } from '@/lib/session';
import { Role } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar — internal operator navigation
//
// Role hint comes from the active membership returned by /memberships/me. It
// drives a *conservative* hide-only filter: items the role definitely cannot
// reach are omitted. Items it might or might not reach (depending on
// per-membership overrides resolved by ResourcePermissionGuard) are still
// shown, because the backend remains the source of truth and a 403 with a
// clear error is a better failure mode than hiding navigation a user might
// actually have.
//
// Concretely: CLIENTE has no operational pipeline view today, so service
// requests is hidden for them; the rest of the roles see everything and
// the backend filters per row.
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
    href: string;
    label: string;
    /** Match this path AND any sub-path (e.g. /requests/abc). */
    matchPrefix?: string;
    /** If set, only these roles see the item. Empty/missing = all roles. */
    visibleToRoles?: Role[];
}

const NAV: NavItem[] = [
    {
        href: '/requests',
        label: 'Service Requests',
        matchPrefix: '/requests',
        // CLIENTE has no operational pipeline; everyone else does.
        visibleToRoles: ['OWNER', 'ADMIN', 'FINANCEIRO', 'OPERACIONAL'],
    },
    { href: '/clients', label: 'Clients', matchPrefix: '/clients' },
    { href: '/proposals', label: 'Proposals', matchPrefix: '/proposals' },
];

function isActive(pathname: string, item: NavItem): boolean {
    if (item.matchPrefix) {
        return pathname === item.matchPrefix || pathname.startsWith(item.matchPrefix + '/');
    }
    return pathname === item.href;
}

function isVisible(item: NavItem, role: Role | null): boolean {
    if (!item.visibleToRoles || item.visibleToRoles.length === 0) return true;
    if (role === null) return true; // unknown role → show everything (safe default)
    return item.visibleToRoles.includes(role);
}

export function Sidebar({ footer }: { footer?: ReactNode }) {
    const pathname = usePathname() ?? '/';
    const { snapshot } = useSession();
    const role: Role | null =
        snapshot.phase === 'authenticated' ? snapshot.active.role : null;

    const items = NAV.filter((item) => isVisible(item, role));

    return (
        <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface-base">
            <div className="flex h-14 items-center gap-2 border-b border-border px-5">
                <span className="inline-block h-6 w-6 rounded-md bg-accent" aria-hidden />
                <span className="text-sm font-semibold tracking-tight text-ink">Orkestree</span>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-4">
                <ul className="space-y-0.5">
                    {items.map((item) => {
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
                <div className="border-t border-border p-3 text-xs text-ink-subtle">{footer}</div>
            ) : null}
        </aside>
    );
}
