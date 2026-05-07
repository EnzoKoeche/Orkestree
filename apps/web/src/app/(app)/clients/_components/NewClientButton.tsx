'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session';
import { ClientFormDialog } from './ClientFormDialog';

// ─────────────────────────────────────────────────────────────────────────────
// NewClientButton — client wrapper that owns the dialog open state.
//
// Role gate (return null when not allowed):
//   - role not in CAN_CREATE_CLIENT_ROLES — backend enforces CLIENT.CREATE,
//     mirrored here. Per permission.defaults.ts, only OWNER and ADMIN have
//     that permission by default.
//
// Lifted state pattern (mirror Sessão 10 NewRequestButton): button owns the
// `open` boolean because the dialog's submit handler closes the dialog
// *before* router.push so the new client's detail page renders without
// the modal still showing.
// ─────────────────────────────────────────────────────────────────────────────

// Mirror of permission.defaults.ts:37-87 for CLIENT.CREATE. Update both
// together when role defaults change.
const CAN_CREATE_CLIENT_ROLES = ['OWNER', 'ADMIN'] as const;

export function NewClientButton() {
    const t = useTranslations('clients');
    const { activeMembership } = useSession();
    const role = activeMembership?.role;
    const [open, setOpen] = useState(false);

    if (!role || !CAN_CREATE_CLIENT_ROLES.some((r) => r === role)) {
        return null;
    }

    return (
        <>
            <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('newClient')}
            </Button>
            <ClientFormDialog open={open} onOpenChange={setOpen} mode="create" />
        </>
    );
}
