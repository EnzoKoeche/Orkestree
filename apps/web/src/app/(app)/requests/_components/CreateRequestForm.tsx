'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { requestsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import type {
    CreateServiceRequestPayload,
    CustomFieldListItem,
    CustomFieldType,
    SetFieldValueItem,
    ServiceTypeListItem,
} from '@/types/domain';
import { ClientCombobox } from './ClientCombobox';
import { CustomFieldInputs } from './CustomFieldInputs';
import { ServiceTypeSelect } from './ServiceTypeSelect';

// ─────────────────────────────────────────────────────────────────────────────
// CreateRequestForm — zod schema is dynamic per selected serviceTypeId.
//
// Architecture:
//   1. The dialog hands us pre-loaded serviceTypes and the FULL custom
//      field list (target=REQUEST, isActive=true). The form decides which
//      fields are applicable: serviceType === null (global) OR
//      serviceType.id === selectedServiceTypeId.
//   2. The form's RHF state is FLAT: serviceTypeId, clientId, title,
//      description, plus `field_<id>` keys for each applicable custom
//      field. On submit, those flat keys are folded into the API's
//      fieldValues[] shape via foldFieldValues().
//   3. The zod schema is rebuilt every render from the applicable list.
//      That's cheap, and it means changing serviceType mid-form
//      automatically tightens/relaxes validation without re-mounting RHF.
//
// FILE field defensive guard:
//   If any applicable field is type=FILE and isRequired=true, we BLOCK
//   submit with an honest error — V1 has no upload infra. Realistically
//   the seed has zero such fields, but this avoids silent surprises if a
//   future tenant configures one.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    companyId: string;
    serviceTypes: ServiceTypeListItem[];
    customFields: CustomFieldListItem[];
    onSuccess: () => void;
    onCancel: () => void;
}

const FIELD_KEY_PREFIX = 'field_' as const;
const fieldKey = (id: string) => `${FIELD_KEY_PREFIX}${id}`;

export function CreateRequestForm({
    companyId,
    serviceTypes,
    customFields,
    onSuccess,
    onCancel,
}: Props) {
    const t = useTranslations('requests.create');
    const tErr = useTranslations('requests.create.errors');
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);

    const form = useForm<Record<string, unknown>>({
        defaultValues: {
            serviceTypeId: '',
            clientId: '',
            title: '',
            description: '',
        },
        // Resolver is computed inside `onSubmit` so the schema reflects the
        // currently-selected serviceType. RHF re-runs validation on every
        // submit attempt with the latest schema.
        mode: 'onSubmit',
    });

    const selectedServiceTypeId =
        (form.watch('serviceTypeId') as string | undefined) ?? '';

    const applicableFields = useMemo(
        () =>
            customFields
                .filter((f) => f.isActive)
                .filter(
                    (f) =>
                        f.serviceType === null ||
                        f.serviceType.id === selectedServiceTypeId,
                )
                .sort((a, b) => {
                    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
                    return a.label.localeCompare(b.label);
                }),
        [customFields, selectedServiceTypeId],
    );

    const fileRequiredBlocked = applicableFields.some(
        (f) => f.type === 'FILE' && f.isRequired,
    );

    const buildSchema = () => buildDynamicSchema(applicableFields, tErr);

    const onSubmit = form.handleSubmit(async (rawValues) => {
        if (fileRequiredBlocked) {
            toast.error(tErr('fileRequiredBlocked'));
            return;
        }

        // Validate against the dynamic schema. We do this inline (rather than
        // via resolver: zodResolver(...)) because applicableFields can change
        // mid-render and a stale resolver could pass invalid data.
        const schema = buildSchema();
        const parsed = schema.safeParse(rawValues);
        if (!parsed.success) {
            // Surface first error per field via RHF's error map.
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

        const payload = buildPayload(parsed.data, applicableFields);

        setSubmitting(true);
        try {
            const created = await requestsApi.create(companyId, payload);
            onSuccess();
            router.push(`/requests/${created.id}`);
        } catch (err) {
            const msg =
                err instanceof ApiError ? err.toUserMessage() : tErr('createFailed');
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    });

    return (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="serviceTypeId">{t('fields.serviceType')}</Label>
                <Controller
                    control={form.control}
                    name="serviceTypeId"
                    render={({ field }) => (
                        <ServiceTypeSelect
                            id="serviceTypeId"
                            value={field.value as string}
                            onValueChange={field.onChange}
                            serviceTypes={serviceTypes}
                            placeholder={t('fields.serviceTypePlaceholder')}
                        />
                    )}
                />
                <FieldError message={form.formState.errors.serviceTypeId?.message as string | undefined} />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label>
                    {t('fields.client')}{' '}
                    <span className="text-muted-foreground">{t('fields.optionalSuffix')}</span>
                </Label>
                <Controller
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                        <ClientCombobox
                            companyId={companyId}
                            value={(field.value as string) || null}
                            onChange={(next) => field.onChange(next ?? '')}
                        />
                    )}
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor="title">{t('fields.title')}</Label>
                <Input
                    id="title"
                    type="text"
                    placeholder={t('fields.titlePlaceholder')}
                    {...form.register('title')}
                />
                <FieldError message={form.formState.errors.title?.message as string | undefined} />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor="description">
                    {t('fields.description')}{' '}
                    <span className="text-muted-foreground">{t('fields.optionalSuffix')}</span>
                </Label>
                <Textarea
                    id="description"
                    rows={3}
                    placeholder={t('fields.descriptionPlaceholder')}
                    {...form.register('description')}
                />
                <FieldError message={form.formState.errors.description?.message as string | undefined} />
            </div>

            {applicableFields.length > 0 ? (
                <CustomFieldInputs
                    fields={applicableFields}
                    control={form.control}
                    register={form.register}
                    errors={form.formState.errors}
                />
            ) : null}

            <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onCancel}
                    disabled={submitting}
                >
                    {t('cancel')}
                </Button>
                <Button type="submit" disabled={submitting || fileRequiredBlocked}>
                    {submitting ? t('submitting') : t('submit')}
                </Button>
            </div>
        </form>
    );
}

