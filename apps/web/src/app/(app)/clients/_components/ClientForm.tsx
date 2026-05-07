'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CustomFieldInputs } from '@/app/(app)/requests/_components/CustomFieldInputs';
import { clientsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { cn } from '@/lib/utils';
import type {
    ClientDetail,
    ClientFieldValue,
    ClientType,
    CreateClientPayload,
    CustomFieldListItem,
    CustomFieldType,
    SetFieldValueItem,
    UpdateClientPayload,
} from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ClientForm — single component for create + edit modes.
//
// RHF state is FLAT (all keys present regardless of type), schema validation
// is via discriminatedUnion('type'). The submit-side payload builder filters
// out the irrelevant branch's fields based on the current type so the wire
// stays clean.
//
// Edit mode quirks:
//   - type radio cards are disabled (immutable backend; service throws 422
//     if changed). Display the existing type, locked.
//   - Submit hits PATCH /:id (basic fields only — type and fieldValues
//     omitted) and, when applicable custom fields exist, follows up with
//     PUT /:id/field-values (replace-all). Sequential: PATCH first; if it
//     fails, no PUT attempt. If PATCH succeeds and PUT fails, partial
//     warning toast lets the operator retry without losing form state.
//
// taxId UX: stored as digits-only in form state; displayed via mask
// (formatTaxIdInput) per current type. Switching type in create mode resets
// taxId because the regex differs (11 vs 14 digits).
//
// name is denormalized server-side (PF: dto.name; PJ: dto.tradeName ??
// dto.legalName) — frontend doesn't send a top-level name field.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    mode: 'create' | 'edit';
    companyId: string;
    initialData?: ClientDetail;
    initialFieldValues?: ClientFieldValue[];
    customFields: CustomFieldListItem[];
    onSuccess: () => void;
    onCancel: () => void;
}

const FIELD_KEY_PREFIX = 'field_' as const;
const fieldKey = (id: string) => `${FIELD_KEY_PREFIX}${id}`;

type FormValues = Record<string, unknown>;

