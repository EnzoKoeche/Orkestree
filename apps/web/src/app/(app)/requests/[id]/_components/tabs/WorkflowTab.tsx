import { Check, Circle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { DateCell } from '@/components/ui/DateCell';
import { cn } from '@/lib/utils';
import type { ServiceRequestDetail } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// WorkflowTab — stage-centric view. Shows the current stage prominently and
// the stages this request has already passed through (from stageHistory).
//
// The forward-looking part of the workflow (upcoming stages) lives in
// Commit Aa+C: it requires the workflow definition (stages + transitions),
// which currently isn't included in the request detail response. Until then
// the operator sees an honest record of what's happened, not a fabricated
// projection of what might happen — matches CLAUDE.md §3 rule 8 (don't
// invent backend data on the frontend).
// ─────────────────────────────────────────────────────────────────────────────

export async function WorkflowTab({ request }: { request: ServiceRequestDetail }) {
    const t = await getTranslations('requests.detail.workflow');

    // stageHistory is ordered ASC (origin → current) by the backend. The last
    // entry's toStage is the current stage by definition, so we can read the
    // path off the history alone — no separate stage list needed yet.
    const history = request.stageHistory;
    const isCurrentFinal = request.currentStage.isFinal;

    return (
        <div className="space-y-6 rounded-md border bg-card p-6">
            <section>
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t('currentStageTitle')}
                </h2>
                <div className="mt-2 flex items-center gap-3">
                    <span className="text-base font-semibold text-foreground">
                        {request.currentStage.name}
                    </span>
                    {isCurrentFinal ? (
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                            {t('finalStage')}
                        </span>
                    ) : null}
                </div>
            </section>

            <section>
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t('historyTitle')}
                </h2>
                {history.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">{t('noHistory')}</p>
                ) : (
                    <ol className="mt-3 space-y-3">
                        {history.map((entry, idx) => {
                            const isLast = idx === history.length - 1;
                            const isInitial = entry.fromStageId === null;
                            return (
                                <li key={entry.id} className="flex gap-3">
                                    <div
                                        className={cn(
                                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                                            isLast
                                                ? 'bg-secondary text-foreground ring-1 ring-border'
                                                : 'bg-muted text-muted-foreground',
                                        )}
                                        aria-hidden="true"
                                    >
                                        {isLast ? (
                                            <Circle className="h-2.5 w-2.5 fill-current" />
                                        ) : (
                                            <Check className="h-3.5 w-3.5" />
                                        )}
                                    </div>
                                    <div className="flex flex-1 flex-col gap-0.5">
                                        <span className="text-sm text-foreground">
                                            {isInitial
                                                ? t('createdInStage', { stage: entry.toStage.name })
                                                : t('movedToStage', { stage: entry.toStage.name })}
                                        </span>
                                        <DateCell
                                            iso={entry.createdAt}
                                            className="text-xs text-muted-foreground"
                                        />
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </section>
        </div>
    );
}
