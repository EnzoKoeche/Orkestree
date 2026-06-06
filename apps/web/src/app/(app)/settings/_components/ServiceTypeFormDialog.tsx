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
import { serviceTypesApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import type { ServiceTypeListItem } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ServiceTypeFormDialog — create/edit a service type (EPIC D / D1).
//
// Create captures code (snake_case, immutable afterwards) + name + description.
// Edit shows code read-only and lets you change name + description (the list
// row lacks description, so we fetch the detail on open to prefill it).
// Access is already gated at the page level (COMPANY_CONFIG / OWNER-ADMIN);
// the backend re-validates. On success: toast + router.refresh().
// ─────────────────────────────────────────────────────────────────────────────

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;

interface FormValues {
    code: string;
    name: string;
    description: string;
}

export function ServiceTypeFormDialog({
    serviceType,
}: {
    serviceType?: ServiceTypeListItem;
}) {
    const t = useTranslations('settings.serviceTypes.form');
    const router = useRouter();
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;
    const isEdit = serviceType !== undefined;

    const [open, setOpen] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        defaultValues: { code: '', name: '', description: '' },
        mode: 'onSubmit',
    });

    // On open: seed from the row, then (edit) fetch the detail for description.
    useEffect(() => {
        if (!open) return;
        reset({
            code: serviceType?.code ?? '',
            name: serviceType?.name ?? '',
            description: '',
        });
        if (isEdit && companyId && serviceType) {
            setLoadingDetail(true);
            serviceTypesApi
                .get(companyId, serviceType.id)
                .then((detail) => reset({
                    code: detail.code,
                    name: detail.name,
                    description: detail.description ?? '',
                }))
                .catch(() => {
                    /* keep the seeded values; description just stays blank */
                })
                .finally(() => setLoadingDetail(false));
        }
    }, [open, isEdit, companyId, serviceType, reset]);

    if (!companyId) return null;

    const schema = z.object({
        code: z
            .string()
            .trim()
            .min(2, t('errors.codeRequired'))
            .max(64, t('errors.codeTooLong'))
            .regex(CODE_PATTERN, t('errors.codePattern')),
        name: z.string().trim().min(1, t('errors.nameRequired')).max(128, t('errors.nameTooLong')),
        description: z.string().max(512, t('errors.descriptionTooLong')),
    });

    const onSubmit = handleSubmit(async (raw) => {
        // In edit mode code is fixed; only validate name + description.
        const toCheck = isEdit ? { ...raw, code: serviceType!.code } : raw;
        const parsed = schema.safeParse(toCheck);
        if (!parsed.success) {
            for (const issue of parsed.error.issues) {
                setError(issue.path[0] as keyof FormValues, { message: issue.message });
            }
            return;
        }

        try {
            if (isEdit) {
                await serviceTypesApi.update(companyId, serviceType!.id, {
                    name: parsed.data.name.trim(),
                    description: parsed.data.description.trim() || null,
                });
                toast.success(t('successEdit'));
            } else {
                await serviceTypesApi.create(companyId, {
                    code: parsed.data.code.trim(),
                    name: parsed.data.name.trim(),
                    description: parsed.data.description.trim() || undefined,
                });
                toast.success(t('successCreate'));
            }
            setOpen(false);
            router.refresh();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.toUserMessage() : t('error'));
        }
    });

    return (
        <Dialog open={open} onOpenChange={(next) => !isSubmitting && setOpen(next)}>
            {isEdit ? (
                <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
                    {t('editTrigger')}
                </Button>
            ) : (
                <Button size="sm" onClick={() => setOpen(true)}>
                    <Plus aria-hidden="true" />
                    {t('createTrigger')}
                </Button>
            )}

            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{isEdit ? t('editTitle') : t('createTitle')}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-4" noValidate>
                    <div className="space-y-1.5">
                        <Label htmlFor="st-code">{t('fields.code')}</Label>
                        <Input
                            id="st-code"
                            {...register('code')}
                            disabled={isEdit}
                            placeholder={t('fields.codePlaceholder')}
                            autoFocus={!isEdit}
                        />
                        {isEdit ? (
                            <p className="text-xs text-muted-foreground">{t('fields.codeLocked')}</p>
                        ) : (
                            <p className="text-xs text-muted-foreground">{t('fields.codeHint')}</p>
                        )}
                        {errors.code ? (
                            <p role="alert" className="text-sm text-destructive">
                                {errors.code.message}
                            </p>
                        ) : null}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="st-name">{t('fields.name')}</Label>
                        <Input id="st-name" {...register('name')} autoFocus={isEdit} />
                        {errors.name ? (
                            <p role="alert" className="text-sm text-destructive">
                                {errors.name.message}
                            </p>
                        ) : null}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="st-description">{t('fields.description')}</Label>
                        <Textarea
                            id="st-description"
                            rows={3}
                            {...register('description')}
                            placeholder={loadingDetail ? t('loading') : undefined}
                            disabled={loadingDetail}
                        />
                        {errors.description ? (
                            <p role="alert" className="text-sm text-destructive">
                                {errors.description.message}
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
                        <Button type="submit" disabled={isSubmitting || loadingDetail} aria-busy={isSubmitting}>
                            {isSubmitting
                                ? t('submitting')
                                : isEdit
                                  ? t('saveEdit')
                                  : t('saveCreate')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
