'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
    Controller,
    type Control,
    type FieldErrors,
    type UseFormRegister,
} from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { CustomFieldListItem, CustomFieldType } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// CustomFieldInputs — renders one input per applicable custom field.
//
// One row per field (P3 — sequencial), except BOOLEAN which inlines the
// label and Switch on the same baseline (vertical real estate isn't worth
// burning on a binary toggle).
//
// FILE is rendered DISABLED with a tooltip — V1 has no upload pipeline.
// The form's submit guard already blocks submission if any FILE field is
// required, so a disabled input here is a visible "nothing to do" rather
// than a dead-end click target.
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_KEY_PREFIX = 'field_' as const;
const fieldKey = (id: string) => `${FIELD_KEY_PREFIX}${id}`;

interface Props {
    fields: CustomFieldListItem[];
    control: Control<Record<string, unknown>>;
    register: UseFormRegister<Record<string, unknown>>;
    errors: FieldErrors;
}

export function CustomFieldInputs({ fields, control, register, errors }: Props) {
    return (
        <div className="flex flex-col gap-4 border-t pt-4">
            {fields.map((field) => {
                const key = fieldKey(field.id);
                const errorMessage = errors[key]?.message as string | undefined;
                return (
                    <FieldRow
                        key={field.id}
                        field={field}
                        control={control}
                        register={register}
                        errorMessage={errorMessage}
                    />
                );
            })}
        </div>
    );
}

