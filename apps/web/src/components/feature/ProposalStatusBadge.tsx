import { Badge, BadgeTone } from '@/components/ui/Badge';
import { ProposalStatus } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalStatusBadge
//
// Single source of truth for "what color is status X?". Pages must NOT
// hand-roll their own mapping — that's how we end up with a green REJECTED
// in one corner of the app.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<ProposalStatus, BadgeTone> = {
    DRAFT: 'neutral',
    SENT: 'info',
    APPROVED: 'success',
    REJECTED: 'danger',
    EXPIRED: 'warning',
    CANCELLED: 'neutral',
};

const STATUS_LABEL: Record<ProposalStatus, string> = {
    DRAFT: 'Draft',
    SENT: 'Sent',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    EXPIRED: 'Expired',
    CANCELLED: 'Cancelled',
};

export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
    return (
        <Badge tone={STATUS_TONE[status]} dot>
            {STATUS_LABEL[status]}
        </Badge>
    );
}

export function proposalStatusLabel(status: ProposalStatus): string {
    return STATUS_LABEL[status];
}
