'use client';

import { Plus, X } from 'lucide-react';
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
import { customFieldsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import type {
    CreateCustomFieldOptionPayload,
    CustomFieldListItem,
    CustomFieldTarget,
    CustomFieldType,
} from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// CustomFieldFormDialog — create/edit a custom field (EPIC D / D2).
//
// Create: code (snake_case, immutable), label, target, type, isRequired,
// placeholder, helpText, and — for SELECT/MULTISELECT — an inline options list
// (option `value` is auto-derived from the label as snake_case). Edit changes
// label/required/placeholder/helpText only (code/target/type are immutable);
// options are shown read-only here (full option editing is a follow-up).
// ─────────────────────────────────────────────────────────────────────────────

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;
const SELECT_TYPES: readonly CustomFieldType[] = ['SELECT', 'MULTISELECT'];

const FIELD_TYPES: readonly CustomFieldType[] = [
    'TEXT', 'TEXTAREA', 'NUMBER', 'DECIMAL', 'DATE', 'DATETIME',
    'SELECT', 'MULTISELECT', 'BOOLEAN', 'PHONE', 'EMAIL', 'URL',
];
const TARGETS: readonly CustomFieldTarget[] = ['REQUEST', 'CLIENT', 'PROPOSAL'];

function slugify(label: string): string {
    const base = label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!base) return 'opcao';
    return /^[a-z]/.test(base) ? base : `o_${base}`;
}

interface FormValues {
    code: string;
    label: string;
    target: CustomFieldTarget;
    type: CustomFieldType;
    isRequired: boolean;
    placeholder: string;
    helpText: string;
}

