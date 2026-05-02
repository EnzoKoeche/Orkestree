import { ReactNode } from 'react';
import { cn } from './cn';

// ─────────────────────────────────────────────────────────────────────────────
// Table primitives
//
// Hand-rolled because every list page in this app has a slightly different
// column shape. The components are dumb wrappers around <table> with the
// shared styling baked in — no header-cell column metadata, no row keys.
// Each page composes them with its own row component.
// ─────────────────────────────────────────────────────────────────────────────

export function Table({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('overflow-x-auto', className)}>
            <table className="w-full border-collapse text-sm">{children}</table>
        </div>
    );
}

Table.Head = function THead({ children }: { children: ReactNode }) {
    return (
        <thead className="border-b border-border bg-surface-sunken text-left text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            {children}
        </thead>
    );
};

Table.Body = function TBody({ children }: { children: ReactNode }) {
    return <tbody>{children}</tbody>;
};

Table.Row = function TRow({
    children,
    onClick,
    className,
}: {
    children: ReactNode;
    onClick?: () => void;
    className?: string;
}) {
    return (
        <tr
            onClick={onClick}
            className={cn(
                'border-b border-border last:border-0',
                onClick && 'cursor-pointer transition hover:bg-surface-sunken',
                className,
            )}
        >
            {children}
        </tr>
    );
};

Table.Cell = function TCell({
    children,
    className,
    align = 'left',
    head,
}: {
    children?: ReactNode;
    className?: string;
    align?: 'left' | 'right' | 'center';
    head?: boolean;
}) {
    const Tag = head ? 'th' : 'td';
    const alignCls =
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    return (
        <Tag
            className={cn(
                'px-4 py-3 align-middle',
                head ? 'font-semibold' : 'text-ink',
                alignCls,
                className,
            )}
        >
            {children ?? <span className="text-ink-faint">—</span>}
        </Tag>
    );
};
