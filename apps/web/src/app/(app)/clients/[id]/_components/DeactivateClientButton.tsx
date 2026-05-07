'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { clientsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import type { ClientDetail } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// DeactivateClientButton — Dialog regular (NOT AlertDialog) for a reversible
// destructive-ish action.
//
// AlertDialog is reserved for IRREVERSIBLE actions (e.g. cancel pedido) — it
// blocks overlay-click + ESC. Deactivate is reversible (operator can
// reactivate), so a plain Dialog is honest about that: clicking outside or
// pressing ESC closes the dialog with low friction. The confirm button is
// `variant="default"` (indigo primary), NOT destructive — vermelho fica
// reservado pra Cancel Pedido.
//
// Idempotency: backend's deactivateClient returns silently if the client is
// already inactive. We surface success in either case (mirror Sessão 10
// D26): a toast saying "Cliente desativado" is honest — the client IS
// inactive, regardless of who flipped the bit.
// ─────────────────────────────────────────────────────────────────────────────

// Mirror of permission.defaults.ts:37-87 for CLIENT.DELETE (deactivate
// permission). Update both together when role defaults change.
const CAN_EDIT_CLIENT_ROLES = ['OWNER', 'ADMIN'] as const;

interface Props {
    client: ClientDetail;
}

export function DeactivateClientButton({ client }: Props) {
    const t = useTranslations('clients.deactivate');
    const router = useRouter();
    const { activeMembership } = useSession();
    const role = activeMembership?.role;
    const companyId = activeMembership?.company.id ?? null;

    const [open, setOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    if (!role || !CAN_EDIT_CLIENT_ROLES.some((r) => r === role)) {
        return null;
    }

    const handleClose = (next: boolean) => {
        // Block closing during in-flight POST so the operator doesn't think
        // the request was cancelled when it was actually still going.
        if (submitting) return;
        setOpen(next);
    };

    const onConfirm = async () => {
        if (submitting || !companyId) return;
        setSubmitting(true);
        try {
            await clientsApi.deactivate(companyId, client.id);
            toast.success(t('success'));
            setOpen(false);
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
        <>
            <Button variant="ghost" onClick={() => setOpen(true)}>
                {t('trigger')}
            </Button>
            <Dialog open={open} onOpenChange={handleClose}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('title', { name: client.name })}</DialogTitle>
                        <DialogDescription>{t('description')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setOpen(false)}
                            disabled={submitting}
                        >
                            {t('cancel')}
                        </Button>
                        <Button
                            type="button"
                            onClick={onConfirm}
                            disabled={submitting}
                        >
                            {submitting ? t('submitting') : t('confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