function FieldRow({
    field,
    control,
    register,
    errorMessage,
}: {
    field: CustomFieldListItem;
    control: Control<Record<string, unknown>>;
    register: UseFormRegister<Record<string, unknown>>;
    errorMessage: string | undefined;
}) {
    const t = useTranslations('requests.create.fields');
    const tErr = useTranslations('requests.create.errors');
    const inputId = `cf-${field.id}`;
    const key = fieldKey(field.id);

    // BOOLEAN: inline layout (label + Switch on the same row).
    if (field.type === 'BOOLEAN') {
        return (
            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                    <FieldLabelInline field={field} htmlFor={inputId} />
                    <Controller
                        control={control}
                        name={key}
                        defaultValue={false}
                        render={({ field: rhf }) => (
                            <Switch
                                id={inputId}
                                checked={Boolean(rhf.value)}
                                onCheckedChange={rhf.onChange}
                            />
                        )}
                    />
                </div>
                {field.helpText ? (
                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                ) : null}
                <FieldError message={errorMessage} />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1.5">
            <FieldLabelStacked field={field} htmlFor={inputId} />
            {field.helpText ? (
                <p className="text-xs text-muted-foreground">{field.helpText}</p>
            ) : null}

            <FieldInput
                field={field}
                inputId={inputId}
                fieldKey={key}
                control={control}
                register={register}
                tFields={t}
                tErr={tErr}
            />

            <FieldError message={errorMessage} />
        </div>
    );
}

function FieldLabelStacked({
    field,
    htmlFor,
}: {
    field: CustomFieldListItem;
    htmlFor: string;
}) {
    const tFields = useTranslations('requests.create.fields');
    return (
        <Label htmlFor={htmlFor}>
            {field.label}
            {field.isRequired ? (
                <span className="ml-0.5 text-destructive" aria-hidden="true">
                    *
                </span>
            ) : (
                <span className="ml-1 text-muted-foreground">
                    {tFields('optionalSuffix')}
                </span>
            )}
        </Label>
    );
}

function FieldLabelInline({
    field,
    htmlFor,
}: {
    field: CustomFieldListItem;
    htmlFor: string;
}) {
    return (
        <Label htmlFor={htmlFor} className="flex-1">
            {field.label}
            {field.isRequired ? (
                <span className="ml-0.5 text-destructive" aria-hidden="true">
                    *
                </span>
            ) : null}
        </Label>
    );
}

function FieldError({ message }: { message: string | undefined }) {
    if (!message) return null;
    return (
        <p role="alert" className="text-sm text-destructive">
            {message}
        </p>
    );
}

function FieldInput({
    field,
    inputId,
    fieldKey: key,
    control,
    register,
    tFields,
    tErr,
}: {
    field: CustomFieldListItem;
    inputId: string;
    fieldKey: string;
    control: Control<Record<string, unknown>>;
    register: UseFormRegister<Record<string, unknown>>;
    tFields: (k: string) => string;
    tErr: (k: string) => string;
}) {
    const t: CustomFieldType = field.type;

    switch (t) {
        case 'TEXT':
            return (
                <Input
                    id={inputId}
                    type="text"
                    placeholder={field.placeholder ?? undefined}
                    {...register(key)}
                />
            );

        case 'TEXTAREA':
            return (
                <Textarea
                    id={inputId}
                    rows={3}
                    placeholder={field.placeholder ?? undefined}
                    {...register(key)}
                />
            );

        case 'PHONE':
            return (
                <Input
                    id={inputId}
                    type="tel"
                    inputMode="tel"
                    placeholder={field.placeholder ?? undefined}
                    {...register(key)}
                />
            );

        case 'EMAIL':
            return (
                <Input
                    id={inputId}
                    type="email"
                    inputMode="email"
                    placeholder={field.placeholder ?? undefined}
                    {...register(key)}
                />
            );

        case 'URL':
            return (
                <Input
                    id={inputId}
                    type="url"
                    inputMode="url"
                    placeholder={field.placeholder ?? undefined}
                    {...register(key)}
                />
            );

        case 'NUMBER':
            return (
                <Input
                    id={inputId}
                    type="number"
                    inputMode="numeric"
                    step="1"
                    placeholder={field.placeholder ?? undefined}
                    {...register(key)}
                />
            );

        case 'DECIMAL':
            return (
                <Input
                    id={inputId}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    placeholder={field.placeholder ?? undefined}
                    {...register(key)}
                />
            );

        case 'DATE':
            return (
                <Input id={inputId} type="date" {...register(key)} />
            );

        case 'DATETIME':
            return (
                <Input id={inputId} type="datetime-local" {...register(key)} />
            );

        case 'SELECT':
            return (
                <Controller
                    control={control}
                    name={key}
                    defaultValue=""
                    render={({ field: rhf }) => (
                        <Select
                            value={(rhf.value as string) || undefined}
                            onValueChange={rhf.onChange}
                        >
                            <SelectTrigger id={inputId} className="h-10 text-base">
                                <SelectValue placeholder={tFields('selectPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent>
                                {field.options.map((opt) => (
                                    <SelectItem key={opt.id} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                />
            );

        case 'MULTISELECT':
            return (
                <Controller
                    control={control}
                    name={key}
                    defaultValue={[]}
                    render={({ field: rhf }) => (
                        <MultiSelectField
                            inputId={inputId}
                            options={field.options}
                            value={(rhf.value as string[]) ?? []}
                            onChange={rhf.onChange}
                            placeholder={tFields('multiselectPlaceholder')}
                            emptyText={tFields('multiselectEmpty')}
                        />
                    )}
                />
            );

        case 'FILE':
            return (
                <TooltipProvider delayDuration={200}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span tabIndex={0} className="inline-block w-full">
                                <Input
                                    id={inputId}
                                    type="file"
                                    disabled
                                    aria-disabled="true"
                                />
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>{tFields('fileDisabled')}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            );

        default:
            return null;
    }
}

// ── MultiSelectField (Popover + Command + checkable items) ──────────────────

function MultiSelectField({
    inputId,
    options,
    value,
    onChange,
    placeholder,
    emptyText,
}: {
    inputId: string;
    options: CustomFieldListItem['options'];
    value: string[];
    onChange: (next: string[]) => void;
    placeholder: string;
    emptyText: string;
}) {
    const tFields = useTranslations('requests.create.fields');
    const [open, setOpen] = useState(false);

    const toggle = (v: string) => {
        const set = new Set(value);
        if (set.has(v)) set.delete(v);
        else set.add(v);
        onChange(Array.from(set));
    };

    const trigger =
        value.length === 0
            ? placeholder
            : tFields('multiselectSummary', { count: value.length });

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    id={inputId}
                    className={cn(
                        'h-10 w-full justify-between text-base font-normal',
                        value.length === 0 && 'text-muted-foreground',
                    )}
                >
                    <span className="truncate">{trigger}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                    <CommandInput placeholder={placeholder} />
                    <CommandList>
                        <CommandGroup>
                            {options.length === 0 ? (
                                <div className="py-6 text-center text-sm text-muted-foreground">
                                    {emptyText}
                                </div>
                            ) : (
                                options.map((opt) => {
                                    const checked = value.includes(opt.value);
                                    return (
                                        <CommandItem
                                            key={opt.id}
                                            value={opt.label}
                                            onSelect={() => toggle(opt.value)}
                                        >
                                            <Check
                                                className={cn(
                                                    'mr-2 h-4 w-4',
                                                    checked ? 'opacity-100' : 'opacity-0',
                                                )}
                                                aria-hidden="true"
                                            />
                                            {opt.label}
                                        </CommandItem>
                                    );
                                })
                            )}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
