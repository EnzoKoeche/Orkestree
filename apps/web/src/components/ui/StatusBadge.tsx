import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge — request-level status pill.
//
// Three states only, derived from (isCancelled, currentStage.isFinal):
//   - cancelled    : isCancelled = true                  → red
//   - completed    : currentStage.isFinal = true         → emerald
//   - in_progress  : everything else                     → neutral
//
// Stage granularity (Triagem / Modelagem / Imprimindo / …) lives in the Stage
// column. This badge is the operator's macro signal: is the request live, done,
// or dead? Coloring is intentional — status colors are events (P5: cor com
// restrição), so neutrals dominate and red/emerald are reserved for the two
// terminal states that change how the operator should act.
//
// Sizing is small (text-xs, px-2 py-0.5) to sit comfortably inside table rows
// without dominating the row. ring-1 + tinted bg gives the badge structure
// without depending on shadow, which would clash with the table's rest density.
// ─────────────────────────────────────────────────────────────────────────────

export type RequestStatus = 'in_progress' | 'completed' | 'cancelled';

const STATUS_CONFIG: Record<RequestStatus, { label: string; className: string }> = {
    in_progress: {
        label: 'Em andamento',
        className: 'bg-secondary text-secondary-foreground ring-1 ring-border',
    },
    completed: {
        label: 'Concluído',
        className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    },
    cancelled: {
        label: 'Cancelado',
        className: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    },
};

export function StatusBadge({
    status,
    className,
}: {
    status: RequestStatus;
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

/**
 * Derives the macro status from the request shape returned by the list endpoint.
 * Kept colocated with StatusBadge so the mapping is one file: change the tri-state
 * here, the badge follows automatically.
 */
export function deriveRequestStatus(req: {
    isCancelled: boolean;
    currentStage: { isFinal: boolean };
}): RequestStatus {
    if (req.isCancelled) return 'cancelled';
    if (req.currentStage.isFinal) return 'completed';
    return 'in_progress';
}
