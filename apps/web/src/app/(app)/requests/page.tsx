'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageContainer, PageHeader } from '@/components/shell/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Field, Select } from '@/components/ui/Input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Table } from '@/components/ui/Table';
import { serviceRequestsApi, serviceTypesApi } from '@/lib/api';
import { formatDate, fullName } from '@/lib/format';
import { ApiError } from '@/lib/http';
import { useRequiredSession } from '@/lib/session';
import { useResource } from '@/lib/use-resource';

// ─────────────────────────────────────────────────────────────────────────────
// Service Requests — list page
//
// Filters supported by the backend (apps/api/.../list-service-requests.dto.ts):
//   stageId, serviceTypeId, assignedMembershipId, isCancelled, limit, skip
//
// Surfaced here:
//   - `isCancelled` — pure shape, no reference data required.
//   - `serviceTypeId` — reads the company's service-type catalogue via
//     GET /companies/:companyId/config/service-types. That endpoint requires
//     COMPANY_CONFIG.VIEW which only OWNER/ADMIN have by default; on a 403
//     we silently hide the filter rather than show a broken dropdown.
//
// `stageId` and `assignedMembershipId` remain off until the membership
// directory and per-workflow stage picker land — both depend on UX choices
// (which workflow's stages are surfaced first?) we don't want to invent.
// ─────────────────────────────────────────────────────────────────────────────

type CancelledFilter = 'all' | 'open' | 'cancelled';

export default function ServiceRequestsListPage() {
    const session = useRequiredSession();
    const [cancelled, setCancelled] = useState<CancelledFilter>('open');
    const [serviceTypeId, setServiceTypeId] = useState<string>('all');

    // Reference catalogue. Loaded once per workspace; permission errors are
    // swallowed at render time so the page still functions for roles that
    // can list requests but not the configuration catalogue.
    const serviceTypes = useResource(
        ['service-types', session.companyId],
        (signal) => serviceTypesApi.list(session.companyId, signal),
    );

    const activeServiceTypes = useMemo(
        () => (serviceTypes.data ?? []).filter((t) => t.isActive),
        [serviceTypes.data],
    );

    const showServiceTypeFilter =
        // Only show the filter if we successfully loaded a non-empty
        // catalogue. A 403 leaves error set; we treat that as "operator
        // doesn't have the catalogue" and degrade silently.
        !serviceTypes.loading &&
        !(serviceTypes.error instanceof ApiError && serviceTypes.error.status === 403) &&
        activeServiceTypes.length > 0;

    const query = useMemo(
        () => ({
            isCancelled:
                cancelled === 'all' ? undefined : cancelled === 'cancelled',
            serviceTypeId: serviceTypeId === 'all' ? undefined : serviceTypeId,
            limit: 100,
        }),
        [cancelled, serviceTypeId],
    );

    const { data, error, loading, refetch } = useResource(
        ['requests', session.companyId, cancelled, serviceTypeId],
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
                        <div className="flex flex-wrap items-end gap-3">
                            {showServiceTypeFilter ? (
                                <Field label="Service type" htmlFor="serviceTypeFilter">
                                    <Select
                                        id="serviceTypeFilter"
                                        value={serviceTypeId}
                                        onChange={(e) => setServiceTypeId(e.target.value)}
                                    >
                                        <option value="all">All</option>
                                        {activeServiceTypes.map((t) => (
                                            <option key={t.id} value={t.id}>
                                                {t.name}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                            ) : null}
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
                        </div>
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
