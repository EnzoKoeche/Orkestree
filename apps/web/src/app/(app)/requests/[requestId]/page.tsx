'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageContainer, PageHeader } from '@/components/shell/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { serviceRequestsApi } from '@/lib/api';
import { formatDateTime, fullName } from '@/lib/format';
import { useRequiredSession } from '@/lib/session';
import { useResource } from '@/lib/use-resource';

// Service Request detail page.
//
// Read-only for now: the backend supports update / cancel / transition /
// assign, but the operator workflow forms (stage picker, assignee picker)
// require config-aware reference data we haven't surfaced yet. Surfaces
// the canonical detail projection plus stage history and assignment log.

export default function ServiceRequestDetailPage() {
    const session = useRequiredSession();
    const params = useParams<{ requestId: string }>();
    const requestId = params.requestId;

    const { data, error, loading, refetch } = useResource(
        ['request', session.companyId, requestId],
        (signal) => serviceRequestsApi.get(session.companyId, requestId, signal),
    );

    if (loading) {
        return (
            <PageContainer>
                <LoadingState />
            </PageContainer>
        );
    }
    if (error) {
        return (
            <PageContainer>
                <ErrorState error={error} onRetry={refetch} />
            </PageContainer>
        );
    }
    if (!data) return null;

    return (
        <PageContainer>
            <PageHeader
                breadcrumb={
                    <Link href="/requests" className="hover:underline">
                        Service Requests
                    </Link>
                }
                title={
                    <span className="flex items-center gap-3">
                        <span className="font-mono text-sm text-ink-subtle">#{data.number}</span>
                        <span className="truncate">{data.title}</span>
                    </span>
                }
                description={
                    data.serviceType ? (
                        <span>
                            {data.serviceType.name}
                            <span className="mx-2 text-ink-faint">·</span>
                            Created {formatDateTime(data.createdAt)}
                        </span>
                    ) : null
                }
                actions={
                    <>
                        {data.isCancelled ? (
                            <Badge tone="danger" dot>
                                Cancelled
                            </Badge>
                        ) : data.currentStage ? (
                            <Badge tone={data.currentStage.isFinal ? 'success' : 'info'} dot>
                                {data.currentStage.name}
                            </Badge>
                        ) : null}
                    </>
                }
            />

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2 flex flex-col gap-5">
                    <Card>
                        <Card.Header title="Description" />
                        <Card.Body>
                            <p className="whitespace-pre-wrap text-sm text-ink">
                                {data.description ?? (
                                    <span className="text-ink-faint">No description provided.</span>
                                )}
                            </p>
                        </Card.Body>
                    </Card>

                    <Card>
                        <Card.Header title="Stage history" />
                        <Card.Body padded={false}>
                            {data.stageHistory.length === 0 ? (
                                <p className="px-5 py-6 text-sm text-ink-subtle">
                                    No stage transitions recorded.
                                </p>
                            ) : (
                                <ol className="divide-y divide-border">
                                    {data.stageHistory.map((entry) => (
                                        <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                                            <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-state-info" />
                                            <div className="flex-1">
                                                <div className="flex flex-wrap items-baseline gap-2">
                                                    <span className="font-medium text-ink">
                                                        {entry.toStage.name}
                                                    </span>
                                                    <span className="text-xs text-ink-subtle">
                                                        {formatDateTime(entry.createdAt)}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-ink-subtle">
                                                    by {fullName(entry.actorMembership?.user)}
                                                </div>
                                                {entry.note ? (
                                                    <p className="mt-1 text-sm text-ink">{entry.note}</p>
                                                ) : null}
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </Card.Body>
                    </Card>
                </div>

                <div className="flex flex-col gap-5">
                    <Card>
                        <Card.Header title="Client" />
                        <Card.Body>
                            {data.client ? (
                                <Link
                                    href={`/clients/${data.client.id}`}
                                    className="block rounded-md border border-border px-3 py-2 transition hover:bg-surface-sunken"
                                >
                                    <div className="text-sm font-medium text-ink">
                                        {data.client.name}
                                    </div>
                                    <div className="text-xs text-ink-subtle">
                                        #{data.client.number} · {data.client.type}
                                    </div>
                                </Link>
                            ) : (
                                <p className="text-sm text-ink-subtle">No client linked.</p>
                            )}
                        </Card.Body>
                    </Card>

                    <Card>
                        <Card.Header title="People" />
                        <Card.Body>
                            <dl className="grid grid-cols-1 gap-y-3 text-sm">
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                                        Assigned
                                    </dt>
                                    <dd className="mt-0.5 text-ink">
                                        {data.assignedMembership ? (
                                            fullName(data.assignedMembership.user)
                                        ) : (
                                            <span className="text-ink-faint">Unassigned</span>
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                                        Created by
                                    </dt>
                                    <dd className="mt-0.5 text-ink">
                                        {fullName(data.createdByMembership?.user)}
                                    </dd>
                                </div>
                            </dl>
                        </Card.Body>
                    </Card>

                    {data.assignments.length > 0 ? (
                        <Card>
                            <Card.Header title="Assignment history" />
                            <Card.Body padded={false}>
                                <ul className="divide-y divide-border">
                                    {data.assignments.map((a) => (
                                        <li key={a.id} className="px-5 py-3 text-sm">
                                            <div className="font-medium text-ink">
                                                {fullName(a.membership?.user)}
                                            </div>
                                            <div className="text-xs text-ink-subtle">
                                                Assigned by {fullName(a.assignedByMembership?.user)} ·{' '}
                                                {formatDateTime(a.createdAt)}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </Card.Body>
                        </Card>
                    ) : null}

                    {data.isCancelled ? (
                        <Card>
                            <Card.Header title="Cancellation" />
                            <Card.Body>
                                <p className="text-sm text-ink">
                                    {data.cancellationReason ?? (
                                        <span className="text-ink-faint">No reason recorded.</span>
                                    )}
                                </p>
                            </Card.Body>
                        </Card>
                    ) : null}
                </div>
            </div>
        </PageContainer>
    );
}
