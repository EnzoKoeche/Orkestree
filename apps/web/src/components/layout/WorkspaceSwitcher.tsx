'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import type { Membership } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// WorkspaceSwitcher — left side of the header.
//
// Three states, each with a distinct render:
//   - membershipsLoading           → caption + skeleton (no flicker of "—")
//   - 0 memberships (defensive)    → caption + "—" muted, no dropdown
//   - 1  membership                → caption + static name, NO chevron and
//                                    NO DropdownMenu (no affordance to
//                                    open something that has nothing in it)
//   - 2+ memberships               → caption + button + chevron + dropdown
//                                    listing every workspace, active one
//                                    surfaced via Check on the right.
//
// The dropdown items use bg-accent on hover + text-foreground for the
// active row's checkmark — NO indigo. Indigo is reserved for primary
// actions; a workspace marker is an indicator, not an acionamento.
// ─────────────────────────────────────────────────────────────────────────────

function displayName(m: Membership): string {
    return m.company.tradeName ?? m.company.legalName;
}

function Caption({ label }: { label: string }) {
    return (
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
        </span>
    );
}

export function WorkspaceSwitcher() {
    const t = useTranslations('workspace');
    const { memberships, activeMembership, setActiveCompany, membershipsLoading } = useSession();

    if (membershipsLoading) {
        return (
            <div className="flex flex-col leading-tight">
                <Caption label={t('label')} />
                <div
                    className="mt-0.5 h-7 w-32 animate-pulse rounded-md bg-secondary/60"
                    aria-hidden="true"
                />
            </div>
        );
    }

    if (memberships.length === 0 || !activeMembership) {
        // Defensive: a logged-in user with zero ACTIVE memberships shouldn't
        // exist (the API filters by status), but if it does we render a
        // muted dash instead of crashing the header.
        return (
            <div className="flex flex-col leading-tight">
                <Caption label={t('label')} />
                <span className="mt-0.5 inline-flex h-7 items-center text-sm text-muted-foreground">
                    —
                </span>
            </div>
        );
    }

    if (memberships.length === 1) {
        return (
            <div className="flex flex-col leading-tight">
                <Caption label={t('label')} />
                <span className="mt-0.5 inline-flex h-7 items-center text-sm font-medium text-foreground">
                    {displayName(activeMembership)}
                </span>
            </div>
        );
    }

    return (
        <div className="flex flex-col leading-tight">
            <Caption label={t('label')} />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="-ml-1 mt-0.5 inline-flex h-7 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                        {displayName(activeMembership)}
                        <ChevronDown
                            className="h-3.5 w-3.5 text-muted-foreground"
                            aria-hidden="true"
                        />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[220px] p-1">
                    {memberships.map((m) => {
                        const isActive = m.id === activeMembership.id;
                        return (
                            <DropdownMenuItem
                                key={m.id}
                                onSelect={() => setActiveCompany(m.company.id)}
                                className={cn(
                                    'flex h-9 cursor-pointer items-center justify-between gap-3 rounded-md px-3 text-sm',
                                    isActive
                                        ? 'font-medium text-foreground'
                                        : 'font-normal text-muted-foreground',
                                )}
                            >
                                <span className="truncate">{displayName(m)}</span>
                                {isActive ? (
                                    <Check
                                        className="h-4 w-4 shrink-0 text-foreground"
                                        aria-hidden="true"
                                    />
                                ) : null}
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
