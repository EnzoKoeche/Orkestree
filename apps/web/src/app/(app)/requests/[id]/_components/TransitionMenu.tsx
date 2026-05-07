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
import { useSession } from '@/lib/session';
import { requestsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { cn } from '@/lib/utils';
import type { AvailableTransition } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// TransitionMenu — DropdownMenu of legal stage transitions for the request.
//
// Server fetches availableTransitions in parallel with request detail (see
// page.tsx). Each item is a direct action: click → POST /transition →
// router.refresh() so the page re-fetches with the new currentStage,
// updated stageHistory entry (HistoryTab), and any new assignee resolved
// by the workflow's stage-assignee rules (Header info row).
//
// Render gates (return null):
//   - role not in CAN_EDIT_REQUEST_ROLES — mirrors permission.defaults.ts
//     for REQUEST.EDIT (OWNER/ADMIN/OPERACIONAL).
//   - request.isCancelled — cancelled requests don't move; backend would
//     422 anyway, but hiding the action is the Linear-correct UX.
//   - availableTransitions.length === 0 — terminal stages or workflows
//     with no outbound. Empty menu would just be visual noise.
//
// Approval-required transitions show a "Requer aprovação" badge but are
// NOT filtered out for OPERACIONAL. Backend rejects the click with 403,
// surfaced via friendly toast. Filtering pre-emptively would mirror more
// permission state in the frontend; we defer that until smoke shows it
// matters in practice.
// ─────────────────────────────────────────────────────────────────────────────

// Mirror of permission.defaults.ts:37-87 for REQUEST.EDIT. Update both
// together when role defaults change.
const CAN_EDIT_REQUEST_ROLES = ['OWNER', 'ADMIN', 'OPERACIONAL'] as const;

interface Props {
    requestId: string;
    isCancelled: boolean;
    availableTransitions: AvailableTransition[];
}

export function TransitionMenu({ requestId, isCancelled, availableTransitions }: Props) {
    const t = useTranslations('requests.transition');
    const router = useRouter();
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;
    const role = activeMembership?.role;

    const [submitting, setSubmitting] = useState(false);

    if (
        !role ||
        !CAN_EDIT_REQUEST_ROLES.some((r) => r === role) ||
        isCancelled ||
        availableTransitions.length === 0 ||
        !companyId
    ) {
        return null;
    }

    const onSelect = async (transition: AvailableTransition) => {
        if (submitting) return;
        setSubmitting(true);
        try {
            await requestsApi.transition(companyId, requestId, {
                toStageId: transition.toStageId,
            });
            toast.success(t('success', { stage: transition.toStageName }));
            router.refresh();
        } catch (err) {
            if (err instanceof ApiError && err.status === 403) {
                toast.error(t('approvalRequired'));
            } else if (err instanceof ApiError) {
                toast.error(err.toUserMessage());
            } else {
                toast.error(t('error'));
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button disabled={submitting}>
                    {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {submitting ? t('moving') : t('trigger')}
                    {!submitting ? (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    ) : null}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
                {availableTransitions.map((transition) => (
                    <DropdownMenuItem
                        key={transition.toStageId}
                        onSelect={(event) => {
                            // Prevent Radix's auto-close before our async work runs;
                            // we handle the lifecycle (toast + router.refresh) ourselves.
                            event.preventDefault();
                            void onSelect(transition);
                        }}
                        disabled={submitting}
                        className="flex items-center justify-between gap-3"
                    >
                        <span className="text-sm text-foreground">
                            {transition.toStageName}
                        </span>
                        {transition.requiresApproval ? (
                            <span
                                className={cn(
                                    'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium',
                                    'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
                                )}
                            >
                                {t('requiresApproval')}
                            </span>
                        ) : null}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