function FieldError({ message }: { message?: string | undefined }) {
    if (!message) return null;
    return (
        <p role="alert" className="text-sm text-destructive">
            {message}
        </p>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic zod schema construction
// ─────────────────────────────────────────────────────────────────────────────

function buildDynamicSchema(
    applicableFields: CustomFieldListItem[],
    tErr: (key: string) => string,
) {
    const shape: Record<string, z.ZodTypeAny> = {
        serviceTypeId: z
            .string()
            .min(1, tErr('serviceTypeRequired')),
        // clientId is optional on the wire; '' from the form maps to undefined.
        clientId: z.string().optional(),
        title: z
            .string()
            .trim()
            .min(1, tErr('titleRequired'))
            .max(256, tErr('titleTooLong')),
        description: z
            .string()
            .max(4096, tErr('descriptionTooLong'))
            .optional(),
    };

    for (const f of applicableFields) {
        shape[fieldKey(f.id)] = buildFieldSchema(f, tErr);
    }

    return z.object(shape);
}

function buildFieldSchema(
    field: CustomFieldListItem,
    tErr: (key: string) => string,
): z.ZodTypeAny {
    const t: CustomFieldType = field.type;
    const required = field.isRequired;

    switch (t) {
        case 'TEXT':
        case 'TEXTAREA':
        case 'PHONE':
        case 'FILE': {
            // FILE-required is blocked upstream; here we just type as text.
            const base = z.string();
            return required
                ? base.trim().min(1, tErr('fieldRequired'))
                : base.optional();
        }

        case 'EMAIL': {
            const base = z.string().email(tErr('emailInvalid'));
            return required
                ? base
                : z
                      .string()
                      .optional()
                      .refine(
                          (v) => v === undefined || v === '' || z.string().email().safeParse(v).success,
                          { message: tErr('emailInvalid') },
                      );
        }

        case 'URL': {
            const base = z.string().url(tErr('urlInvalid'));
            return required
                ? base
                : z
                      .string()
                      .optional()
                      .refine(
                          (v) => v === undefined || v === '' || z.string().url().safeParse(v).success,
                          { message: tErr('urlInvalid') },
                      );
        }

        case 'NUMBER': {
            const base = z.coerce
                .number({ invalid_type_error: tErr('numberInvalid') })
                .int(tErr('integerInvalid'));
            return required ? base : base.optional();
        }

        case 'DECIMAL': {
            const base = z.coerce.number({
                invalid_type_error: tErr('numberInvalid'),
            });
            return required ? base : base.optional();
        }

        case 'DATE':
        case 'DATETIME': {
            const base = z.string();
            return required
                ? base.min(1, tErr('fieldRequired'))
                : base.optional();
        }

        case 'BOOLEAN': {
            // Native boolean — checkbox/Switch always submits true|false, so
            // "required" semantics don't apply (a Switch is never undefined).
            return z.boolean();
        }

        case 'SELECT': {
            const valid = new Set(field.options.map((o) => o.value));
            const base = z
                .string()
                .refine((v) => valid.has(v), tErr('selectInvalid'));
            return required
                ? base
                : z
                      .string()
                      .optional()
                      .refine((v) => v === undefined || v === '' || valid.has(v), {
                          message: tErr('selectInvalid'),
                      });
        }

        case 'MULTISELECT': {
            const valid = new Set(field.options.map((o) => o.value));
            // .min() must be applied to the ZodArray before .refine() (which
            // returns ZodEffects, no .min()).
            const base = required
                ? z.array(z.string()).min(1, tErr('fieldRequired'))
                : z.array(z.string());
            return base.refine(
                (arr) => arr.every((v) => valid.has(v)),
                tErr('multiselectInvalid'),
            );
        }

        default:
            return z.unknown().optional();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Flat form state → API payload
// ─────────────────────────────────────────────────────────────────────────────

function buildPayload(
    values: Record<string, unknown>,
    applicableFields: CustomFieldListItem[],
): CreateServiceRequestPayload {
    const fieldValues: SetFieldValueItem[] = [];

    for (const field of applicableFields) {
        const raw = values[fieldKey(field.id)];
        const item = foldFieldValue(field, raw);
        if (item !== null) fieldValues.push(item);
    }

    const clientId = (values.clientId as string) || undefined;
    const description = (values.description as string)?.trim() || undefined;

    return {
        serviceTypeId: values.serviceTypeId as string,
        clientId,
        title: (values.title as string).trim(),
        description,
        fieldValues: fieldValues.length > 0 ? fieldValues : undefined,
    };
}

function foldFieldValue(
    field: CustomFieldListItem,
    raw: unknown,
): SetFieldValueItem | null {
    const t: CustomFieldType = field.type;
    const empty = raw === undefined || raw === null || raw === '';

    if (empty) {
        // Optional fields left blank — omit entirely. Required ones never
        // reach here because zod blocks submit upstream.
        if (t !== 'BOOLEAN' && t !== 'MULTISELECT') return null;
        if (t === 'MULTISELECT' && Array.isArray(raw) && raw.length === 0) return null;
    }

    const base = { customFieldId: field.id };

    switch (t) {
        case 'TEXT':
        case 'TEXTAREA':
        case 'PHONE':
        case 'EMAIL':
        case 'URL':
        case 'SELECT':
        case 'FILE':
            return { ...base, valueText: String(raw) };

        case 'NUMBER':
        case 'DECIMAL':
            return { ...base, valueNumber: Number(raw) };

        case 'BOOLEAN':
            return { ...base, valueBoolean: Boolean(raw) };

        case 'DATE': {
            // <input type="date"> gives "YYYY-MM-DD". Send as-is — backend
            // validates ISO8601 and stores as DateTime at 00:00 UTC.
            return { ...base, valueDate: String(raw) };
        }

        case 'DATETIME': {
            // <input type="datetime-local"> gives "YYYY-MM-DDTHH:mm" without
            // timezone. Convert to ISO so backend's @IsISO8601 passes.
            const iso = new Date(String(raw)).toISOString();
            return { ...base, valueDate: iso };
        }

        case 'MULTISELECT':
            return { ...base, valueMulti: Array.isArray(raw) ? (raw as string[]) : [] };

        default:
            return null;
    }
}
