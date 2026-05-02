'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageContainer, PageHeader } from '@/components/shell/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Field, Select } from '@/components/ui/Input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Table } from '@/components/ui/Table';
import { serviceRequestsApi } from '@/lib/api';
import { formatDate, fullName } from '@/lib/format';
import { useRequiredSession } from '@/lib/session';
import { useResource } from '@/lib/use-resource';

// ─────────────────────────────────────────────────────────────────────────────
// Service Requests — list page
//
// Filters supported by the backend (apps/api/.../list-service-requests.dto.ts):
//   stageId, serviceTypeId, assignedMembershipId, isCancelled, limit, skip
//
// We surface only `isCancelled` here — the others would need workspace-
// specific reference data (stage / service-type catalogues) that the
// backend doesn't yet expose to the operator UI. We'd rather ship the list
// without them than fake a dropdown.
// ─────────────────────────────────────────────────────────────────────────────

type CancelledFilter = 'all' | 'open' | 'cancelled';

export default function ServiceRequestsListPage() {
    const session = useRequiredSession();
    const [cancelled, setCancelled] = useState<CancelledFilter>('open');

    const query = useMemo(
        () => ({
            isCancelled:
                cancelled === 'all' ? undefined : cancelled === 'cancelled',
            limit: 100,
        }),
        [cancelled],
    );

    const { data, error, loading, refetch } = useResource(
        ['requests', session.companyId, cancelled],
        (signal) => serviceRequestsApi.list(session.companyId, query, signal),
    );

    return (
        <PageContainer>
            <PageHeader
                title="Service Requests"
                description="Operational pipeline. Each request anchors a workflow with an assigned operator and a current stage."
            />

            <Card>
                <Card.Header
                    title="All requests"
                    actions={
                        <Field label="Status" htmlFor="cancelledFilter">
                            <Select
                                id="cancelledFilter"
                                value={cancelled}
                                onChange={(e) =>
                                    setCancelled(e.target.value as CancelledFilter)
                                }
                            >
                                <option value="open">Open only</option>
                                <option value="cancelled">Cancelled only</option>
                                <option value="all">All</option>
                            </Select>
                        </Field>
                    }
                />
                <Card.Body padded={false}>
                    {loading ? (
                        <LoadingState />
                    ) : error ? (
                        <ErrorState error={error} onRetry={refetch} />
                    ) : !data || data.length === 0 ? (
                        <EmptyState
                            title="No service requests yet"
                            description="When operators create requests they will show up here."
                        />
                    ) : (
                        <Table>
                            <Table.Head>
                                <tr>
                                    <Table.Cell head className="w-20">#</Table.Cell>
                                    <Table.Cell head>Title</Table.Cell>
                                    <Table.Cell head>Client</Table.Cell>
                                    <Table.Cell head>Service type</Table.Cell>
                                    <Table.Cell head>Stage</Table.Cell>
                                    <Table.Cell head>Assigned</Table.Cell>
                                    <Table.Cell head>Created</Table.Cell>
                                </tr>
                            </Table.Head>
                            <Table.Body>
                                {data.map((r) => (
                                    <Table.Row key={r.id}>
                                        <Table.Cell>
                                            <Link
                                                href={`/requests/${r.id}`}
                                                className="font-mono text-sm text-ink hover:underline"
                                            >
                                                #{r.number}
                                            </Link>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Link
                                                href={`/requests/${r.id}`}
                                                className="block max-w-md truncate font-medium text-ink hover:underline"
                                                title={r.title}
                                            >
                                                {r.title}
                                            </Link>
                                            {r.isCancelled ? (
                                                <Badge tone="danger" className="mt-1">
                                                    Cancelled
                                                </Badge>
                                            ) : null}
                                        </Table.Cell>
                                        <Table.Cell>
                                            {r.client ? (
                                                <Link
                                                    href={`/clients/${r.client.id}`}
                                                    className="text-ink hover:underline"
                                                >
                                                    {r.client.name}
                                                </Link>
                                            ) : null}
                                        </Table.Cell>
                                        <Table.Cell>
                                            {r.serviceType ? (
                                                <span className="text-sm text-ink">
                                                    {r.serviceType.name}
                                                </span>
                                            ) : null}
                                        </Table.Cell>
                                        <Table.Cell>
                                            {r.currentStage ? (
                                                <Badge
                                                    tone={r.currentStage.isFinal ? 'success' : 'info'}
                                                >
                                                    {r.currentStage.name}
                                                </Badge>
                                            ) : null}
                                        </Table.Cell>
                                        <Table.Cell>
                                            {r.assignedMembership ? (
                                                <span className="text-sm text-ink">
                                                    {fullName(r.assignedMembership.user)}
                                                </span>
                                            ) : (
                                                <span className="text-sm text-ink-faint">Unassigned</span>
                                            )}
                                        </Table.Cell>
                                        <Table.Cell>
                                            <span className="text-sm text-ink-subtle">
                                                {formatDate(r.createdAt)}
                                            </span>
                                        </Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>
                    )}
                </Card.Body>
            </Card>
        </PageContainer>
    );
}
