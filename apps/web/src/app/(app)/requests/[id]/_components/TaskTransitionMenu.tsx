'use client';

import { ChevronDown, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { tasksApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import type { Role, TaskStatus } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// TaskTransitionMenu — per-row status transition for a task (EPIC C / C1).
//
// Offers only the legal next statuses for the current one — a mirror of
// isLegalTaskTransition in tasks.service.ts. CANCELLED is terminal (no menu).
// Role-gated to TASK.EDIT (OWNER/ADMIN/OPERACIONAL). On success: toast +
// router.refresh() so the server-rendered tasks list reflects the new status.
// The backend is the state-machine authority; a stale tab gets a 422 toast.
// ─────────────────────────────────────────────────────────────────────────────

const CAN_EDIT_TASK_ROLES: readonly Role[] = ['OWNER', 'ADMIN', 'OPERACIONAL'];

const LEGAL_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    OPEN: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
    IN_PROGRESS: ['OPEN', 'DONE', 'CANCELLED'],
    DONE: ['OPEN'],
    CANCELLED: [],
};

export function TaskTransitionMenu({
    taskId,
    status,
}: {
    taskId: string;
    status: TaskStatus;
}) {
    const t = useTranslations('requests.detail.tasks');
    const router = useRouter();
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;
    const role = activeMembership?.role;
    const [submitting, setSubmitting] = useState(false);

    const targets = LEGAL_TRANSITIONS[status];
    if (!role || !CAN_EDIT_TASK_ROLES.includes(role) || !companyId || targets.length === 0) {
        return null;
    }

    const onSelect = async (toStatus: TaskStatus) => {
        if (submitting) return;
        setSubmitting(true);
        try {
            await tasksApi.transition(companyId, taskId, { toStatus });
            toast.success(t('transition.success', { status: t(`status.${toStatus}`) }));
            router.refresh();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.toUserMessage() : t('transition.error'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8" disabled={submitting}>
                    {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {t('transition.trigger')}
                    {!submitting ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : null}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
                {targets.map((to) => (
                    <DropdownMenuItem
                        key={to}
                        onSelect={(event) => {
                            event.preventDefault();
                            void onSelect(to);
                        }}
                        disabled={submitting}
                    >
                        {t(`transition.to.${to}`)}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
