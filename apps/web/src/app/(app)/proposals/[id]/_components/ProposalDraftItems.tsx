'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { proposalsApi } from '@/lib/api';
import { formatBRL, formatPercent, formatQuantity } from '@/lib/format';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import type {
    CreateProposalItemPayload,
    ProposalDetail,
    ProposalItem,
    Role,
} from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalDraftItems — DRAFT-only items editor (EPIC A / A3a).
//
// Mounted by the proposal detail page only when status === 'DRAFT'. Holds the
// proposal in local state and re-renders it after every mutation: each item
// endpoint (add/edit/remove) returns the full ProposalDetail with totals
// already recomputed server-side, so we setProposal(response) and the table +
// totals update together. The client NEVER computes a total — row subtotals and
// the footer come straight from the backend.
//
// Role gates:
//   - canEdit (OWNER/ADMIN/OPERACIONAL → PROPOSAL.EDIT): shows the add/edit/
//     remove actions. Other roles viewing a DRAFT get the same table read-only.
//   - showInternalCost (OWNER/ADMIN): the "Custo interno" column + form field.
//     OPERACIONAL can edit but never sees internal cost — the backend strips it
//     from the payload and we omit the field from their edit form (so their
//     PATCH leaves the stored internalCost untouched).
// ─────────────────────────────────────────────────────────────────────────────

const CAN_EDIT_PROPOSAL_ROLES: readonly Role[] = ['OWNER', 'ADMIN', 'OPERACIONAL'];
const PRIVILEGED_ROLES: readonly Role[] = ['OWNER', 'ADMIN'];

