import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { DateCell } from '@/components/ui/DateCell';
import { ProposalStatusBadge } from '@/components/ui/ProposalStatusBadge';
import type { MembershipRef, ProposalDetail } from '@/types/domain';
import { ProposalActions } from './ProposalActions';
import { ProposalPdfButton } from './ProposalPdfButton';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalDetailHeader — top of the proposal detail page.
//
// Read-only in A1: no lifecycle actions yet (send/approve/reject/cancel land
// in A4, into the action zone reserved on the right). For now the right column
// holds the headline total — the single number the operator most wants here.
//
// Hierarchy (P2):
//   1. Title — the operator's anchor.
//   2. Number + status badge inline above — status-at-a-glance.
//   3. Info row (linked pedido/cliente, criada por, válida até) — tertiary.
//   4. Total (right) — prominent, tabular, the proposal's bottom line.
// ─────────────────────────────────────────────────────────────────────────────

import { formatBRL } from '@/lib/format';

function memberName(m: MembershipRef | null | undefined): string | null {
    if (!m) return null;
    return `${m.user.firstName} ${m.user.lastName}`.trim() || m.user.firstName;
}

export async function ProposalDetailHeader({
    proposal,
}: {
    proposal: ProposalDetail;
}) {
    const t = await getTranslations('proposals.detail.header');

    const creator = memberName(proposal.createdByMembership);

    return (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-3">
                <div className="flex items-center gap-3">
                    <span className="font-medium tabular-nums text-muted-foreground">
                        #{proposal.number}
                    </span>
                    <ProposalStatusBadge status={proposal.status} />
                </div>

                <h1 className="text-2xl font-semibold leading-tight text-foreground">
                    {proposal.title}
                </h1>

                <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <InfoItem label={t('request')}>
                        <Link
                            href={`/requests/${proposal.serviceRequest.id}`}
                            className="rounded-md font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            #{proposal.serviceRequest.number} · {proposal.serviceRequest.title}
                        </Link>
                    </InfoItem>

                    {proposal.client ? (
                        <InfoItem label={t('client')}>
                            <Link
                                href={`/clients/${proposal.client.id}`}
                                className="rounded-md font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                                {proposal.client.name}
                            </Link>
                        </InfoItem>
                    ) : null}

                    {creator ? (
                        <InfoItem label={t('createdBy')}>
                            <span className="font-medium text-foreground">{creator}</span>
                        </InfoItem>
                    ) : null}

                    <div className="inline-flex items-baseline gap-2">
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            {t('validUntil')}
                        </dt>
                        <dd className="font-medium text-foreground">
                            {proposal.validUntil ? (
                                <DateCell iso={proposal.validUntil} />
                            ) : (
                                <span className="text-muted-foreground">{t('noValidUntil')}</span>
                            )}
                        </dd>
                    </div>
                </dl>
            </div>

            <div className="flex shrink-0 flex-col items-start gap-4 sm:items-end">
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <ProposalPdfButton proposalId={proposal.id} status={proposal.status} />
                    <ProposalActions proposal={proposal} />
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t('total')}
                    </span>
                    <span className="text-2xl font-semibold tabular-nums text-foreground">
                        {formatBRL(proposal.totalPrice)}
                    </span>
                </div>
            </div>
        </header>
    );
}

function InfoItem({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="inline-flex items-baseline gap-2">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate">{children}</dd>
        </div>
    );
}
