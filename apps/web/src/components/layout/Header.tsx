'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ─────────────────────────────────────────────────────────────────────────────
// Header — sticky top chrome.
//
// Hierarchy (P2): same surface as <main> (bg-background) with a 1 px bottom
// border. The header fades into the page until the operator reaches for it.
// Density (P3): 56 px tall — meio-termo between Linear's compact 48 px and
// Notion's roomy 64 px.
//
// Two zones, both placeholders for now:
//   - Left:  workspace switcher. Caption "WORKSPACE" (11 px uppercase
//            tracking-wide, muted) above the company name. Fase 6 wires this
//            to `GET /memberships/me` and a real DropdownMenu.
//   - Right: user menu. Avatar + name as the trigger; DropdownMenu opens to
//            "Sair", currently disabled. Fase 5 wires logout for real.
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER_WORKSPACE = 'Orkestree Studio';
const PLACEHOLDER_USER = {
    initials: 'EK',
    name: 'Enzo Koeche',
};

export function Header() {
    const t = useTranslations('header');

    return (
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-6">
            {/* Workspace switcher placeholder — Fase 6 will swap this for a
                real DropdownMenu reading from /memberships/me. */}
            <div className="flex flex-col leading-tight">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t('workspaceLabel')}
                </span>
                <button
                    type="button"
                    className="-ml-1 mt-0.5 inline-flex h-7 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-label="Trocar workspace (em breve)"
                >
                    {PLACEHOLDER_WORKSPACE}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </button>
            </div>

            {/* User menu — DropdownMenu shell wired now, items disabled until
                Fase 5 brings real auth. */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="inline-flex h-9 items-center gap-2 rounded-md px-2 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                        <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-secondary text-xs font-medium text-foreground">
                                {PLACEHOLDER_USER.initials}
                            </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium text-foreground">
                            {PLACEHOLDER_USER.name}
                        </span>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem disabled>
                        {t('userMenu.signOut')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </header>
    );
}