export function ProposalDraftItems({ proposal: initial }: { proposal: ProposalDetail }) {
    const t = useTranslations('proposals.detail.items');
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;
    const role = activeMembership?.role;

    const [proposal, setProposal] = useState<ProposalDetail>(initial);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<ProposalItem | null>(null);
    const [removing, setRemoving] = useState<ProposalItem | null>(null);
    const [removeBusy, setRemoveBusy] = useState(false);

    const canEdit = Boolean(role && CAN_EDIT_PROPOSAL_ROLES.includes(role) && companyId);
    const showInternalCost = Boolean(role && PRIVILEGED_ROLES.includes(role));

    const hasDiscount =
        (proposal.discountPct !== null && proposal.discountPct !== undefined) ||
        (proposal.discountAmount !== null && proposal.discountAmount !== undefined);
    const labelSpan = showInternalCost ? 5 : 4; // leading cols before "Subtotal"
    const colCount = labelSpan + 2 + (canEdit ? 1 : 0); // + subtotal + (actions)

    function openAdd() {
        setEditing(null);
        setFormOpen(true);
    }

    function openEdit(item: ProposalItem) {
        setEditing(item);
        setFormOpen(true);
    }

    async function confirmRemove() {
        if (!removing || !companyId) return;
        setRemoveBusy(true);
        try {
            const next = await proposalsApi.removeItem(companyId, proposal.id, removing.id);
            setProposal(next);
            toast.success(t('editor.removed'));
            setRemoving(null);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.toUserMessage() : t('editor.removeError'));
        } finally {
            setRemoveBusy(false);
        }
    }

    return (
        <section aria-labelledby="proposal-items-heading">
            <div className="mb-3 flex items-center justify-between gap-4">
                <h2 id="proposal-items-heading" className="text-sm font-semibold text-foreground">
                    {t('title')}
                </h2>
                {canEdit ? (
                    <Button size="sm" onClick={openAdd}>
                        <Plus aria-hidden="true" />
                        {t('editor.addItem')}
                    </Button>
                ) : null}
            </div>

            <div className="overflow-hidden rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('columns.description')}</TableHead>
                            <TableHead className="w-[90px]">{t('columns.unit')}</TableHead>
                            <TableHead className="w-[90px] text-right">{t('columns.quantity')}</TableHead>
                            <TableHead className="w-[130px] text-right">{t('columns.unitPrice')}</TableHead>
                            <TableHead className="w-[100px] text-right">{t('columns.discount')}</TableHead>
                            {showInternalCost ? (
                                <TableHead className="w-[130px] text-right">
                                    {t('columns.internalCost')}
                                </TableHead>
                            ) : null}
                            <TableHead className="w-[140px] text-right">{t('columns.subtotal')}</TableHead>
                            {canEdit ? (
                                <TableHead className="w-[90px] text-right">
                                    {t('editor.actions')}
                                </TableHead>
                            ) : null}
                        </TableRow>
                    </TableHeader>

                    <TableBody>
                        {proposal.items.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={colCount}
                                    className="py-8 text-center text-sm text-muted-foreground"
                                >
                                    {t('editor.empty')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            proposal.items.map((item) => (
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
                                        {item.discountPct !== null ? formatPercent(item.discountPct) : '—'}
                                    </TableCell>
                                    {showInternalCost ? (
                                        <TableCell className="text-right tabular-nums text-muted-foreground">
                                            {formatBRL(item.internalCost)}
                                        </TableCell>
                                    ) : null}
                                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                                        {formatBRL(item.subtotal)}
                                    </TableCell>
                                    {canEdit ? (
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => openEdit(item)}
                                                    aria-label={t('editor.editItemAria', {
                                                        description: item.description,
                                                    })}
                                                >
                                                    <Pencil aria-hidden="true" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                    onClick={() => setRemoving(item)}
                                                    aria-label={t('editor.removeItemAria', {
                                                        description: item.description,
                                                    })}
                                                >
                                                    <Trash2 aria-hidden="true" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    ) : null}
                                </TableRow>
                            ))
                        )}
                    </TableBody>

                    {proposal.items.length > 0 ? (
                        <tfoot className="border-t bg-muted/30">
                            <TotalRow labelSpan={labelSpan} trailing={canEdit} label={t('totals.subtotal')} value={formatBRL(proposal.subtotal)} />
                            {hasDiscount ? (
                                <TotalRow
                                    labelSpan={labelSpan}
                                    trailing={canEdit}
                                    label={t('totals.discount')}
                                    value={
                                        proposal.discountPct !== null && proposal.discountPct !== undefined
                                            ? `− ${formatPercent(proposal.discountPct)}`
                                            : `− ${formatBRL(proposal.discountAmount)}`
                                    }
                                    muted
                                />
                            ) : null}
                            <TotalRow labelSpan={labelSpan} trailing={canEdit} label={t('totals.total')} value={formatBRL(proposal.totalPrice)} emphasis />
                            {proposal.totalCost !== undefined ? (
                                <TotalRow labelSpan={labelSpan} trailing={canEdit} label={t('totals.internalCost')} value={formatBRL(proposal.totalCost)} muted />
                            ) : null}
                        </tfoot>
                    ) : null}
                </Table>
            </div>

            {canEdit && companyId ? (
                <ItemFormDialog
                    key={editing?.id ?? 'new'}
                    open={formOpen}
                    onOpenChange={setFormOpen}
                    item={editing}
                    showInternalCost={showInternalCost}
                    companyId={companyId}
                    proposalId={proposal.id}
                    onMutated={setProposal}
                />
            ) : null}

            <AlertDialog open={removing !== null} onOpenChange={(o) => !o && !removeBusy && setRemoving(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('editor.removeTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('editor.removeWarning', { description: removing?.description ?? '' })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={removeBusy}>
                            {t('editor.removeCancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                void confirmRemove();
                            }}
                            disabled={removeBusy}
                            className={cn(buttonVariants({ variant: 'destructive' }))}
                        >
                            {removeBusy ? t('editor.removing') : t('editor.removeConfirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </section>
    );
}

function TotalRow({
    labelSpan,
    trailing,
    label,
    value,
    emphasis = false,
    muted = false,
}: {
    labelSpan: number;
    trailing: boolean;
    label: string;
    value: string;
    emphasis?: boolean;
    muted?: boolean;
}) {
    return (
        <tr>
            <td
                colSpan={labelSpan}
                className={cn(
                    'px-4 py-2 text-right text-sm',
                    emphasis ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
            >
                {label}
            </td>
            <td
                className={cn(
                    'px-4 py-2 text-right tabular-nums',
                    emphasis
                        ? 'text-base font-semibold text-foreground'
                        : muted
                          ? 'text-sm text-muted-foreground'
                          : 'text-sm font-medium text-foreground',
                )}
            >
                {value}
            </td>
            {trailing ? <td /> : null}
        </tr>
    );
}

// ── Item add/edit form dialog ────────────────────────────────────────────────

interface ItemFormValues {
    description: string;
    unit: string;
    quantity: string;
    unitPrice: string;
    discountPct: string;
    internalCost: string;
}

function ItemFormDialog({
    open,
    onOpenChange,
    item,
    showInternalCost,
    companyId,
    proposalId,
    onMutated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: ProposalItem | null;
    showInternalCost: boolean;
    companyId: string;
    proposalId: string;
    onMutated: (next: ProposalDetail) => void;
}) {
    const t = useTranslations('proposals.detail.items.editor');
    const isEdit = item !== null;

    const {
        register,
        handleSubmit,
        reset,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<ItemFormValues>({
        defaultValues: toFormValues(item),
        mode: 'onSubmit',
    });

    useEffect(() => {
        if (open) reset(toFormValues(item));
    }, [open, item, reset]);

    const onSubmit = handleSubmit(async (raw) => {
        const parsed = parseItemForm(raw, showInternalCost, t, setError);
        if (!parsed) return;

        try {
            const next = isEdit
                ? await proposalsApi.updateItem(companyId, proposalId, item.id, parsed)
                : await proposalsApi.addItem(companyId, proposalId, parsed as CreateProposalItemPayload);
            onMutated(next);
            toast.success(isEdit ? t('updated') : t('added'));
            onOpenChange(false);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.toUserMessage() : t('saveError'));
        }
    });

    return (
        <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{isEdit ? t('editTitle') : t('addTitle')}</DialogTitle>
                    <DialogDescription>{t('formDescription')}</DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-4" noValidate>
                    <Field id="item-description" label={t('fields.description')} error={errors.description?.message}>
                        <Input id="item-description" {...register('description')} autoFocus />
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
                        <Field id="item-quantity" label={t('fields.quantity')} error={errors.quantity?.message}>
                            <Input id="item-quantity" type="number" step="0.0001" inputMode="decimal" {...register('quantity')} />
                        </Field>
                        <Field id="item-unit" label={t('fields.unit')} error={errors.unit?.message}>
                            <Input id="item-unit" {...register('unit')} placeholder={t('fields.unitPlaceholder')} />
                        </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Field id="item-unit-price" label={t('fields.unitPrice')} error={errors.unitPrice?.message}>
                            <Input id="item-unit-price" type="number" step="0.01" inputMode="decimal" {...register('unitPrice')} />
                        </Field>
                        <Field id="item-discount" label={t('fields.discountPct')} error={errors.discountPct?.message}>
                            <Input id="item-discount" type="number" step="0.01" inputMode="decimal" placeholder="0" {...register('discountPct')} />
                        </Field>
                    </div>

                    {showInternalCost ? (
                        <Field id="item-internal-cost" label={t('fields.internalCost')} error={errors.internalCost?.message} hint={t('fields.internalCostHint')}>
                            <Input id="item-internal-cost" type="number" step="0.01" inputMode="decimal" {...register('internalCost')} />
                        </Field>
                    ) : null}

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                            {t('formCancel')}
                        </Button>
                        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                            {isSubmitting ? t('saving') : isEdit ? t('saveEdit') : t('saveAdd')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function Field({
    id,
    label,
    error,
    hint,
    children,
}: {
    id: string;
    label: string;
    error?: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            {children}
            {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}
        </div>
    );
}

function toFormValues(item: ProposalItem | null): ItemFormValues {
    if (!item) {
        return { description: '', unit: '', quantity: '1', unitPrice: '0', discountPct: '', internalCost: '' };
    }
    return {
        description: item.description,
        unit: item.unit ?? '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPct: item.discountPct ?? '',
        internalCost: item.internalCost ?? '',
    };
}

type TFn = (key: string) => string;
type SetErr = (field: keyof ItemFormValues, err: { message: string }) => void;

/**
 * Validates + normalizes the string form into a CreateProposalItemPayload-shaped
 * object (also valid as an UpdateProposalItemPayload). Returns null and sets
 * field errors when invalid. internalCost is only included for privileged
 * editors — omitting it on a PATCH leaves the stored value unchanged.
 */
function parseItemForm(
    raw: ItemFormValues,
    showInternalCost: boolean,
    t: TFn,
    setError: SetErr,
): CreateProposalItemPayload | null {
    const description = raw.description.trim();
    if (description.length === 0) {
        setError('description', { message: t('errors.descriptionRequired') });
        return null;
    }
    if (description.length > 1024) {
        setError('description', { message: t('errors.descriptionTooLong') });
        return null;
    }

    const unit = raw.unit.trim();
    if (unit.length > 32) {
        setError('unit', { message: t('errors.unitTooLong') });
        return null;
    }

    const quantity = Number(raw.quantity);
    if (!Number.isFinite(quantity) || quantity < 0.0001) {
        setError('quantity', { message: t('errors.quantityInvalid') });
        return null;
    }

    const unitPrice = Number(raw.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        setError('unitPrice', { message: t('errors.unitPriceInvalid') });
        return null;
    }

    let discountPct: number | null = null;
    if (raw.discountPct.trim() !== '') {
        const d = Number(raw.discountPct);
        if (!Number.isFinite(d) || d < 0 || d > 100) {
            setError('discountPct', { message: t('errors.discountInvalid') });
            return null;
        }
        discountPct = d;
    }

    const payload: CreateProposalItemPayload = {
        description,
        unit: unit || undefined,
        quantity,
        unitPrice,
        discountPct,
    };

    if (showInternalCost) {
        if (raw.internalCost.trim() === '') {
            payload.internalCost = null;
        } else {
            const c = Number(raw.internalCost);
            if (!Number.isFinite(c) || c < 0) {
                setError('internalCost', { message: t('errors.internalCostInvalid') });
                return null;
            }
            payload.internalCost = c;
        }
    }

    return payload;
}
