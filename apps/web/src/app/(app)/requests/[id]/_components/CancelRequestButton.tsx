'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSession } from '@/lib/session';
import { CancelRequestDialog } from './CancelRequestDialog';

// ─────────────────────────────────────────────────────────────────────────────
// CancelRequestButton — client wrapper that owns the AlertDialog open state.
//
// Rendering rules (return null):
//   - role not in CAN_CANCEL_REQUEST_ROLES — mirrors permission.defaults.ts
//     for REQUEST.EDIT (OWNER/ADMIN/OPERACIONAL). Backend uses the same
//     permission for cancel and transition; whitelist matches Commit C.
//
// When request is already cancelled, the button is rendered DISABLED with
// a tooltip ("Pedido já cancelado") rather than hidden — explicit signal
// that the action exists but has already been performed. Hiding would
// leave the operator wondering whether the action is gone or just
// missing; disabled+tooltip removes the ambiguity.
// ─────────────────────────────────────────────────────────────────────────────

// Mirror of permission.defaults.ts:37-87 for REQUEST.EDIT (cancel uses the
// same permission as transition). Update both together when role defaults
// change.
const CAN_CANCEL_REQUEST_ROLES = ['OWNER', 'ADMIN', 'OPERACIONAL'] as const;

interface Props {
    requestId: string;
    isCancelled: boolean;
}

export function CancelRequestButton({ requestId, isCancelled }: Props) {
    const t = useTranslations('requests.cancel');
    const { activeMembership } = useSession();
    const role = activeMembership?.role;
    const [open, setOpen] = useState(false);

    if (!role || !CAN_CANCEL_REQUEST_ROLES.some((r) => r === role)) {
        return null;
    }

    if (isCancelled) {
        return (
            <TooltipProvider delayDuration={200}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span tabIndex={0}>
                            <Button
                                variant="ghost"
                                disabled
                                aria-disabled="true"
                            >
                                {t('trigger')}
                            </Button>
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{t('alreadyCancelledTooltip')}</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return (
        <>
            <Button variant="ghost" onClick={() => setOpen(true)}>
                {t('trigger')}
            </Button>
            <CancelRequestDialog
                open={open}
                onOpenChange={setOpen}
                requestId={requestId}
            />
        </>
    );
}
