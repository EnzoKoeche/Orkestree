import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { DateCell } from '@/components/ui/DateCell';
import { ProposalStatusBadge } from '@/components/ui/ProposalStatusBadge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatBRL } from '@/lib/format';
import type { ProposalListItem, ServiceRequestDetail } from '@/types/domain';
import { CreateProposalButton } from '../CreateProposalButton';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalsTab — proposals anchored to this request, plus the create action.
//
// Server-rendered list (mirror of TasksTab); the "Nova proposta" button is a
// client island that role-gates itself and opens the create dialog. The list
// is a thin pass-through of GET /proposals?serviceRequestId=… — no client-side
// filtering or invented joins. CLIENTE never reaches this tab (request detail
// is operator-facing), so the role-stripped fields don't matter here.
// ─────────────────────────────────────────────────────────────────────────────

export async function ProposalsTab({
    proposals,
    request,
}: {
    proposals: ProposalListItem[];
    request: ServiceRequestDetail;
}) {
    const t = await getTranslations('requests.detail.proposals');

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
                <CreateProposalButton request={request} />
            </div>

            {proposals.length === 0 ? (
                <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
                    {t('empty')}
                </div>
            ) : (
                <div className="overflow-hidden rounded-md border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[80px]">{t('columns.number')}</TableHead>
                                <TableHead>{t('columns.title')}</TableHead>
                                <TableHead className="w-[120px]">{t('columns.status')}</TableHead>
                                <TableHead className="w-[150px] text-right">
                                    {t('columns.total')}
                                </TableHead>
                                <TableHead className="w-[140px]">{t('columns.validUntil')}</TableHead>
                                <TableHead className="w-[140px]">{t('columns.updatedAt')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {proposals.map((proposal) => (
                                <TableRow key={proposal.id}>
                                    <TableCell className="font-medium tabular-nums text-muted-foreground">
                                        <Link
                                            href={`/proposals/${proposal.id}`}
                                            className="rounded-md hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        >
                                            #{proposal.number}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="max-w-md">
                                        <Link
                                            href={`/proposals/${proposal.id}`}
                                            className="block truncate font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            title={proposal.title}
                                        >
                                            {proposal.title}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <ProposalStatusBadge status={proposal.status} />
                                    </TableCell>
                                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                                        {formatBRL(proposal.totalPrice)}
                                    </TableCell>
                                    <TableCell>
                                        {proposal.validUntil ? (
                                            <DateCell iso={proposal.validUntil} />
                                        ) : (
                                            <span className="text-sm text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <DateCell iso={proposal.updatedAt} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}
