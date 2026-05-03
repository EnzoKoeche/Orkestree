'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ProposalActions } from '@/components/feature/ProposalActions';
import { ProposalDetailsForm } from '@/components/feature/ProposalDetailsForm';
import { ProposalItemsEditor } from '@/components/feature/ProposalItemsEditor';
import { ProposalPdfButton } from '@/components/feature/ProposalPdfButton';
import {
    ProposalStatusBadge,
    proposalStatusLabel,
} from '@/components/feature/ProposalStatusBadge';
import { PageContainer, PageHeader } from '@/components/shell/PageContainer';
import { Card } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Table } from '@/components/ui/Table';
import { proposalsApi } from '@/lib/api';
import {
    formatCurrency,
    formatDate,
    formatDateTime,
    formatNumber,
    formatPercent,
    fullName,
} from '@/lib/format';
import { useRequiredSession } from '@/lib/session';
import { useResource } from '@/lib/use-resource';
import { ProposalDetail } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// Proposal detail page.
//
// Two display modes driven by `proposal.status`:
//
//   DRAFT   → editing affordances visible
//             - ProposalDetailsForm  (title / notes / clientNotes / validUntil
//                                     / discount)
//             - ProposalItemsEditor  (add / edit / delete items)
//             - Transition actions limited to "Send to client" + "Cancel"
//   else    → strictly read-only items table + sealed details summary; the
//             editing components never mount, so a stale tab cannot even
//             attempt the PATCH/POST/DELETE calls.
//
// Backend remains the source of truth for editability: every mutation
// re-checks `status = DRAFT` under SELECT FOR UPDATE inside its tx, so a
// race between an edit and a "send/approve/cancel" cannot produce a half-
// applied state.
//
// All four DRAFT mutations return the full ProposalDetail with totals
// recomputed by ProposalItemsService — we replace local state with that
// response. Front-end calculation of totals is intentionally absent.
// ─────────────────────────────────────────────────────────────────────────────

