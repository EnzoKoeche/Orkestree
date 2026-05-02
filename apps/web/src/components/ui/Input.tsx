'use client';

import { InputHTMLAttributes, forwardRef, ReactNode, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

// ─────────────────────────────────────────────────────────────────────────────
// Form primitives — Input / Textarea / Field
//
// Field handles the label + helper / error layout so every form across the
// app reads the same. Keep these dumb: validation lives at the form level,
// not inside the primitive.
// ─────────────────────────────────────────────────────────────────────────────

const inputBase =
    'w-full rounded-md border border-border bg-surface-base px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-ring disabled:bg-surface-sunken disabled:text-ink-subtle';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> { }

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { className, ...rest },
    ref,
) {
    return <input ref={ref} className={cn(inputBase, className)} {...rest} />;
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
    { className, rows = 4, ...rest },
    ref,
) {
    return (
        <textarea
            ref={ref}
            rows={rows}
            className={cn(inputBase, 'resize-y leading-snug', className)}
            {...rest}
        />
    );
});

export interface FieldProps {
    label?: ReactNode;
    htmlFor?: string;
    helper?: ReactNode;
    error?: ReactNode;
    children: ReactNode;
}

export function Field({ label, htmlFor, helper, error, children }: FieldProps) {
    return (
        <div className="flex flex-col gap-1.5">
            {label ? (
                <label
                    htmlFor={htmlFor}
                    className="text-xs font-medium uppercase tracking-wide text-ink-subtle"
                >
                    {label}
                </label>
            ) : null}
            {children}
            {error ? (
                <p className="text-xs text-state-danger">{error}</p>
            ) : helper ? (
                <p className="text-xs text-ink-subtle">{helper}</p>
            ) : null}
        </div>
    );
}

export interface SelectProps extends InputHTMLAttributes<HTMLSelectElement> { }

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
    { className, children, ...rest },
    ref,
) {
    // Native select is intentional — predictable, accessible, no hidden
    // ARIA quirks. Replace with a custom listbox only when we need search
    // / multi-select, never sooner.
    return (
        <select
            ref={ref}
            className={cn(inputBase, 'pr-8', className)}
            {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
        >
            {children}
        </select>
    );
});
