import { getTranslations } from 'next-intl/server';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatBRL, formatPercent, formatQuantity } from '@/lib/format';
import type { ProposalDetail } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalItemsTable — the line items plus the totals summary.
//
// Read-only (A1). Money/quantity arrive as Decimal strings; formatted via
// lib/format, never recomputed. Totals come straight from the backend
// (subtotal / totalPrice / totalCost) — the UI does not sum anything itself.
//
// Role-awareness is data-driven: the "Custo interno" column and the internal
// cost total only render when the backend included them (OWNER/ADMIN). For
// every other role those fields are absent from the payload, so the column
// simply never appears — no client-side role check needed.
// ─────────────────────────────────────────────────────────────────────────────

export async function ProposalItemsTable({
    proposal,
}: {
    proposal: ProposalDetail;
}) {
    const t = await getTranslations('proposals.detail.items');

    const showInternalCost = proposal.items.some(
        (item) => item.internalCost !== undefined,
    );
    const hasDiscount =
        (proposal.discountPct !== null && proposal.discountPct !== undefined) ||
        (proposal.discountAmount !== null && proposal.discountAmount !== undefined);

    // Number of leading columns before the right-aligned "Subtotal" so the
    // totals footer can span-align under it.
    const labelSpan = showInternalCost ? 5 : 4;

    if (proposal.items.length === 0) {
        return (
            <section aria-labelledby="proposal-items-heading">
                <h2 id="proposal-items-heading" className="mb-3 text-sm font-semibold text-foreground">
                    {t('title')}
                </h2>
                <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
                    {t('empty')}
                </div>
            </section>
        );
    }

    return (
        <section aria-labelledby="proposal-items-heading">
            <h2 id="proposal-items-heading" className="mb-3 text-sm font-semibold text-foreground">
                {t('title')}
            </h2>

            <div className="overflow-hidden rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('columns.description')}</TableHead>
                            <TableHead className="w-[100px]">{t('columns.unit')}</TableHead>
                            <TableHead className="w-[100px] text-right">
                                {t('columns.quantity')}
                            </TableHead>
                            <TableHead className="w-[140px] text-right">
                                {t('columns.unitPrice')}
                            </TableHead>
                            <TableHead className="w-[110px] text-right">
                                {t('columns.discount')}
                            </TableHead>
                            {showInternalCost ? (
                                <TableHead className="w-[140px] text-right">
                                    {t('columns.internalCost')}
                                </TableHead>
                            ) : null}
                            <TableHead className="w-[150px] text-right">
                                {t('columns.subtotal')}
                            </TableHead>
                        </TableRow>
                    </TableHeader>

                    <TableBody>
                        {proposal.items.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium text-foreground">
                                    {item.description}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {item.unit ?? '—'}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatQuantity(item.quantity)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatBRL(item.unitPrice)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                    {item.discountPct !== null
                                        ? formatPercent(item.discountPct)
                                        : '—'}
                                </TableCell>
                                {showInternalCost ? (
                                    <TableCell className="text-right tabular-nums text-muted-foreground">
                                        {formatBRL(item.internalCost)}
                                    </TableCell>
                                ) : null}
                                <TableCell className="text-right font-medium tabular-nums text-foreground">
                                    {formatBRL(item.subtotal)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>

                    <tfoot className="border-t bg-muted/30">
                        <TotalRow
                            labelSpan={labelSpan}
                            label={t('totals.subtotal')}
                            value={formatBRL(proposal.subtotal)}
                        />
                        {hasDiscount ? (
                            <TotalRow
                                labelSpan={labelSpan}
                                label={t('totals.discount')}
                                value={
                                    proposal.discountPct !== null &&
                                    proposal.discountPct !== undefined
                                        ? `− ${formatPercent(proposal.discountPct)}`
                                        : `− ${formatBRL(proposal.discountAmount)}`
                                }
                                muted
                            />
                        ) : null}
                        <TotalRow
                            labelSpan={labelSpan}
                            label={t('totals.total')}
                            value={formatBRL(proposal.totalPrice)}
                            emphasis
                        />
                        {proposal.totalCost !== undefined ? (
                            <TotalRow
                                labelSpan={labelSpan}
                                label={t('totals.internalCost')}
                                value={formatBRL(proposal.totalCost)}
                                muted
                            />
                        ) : null}
                    </tfoot>
                </Table>
            </div>
        </section>
    );
}

function TotalRow({
    labelSpan,
    label,
    value,
    emphasis = false,
    muted = false,
}: {
    labelSpan: number;
    label: string;
    value: string;
    emphasis?: boolean;
    muted?: boolean;
}) {
    return (
        <tr>
            <td
                colSpan={labelSpan}
                className={
                    'px-4 py-2 text-right text-sm ' +
                    (emphasis
                        ? 'font-semibold text-foreground'
                        : 'text-muted-foreground')
                }
            >
                {label}
            </td>
            <td
                className={
                    'px-4 py-2 text-right tabular-nums ' +
                    (emphasis
                        ? 'text-base font-semibold text-foreground'
                        : muted
                          ? 'text-sm text-muted-foreground'
                          : 'text-sm font-medium text-foreground')
                }
            >
                {value}
            </td>
        </tr>
    );
}