export function ClientForm({
    mode,
    companyId,
    initialData,
    initialFieldValues = [],
    customFields,
    onSuccess,
    onCancel,
}: Props) {
    const t = useTranslations('clients.form');
    const tFields = useTranslations('clients.form.fields');
    const tErr = useTranslations('clients.form.errors');
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);

    const applicableFields = customFields.filter((f) => f.isActive);

    const defaultValues: FormValues = buildDefaults(
        mode,
        initialData,
        initialFieldValues,
        applicableFields,
    );

    const form = useForm<FormValues>({
        defaultValues,
        mode: 'onSubmit',
    });

    const currentType = (form.watch('type') as ClientType) ?? 'INDIVIDUAL';
    const isPF = currentType === 'INDIVIDUAL';

    // Type switch in create mode resets taxId — regex differs (11 vs 14
    // digits). In edit mode, type is locked, so this effect is a no-op.
    useEffect(() => {
        if (mode === 'edit') return;
        form.setValue('taxId', '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentType, mode]);

    const onSubmit = form.handleSubmit(async (rawValues) => {
        const schema = buildDynamicSchema(applicableFields, tErr);
        const parsed = schema.safeParse(rawValues);
        if (!parsed.success) {
            for (const issue of parsed.error.issues) {
                const path = issue.path.join('.');
                form.setError(path as never, {
                    type: 'manual',
                    message: issue.message,
                });
            }
            toast.error(tErr('validationGeneric'));
            return;
        }

        setSubmitting(true);
        try {
            if (mode === 'create') {
                const payload = buildCreatePayload(parsed.data, applicableFields);
                const created = await clientsApi.create(companyId, payload);
                onSuccess();
                router.push(`/clients/${created.id}`);
                return;
            }

            // ── edit mode ────────────────────────────────────────────────────
            const clientId = initialData!.id;
            const updatePayload = buildUpdatePayload(parsed.data);
            await clientsApi.update(companyId, clientId, updatePayload);

            // 2-step: only fire PUT if there are applicable custom fields.
            if (applicableFields.length > 0) {
                const items = buildFieldValueItems(parsed.data, applicableFields);
                try {
                    await clientsApi.setFieldValues(companyId, clientId, items);
                } catch (fieldErr) {
                    // Partial state — PATCH succeeded, PUT failed. Honest about it.
                    toast.warning(t('warningPartial'));
                    setSubmitting(false);
                    router.refresh();
                    return;
                }
            }

            toast.success(t('successEdit'));
            onSuccess();
            router.refresh();
        } catch (err) {
            const msg =
                err instanceof ApiError
                    ? err.toUserMessage()
                    : tErr(mode === 'create' ? 'createFailed' : 'updateFailed');
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    });

    return (
        <form
            onSubmit={onSubmit}
            className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto pr-1"
        >
            {/* ── Tipo ─────────────────────────────────────────────────────── */}
            <section>
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t('sections.type')}
                </h3>
                <Controller
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            <TypeCard
                                value="INDIVIDUAL"
                                label={tFields('typeIndividual')}
                                selected={field.value === 'INDIVIDUAL'}
                                disabled={mode === 'edit' || submitting}
                                onSelect={() => field.onChange('INDIVIDUAL')}
                            />
                            <TypeCard
                                value="BUSINESS"
                                label={tFields('typeBusiness')}
                                selected={field.value === 'BUSINESS'}
                                disabled={mode === 'edit' || submitting}
                                onSelect={() => field.onChange('BUSINESS')}
                            />
                        </div>
                    )}
                />
            </section>

            {/* ── Identificação ───────────────────────────────────────────── */}
            <section>
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t('sections.identification')}
                </h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {isPF ? (
                        <FieldWrapper className="sm:col-span-2">
                            <Label htmlFor="name">{tFields('name')}</Label>
                            <Input
                                id="name"
                                type="text"
                                placeholder={tFields('namePlaceholder')}
                                disabled={submitting}
                                {...form.register('name')}
                            />
                            <FieldError
                                message={form.formState.errors.name?.message as string | undefined}
                            />
                        </FieldWrapper>
                    ) : (
                        <>
                            <FieldWrapper className="sm:col-span-2">
                                <Label htmlFor="legalName">{tFields('legalName')}</Label>
                                <Input
                                    id="legalName"
                                    type="text"
                                    placeholder={tFields('legalNamePlaceholder')}
                                    disabled={submitting}
                                    {...form.register('legalName')}
                                />
                                <FieldError
                                    message={
                                        form.formState.errors.legalName?.message as string | undefined
                                    }
                                />
                            </FieldWrapper>
                            <FieldWrapper className="sm:col-span-2">
                                <Label htmlFor="tradeName">
                                    {tFields('tradeName')}{' '}
                                    <span className="text-muted-foreground">
                                        {tFields('optionalSuffix')}
                                    </span>
                                </Label>
                                <Input
                                    id="tradeName"
                                    type="text"
                                    placeholder={tFields('tradeNamePlaceholder')}
                                    disabled={submitting}
                                    {...form.register('tradeName')}
                                />
                                <FieldError
                                    message={
                                        form.formState.errors.tradeName?.message as string | undefined
                                    }
                                />
                            </FieldWrapper>
                        </>
                    )}
                </div>
            </section>

            {/* ── Documento e contato ─────────────────────────────────────── */}
            <section>
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t('sections.contact')}
                </h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <FieldWrapper>
                        <Label htmlFor="taxId">
                            {tFields('taxId')}{' '}
                            <span className="text-muted-foreground">
                                {tFields('optionalSuffix')}
                            </span>
                        </Label>
                        <Controller
                            control={form.control}
                            name="taxId"
                            render={({ field }) => (
                                <Input
                                    id="taxId"
                                    type="text"
                                    inputMode="numeric"
                                    placeholder={
                                        isPF
                                            ? tFields('taxIdPlaceholderPF')
                                            : tFields('taxIdPlaceholderPJ')
                                    }
                                    value={formatTaxIdInput(
                                        (field.value as string) ?? '',
                                        currentType,
                                    )}
                                    onChange={(e) => {
                                        field.onChange(
                                            e.target.value.replace(/\D/g, ''),
                                        );
                                        // Inline safeParse on submit means RHF
                                        // doesn't auto-revalidate on field
                                        // change. Without this clear, an error
                                        // from a previous submit (e.g. user
                                        // tried 13 digits) persists even after
                                        // they finish typing the 14th — the
                                        // display reads "valid CNPJ but error
                                        // says invalid" until they re-submit.
                                        if (form.formState.errors.taxId) {
                                            form.clearErrors('taxId');
                                        }
                                    }}
                                    disabled={submitting}
                                    className="tabular-nums"
                                />
                            )}
                        />
                        <FieldError
                            message={form.formState.errors.taxId?.message as string | undefined}
                        />
                    </FieldWrapper>

                    <FieldWrapper>
                        <Label htmlFor="email">
                            {tFields('email')}{' '}
                            <span className="text-muted-foreground">
                                {tFields('optionalSuffix')}
                            </span>
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            inputMode="email"
                            placeholder={tFields('emailPlaceholder')}
                            disabled={submitting}
                            {...form.register('email')}
                        />
                        <FieldError
                            message={form.formState.errors.email?.message as string | undefined}
                        />
                    </FieldWrapper>

                    <FieldWrapper className="sm:col-span-2">
                        <Label htmlFor="phone">
                            {tFields('phone')}{' '}
                            <span className="text-muted-foreground">
                                {tFields('optionalSuffix')}
                            </span>
                        </Label>
                        <Input
                            id="phone"
                            type="tel"
                            inputMode="tel"
                            placeholder={tFields('phonePlaceholder')}
                            disabled={submitting}
                            {...form.register('phone')}
                        />
                        <FieldError
                            message={form.formState.errors.phone?.message as string | undefined}
                        />
                    </FieldWrapper>
                </div>
            </section>

            {/* ── Específicos PF/PJ ───────────────────────────────────────── */}
            <section>
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t('sections.specifics')}
                </h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {isPF ? (
                        <FieldWrapper>
                            <Label htmlFor="dateOfBirth">
                                {tFields('dateOfBirth')}{' '}
                                <span className="text-muted-foreground">
                                    {tFields('optionalSuffix')}
                                </span>
                            </Label>
                            <Input
                                id="dateOfBirth"
                                type="date"
                                disabled={submitting}
                                {...form.register('dateOfBirth')}
                            />
                        </FieldWrapper>
                    ) : (
                        <>
                            <FieldWrapper>
                                <Label htmlFor="stateRegistration">
                                    {tFields('stateRegistration')}{' '}
                                    <span className="text-muted-foreground">
                                        {tFields('optionalSuffix')}
                                    </span>
                                </Label>
                                <Input
                                    id="stateRegistration"
                                    type="text"
                                    disabled={submitting}
                                    {...form.register('stateRegistration')}
                                />
                            </FieldWrapper>
                            <FieldWrapper>
                                <Label htmlFor="municipalRegistration">
                                    {tFields('municipalRegistration')}{' '}
                                    <span className="text-muted-foreground">
                                        {tFields('optionalSuffix')}
                                    </span>
                                </Label>
                                <Input
                                    id="municipalRegistration"
                                    type="text"
                                    disabled={submitting}
                                    {...form.register('municipalRegistration')}
                                />
                            </FieldWrapper>
                        </>
                    )}
                </div>
            </section>

            {/* ── Endereço ────────────────────────────────────────────────── */}
            <section>
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t('sections.address')}
                </h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    <FieldWrapper className="sm:col-span-2">
                        <Label htmlFor="addressStreet">{tFields('addressStreet')}</Label>
                        <Input
                            id="addressStreet"
                            type="text"
                            disabled={submitting}
                            {...form.register('addressStreet')}
                        />
                    </FieldWrapper>
                    <FieldWrapper>
                        <Label htmlFor="addressNumber">{tFields('addressNumber')}</Label>
                        <Input
                            id="addressNumber"
                            type="text"
                            disabled={submitting}
                            {...form.register('addressNumber')}
                        />
                    </FieldWrapper>
                    <FieldWrapper className="sm:col-span-2">
                        <Label htmlFor="addressComplement">
                            {tFields('addressComplement')}
                        </Label>
                        <Input
                            id="addressComplement"
                            type="text"
                            disabled={submitting}
                            {...form.register('addressComplement')}
                        />
                    </FieldWrapper>
                    <FieldWrapper>
                        <Label htmlFor="addressNeighborhood">
                            {tFields('addressNeighborhood')}
                        </Label>
                        <Input
                            id="addressNeighborhood"
                            type="text"
                            disabled={submitting}
                            {...form.register('addressNeighborhood')}
                        />
                    </FieldWrapper>
                    <FieldWrapper>
                        <Label htmlFor="addressCity">{tFields('addressCity')}</Label>
                        <Input
                            id="addressCity"
                            type="text"
                            disabled={submitting}
                            {...form.register('addressCity')}
                        />
                    </FieldWrapper>
                    <FieldWrapper>
                        <Label htmlFor="addressState">{tFields('addressState')}</Label>
                        <Input
                            id="addressState"
                            type="text"
                            maxLength={2}
                            disabled={submitting}
                            {...form.register('addressState')}
                            className="uppercase"
                        />
                        <FieldError
                            message={
                                form.formState.errors.addressState?.message as string | undefined
                            }
                        />
                    </FieldWrapper>
                    <FieldWrapper>
                        <Label htmlFor="addressPostalCode">
                            {tFields('addressPostalCode')}
                        </Label>
                        <Input
                            id="addressPostalCode"
                            type="text"
                            disabled={submitting}
                            {...form.register('addressPostalCode')}
                        />
                    </FieldWrapper>
                </div>
            </section>

            {/* ── Campos personalizados ──────────────────────────────────── */}
            {applicableFields.length > 0 ? (
                <section>
                    <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                        {t('sections.customFields')}
                    </h3>
                    <div className="mt-3">
                        <CustomFieldInputs
                            fields={applicableFields}
                            control={form.control}
                            register={form.register}
                            errors={form.formState.errors}
                        />
                    </div>
                </section>
            ) : null}

            {/* ── Observações ─────────────────────────────────────────────── */}
            <section>
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t('sections.notes')}
                </h3>
                <div className="mt-3">
                    <FieldWrapper>
                        <Label htmlFor="notes" className="sr-only">
                            {tFields('notesLabel')}
                        </Label>
                        <Textarea
                            id="notes"
                            rows={3}
                            placeholder={tFields('notesPlaceholder')}
                            disabled={submitting}
                            {...form.register('notes')}
                        />
                        <FieldError
                            message={form.formState.errors.notes?.message as string | undefined}
                        />
                    </FieldWrapper>
                </div>
            </section>

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <div className="sticky bottom-0 -mx-1 -mb-1 flex flex-col-reverse gap-2 border-t bg-card pt-4 sm:flex-row sm:justify-end">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onCancel}
                    disabled={submitting}
                >
                    {t('cancel')}
                </Button>
                <Button type="submit" disabled={submitting}>
                    {submitting
                        ? mode === 'create'
                            ? t('creating')
                            : t('submitting')
                        : mode === 'create'
                            ? t('submitCreate')
                            : t('submitEdit')}
                </Button>
            </div>
        </form>
    );
}