export function CustomFieldFormDialog({ field }: { field?: CustomFieldListItem }) {
    const t = useTranslations('settings.customFields.form');
    const tType = useTranslations('settings.customFields.types');
    const tTarget = useTranslations('settings.customFields.targets');
    const router = useRouter();
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;
    const isEdit = field !== undefined;

    const [open, setOpen] = useState(false);
    const [optionLabels, setOptionLabels] = useState<string[]>([]);
    const [newOption, setNewOption] = useState('');

    const {
        register,
        handleSubmit,
        reset,
        watch,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        defaultValues: {
            code: '',
            label: '',
            target: 'REQUEST',
            type: 'TEXT',
            isRequired: false,
            placeholder: '',
            helpText: '',
        },
        mode: 'onSubmit',
    });

    useEffect(() => {
        if (!open) return;
        reset({
            code: field?.code ?? '',
            label: field?.label ?? '',
            target: field?.target ?? 'REQUEST',
            type: field?.type ?? 'TEXT',
            isRequired: field?.isRequired ?? false,
            placeholder: field?.placeholder ?? '',
            helpText: field?.helpText ?? '',
        });
        setOptionLabels([]);
        setNewOption('');
    }, [open, field, reset]);

    if (!companyId) return null;

    const selectedType = watch('type');
    const needsOptions = SELECT_TYPES.includes(selectedType);

    function addOptionLabel() {
        const v = newOption.trim();
        if (!v) return;
        setOptionLabels((prev) => [...prev, v]);
        setNewOption('');
    }

    const onSubmit = handleSubmit(async (raw) => {
        const baseSchema = z.object({
            label: z.string().trim().min(1, t('errors.labelRequired')).max(128, t('errors.labelTooLong')),
            placeholder: z.string().max(256, t('errors.placeholderTooLong')),
            helpText: z.string().max(512, t('errors.helpTextTooLong')),
        });
        const codeSchema = z
            .string()
            .trim()
            .min(2, t('errors.codeRequired'))
            .max(64, t('errors.codeTooLong'))
            .regex(CODE_PATTERN, t('errors.codePattern'));

        const base = baseSchema.safeParse(raw);
        if (!base.success) {
            for (const issue of base.error.issues) {
                setError(issue.path[0] as keyof FormValues, { message: issue.message });
            }
            return;
        }
        if (!isEdit) {
            const codeParsed = codeSchema.safeParse(raw.code);
            if (!codeParsed.success) {
                setError('code', { message: codeParsed.error.issues[0]?.message });
                return;
            }
            if (needsOptions && optionLabels.length === 0) {
                toast.error(t('errors.optionsRequired'));
                return;
            }
        }

        try {
            if (isEdit) {
                await customFieldsApi.update(companyId, field!.id, {
                    label: base.data.label.trim(),
                    isRequired: raw.isRequired,
                    placeholder: base.data.placeholder.trim() || null,
                    helpText: base.data.helpText.trim() || null,
                });
                toast.success(t('successEdit'));
            } else {
                const options: CreateCustomFieldOptionPayload[] | undefined = needsOptions
                    ? optionLabels.map((label, i) => ({ label, value: slugify(label), sortOrder: i }))
                    : undefined;
                await customFieldsApi.create(companyId, {
                    code: raw.code.trim(),
                    label: base.data.label.trim(),
                    target: raw.target,
                    type: raw.type,
                    isRequired: raw.isRequired,
                    placeholder: base.data.placeholder.trim() || undefined,
                    helpText: base.data.helpText.trim() || undefined,
                    options,
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

            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEdit ? t('editTitle') : t('createTitle')}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-4" noValidate>
                    <Field label={t('fields.label')} error={errors.label?.message} htmlFor="cf-label">
                        <Input id="cf-label" {...register('label')} autoFocus />
                    </Field>

                    {!isEdit ? (
                        <>
                            <Field label={t('fields.code')} error={errors.code?.message} hint={t('fields.codeHint')} htmlFor="cf-code">
                                <Input id="cf-code" {...register('code')} placeholder={t('fields.codePlaceholder')} />
                            </Field>

                            <div className="grid grid-cols-2 gap-4">
                                <Field label={t('fields.target')} htmlFor="cf-target">
                                    <Select id="cf-target" {...register('target')}>
                                        {TARGETS.map((tg) => (
                                            <option key={tg} value={tg}>{tTarget(tg)}</option>
                                        ))}
                                    </Select>
                                </Field>
                                <Field label={t('fields.type')} htmlFor="cf-type">
                                    <Select id="cf-type" {...register('type')}>
                                        {FIELD_TYPES.map((ty) => (
                                            <option key={ty} value={ty}>{tType(ty)}</option>
                                        ))}
                                    </Select>
                                </Field>
                            </div>
                        </>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            {t('immutableHint', {
                                code: field!.code,
                                type: tType(field!.type),
                                target: tTarget(field!.target),
                            })}
                        </p>
                    )}

                    {/* Options */}
                    {!isEdit && needsOptions ? (
                        <div className="space-y-2">
                            <Label>{t('fields.options')}</Label>
                            {optionLabels.length > 0 ? (
                                <ul className="space-y-1">
                                    {optionLabels.map((opt, i) => (
                                        <li key={`${opt}-${i}`} className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-1.5 text-sm">
                                            <span className="truncate">{opt}</span>
                                            <button
                                                type="button"
                                                onClick={() => setOptionLabels((prev) => prev.filter((_, idx) => idx !== i))}
                                                aria-label={t('removeOption')}
                                                className="text-muted-foreground hover:text-destructive"
                                            >
                                                <X className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                            <div className="flex gap-2">
                                <Input
                                    value={newOption}
                                    onChange={(e) => setNewOption(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            addOptionLabel();
                                        }
                                    }}
                                    placeholder={t('fields.optionPlaceholder')}
                                />
                                <Button type="button" variant="secondary" onClick={addOptionLabel}>
                                    {t('addOption')}
                                </Button>
                            </div>
                        </div>
                    ) : isEdit && SELECT_TYPES.includes(field!.type) ? (
                        <div className="space-y-1">
                            <Label>{t('fields.options')}</Label>
                            <p className="text-sm text-muted-foreground">
                                {field!.options.map((o) => o.label).join(' · ') || '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">{t('optionsReadonlyHint')}</p>
                        </div>
                    ) : null}

                    <Field label={t('fields.placeholder')} error={errors.placeholder?.message} htmlFor="cf-ph">
                        <Input id="cf-ph" {...register('placeholder')} />
                    </Field>
                    <Field label={t('fields.helpText')} error={errors.helpText?.message} htmlFor="cf-help">
                        <Input id="cf-help" {...register('helpText')} />
                    </Field>

                    <label className="flex items-center gap-2 text-sm text-foreground">
                        <input type="checkbox" {...register('isRequired')} className="h-4 w-4 rounded border-input" />
                        {t('fields.isRequired')}
                    </label>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isSubmitting}>
                            {t('cancel')}
                        </Button>
                        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                            {isSubmitting ? t('submitting') : isEdit ? t('saveEdit') : t('saveCreate')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function Field({
    label,
    htmlFor,
    error,
    hint,
    children,
}: {
    label: string;
    htmlFor: string;
    error?: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={htmlFor}>{label}</Label>
            {children}
            {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
            {error ? (
                <p role="alert" className="text-sm text-destructive">{error}</p>
            ) : null}
        </div>
    );
}

function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            className={cn(
                'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                className,
            )}
            {...props}
        />
    );
}
