'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from './cn';

// ─────────────────────────────────────────────────────────────────────────────
// Button
//
// Three intents (primary / secondary / ghost) × two tones (neutral / danger)
// covers everything in the operator UI. New variants must justify themselves
// before being added — divergence here is the easiest way to make pages look
// inconsistent.
// ─────────────────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost';
type Tone = 'neutral' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    tone?: Tone;
    size?: Size;
    /** Show a small spinner and disable the button. */
    loading?: boolean;
}

const SIZES: Record<Size, string> = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
};

function classesFor(variant: Variant, tone: Tone, disabled: boolean): string {
    const base =
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition focus-ring border';
    const disabledCls = disabled
        ? 'opacity-50 cursor-not-allowed pointer-events-none'
        : '';

    if (variant === 'primary') {
        if (tone === 'danger') {
            return cn(
                base,
                disabledCls,
                'bg-state-danger text-white border-state-danger hover:bg-red-700',
            );
        }
        return cn(
            base,
            disabledCls,
            'bg-accent text-accent-contrast border-accent hover:bg-accent-soft',
        );
    }

    if (variant === 'secondary') {
        if (tone === 'danger') {
            return cn(
                base,
                disabledCls,
                'bg-state-danger-bg text-state-danger border-red-200 hover:bg-red-100',
            );
        }
        return cn(
            base,
            disabledCls,
            'bg-surface-base text-ink border-border hover:bg-surface-sunken',
        );
    }

    // ghost
    if (tone === 'danger') {
        return cn(
            base,
            disabledCls,
            'bg-transparent text-state-danger border-transparent hover:bg-state-danger-bg',
        );
    }
    return cn(
        base,
        disabledCls,
        'bg-transparent text-ink-muted border-transparent hover:bg-surface-sunken hover:text-ink',
    );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    {
        variant = 'secondary',
        tone = 'neutral',
        size = 'md',
        loading = false,
        disabled,
        className,
        children,
        type = 'button',
        ...rest
    },
    ref,
) {
    const isDisabled = disabled || loading;
    return (
        <button
            ref={ref}
            type={type}
            disabled={isDisabled}
            aria-busy={loading || undefined}
            className={cn(SIZES[size], classesFor(variant, tone, !!isDisabled), className)}
            {...rest}
        >
            {loading ? (
                <span
                    className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
                    aria-hidden
                />
            ) : null}
            <span className="truncate">{children}</span>
        </button>
    );
});
