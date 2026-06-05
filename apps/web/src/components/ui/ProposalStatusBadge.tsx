import type { ProposalStatus } from '@/types/domain';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalStatusBadge — proposal lifecycle status pill.
//
// Unlike the request StatusBadge (a derived tri-state), a proposal carries an
// explicit status enum, so this maps the six backend states directly.
//
// Coloring follows P5 (cor com restrição): neutrals dominate, color is reserved
// for the states that change how the operator should act.
//   - DRAFT      neutral   — still being built, not yet sent.
//   - SENT       blue      — out with the client, awaiting a decision.
//   - APPROVED   emerald   — won; the operational happy path.
//   - REJECTED   red       — lost; an event the operator must notice.
//   - EXPIRED    amber     — lapsed without a decision; soft warning.
//   - CANCELLED  muted     — withdrawn internally; dead but not alarming.
//
// Labels are hardcoded PT-BR here to mirror the existing StatusBadge primitive
// (the design-system convention treats status labels as part of the component,
// not page microcopy). Sizing matches StatusBadge so the two read as siblings.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ProposalStatus, { label: string; className: string }> = {
    DRAFT: {
        label: 'Rascunho',
        className: 'bg-secondary text-secondary-foreground ring-1 ring-border',
    },
    SENT: {
        label: 'Enviada',
        className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    },
    APPROVED: {
        label: 'Aprovada',
        className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    },
    REJECTED: {
        label: 'Recusada',
        className: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    },
    EXPIRED: {
        label: 'Expirada',
        className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    },
    CANCELLED: {
        label: 'Cancelada',
        className: 'bg-muted text-muted-foreground ring-1 ring-border',
    },
};

export function ProposalStatusBadge({
    status,
    className,
}: {
    status: ProposalStatus;
    className?: string;
}) {
    const { label, className: statusClass } = STATUS_CONFIG[status];
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                statusClass,
                className,
            )}
        >
            {label}
        </span>
    );
}
