'use client';

import { Loader2, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { clientsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import type { ClientDetail } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ReactivateClientButton — single-click action, no confirm dialog.
//
// Reactivate is non-destructive (it restores access to a client the operator
// previously deactivated, often by mistake). Adding a confirm dialog would
// force needless friction. Linear-style undo: click → toast → done.
//
// Icon is RotateCcw (counterclockwise rotation) — semantically "revert /
// restore", not CheckCircle which would read as "completed task". The
// reactivation is an undo of the deactivation, not a new completion.
//
// Idempotency: backend's reactivateClient returns silently if the client is
// already active. Toast success either way (mirror D26).
// ─────────────────────────────────────────────────────────────────────────────

// Mirror of permission.defaults.ts:37-87 for CLIENT.EDIT (reactivate
// permission). Update both together when role defaults change.
const CAN_EDIT_CLIENT_ROLES = ['OWNER', 'ADMIN'] as const;

interface Props {
    client: ClientDetail;
}

export function ReactivateClientButton({ client }: Props) {
    const t = useTranslations('clients.reactivate');
    const router = useRouter();
    const { activeMembership } = useSession();
    const role = activeMembership?.role;
    const companyId = activeMembership?.company.id ?? null;

    const [submitting, setSubmitting] = useState(false);

    if (!role || !CAN_EDIT_CLIENT_ROLES.some((r) => r === role)) {
        return null;
    }

    const onClick = async () => {
        if (submitting || !companyId) return;
        setSubmitting(true);
        try {
            await clientsApi.reactivate(companyId, client.id);
            toast.success(t('success'));
            router.refresh();
        } catch (err) {
            const msg =
                err instanceof ApiError ? err.toUserMessage() : t('error');
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Button variant="ghost" onClick={onClick} disabled={submitting}>
            {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
            )}
            {submitting ? t('submitting') : t('trigger')}
        </Button>
    );
}
