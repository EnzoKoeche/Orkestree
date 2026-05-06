import { getTranslations } from 'next-intl/server';
import { DateCell } from '@/components/ui/DateCell';
import { StatusBadge, deriveRequestStatus } from '@/components/ui/StatusBadge';
import type { MembershipRef, ServiceRequestDetail } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// RequestDetailHeader — top of the detail page (number + status + title +
// info row). Action buttons (Mover para…, Cancelar) land in Commits C/D and
// will plug into the action zone reserved on the right of this header.
//
// Hierarchy (P2):
//   1. Title (text-2xl semibold) — the operator's anchor.
//   2. Number + StatusBadge inline above title — secondary, status-at-a-glance.
//   3. Info row (text-sm muted) — tertiary, scannable but not loud.
// ─────────────────────────────────────────────────────────────────────────────

function memberName(m: MembershipRef | null): string | null {
    if (!m) return null;
    return `${m.user.firstName} ${m.user.lastName}`.trim() || m.user.firstName;
}

export async function RequestDetailHeader({
    request,
}: {
    request: ServiceRequestDetail;
}) {
    const t = await getTranslations('requests.detail.header');

    const assignee = memberName(request.assignedMembership);
    const creator = memberName(request.createdByMembership);

    return (
        <header className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
                <span className="font-medium tabular-nums text-muted-foreground">
                    #{request.number}
                </span>
                <StatusBadge status={deriveRequestStatus(request)} />
            </div>

            <h1 className="text-2xl font-semibold leading-tight text-foreground">
                {request.title}
            </h1>

            <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <InfoItem
                    label={t('type')}
                    value={request.serviceType.name}
                />
                <InfoItem
                    label={t('client')}
                    value={request.client?.name ?? null}
                />
                <InfoItem
                    label={t('assignee')}
                    value={assignee}
                />
                <InfoItem
                    label={t('createdBy')}
                    value={creator}
                />
                <div className="inline-flex items-baseline gap-2">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t('createdAt')}
                    </dt>
                    <dd>
                        <DateCell iso={request.createdAt} />
                    </dd>
                </div>
            </dl>
        </header>
    );
}

function InfoItem({ label, value }: { label: string; value: string | null }) {
    return (
        <div className="inline-flex items-baseline gap-2">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {label}
            </dt>
            <dd className="text-sm text-foreground">
                {value ?? <span className="text-muted-foreground">—</span>}
            </dd>
        </div>
    );
}
