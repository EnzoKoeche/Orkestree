'use client';

import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { tasksApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import type { CompanyMember, MembershipRef, Role } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// TaskAssigneePicker — per-row assignee control (EPIC C / C2).
//
// Role-gated to TASK.ASSIGN (OWNER/ADMIN/OPERACIONAL — mirror of
// permission.defaults.ts; OPERACIONAL was granted ASSIGN in the B2 change).
// Non-assigning roles see the current assignee read-only. Members come from
// the company directory (GET /companies/:c/memberships), fetched once by the
// page and passed down. assign/unassign → toast + router.refresh().
// ─────────────────────────────────────────────────────────────────────────────

const CAN_ASSIGN_TASK_ROLES: readonly Role[] = ['OWNER', 'ADMIN', 'OPERACIONAL'];

function memberName(m: MembershipRef | CompanyMember | null): string | null {
    if (!m) return null;
    return `${m.user.firstName} ${m.user.lastName}`.trim() || m.user.firstName;
}

export function TaskAssigneePicker({
    taskId,
    assignedMembership,
    members,
}: {
    taskId: string;
    assignedMembership: MembershipRef | null;
    members: CompanyMember[];
}) {
    const t = useTranslations('requests.detail.tasks.assign');
    const router = useRouter();
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;
    const role = activeMembership?.role;
    const [submitting, setSubmitting] = useState(false);

    const currentName = memberName(assignedMembership);
    const canAssign = Boolean(role && CAN_ASSIGN_TASK_ROLES.includes(role) && companyId);

    // Read-only fallback for non-assigning roles (or if the directory failed to
    // load): just show who's assigned.
    if (!canAssign || members.length === 0) {
        return currentName ? (
            <span className="text-sm text-foreground">{currentName}</span>
        ) : (
            <span className="text-sm text-muted-foreground">{t('unassigned')}</span>
        );
    }

    async function run(action: () => Promise<unknown>, successKey: string) {
        if (submitting) return;
        setSubmitting(true);
        try {
            await action();
            toast.success(t(successKey));
            router.refresh();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.toUserMessage() : t('error'));
        } finally {
            setSubmitting(false);
        }
    }

    const assignedId = assignedMembership?.id ?? null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 max-w-[180px]" disabled={submitting}>
                    {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    <span className={cn('truncate', !currentName && 'text-muted-foreground')}>
                        {currentName ?? t('assign')}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[280px] min-w-[200px] overflow-y-auto">
                {members.map((m) => {
                    const isCurrent = m.id === assignedId;
                    return (
                        <DropdownMenuItem
                            key={m.id}
                            disabled={submitting || isCurrent}
                            onSelect={(event) => {
                                event.preventDefault();
                                if (isCurrent) return;
                                void run(
                                    () => tasksApi.assign(companyId!, taskId, { membershipId: m.id }),
                                    'assigned',
                                );
                            }}
                            className="flex items-center justify-between gap-2"
                        >
                            <span className="truncate">{memberName(m)}</span>
                            {isCurrent ? (
                                <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                            ) : null}
                        </DropdownMenuItem>
                    );
                })}
                {assignedId ? (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            disabled={submitting}
                            onSelect={(event) => {
                                event.preventDefault();
                                void run(() => tasksApi.unassign(companyId!, taskId), 'cleared');
                            }}
                            className="text-muted-foreground"
                        >
                            {t('clear')}
                        </DropdownMenuItem>
                    </>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