export default function ProposalDetailPage() {
    const session = useRequiredSession();
    const params = useParams<{ proposalId: string }>();
    const proposalId = params.proposalId;

    const { data, error, loading, refetch } = useResource(
        ['proposal', session.companyId, proposalId],
        (signal) => proposalsApi.get(session.companyId, proposalId, signal),
    );

    // `overlay` holds the most recent server-confirmed snapshot returned
    // by a mutation. This is the canonical post-mutation state — items
    // and totals come from the backend, never from a client-side
    // recomputation. Cleared when the page remounts (refetch).
    const [overlay, setOverlay] = useState<ProposalDetail | null>(null);

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

    const proposal = overlay ?? data;
    const isDraft = proposal.status === 'DRAFT';
    // The privileged-only internalCost field is included by the backend's
    // PRIVILEGED projection. Its presence on at least one item is the
    // authoritative signal — the UI never tries to derive role from session.
    const showInternalCost = proposal.items.some((i) => i.internalCost !== undefined);

    return (
        <PageContainer>
            <PageHeader
                breadcrumb={
                    <Link href="/proposals" className="hover:underline">
                        Proposals
                    </Link>
                }
                title={
                    <span className="flex items-center gap-3">
                        <span className="font-mono text-sm text-ink-subtle">#{proposal.number}</span>
                        <span className="truncate">{proposal.title}</span>
                    </span>
                }
                description={
                    <span>
                        Created {formatDateTime(proposal.createdAt)} by{' '}
                        {fullName(proposal.createdByMembership?.user)}
                        {proposal.serviceRequest ? (
                            <>
                                <span className="mx-2 text-ink-faint">·</span>
                                <Link
                                    href={`/requests/${proposal.serviceRequest.id}`}
                                    className="hover:underline"
                                >
                                    Request #{proposal.serviceRequest.number}
                                </Link>
                            </>
                        ) : null}
                    </span>
                }
                actions={
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <ProposalStatusBadge status={proposal.status} />
                        <ProposalPdfButton
                            proposal={proposal}
                            companyId={session.companyId}
                        />
                        <ProposalActions
                            proposal={proposal}
                            companyId={session.companyId}
                            onMutated={(next) => setOverlay(next)}
                        />
                    </div>
                }
            />

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2 flex flex-col gap-5">
                    {isDraft ? (
                        <Card>
                            <Card.Header
                                title="Proposal details"
                                description="Editable while the proposal is in DRAFT. Once sent, these fields become read-only."
                            />
                            <Card.Body>
                                <ProposalDetailsForm
                                    proposal={proposal}
                                    companyId={session.companyId}
                                    onSaved={(next) => setOverlay(next)}
                                />
                            </Card.Body>
                        </Card>
                    ) : null}

                    <Card>
                        <Card.Header
                            title="Items"
                            description={
                                proposal.items.length === 0
                                    ? isDraft
                                        ? 'Add items to populate the totals.'
                                        : 'No items on this proposal.'
                                    : `${proposal.items.length} item${proposal.items.length === 1 ? '' : 's'}${isDraft ? ' · editable' : ''}`
                            }
                        />
                        <Card.Body padded={false}>
                            {isDraft ? (
                                <ProposalItemsEditor
                                    proposal={proposal}
                                    companyId={session.companyId}
                                    onMutated={(next) => setOverlay(next)}
                                    editable
                                    showInternalCost={showInternalCost}
                                />
                            ) : (
                                <ReadOnlyItemsTable
                                    items={proposal.items}
                                    showInternalCost={showInternalCost}
                                />
                            )}
                        </Card.Body>
                    </Card>

                    <Card>
                        <Card.Header title="Status history" />
                        <Card.Body padded={false}>
                            {proposal.statusHistory.length === 0 ? (
                                <p className="px-5 py-6 text-sm text-ink-subtle">
                                    No transitions recorded yet.
                                </p>
                            ) : (
                                <ol className="divide-y divide-border">
                                    {proposal.statusHistory.map((entry) => (
                                        <li
                                            key={entry.id}
                                            className="flex items-start gap-3 px-5 py-3"
                                        >
                                            <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-state-info" />
                                            <div className="flex-1">
                                                <div className="flex flex-wrap items-baseline gap-2">
                                                    <span className="font-medium text-ink">
                                                        {entry.fromStatus
                                                            ? `${proposalStatusLabel(entry.fromStatus)} → ${proposalStatusLabel(entry.toStatus)}`
                                                            : `Created as ${proposalStatusLabel(entry.toStatus)}`}
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

                    {/* Sealed-state notes summary. While DRAFT, the editor
                        above is the only authoritative view of these
                        fields; rendering them again would be confusing. */}
                    {!isDraft && (proposal.notes || proposal.clientNotes) ? (
                        <Card>
                            <Card.Header title="Notes" />
                            <Card.Body>
                                <dl className="space-y-4 text-sm">
                                    {proposal.notes ? (
                                        <div>
                                            <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                                                Internal notes
                                            </dt>
                                            <dd className="mt-1 whitespace-pre-wrap text-ink">
                                                {proposal.notes}
                                            </dd>
                                        </div>
                                    ) : null}
                                    {proposal.clientNotes ? (
                                        <div>
                                            <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                                                Client-facing notes
                                            </dt>
                                            <dd className="mt-1 whitespace-pre-wrap text-ink">
                                                {proposal.clientNotes}
                                            </dd>
                                        </div>
                                    ) : null}
                                </dl>
                            </Card.Body>
                        </Card>
                    ) : null}
                </div>

                <div className="flex flex-col gap-5">
                    <Card>
                        <Card.Header
                            title="Totals"
                            description={
                                isDraft
                                    ? 'Recalculated by the backend on every change.'
                                    : undefined
                            }
                        />
                        <Card.Body>
                            <dl className="space-y-2 text-sm">
                                <Row label="Subtotal" value={formatCurrency(proposal.subtotal)} />
                                {proposal.discountPct ? (
                                    <Row
                                        label="Discount (pct)"
                                        value={formatPercent(proposal.discountPct)}
                                    />
                                ) : null}
                                {proposal.discountAmount ? (
                                    <Row
                                        label="Discount (fixed)"
                                        value={formatCurrency(proposal.discountAmount)}
                                    />
                                ) : null}
                                <div className="my-2 border-t border-border" />
                                <Row
                                    label="Total"
                                    value={formatCurrency(proposal.totalPrice)}
                                    strong
                                />
                                {proposal.totalCost !== undefined ? (
                                    <Row
                                        label="Total cost"
                                        value={formatCurrency(proposal.totalCost)}
                                        muted
                                    />
                                ) : null}
                            </dl>
                        </Card.Body>
                    </Card>

                    <Card>
                        <Card.Header title="Lifecycle" />
                        <Card.Body>
                            <dl className="grid grid-cols-1 gap-y-3 text-sm">
                                <Detail
                                    label="Valid until"
                                    value={formatDate(proposal.validUntil)}
                                />
                                <Detail
                                    label="Sent"
                                    value={formatDateTime(proposal.sentAt)}
                                />
                                <Detail
                                    label="Approved"
                                    value={formatDateTime(proposal.approvedAt)}
                                    sub={
                                        proposal.approvedByMembership
                                            ? `by ${fullName(proposal.approvedByMembership.user)}`
                                            : null
                                    }
                                />
                                <Detail
                                    label="Rejected"
                                    value={formatDateTime(proposal.rejectedAt)}
                                    sub={
                                        proposal.rejectedByMembership
                                            ? `by ${fullName(proposal.rejectedByMembership.user)}`
                                            : null
                                    }
                                />
                                <Detail
                                    label="Expired"
                                    value={formatDateTime(proposal.expiredAt)}
                                />
                                <Detail
                                    label="Cancelled"
                                    value={formatDateTime(proposal.cancelledAt)}
                                />
                                <Detail
                                    label="PDF generated"
                                    value={formatDateTime(proposal.pdfGeneratedAt)}
                                />
                            </dl>
                        </Card.Body>
                    </Card>

                    {proposal.client ? (
                        <Card>
                            <Card.Header title="Client" />
                            <Card.Body>
                                <Link
                                    href={`/clients/${proposal.client.id}`}
                                    className="block rounded-md border border-border px-3 py-2 transition hover:bg-surface-sunken"
                                >
                                    <div className="text-sm font-medium text-ink">
                                        {proposal.client.name}
                                    </div>
                                    <div className="text-xs text-ink-subtle">
                                        #{proposal.client.number} · {proposal.client.type}
                                    </div>
                                </Link>
                            </Card.Body>
                        </Card>
                    ) : null}

                    {proposal.rejectionReason ? (
                        <Card>
                            <Card.Header title="Rejection reason" />
                            <Card.Body>
                                <p className="whitespace-pre-wrap text-sm text-ink">
                                    {proposal.rejectionReason}
                                </p>
                            </Card.Body>
                        </Card>
                    ) : null}

                    {proposal.cancellationReason ? (
                        <Card>
                            <Card.Header title="Cancellation reason" />
                            <Card.Body>
                                <p className="whitespace-pre-wrap text-sm text-ink">
                                    {proposal.cancellationReason}
                                </p>
                            </Card.Body>
                        </Card>
                    ) : null}
                </div>
            </div>
        </PageContainer>
    );
}

// ── Read-only items table (non-DRAFT proposals) ──────────────────────────────
//
// Mirrors the columns ProposalItemsEditor renders so the UI stays visually
// consistent across status transitions; it just omits the actions column
// and never mounts the editor's modals.
function ReadOnlyItemsTable({
    items,
    showInternalCost,
}: {
    items: ProposalDetail['items'];
    showInternalCost: boolean;
}) {
    if (items.length === 0) {
        return (
            <p className="px-5 py-6 text-sm text-ink-subtle">
                No items on this proposal.
            </p>
        );
    }
    return (
        <Table>
            <Table.Head>
                <tr>
                    <Table.Cell head>Description</Table.Cell>
                    <Table.Cell head>Unit</Table.Cell>
                    <Table.Cell head align="right">Qty</Table.Cell>
                    <Table.Cell head align="right">Unit price</Table.Cell>
                    <Table.Cell head align="right">Discount</Table.Cell>
                    {showInternalCost ? (
                        <Table.Cell head align="right">Internal cost</Table.Cell>
                    ) : null}
                    <Table.Cell head align="right">Subtotal</Table.Cell>
                </tr>
            </Table.Head>
            <Table.Body>
                {items.map((item) => (
                    <Table.Row key={item.id}>
                        <Table.Cell>
                            <span className="block max-w-md truncate font-medium text-ink">
                                {item.description}
                            </span>
                        </Table.Cell>
                        <Table.Cell>
                            <span className="text-sm text-ink-subtle">
                                {item.unit ?? '—'}
                            </span>
                        </Table.Cell>
                        <Table.Cell align="right">
                            <span className="tabular-nums text-sm text-ink">
                                {formatNumber(item.quantity, 2)}
                            </span>
                        </Table.Cell>
                        <Table.Cell align="right">
                            <span className="tabular-nums text-sm text-ink">
                                {formatCurrency(item.unitPrice)}
                            </span>
                        </Table.Cell>
                        <Table.Cell align="right">
                            <span className="tabular-nums text-sm text-ink-subtle">
                                {formatPercent(item.discountPct)}
                            </span>
                        </Table.Cell>
                        {showInternalCost ? (
                            <Table.Cell align="right">
                                <span className="tabular-nums text-sm text-ink-subtle">
                                    {formatCurrency(item.internalCost ?? null)}
                                </span>
                            </Table.Cell>
                        ) : null}
                        <Table.Cell align="right">
                            <span className="tabular-nums font-medium text-ink">
                                {formatCurrency(item.subtotal)}
                            </span>
                        </Table.Cell>
                    </Table.Row>
                ))}
            </Table.Body>
        </Table>
    );
}

function Row({
    label,
    value,
    strong,
    muted,
}: {
    label: string;
    value: string;
    strong?: boolean;
    muted?: boolean;
}) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <dt
                className={
                    muted
                        ? 'text-xs uppercase tracking-wide text-ink-subtle'
                        : 'text-sm text-ink-muted'
                }
            >
                {label}
            </dt>
            <dd
                className={
                    'tabular-nums ' +
                    (strong
                        ? 'text-base font-semibold text-ink'
                        : muted
                            ? 'text-xs text-ink-subtle'
                            : 'text-sm text-ink')
                }
            >
                {value}
            </dd>
        </div>
    );
}

function Detail({
    label,
    value,
    sub,
}: {
    label: string;
    value: string;
    sub?: string | null;
}) {
    return (
        <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                {label}
            </dt>
            <dd className="mt-0.5 text-sm text-ink">
                {value === '—' ? <span className="text-ink-faint">—</span> : value}
            </dd>
            {sub ? <div className="text-xs text-ink-subtle">{sub}</div> : null}
        </div>
    );
}
