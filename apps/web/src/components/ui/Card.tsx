import { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

// Card / SectionHeader: structural primitives for a page detail view.
//
// `Card` is just a bordered surface — no opinionated padding so dense lists
// and detail panels can compose it differently. Nest a `Card.Header` /
// `Card.Body` for the typical pattern.

interface CardProps extends HTMLAttributes<HTMLDivElement> { }

export function Card({ className, ...rest }: CardProps) {
    return (
        <div
            className={cn(
                'rounded-lg border border-border bg-surface-base shadow-card',
                className,
            )}
            {...rest}
        />
    );
}

Card.Header = function CardHeader({
    title,
    description,
    actions,
    className,
}: {
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex items-start justify-between gap-4 border-b border-border px-5 py-4',
                className,
            )}
        >
            <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
                {description ? (
                    <p className="mt-0.5 text-sm text-ink-subtle">{description}</p>
                ) : null}
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
    );
};

Card.Body = function CardBody({
    className,
    children,
    padded = true,
}: {
    className?: string;
    children: ReactNode;
    padded?: boolean;
}) {
    return (
        <div className={cn(padded && 'px-5 py-4', className)}>{children}</div>
    );
};

Card.Footer = function CardFooter({
    className,
    children,
}: {
    className?: string;
    children: ReactNode;
}) {
    return (
        <div
            className={cn(
                'flex items-center justify-end gap-2 border-t border-border bg-surface-sunken px-5 py-3',
                className,
            )}
        >
            {children}
        </div>
    );
};
