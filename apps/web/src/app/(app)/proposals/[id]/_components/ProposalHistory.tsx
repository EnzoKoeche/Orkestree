import { getTranslations } from 'next-intl/server';
import { DateCell } from '@/components/ui/DateCell';
import { ProposalStatusBadge } from '@/components/ui/ProposalStatusBadge';
import type { MembershipRef, ProposalStatusHistoryEntry } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalHistory — the proposal's status timeline.
//
// Internal-only: the backend strips statusHistory from the CLIENTE projection,
// so this only ever renders for internal roles. Entries arrive ordered ASC
// (creation → now). The first row has fromStatus = null (the DRAFT placement
// at creation); we render just the target badge there.
// ─────────────────────────────────────────────────────────────────────────────

function memberName(m: MembershipRef): string {
    return `${m.user.firstName} ${m.user.lastName}`.trim() || m.user.firstName;
}

export async function ProposalHistory({
    entries,
}: {
    entries: ProposalStatusHistoryEntry[];
}) {
    const t = await getTranslations('proposals.detail.history');

    if (entries.length === 0) return null;

    return (
        <section aria-labelledby="proposal-history-heading">
            <h2 id="proposal-history-heading" className="mb-3 text-sm font-semibold text-foreground">
                {t('title')}
            </h2>

            <ol className="overflow-hidden rounded-md border bg-card">
                {entries.map((entry, index) => (
                    <li
                        key={entry.id}
                        className={
                            'flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm' +
                            (index > 0 ? ' border-t' : '')
                        }
                    >
                        <div className="flex items-center gap-2">
                            {entry.fromStatus ? (
                                <>
                                    <ProposalStatusBadge status={entry.fromStatus} />
                                    <span aria-hidden className="text-muted-foreground">
                                        →
                                    </span>
                                </>
                            ) : null}
                            <ProposalStatusBadge status={entry.toStatus} />
                        </div>

                        <span className="text-muted-foreground">
                            {t('by', { name: memberName(entry.actorMembership) })}
                        </span>

                        <span className="ml-auto text-muted-foreground">
                            <DateCell iso={entry.createdAt} />
                        </span>

                        {entry.note ? (
                            <p className="w-full text-muted-foreground">{entry.note}</p>
                        ) : null}
                    </li>
                ))}
            </ol>
        </section>
    );
}
