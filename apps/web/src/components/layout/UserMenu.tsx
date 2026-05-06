'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession } from '@/lib/session';

// ─────────────────────────────────────────────────────────────────────────────
// UserMenu — right side of the header.
//
// Renders the avatar + name as the dropdown trigger; opens to a header
// (full name + email muted) above a single "Sair" item. Logout is an
// intentional click on a deliberately-deep dropdown — no confirm dialog
// (operator clicked, the cost of pressing again is zero).
//
// "Sair" stays in `text-foreground` with a muted icon. Logout isn't a
// destructive action; coloring it red would imply danger and add noise
// to a verb that's just "go back to /login".
// ─────────────────────────────────────────────────────────────────────────────

function getInitials(firstName: string, lastName: string): string {
    const f = firstName.trim().charAt(0).toUpperCase();
    const l = lastName.trim().charAt(0).toUpperCase();
    const result = `${f}${l}`;
    return result.length > 0 ? result : '?';
}

export function UserMenu() {
    const t = useTranslations('userMenu');
    const router = useRouter();
    const { session, signOut } = useSession();

    if (!session) return null;

    const fullName = `${session.user.firstName} ${session.user.lastName}`.trim() || session.user.email;
    const initials = getInitials(session.user.firstName, session.user.lastName);

    function handleSignOut() {
        signOut();
        router.push('/login');
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-md px-2 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-label={fullName}
                >
                    <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-secondary text-xs font-medium text-foreground">
                            {initials}
                        </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-foreground">{fullName}</span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px] p-1">
                <div className="flex flex-col gap-1 p-3">
                    <span className="text-sm font-medium text-foreground">{fullName}</span>
                    <span className="text-xs text-muted-foreground">{session.user.email}</span>
                </div>
                <DropdownMenuSeparator className="mx-1 my-1 bg-border" />
                <DropdownMenuItem
                    onSelect={handleSignOut}
                    className="flex h-9 cursor-pointer items-center gap-3 rounded-md px-3 text-sm"
                >
                    <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span>{t('signOut')}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
