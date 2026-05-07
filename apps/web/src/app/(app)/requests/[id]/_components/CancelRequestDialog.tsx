'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSession } from '@/lib/session';
import { requestsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

// ─────────────────────────────────────────────────────────────────────────────
// CancelRequestDialog — destructive confirm for cancelling a request.
//
// AlertDialog (not Dialog) is the right primitive: Radix's AlertDialog
// blocks overlay-click and ESC dismissal, forcing the operator into an
// explicit Cancel/Confirm choice. Reflects the irreversibility of the
// action — the warning copy says "Esta ação não pode ser desfeita."
//
// Reason is optional (max 1024 chars per backend DTO). Empty string is
// dropped to undefined on submit so the wire payload is `{}` for a no-
// reason cancel — backend sets cancellationReason = null in that branch.
//
// Lifecycle:
//   - Click "Cancelar pedido" → setSubmitting → POST /cancel
//   - Success → toast.success + router.refresh() + close
//   - Error → toast.error, dialog stays open, reason preserved
//
// AlertDialogAction styled as `destructive` — only place in this surface
// where indigo doesn't dominate (P5 cor com restrição: red is reserved
// for irreversible actions, this is the canonical instance).
// ─────────────────────────────────────────────────────────────────────────────

const REASON_MAX = 1024;

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    requestId: string;
}

export function CancelRequestDialog({ open, onOpenChange, requestId }: Props) {
    const t = useTranslations('requests.cancel');
    const router = useRouter();
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;

    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const reasonTooLong = reason.length > REASON_MAX;
    const canSubmit = !submitting && !reasonTooLong && companyId !== null;

    const handleClose = (next: boolean) => {
        if (submitting) return;
        if (!next) setReason('');
        onOpenChange(next);
    };

    const onConfirm = async () => {
        if (!canSubmit || !companyId) return;
        setSubmitting(true);
        try {
            await requestsApi.cancel(companyId, requestId, {
                reason: reason.trim() || undefined,
            });
            toast.success(t('success'));
            router.refresh();
            onOpenChange(false);
            setReason('');
        } catch (err) {
            const msg =
                err instanceof ApiError ? err.toUserMessage() : t('error');
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={handleClose}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('title')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('warning')}</AlertDialogDescription>
                </AlertDialogHeader>

                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cancel-reason">
                        {t('reasonLabel')}{' '}
                        <span className="text-muted-foreground">
                            {t('reasonOptional')}
                        </span>
                    </Label>
                    <Textarea
                        id="cancel-reason"
                        rows={3}
                        placeholder={t('reasonPlaceholder')}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={submitting}
                        maxLength={REASON_MAX + 200}
                    />
                    {reasonTooLong ? (
                        <p role="alert" className="text-sm text-destructive">
                            {t('reasonTooLong')}
                        </p>
                    ) : null}
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel disabled={submitting}>
                        {t('keepLabel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        disabled={!canSubmit}
                        onClick={(event) => {
                            // Prevent Radix's auto-close before our async work runs;
                            // we own the close timing (after success or never on error).
                            event.preventDefault();
                            void onConfirm();
                        }}
                        className={cn(
                            buttonVariants({ variant: 'destructive' }),
                        )}
                    >
                        {submitting ? t('submitting') : t('confirmLabel')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
