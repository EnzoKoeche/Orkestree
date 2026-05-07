'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ClientFormDialog } from '@/app/(app)/clients/_components/ClientFormDialog';
import { useSession } from '@/lib/session';
import type { ClientDetail } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// EditClientButton — opens the same ClientFormDialog used by create, but in
// `edit` mode with initialData populated.
//
// Role gate mirrors backend's CLIENT.EDIT: OWNER + ADMIN per
// permission.defaults.ts. FINANCEIRO/OPERACIONAL get VIEW only.
//
// `type` is locked in the form (immutable backend); other fields editable.
// ─────────────────────────────────────────────────────────────────────────────

const CAN_EDIT_CLIENT_ROLES = ['OWNER', 'ADMIN'] as const;

interface Props {
    client: ClientDetail;
}

export function EditClientButton({ client }: Props) {
    const t = useTranslations('common');
    const { activeMembership } = useSession();
    const role = activeMembership?.role;
    const [open, setOpen] = useState(false);

    if (!role || !CAN_EDIT_CLIENT_ROLES.some((r) => r === role)) {
        return null;
    }

    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {t('edit')}
            </Button>
            <ClientFormDialog
                open={open}
                onOpenChange={setOpen}
                mode="edit"
                initialData={client}
            />
        </>
    );
}
