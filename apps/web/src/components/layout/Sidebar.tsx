'use client';

import { ClipboardList, FileText, Home, Settings, Users, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar — persistent left rail.
//
// Hierarchy choices (P2 + P5):
//   - bg-card (one shade above --background) marks the rail as "elevated
//     chrome" without adding chromatic noise.
//   - Active nav uses three quiet signals stacked: bg-secondary,
//     text-foreground, font-medium. NO indigo accent strip — primary actions
//     remain the only place indigo surfaces on a navigation chrome.
//   - Inactive items sit at text-muted-foreground / font-normal so the
//     active item visibly "lights up" without the inactive ones competing.
//
// Layout (P3 + P6):
//   - 240 px wide (w-60). Nav items 36 px tall (h-9, px-3, text-sm), 2 px gap
//     between them — Linear-dense without losing breathing room.
//   - Configurações lives at the bottom under a Separator: it's a meta
//     surface, not a daily-operation one, and the rhythm-break tells the
//     operator that.
//
// Microcopy (P9): every label is keyed through next-intl/'nav' so future
// locales drop in without touching this file.
// ─────────────────────────────────────────────────────────────────────────────

type NavLabelKey = 'home' | 'requests' | 'clients' | 'proposals' | 'settings';

interface NavItem {
    href: string;
    icon: LucideIcon;
    labelKey: NavLabelKey;
    /** Active when pathname equals href OR starts with `${prefix}/`. */
    matchPrefix: string;
}

// Home (`/`) uses an exact-match-only rule: matchPrefix is the same as href, so
// `pathname.startsWith('//')` never fires — the item only lights up on the
// dashboard route itself, not on every page (which all start with '/').
const PRIMARY_NAV: readonly NavItem[] = [
    { href: '/', icon: Home, labelKey: 'home', matchPrefix: '/' },
    { href: '/requests', icon: ClipboardList, labelKey: 'requests', matchPrefix: '/requests' },
    { href: '/clients', icon: Users, labelKey: 'clients', matchPrefix: '/clients' },
    { href: '/proposals', icon: FileText, labelKey: 'proposals', matchPrefix: '/proposals' },
];

const SETTINGS_NAV: NavItem = {
    href: '/settings',
    icon: Settings,
    labelKey: 'settings',
    matchPrefix: '/settings',
};

function isActive(pathname: string, item: NavItem): boolean {
    return pathname === item.href || pathname.startsWith(`${item.matchPrefix}/`);
}

function NavLink({ item, active, label }: { item: NavItem; active: boolean; label: string }) {
    const Icon = item.icon;
    return (
        <Link
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
                'flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                active
                    ? 'bg-secondary font-medium text-foreground'
                    : 'font-normal text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )}
        >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
        </Link>
    );
}

export function Sidebar() {
    const pathname = usePathname() ?? '/';
    const t = useTranslations('nav');
    return (
        <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-card">
            <div className="px-3 pb-2 pt-4">
                <Link
                    href="/"
                    aria-label="Voltar para o início"
                    className={cn(
                        '-mx-1 inline-flex cursor-pointer rounded-md px-1 py-0.5 transition-opacity hover:opacity-80',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                    )}
                >
                    <Logo size="sm" />
                </Link>
            </div>
            <nav className="mt-2 flex-1 space-y-0.5 px-3" aria-label="Navegação principal">
                {PRIMARY_NAV.map((item) => (
                    <NavLink
                        key={item.href}
                        item={item}
                        active={isActive(pathname, item)}
                        label={t(item.labelKey)}
                    />
                ))}
            </nav>
            <div className="px-3 pb-3">
                <Separator className="my-2 bg-border" />
                <NavLink
                    item={SETTINGS_NAV}
                    active={isActive(pathname, SETTINGS_NAV)}
                    label={t(SETTINGS_NAV.labelKey)}
                />
            </div>
        </aside>
    );
}
