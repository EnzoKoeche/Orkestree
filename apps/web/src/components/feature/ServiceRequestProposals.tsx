'use client';

import Link from 'next/link';
import { ProposalStatusBadge } from '@/components/feature/ProposalStatusBadge';
import { Card } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Table } from '@/components/ui/Table';
import { proposalsApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { useResource } from '@/lib/use-resource';

// ─────────────────────────────────────────────────────────────────────────────
// ServiceRequestProposals
//
// Surfaces proposals already linked to the current request. The backend's
// list endpoint accepts a `serviceRequestId` filter (see
// `apps/api/src/proposals/dto/list-proposals.dto.ts`), so this is a thin
// pass-through with no client-side filtering or invented joins.
//
// Visibility / permissions are enforced by the existing
// ResourcePermissionGuard:
//   - PROPOSAL.VIEW is required; OPERACIONAL/FINANCEIRO/ADMIN/OWNER have it
//     by default.
//   - CLIENTE row-level filter applies on the backend; DRAFT proposals are
//     hidden from CLIENTE per `proposals.service.ts`.
//
// We render an empty card (rather than hide) when there are no proposals,
// because the empty state is the most common precondition for the
// "Create proposal" action that lives in the page header.
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceRequestProposalsProps {
    companyId: string;
    requestId: string;
}

export function ServiceRequestProposals({ companyId, requestId }: ServiceRequestProposalsProps) {
    const { data, error, loading, refetch } = useResource(
        ['request-proposals', companyId, requestId],
        (signal) =>
            proposalsApi.list(
                companyId,
                { serviceRequestId: requestId, limit: 50 },
                signal,
            ),
    );

    return (
        <Card>
            <Card.Header
                title="Proposals"
                description="Commercial offers anchored to this request."
            />
            <Card.Body padded={false}>
                {loading ? (
                    <LoadingState />
                ) : error ? (
                    <ErrorState error={error} onRetry={refetch} />
                ) : !data || data.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-ink-subtle">
                        No proposals yet. Use the “Create proposal” action above to
                        start a draft.
                    </p>
                ) : (
                    <Table>
                        <Table.Head>
                            <tr>
                                <Table.Cell head className="w-20">
                                    #
                                </Table.Cell>
                                <Table.Cell head>Title</Table.Cell>
                                <Table.Cell head>Status</Table.Cell>
                                <Table.Cell head align="right">
                                    Total
                                </Table.Cell>
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
    );
}