// ── Helpers (UI primitives) ─────────────────────────────────────────────────

function FieldWrapper({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return <div className={cn('flex flex-col gap-1.5', className)}>{children}</div>;
}

function FieldError({ message }: { message: string | undefined }) {
    if (!message) return null;
    return (
        <p role="alert" className="text-sm text-destructive">
            {message}
        </p>
    );
}

function TypeCard({
    label,
    selected,
    disabled,
    onSelect,
}: {
    value: ClientType;
    label: string;
    selected: boolean;
    disabled: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            disabled={disabled}
            aria-pressed={selected}
            className={cn(
                'flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selected
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-input bg-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                disabled && 'cursor-not-allowed opacity-60',
            )}
        >
            {label}
        </button>
    );
}

// ── Helpers (taxId mask, dynamic schema, payload builders) ──────────────────

function formatTaxIdInput(digits: string, type: ClientType): string {
    const d = digits.replace(/\D/g, '');
    if (type === 'INDIVIDUAL') {
        const cap = d.slice(0, 11);
        if (cap.length <= 3) return cap;
        if (cap.length <= 6) return `${cap.slice(0, 3)}.${cap.slice(3)}`;
        if (cap.length <= 9) return `${cap.slice(0, 3)}.${cap.slice(3, 6)}.${cap.slice(6)}`;
        return `${cap.slice(0, 3)}.${cap.slice(3, 6)}.${cap.slice(6, 9)}-${cap.slice(9)}`;
    }
    const cap = d.slice(0, 14);
    if (cap.length <= 2) return cap;
    if (cap.length <= 5) return `${cap.slice(0, 2)}.${cap.slice(2)}`;
    if (cap.length <= 8) return `${cap.slice(0, 2)}.${cap.slice(2, 5)}.${cap.slice(5)}`;
    if (cap.length <= 12)
        return `${cap.slice(0, 2)}.${cap.slice(2, 5)}.${cap.slice(5, 8)}/${cap.slice(8)}`;
    return `${cap.slice(0, 2)}.${cap.slice(2, 5)}.${cap.slice(5, 8)}/${cap.slice(8, 12)}-${cap.slice(12)}`;
}

function buildDefaults(
    mode: 'create' | 'edit',
    initial: ClientDetail | undefined,
    initialFieldValues: ClientFieldValue[],
    applicableFields: CustomFieldListItem[],
): FormValues {
    const fieldDefaults: FormValues = {};
    for (const f of applicableFields) {
        fieldDefaults[fieldKey(f.id)] = pickInitialFieldValue(f, initialFieldValues);
    }

    if (mode === 'create' || !initial) {
        return {
            type: 'INDIVIDUAL',
            name: '',
            legalName: '',
            tradeName: '',
            taxId: '',
            email: '',
            phone: '',
            dateOfBirth: '',
            stateRegistration: '',
            municipalRegistration: '',
            addressStreet: '',
            addressNumber: '',
            addressComplement: '',
            addressNeighborhood: '',
            addressCity: '',
            addressState: '',
            addressPostalCode: '',
            addressCountry: 'BR',
            notes: '',
            ...fieldDefaults,
        };
    }

    return {
        type: initial.type,
        name: initial.name ?? '',
        legalName: initial.legalName ?? '',
        tradeName: initial.tradeName ?? '',
        taxId: initial.taxId ?? '',
        email: initial.email ?? '',
        phone: initial.phone ?? '',
        // dateOfBirth comes back as ISO timestamp; <input type=date> wants
        // YYYY-MM-DD. Slice the date portion off.
        dateOfBirth: initial.dateOfBirth ? initial.dateOfBirth.slice(0, 10) : '',
        stateRegistration: initial.stateRegistration ?? '',
        municipalRegistration: initial.municipalRegistration ?? '',
        addressStreet: initial.addressStreet ?? '',
        addressNumber: initial.addressNumber ?? '',
        addressComplement: initial.addressComplement ?? '',
        addressNeighborhood: initial.addressNeighborhood ?? '',
        addressCity: initial.addressCity ?? '',
        addressState: initial.addressState ?? '',
        addressPostalCode: initial.addressPostalCode ?? '',
        addressCountry: initial.addressCountry ?? 'BR',
        notes: initial.notes ?? '',
        ...fieldDefaults,
    };
}

function pickInitialFieldValue(
    field: CustomFieldListItem,
    fieldValues: ClientFieldValue[],
): unknown {
    const fv = fieldValues.find((v) => v.customFieldId === field.id);
    if (!fv) return field.type === 'BOOLEAN' ? false : field.type === 'MULTISELECT' ? [] : '';

    switch (field.type) {
        case 'NUMBER':
        case 'DECIMAL':
            return fv.valueNumber ?? '';
        case 'BOOLEAN':
            return fv.valueBoolean ?? false;
        case 'DATE':
            return fv.valueDate ? fv.valueDate.slice(0, 10) : '';
        case 'DATETIME':
            return fv.valueDate ?? '';
        case 'MULTISELECT':
            return fv.valueMulti ?? [];
        default:
            return fv.valueText ?? '';
    }
}

function buildDynamicSchema(
    applicableFields: CustomFieldListItem[],
    tErr: (key: string) => string,
) {
    const sharedFields = {
        email: z
            .preprocess((v) => (v === '' ? undefined : v), z.string().email(tErr('emailInvalid')).optional()),
        phone: z.string().max(32, tErr('phoneTooLong')).optional(),
        notes: z.string().max(4096, tErr('notesTooLong')).optional(),
        addressStreet: z.string().max(256).optional(),
        addressNumber: z.string().max(32).optional(),
        addressComplement: z.string().max(128).optional(),
        addressNeighborhood: z.string().max(128).optional(),
        addressCity: z.string().max(128).optional(),
        addressState: z
            .preprocess(
                (v) => (v === '' ? undefined : v),
                z.string().length(2, tErr('addressStateInvalid')).optional(),
            ),
        addressPostalCode: z.string().max(16).optional(),
        addressCountry: z.string().min(2).max(4).optional(),
    };

    const customFieldShape: Record<string, z.ZodTypeAny> = {};
    for (const f of applicableFields) {
        customFieldShape[fieldKey(f.id)] = buildFieldSchema(f);
    }

    return z.discriminatedUnion('type', [
        z.object({
            type: z.literal('INDIVIDUAL'),
            name: z
                .string()
                .trim()
                .min(1, tErr('nameRequired'))
                .max(256, tErr('nameTooLong')),
            dateOfBirth: z.string().optional(),
            taxId: z
                .string()
                .regex(/^(\d{11})?$/, tErr('taxIdInvalidCPF'))
                .optional(),
            // ignored fields (PJ-only) tolerated as strings to keep flat state
            legalName: z.string().optional(),
            tradeName: z.string().optional(),
            stateRegistration: z.string().optional(),
            municipalRegistration: z.string().optional(),
            ...sharedFields,
            ...customFieldShape,
        }),
        z.object({
            type: z.literal('BUSINESS'),
            legalName: z
                .string()
                .trim()
                .min(1, tErr('legalNameRequired'))
                .max(256, tErr('legalNameTooLong')),
            tradeName: z.string().max(256, tErr('tradeNameTooLong')).optional(),
            stateRegistration: z.string().max(64).optional(),
            municipalRegistration: z.string().max(64).optional(),
            taxId: z
                .string()
                .regex(/^(\d{14})?$/, tErr('taxIdInvalidCNPJ'))
                .optional(),
            // ignored (PF-only)
            name: z.string().optional(),
            dateOfBirth: z.string().optional(),
            ...sharedFields,
            ...customFieldShape,
        }),
    ]);
}

function buildFieldSchema(field: CustomFieldListItem): z.ZodTypeAny {
    const t: CustomFieldType = field.type;
    switch (t) {
        case 'NUMBER':
        case 'DECIMAL':
            return z.coerce.number().optional().or(z.literal(''));
        case 'BOOLEAN':
            return z.boolean();
        case 'DATE':
        case 'DATETIME':
            return z.string().optional();
        case 'MULTISELECT':
            return z.array(z.string());
        default:
            return z.string().optional();
    }
}

function buildCreatePayload(
    values: FormValues,
    applicableFields: CustomFieldListItem[],
): CreateClientPayload {
    const type = values.type as ClientType;

    const base: CreateClientPayload = {
        type,
        taxId: emptyToUndef(values.taxId),
        email: emptyToUndef(values.email),
        phone: emptyToUndef(values.phone),
        notes: emptyToUndef(values.notes),
        addressStreet: emptyToUndef(values.addressStreet),
        addressNumber: emptyToUndef(values.addressNumber),
        addressComplement: emptyToUndef(values.addressComplement),
        addressNeighborhood: emptyToUndef(values.addressNeighborhood),
        addressCity: emptyToUndef(values.addressCity),
        addressState: emptyToUndef(
            (values.addressState as string | undefined)?.toUpperCase(),
        ),
        addressPostalCode: emptyToUndef(values.addressPostalCode),
        addressCountry: emptyToUndef(values.addressCountry),
    };

    if (type === 'INDIVIDUAL') {
        base.name = (values.name as string).trim();
        const dob = emptyToUndef(values.dateOfBirth);
        // <input type=date> gives YYYY-MM-DD; backend @IsISO8601() accepts it.
        if (dob) base.dateOfBirth = dob;
    } else {
        base.legalName = (values.legalName as string).trim();
        const trade = emptyToUndef(values.tradeName);
        if (trade) base.tradeName = trade.trim();
        base.stateRegistration = emptyToUndef(values.stateRegistration);
        base.municipalRegistration = emptyToUndef(values.municipalRegistration);
    }

    if (applicableFields.length > 0) {
        const items = buildFieldValueItems(values, applicableFields);
        if (items.length > 0) base.fieldValues = items;
    }

    return base;
}

function buildUpdatePayload(values: FormValues): UpdateClientPayload {
    const type = values.type as ClientType;

    const payload: UpdateClientPayload = {
        taxId: emptyToUndef(values.taxId),
        email: emptyToUndef(values.email),
        phone: emptyToUndef(values.phone),
        notes: emptyToUndef(values.notes),
        addressStreet: emptyToUndef(values.addressStreet),
        addressNumber: emptyToUndef(values.addressNumber),
        addressComplement: emptyToUndef(values.addressComplement),
        addressNeighborhood: emptyToUndef(values.addressNeighborhood),
        addressCity: emptyToUndef(values.addressCity),
        addressState: emptyToUndef(
            (values.addressState as string | undefined)?.toUpperCase(),
        ),
        addressPostalCode: emptyToUndef(values.addressPostalCode),
        addressCountry: emptyToUndef(values.addressCountry),
    };

    if (type === 'INDIVIDUAL') {
        const n = emptyToUndef((values.name as string)?.trim());
        if (n) payload.name = n;
        const dob = emptyToUndef(values.dateOfBirth);
        if (dob) payload.dateOfBirth = dob;
    } else {
        const ln = emptyToUndef((values.legalName as string)?.trim());
        if (ln) payload.legalName = ln;
        const tn = emptyToUndef((values.tradeName as string)?.trim());
        if (tn) payload.tradeName = tn;
        payload.stateRegistration = emptyToUndef(values.stateRegistration);
        payload.municipalRegistration = emptyToUndef(values.municipalRegistration);
    }

    return payload;
}

function buildFieldValueItems(
    values: FormValues,
    applicableFields: CustomFieldListItem[],
): SetFieldValueItem[] {
    const items: SetFieldValueItem[] = [];
    for (const f of applicableFields) {
        const raw = values[fieldKey(f.id)];
        const item = foldFieldValue(f, raw);
        if (item !== null) items.push(item);
    }
    return items;
}

function foldFieldValue(
    field: CustomFieldListItem,
    raw: unknown,
): SetFieldValueItem | null {
    const t: CustomFieldType = field.type;
    const empty = raw === undefined || raw === null || raw === '';

    if (empty) {
        if (t !== 'BOOLEAN' && t !== 'MULTISELECT') return null;
        if (t === 'MULTISELECT' && Array.isArray(raw) && raw.length === 0) return null;
    }

    const base = { customFieldId: field.id };

    switch (t) {
        case 'NUMBER':
        case 'DECIMAL':
            return { ...base, valueNumber: Number(raw) };
        case 'BOOLEAN':
            return { ...base, valueBoolean: Boolean(raw) };
        case 'DATE':
            return { ...base, valueDate: String(raw) };
        case 'DATETIME': {
            const iso = new Date(String(raw)).toISOString();
            return { ...base, valueDate: iso };
        }
        case 'MULTISELECT':
            return {
                ...base,
                valueMulti: Array.isArray(raw) ? (raw as string[]) : [],
            };
        case 'TEXT':
        case 'TEXTAREA':
        case 'PHONE':
        case 'EMAIL':
        case 'URL':
        case 'SELECT':
        case 'FILE':
        default:
            return { ...base, valueText: String(raw) };
    }
}

function emptyToUndef(v: unknown): string | undefined {
    if (typeof v !== 'string') return undefined;
    const trimmed = v.trim();
    return trimmed === '' ? undefined : trimmed;
}
