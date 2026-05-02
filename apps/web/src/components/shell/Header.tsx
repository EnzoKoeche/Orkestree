'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/lib/session';
import { Role } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// Header — top bar of the app shell.
//
// Surfaces the current workspace label, the operator's role hint (if known),
// and a sign-out action. Adding workspace switching here is intentional
// future work — there is no /memberships/me endpoint to power a real picker
// yet, so keeping the surface minimal avoids inventing one.
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<Role, string> = {
    OWNER: 'Owner',
    ADMIN: 'Admin',
    FINANCEIRO: 'Finance',
    OPERACIONAL: 'Operations',
    CLIENTE: 'Client',
};

export function Header({ title, subtitle }: { title?: string; subtitle?: string }) {
    const { session, signOut } = useSession();

    return (
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-border bg-surface-base/90 px-6 backdrop-blur">
            <div className="min-w-0">
                {title ? (
                    <h1 className="truncate text-base font-semibold text-ink">{title}</h1>
                ) : null}
                {subtitle ? (
                    <p className="truncate text-xs text-ink-subtle">{subtitle}</p>
                ) : null}
            </div>
            {session ? (
                <div className="flex items-center gap-3">
                    <div className="hidden flex-col items-end text-right sm:flex">
                        <span className="text-xs text-ink-subtle">Workspace</span>
                        <span
                            className="max-w-[14rem] truncate text-sm font-medium text-ink"
                            title={session.companyId}
                        >
                            {session.workspaceLabel ?? session.companyId}
                        </span>
                    </div>
                    {session.role ? (
                        <Badge tone="neutral">{ROLE_LABEL[session.role]}</Badge>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={signOut}>
                        Sign out
                    </Button>
                </div>
            ) : null}
        </header>
    );
}
