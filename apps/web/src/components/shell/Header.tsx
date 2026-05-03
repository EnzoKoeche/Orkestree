'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { useSession, workspaceLabel } from '@/lib/session';
import { initials } from '@/lib/format';
import { MembershipSummary, Role } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// Header — top bar of the app shell.
//
// Surfaces:
//   - a workspace switcher (only when the user has >1 active membership)
//   - the active workspace label + role badge
//   - the signed-in user's identity (initials + email)
//   - sign-out
//
// The role badge is purely informational. The backend re-checks every
// permission on every call — the UI never claims to be the source of
// authorization truth.
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<Role, string> = {
    OWNER: 'Owner',
    ADMIN: 'Admin',
    FINANCEIRO: 'Finance',
    OPERACIONAL: 'Operations',
    CLIENTE: 'Client',
};

export function Header() {
    const { snapshot, switchWorkspace, signOut } = useSession();

    if (snapshot.phase !== 'authenticated') return null;

    const { user, memberships, active } = snapshot;
    const hasMultiple = memberships.length > 1;

    return (
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-border bg-surface-base/90 px-6 backdrop-blur">
            <div className="min-w-0 flex items-center gap-3">
                {hasMultiple ? (
                    <WorkspaceSwitcher
                        memberships={memberships}
                        activeId={active.id}
                        onPick={(id) => switchWorkspace(id)}
                    />
                ) : (
                    <div className="flex flex-col leading-tight">
                        <span className="text-xs text-ink-subtle">Workspace</span>
                        <span
                            className="max-w-[20rem] truncate text-sm font-medium text-ink"
                            title={active.company.legalName}
                        >
                            {workspaceLabel(active)}
                        </span>
                    </div>
                )}
                <Badge tone="neutral">{ROLE_LABEL[active.role]}</Badge>
            </div>

            <div className="flex items-center gap-3">
                <div className="hidden flex-col items-end text-right sm:flex">
                    <span
                        className="max-w-[14rem] truncate text-sm font-medium text-ink"
                        title={`${user.firstName} ${user.lastName}`}
                    >
                        {user.firstName} {user.lastName}
                    </span>
                    <span className="max-w-[14rem] truncate text-xs text-ink-subtle">
                        {user.email}
                    </span>
                </div>
                <span
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-contrast"
                    aria-hidden
                >
                    {initials(user)}
                </span>
                <Button variant="ghost" size="sm" onClick={signOut}>
                    Sign out
                </Button>
            </div>
        </header>
    );
}

// ── Workspace switcher ──────────────────────────────────────────────────────
//
// Tiny dropdown built from native primitives. We deliberately avoid a heavy
// combobox library: this list is bounded by the number of workspaces a
// human can join, and a vanilla button + popover handles ~50 entries fine.
// Closes on outside click or Escape; selection is immediate (no confirm).

interface WorkspaceSwitcherProps {
    memberships: MembershipSummary[];
    activeId: string;
    onPick: (membershipId: string) => void;
}

function WorkspaceSwitcher({ memberships, activeId, onPick }: WorkspaceSwitcherProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('mousedown', onClick);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', onClick);
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const active = memberships.find((m) => m.id === activeId);
    if (!active) return null;

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    'flex items-center gap-2 rounded-md border border-border bg-surface-base px-3 py-1.5 text-left transition focus-ring',
                    'hover:bg-surface-sunken',
                )}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <div className="flex flex-col leading-tight">
                    <span className="text-[10px] uppercase tracking-wide text-ink-subtle">
                        Workspace
                    </span>
                    <span
                        className="max-w-[16rem] truncate text-sm font-medium text-ink"
                        title={active.company.legalName}
                    >
                        {workspaceLabel(active)}
                    </span>
                </div>
                <svg
                    aria-hidden
                    className={cn('h-3 w-3 text-ink-subtle transition', open && 'rotate-180')}
                    viewBox="0 0 12 12"
                    fill="none"
                >
                    <path
                        d="M2 4l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>

            {open ? (
                <div
                    role="listbox"
                    className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-md border border-border bg-surface-base shadow-pop"
                >
                    <ul className="max-h-80 overflow-y-auto py-1">
                        {memberships.map((m) => {
                            const isActive = m.id === activeId;
                            const label =
                                m.company.tradeName?.trim() || m.company.legalName.trim() || m.company.taxId;
                            return (
                                <li key={m.id}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={isActive}
                                        onClick={() => {
                                            onPick(m.id);
                                            setOpen(false);
                                        }}
                                        className={cn(
                                            'flex w-full items-start gap-3 px-3 py-2 text-left transition focus-ring',
                                            isActive
                                                ? 'bg-surface-sunken'
                                                : 'hover:bg-surface-sunken',
                                        )}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium text-ink">
                                                {label}
                                            </div>
                                            <div className="truncate text-xs text-ink-subtle">
                                                {ROLE_LABEL[m.role]}
                                                <span className="mx-1.5 text-ink-faint">·</span>
                                                <span className="font-mono">{m.company.id}</span>
                                            </div>
                                        </div>
                                        {isActive ? (
                                            <span
                                                className="mt-0.5 inline-block h-2 w-2 rounded-full bg-state-success"
                                                aria-hidden
                                            />
                                        ) : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}
