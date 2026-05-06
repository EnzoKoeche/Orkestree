import { ArrowRight, UserPlus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { DateCell } from '@/components/ui/DateCell';
import type {
    MembershipRef,
    RequestAssignmentEntry,
    RequestStageHistoryEntry,
    ServiceRequestDetail,
} from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// HistoryTab — interleaved event log of stage transitions and assignment
// changes, ordered DESC (most recent first).
//
// Different from WorkflowTab's "por onde passou" forward narrative: this is
// the audit-style timeline. Operator who needs "who did what, when" reads
// this; operator who needs "what's the current shape of the workflow"
// reads Workflow tab.
// ─────────────────────────────────────────────────────────────────────────────

type StageEvent = {
    kind: 'stage';
    id: string;
    createdAt: string;
    entry: RequestStageHistoryEntry;
};
type AssignEvent = {
    kind: 'assign';
    id: string;
    createdAt: string;
    entry: RequestAssignmentEntry;
};
type Event = StageEvent | AssignEvent;

function memberName(m: MembershipRef | null): string {
    if (!m) return '—';
    return `${m.user.firstName} ${m.user.lastName}`.trim() || m.user.firstName;
}

export async function HistoryTab({ request }: { request: ServiceRequestDetail }) {
    const t = await getTranslations('requests.detail.history');

    // Build a stageId → name index from history.toStage entries. Any non-initial
    // transition's fromStageId was a toStageId on some earlier row, so this
    // covers the full lookup table without needing the workflow definition.
    const stageNameById = new Map<string, string>();
    for (const h of request.stageHistory) {
        stageNameById.set(h.toStage.id, h.toStage.name);
    }

    const events: Event[] = [
        ...request.stageHistory.map<StageEvent>((entry) => ({
            kind: 'stage',
            id: `stage-${entry.id}`,
            createdAt: entry.createdAt,
            entry,
        })),
        ...request.assignments.map<AssignEvent>((entry) => ({
            kind: 'assign',
            id: `assign-${entry.id}`,
            createdAt: entry.createdAt,
            entry,
        })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (events.length === 0) {
        return (
            <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
                {t('empty')}
            </div>
        );
    }

    return (
        <ol className="space-y-3 rounded-md border bg-card p-6">
            {events.map((event) => (
                <li key={event.id} className="flex gap-3">
                    <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                        aria-hidden="true"
                    >
                        {event.kind === 'stage' ? (
                            <ArrowRight className="h-3.5 w-3.5" />
                        ) : (
                            <UserPlus className="h-3.5 w-3.5" />
                        )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5">
                        <span className="text-sm text-foreground">
                            {event.kind === 'stage'
                                ? renderStageLabel(event.entry, stageNameById, t)
                                : t('assigned', {
                                      member: memberName(event.entry.membership),
                                  })}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {t('by', {
                                actor:
                                    event.kind === 'stage'
                                        ? memberName(event.entry.actorMembership)
                                        : memberName(event.entry.assignedByMembership),
                            })}
                            {' · '}
                            <DateCell
                                iso={event.createdAt}
                                className="text-xs text-muted-foreground"
                            />
                        </span>
                    </div>
                </li>
            ))}
        </ol>
    );
}

function renderStageLabel(
    entry: RequestStageHistoryEntry,
    stageNameById: Map<string, string>,
    t: (key: string, values?: Record<string, string>) => string,
): string {
    if (entry.fromStageId === null) {
        return t('stageInitial', { to: entry.toStage.name });
    }
    const fromName = stageNameById.get(entry.fromStageId) ?? '—';
    return t('stageMoved', { from: fromName, to: entry.toStage.name });
}
