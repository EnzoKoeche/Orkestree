'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { proposalsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import type { Role, ServiceRequestDetail } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// CreateProposalButton — "Nova proposta" action on the request detail.
//
// Opens a small dialog capturing only what CreateProposalDto requires beyond
// the link: title (seeded from the request title), an optional validUntil, and
// optional client-facing notes. Items are NOT collected here — the proposal is
// created in DRAFT and items are added on the proposal detail page (A3). On
// success we navigate straight to /proposals/:id (A1) + refresh so the request
// page's proposals list reflects the new draft if the operator comes back.
//
// Render gate (return null): role not in CAN_CREATE_PROPOSAL_ROLES — mirrors
// permission.defaults.ts PROPOSAL.CREATE (OWNER/ADMIN/OPERACIONAL). The button
// is also disabled for cancelled requests (backend would 404 the create).
//
// Validation is inline zod + react-hook-form (no resolver dep), mirroring
// CreateRequestForm. Backend 422 surfaces its message verbatim via toast.
// ─────────────────────────────────────────────────────────────────────────────

// Mirror of permission.defaults.ts PROPOSAL.CREATE. Update both together when
// role defaults change.
const CAN_CREATE_PROPOSAL_ROLES: readonly Role[] = ['OWNER', 'ADMIN', 'OPERACIONAL'];

interface FormValues {
    title: string;
    validUntil: string;
    clientNotes: string;
}

export function CreateProposalButton({ request }: { request: ServiceRequestDetail }) {
    const t = useTranslations('requests.detail.proposals.create');
    const router = useRouter();
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;
    const role = activeMembership?.role;

    const [open, setOpen] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        defaultValues: { title: request.title, validUntil: '', clientNotes: '' },
        mode: 'onSubmit',
    });

    // Re-seed the title each time the dialog opens so an edit to the request
    // title while the dialog was closed isn't shadowed by stale form state.
    useEffect(() => {
        if (open) reset({ title: request.title, validUntil: '', clientNotes: '' });
    }, [open, request.title, reset]);

    if (!role || !CAN_CREATE_PROPOSAL_ROLES.includes(role) || !companyId) {
        return null;
    }

    const schema = z.object({
        title: z
            .string()
            .trim()
            .min(1, t('errors.titleRequired'))
            .max(256, t('errors.titleTooLong')),
        validUntil: z.string(),
        clientNotes: z.string().max(4096, t('errors.clientNotesTooLong')),
    });

    const onSubmit = handleSubmit(async (raw) => {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
            for (const issue of parsed.error.issues) {
                const field = issue.path[0] as keyof FormValues;
                setError(field, { message: issue.message });
            }
            return;
        }

        // HTML date input gives "YYYY-MM-DD"; the backend DTO wants ISO-8601.
        // Serialize to UTC midnight, matching how the proposal detail editor
        // will serialize the same field.
        let validUntilIso: string | undefined;
        if (parsed.data.validUntil) {
            const candidate = new Date(`${parsed.data.validUntil}T00:00:00Z`);
            if (Number.isNaN(candidate.getTime())) {
                setError('validUntil', { message: t('errors.validUntilInvalid') });
                return;
            }
            validUntilIso = candidate.toISOString();
        }

        try {
            const proposal = await proposalsApi.create(companyId, {
                serviceRequestId: request.id,
                title: parsed.data.title.trim(),
                clientNotes: parsed.data.clientNotes.trim() || undefined,
                validUntil: validUntilIso,
            });
            toast.success(t('success', { number: proposal.number }));
            setOpen(false);
            router.push(`/proposals/${proposal.id}`);
            router.refresh();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.toUserMessage() : t('error'));
        }
    });

    return (
        <Dialog open={open} onOpenChange={(next) => !isSubmitting && setOpen(next)}>
            <Button
                size="sm"
                onClick={() => setOpen(true)}
                disabled={request.isCancelled}
                title={request.isCancelled ? t('cancelledTooltip') : undefined}
            >
                <Plus aria-hidden="true" />
                {t('trigger')}
            </Button>

            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-4" noValidate>
                    <div className="space-y-1.5">
                        <Label htmlFor="proposal-title">{t('fields.title')}</Label>
                        <Input
                            id="proposal-title"
                            {...register('title')}
                            aria-invalid={errors.title ? true : undefined}
                            autoFocus
                        />
                        {errors.title ? (
                            <p role="alert" className="text-sm text-destructive">
                                {errors.title.message}
                            </p>
                        ) : null}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="proposal-valid-until">{t('fields.validUntil')}</Label>
                        <Input
                            id="proposal-valid-until"
                            type="date"
                            {...register('validUntil')}
                            aria-invalid={errors.validUntil ? true : undefined}
                        />
                        {errors.validUntil ? (
                            <p role="alert" className="text-sm text-destructive">
                                {errors.validUntil.message}
                            </p>
                        ) : null}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="proposal-client-notes">{t('fields.clientNotes')}</Label>
                        <Textarea
                            id="proposal-client-notes"
                            rows={3}
                            placeholder={t('fields.clientNotesPlaceholder')}
                            {...register('clientNotes')}
                            aria-invalid={errors.clientNotes ? true : undefined}
                        />
                        {errors.clientNotes ? (
                            <p role="alert" className="text-sm text-destructive">
                                {errors.clientNotes.message}
                            </p>
                        ) : null}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setOpen(false)}
                            disabled={isSubmitting}
                        >
                            {t('cancel')}
                        </Button>
                        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                            {isSubmitting ? t('submitting') : t('submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
