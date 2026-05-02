'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ProposalStatusBadge } from '@/components/feature/ProposalStatusBadge';
import { PageContainer, PageHeader } from '@/components/shell/PageContainer';
import { Card } from '@/components/ui/Card';
import { Field, Select } from '@/components/ui/Input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Table } from '@/components/ui/Table';
import { proposalsApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { useRequiredSession } from '@/lib/session';
import { useResource } from '@/lib/use-resource';
import { ProposalStatus } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// Proposals — list page
//
// Backend filters supported (apps/api/.../list-proposals.dto.ts):
//   serviceRequestId, clientId, status, limit, skip
//
// We surface `status` here. serviceRequestId / clientId are exposed via the
// detail pages (linking back). Pagination uses `limit=100` until we add a
// dedicated paginator.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: ProposalStatus[] = [
    'DRAFT',
    'SENT',
    'APPROVED',
    'REJECTED',
    'EXPIRED',
    'CANCELLED',
];

export default function ProposalsListPage() {
    const session = useRequiredSession();
    const [status, setStatus] = useState<ProposalStatus | 'all'>('all');

    const query = useMemo(
        () => ({
            status: status === 'all' ? undefined : status,
            limit: 100,
        }),
        [status],
    );

    const { data, error, loading, refetch } = useResource(
        ['proposals', session.companyId, status],
        (signal) => proposalsApi.list(session.companyId, query, signal),
    );

    return (
        <PageContainer>
            <PageHeader
                title="Proposals"
                description="Commercial offers attached to service requests. Approved proposals trigger an automatic PDF render."
            />

            <Card>
                <Card.Header
                    title="All proposals"
                    actions={
                        <Field label="Status" htmlFor="status">
                            <Select
                                id="status"
                                value={status}
                                onChange={(e) =>
                                    setStatus(e.target.value as ProposalStatus | 'all')
                                }
                            >
                                <option value="all">All</option>
                                {STATUS_OPTIONS.map((s) => (
                                    <option key={s} value={s}>
                                        {s}
                                    </option>
                                ))}
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
                            title="No proposals match this filter"
                            description="Proposals are created from a service request and start in DRAFT."
                        />
                    ) : (
                        <Table>
                            <Table.Head>
                                <tr>
                                    <Table.Cell head className="w-20">#</Table.Cell>
                                    <Table.Cell head>Title</Table.Cell>
                                    <Table.Cell head>Status</Table.Cell>
                                    <Table.Cell head>Client</Table.Cell>
                                    <Table.Cell head>Service request</Table.Cell>
                                    <Table.Cell head align="right">Total</Table.Cell>
                                    <Table.Cell head>Valid until</Table.Cell>
                                    <Table.Cell head>Updated</Table.Cell>
                                </tr>
                            </Table.Head>
                            <Table.Body>
                                {data.map((p) => (
                                    <Table.Row key={p.id}>
                                        <Table.Cell>
                                            <Link
                                                href={`/proposals/${p.id}`}
                                                className="font-mono text-sm text-ink hover:underline"
                                            >
                                                #{p.number}
                                            </Link>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Link
                                                href={`/proposals/${p.id}`}
                                                className="block max-w-md truncate font-medium text-ink hover:underline"
                                                title={p.title}
                                            >
                                                {p.title}
                                            </Link>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <ProposalStatusBadge status={p.status} />
                                        </Table.Cell>
                                        <Table.Cell>
                                            {p.client ? (
                                                <Link
                                                    href={`/clients/${p.client.id}`}
                                                    className="text-ink hover:underline"
                                                >
                                                    {p.client.name}
                                                </Link>
                                            ) : null}
                                        </Table.Cell>
                                        <Table.Cell>
                                            {p.serviceRequest ? (
                                                <Link
                                                    href={`/requests/${p.serviceRequest.id}`}
                                                    className="text-ink hover:underline"
                                                >
                                                    #{p.serviceRequest.number} {p.serviceRequest.title}
                                                </Link>
                                            ) : null}
                                        </Table.Cell>
                                        <Table.Cell align="right">
                                            <span className="tabular-nums font-medium text-ink">
                                                {formatCurrency(p.totalPrice)}
                                            </span>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <span className="text-sm text-ink-subtle">
                                                {formatDate(p.validUntil)}
                                            </span>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <span className="text-sm text-ink-subtle">
                                                {formatDate(p.updatedAt)}
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
