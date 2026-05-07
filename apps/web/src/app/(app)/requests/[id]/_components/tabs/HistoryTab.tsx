import { ArrowRight, UserPlus, XCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { DateCell } from '@/components/ui/DateCell';
import { cn } from '@/lib/utils';
import type {
    MembershipRef,
    RequestAssignmentEntry,
    RequestStageHistoryEntry,
    ServiceRequestDetail,
} from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// HistoryTab — interleaved event log of stage transitions, assignment
// changes, and cancellations, ordered DESC (most recent first).
//
// Different from WorkflowTab's "por onde passou" forward narrative: this is
// the audit-style timeline. Operator who needs "who did what, when" reads
// this; operator who needs "what's the current shape of the workflow"
// reads Workflow tab.
//
// Cancel event is SYNTHETIC: backend's cancelServiceRequest is correct
// architecturally — cancel is a flag toggle, not a stage transition, so it
// does NOT write to RequestStageHistory by design. The frontend reconstructs
// a timeline-style entry from request.isCancelled + cancellationReason +
// updatedAt. Actor is omitted in V1 because DETAIL_SELECT doesn't expose
// cancelledByMembership (follow-up task — backend adds cancelledByMembershipId
// + cancelledAt to the schema, then frontend can fold a "por X" line in).
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
type CancelEvent = {
    kind: 'cancel';
    id: 'cancel';
    createdAt: string;
    /** request.cancellationReason. null when operator cancelled without
     *  providing a reason (form is optional). */
    reason: string | null;
};
type Event = StageEvent | AssignEvent | CancelEvent;

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
        ...(request.isCancelled
            ? [
                  {
                      kind: 'cancel',
                      id: 'cancel',
                      // updatedAt as a proxy for cancelledAt — backend doesn't
                      // persist a dedicated cancelledAt column, but cancel
                      // bumps updatedAt and blocks subsequent mutations, so
                      // updatedAt ≈ cancelledAt at read time.
                      createdAt: request.updatedAt,
                      reason: request.cancellationReason,
                  } satisfies CancelEvent,
              ]
            : []),
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
                        className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                            event.kind === 'cancel'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-muted text-muted-foreground',
                        )}
                        aria-hidden="true"
                    >
                        {event.kind === 'stage' ? (
                            <ArrowRight className="h-3.5 w-3.5" />
                        ) : event.kind === 'assign' ? (
                            <UserPlus className="h-3.5 w-3.5" />
                        ) : (
                            <XCircle className="h-3.5 w-3.5" />
                        )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5">
                        <span className="text-sm text-foreground">
                            {event.kind === 'stage'
                                ? renderStageLabel(event.entry, stageNameById, t)
                                : event.kind === 'assign'
                                    ? t('assigned', {
                                          member: memberName(event.entry.membership),
                                      })
                                    : t('cancelled')}
                        </span>
                        {event.kind === 'cancel' && event.reason ? (
                            <span className="text-xs text-muted-foreground">
                                {t('cancelledReason', { reason: event.reason })}
                            </span>
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                            {event.kind === 'cancel' ? null : (
                                <>
                                    {t('by', {
                                        actor:
                                            event.kind === 'stage'
                                                ? memberName(event.entry.actorMembership)
                                                : memberName(event.entry.assignedByMembership),
                                    })}
                                    {' · '}
                                </>
                            )}
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
