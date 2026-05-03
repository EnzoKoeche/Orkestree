'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { proposalsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import {
    CreateProposalItemPayload,
    ProposalDetail,
    ProposalItem,
    UpdateProposalItemPayload,
} from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalItemsEditor
//
// DRAFT-only items CRUD UI. Three operations are wired:
//
//   add     → POST   /proposals/:id/items
//   update  → PATCH  /proposals/:id/items/:itemId
//   remove  → DELETE /proposals/:id/items/:itemId
//
// Reorder is intentionally NOT included: the backend accepts `sortOrder` on
// create/update DTOs but does not expose a dedicated reorder endpoint, and
// driving drag-and-drop through one-PATCH-per-row is operationally noisy
// for a DRAFT-only editor. Sort order is editable as a numeric field on
// each item (the same field the backend uses), which is enough for the
// operator console today and avoids inventing a contract that doesn't
// exist. Document this in the PR description.
//
// Every endpoint returns the full ProposalDetail with totals already
// recomputed by ProposalItemsService — we surface that response verbatim
// to the parent. We never compute totals on the client; the row-level
// "subtotal" rendered in the table is the value the API returned for that
// item, never derived from quantity × unitPrice on the front-end.
// ─────────────────────────────────────────────────────────────────────────────

interface ProposalItemsEditorProps {
    proposal: ProposalDetail;
    companyId: string;
    onMutated: (next: ProposalDetail) => void;
    /**
     * When false, the component renders read-only — used while the parent
     * still wants the same table shape but the proposal is no longer DRAFT.
     * The parent currently only mounts this component for DRAFT proposals,
     * but we keep the prop because it makes the contract explicit.
     */
    editable: boolean;
    /** Whether the privileged columns (internalCost) should be rendered. */
    showInternalCost: boolean;
}

// Form draft state shared by add + edit modal. Strings throughout because
// number inputs are easier to handle as strings until submit (intermediate
// "1." or "" states blow up Number()).
interface ItemDraft {
    description: string;
    unit: string;
    quantity: string;
    unitPrice: string;
    discountPct: string;
    internalCost: string;
    sortOrder: string;
}

function emptyDraft(): ItemDraft {
    return {
        description: '',
        unit: '',
        quantity: '1',
        unitPrice: '0',
        discountPct: '',
        internalCost: '',
        sortOrder: '',
    };
}

function draftFromItem(item: ProposalItem): ItemDraft {
    return {
        description: item.description,
        unit: item.unit ?? '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPct: item.discountPct ?? '',
        // internalCost is undefined for non-privileged roles — the API
        // strips it at the Prisma select layer. We render an empty string
        // so the field is editable for privileged users without leaking
        // the value to roles that shouldn't see it.
        internalCost: item.internalCost ?? '',
        sortOrder: String(item.sortOrder ?? 0),
    };
}

interface ParseResult<T> {
    ok: true;
    value: T;
}
interface ParseError {
    ok: false;
    error: string;
}

function parseAddPayload(d: ItemDraft): ParseResult<CreateProposalItemPayload> | ParseError {
    const description = d.description.trim();
    if (description.length === 0) {
        return { ok: false, error: 'Description is required.' };
    }
    const quantity = Number(d.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
        return { ok: false, error: 'Quantity must be greater than 0.' };
    }
    const unitPrice = Number(d.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return { ok: false, error: 'Unit price must be a non-negative number.' };
    }

    const payload: CreateProposalItemPayload = {
        description,
        quantity,
        unitPrice,
    };
    if (d.unit.trim()) payload.unit = d.unit.trim();

    if (d.discountPct.trim()) {
        const dp = Number(d.discountPct);
        if (!Number.isFinite(dp) || dp < 0 || dp > 100) {
            return { ok: false, error: 'Discount % must be between 0 and 100.' };
        }
        payload.discountPct = dp;
    }

    if (d.internalCost.trim()) {
        const ic = Number(d.internalCost);
        if (!Number.isFinite(ic) || ic < 0) {
            return { ok: false, error: 'Internal cost must be non-negative.' };
        }
        payload.internalCost = ic;
    }

    if (d.sortOrder.trim()) {
        const so = Number(d.sortOrder);
        if (!Number.isInteger(so) || so < 0) {
            return { ok: false, error: 'Sort order must be a non-negative integer.' };
        }
        payload.sortOrder = so;
    }

    return { ok: true, value: payload };
}

/**
 * For PATCH, we send only the keys that actually changed against the
 * original item. The backend rejects empty bodies with 422; we therefore
 * also report "no changes" before the round-trip.
 */
function parseUpdatePayload(
    d: ItemDraft,
    original: ProposalItem,
): ParseResult<UpdateProposalItemPayload> | ParseError {
    const payload: UpdateProposalItemPayload = {};

    const description = d.description.trim();
    if (description.length === 0) {
        return { ok: false, error: 'Description is required.' };
    }
    if (description !== original.description) payload.description = description;

    const unitInput = d.unit.trim();
    const originalUnit = original.unit ?? '';
    if (unitInput !== originalUnit) {
        payload.unit = unitInput.length === 0 ? null : unitInput;
    }

    if (d.quantity !== original.quantity) {
        const q = Number(d.quantity);
        if (!Number.isFinite(q) || q <= 0) {
            return { ok: false, error: 'Quantity must be greater than 0.' };
        }
        payload.quantity = q;
    }

    if (d.unitPrice !== original.unitPrice) {
        const up = Number(d.unitPrice);
        if (!Number.isFinite(up) || up < 0) {
            return { ok: false, error: 'Unit price must be a non-negative number.' };
        }
        payload.unitPrice = up;
    }

    const originalDiscount = original.discountPct ?? '';
    if (d.discountPct !== originalDiscount) {
        if (d.discountPct.trim().length === 0) {
            payload.discountPct = null;
        } else {
            const dp = Number(d.discountPct);
            if (!Number.isFinite(dp) || dp < 0 || dp > 100) {
                return { ok: false, error: 'Discount % must be between 0 and 100.' };
            }
            payload.discountPct = dp;
        }
    }

    // internalCost: only included if the role can see it (otherwise the
    // input was disabled and the value matches the empty default).
    if (original.internalCost !== undefined) {
        const originalIC = original.internalCost ?? '';
        if (d.internalCost !== originalIC) {
            if (d.internalCost.trim().length === 0) {
                payload.internalCost = null;
            } else {
                const ic = Number(d.internalCost);
                if (!Number.isFinite(ic) || ic < 0) {
                    return { ok: false, error: 'Internal cost must be non-negative.' };
                }
                payload.internalCost = ic;
            }
        }
    }

    const originalSort = String(original.sortOrder ?? 0);
    if (d.sortOrder.trim() !== originalSort) {
        const so = Number(d.sortOrder.trim() || '0');
        if (!Number.isInteger(so) || so < 0) {
            return { ok: false, error: 'Sort order must be a non-negative integer.' };
        }
        payload.sortOrder = so;
    }

    if (Object.keys(payload).length === 0) {
        return { ok: false, error: 'No changes to save.' };
    }

    return { ok: true, value: payload };
}

type EditorMode =
    | { kind: 'idle' }
    | { kind: 'add' }
    | { kind: 'edit'; item: ProposalItem }
    | { kind: 'delete'; item: ProposalItem };

export function ProposalItemsEditor({
    proposal,
    companyId,
    onMutated,
    editable,
    showInternalCost,
}: ProposalItemsEditorProps) {
    const toast = useToast();
    const [mode, setMode] = useState<EditorMode>({ kind: 'idle' });
    const [draft, setDraft] = useState<ItemDraft>(emptyDraft());
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // Reset draft + error whenever the modal target changes.
    useEffect(() => {
        if (mode.kind === 'add') {
            setDraft(emptyDraft());
        } else if (mode.kind === 'edit') {
            setDraft(draftFromItem(mode.item));
        }
        setFormError(null);
    }, [mode]);

    const items = proposal.items;
    const isEmpty = items.length === 0;

    function open(next: EditorMode) {
        if (busy) return;
        setMode(next);
    }

    function close() {
        if (busy) return;
        setMode({ kind: 'idle' });
    }

    async function submitAdd() {
        if (busy) return;
        const parsed = parseAddPayload(draft);
        if (!parsed.ok) {
            setFormError(parsed.error);
            return;
        }
        setBusy(true);
        setFormError(null);
        try {
            const next = await proposalsApi.addItem(companyId, proposal.id, parsed.value);
            onMutated(next);
            toast.show('Item added.', 'success');
            setMode({ kind: 'idle' });
        } catch (err) {
            const msg =
                err instanceof ApiError ? err.toUserMessage() : 'Could not add item.';
            toast.show(msg, 'danger');
            setFormError(msg);
        } finally {
            setBusy(false);
        }
    }

    async function submitEdit() {
        if (busy || mode.kind !== 'edit') return;
        const parsed = parseUpdatePayload(draft, mode.item);
        if (!parsed.ok) {
            setFormError(parsed.error);
            return;
        }
        setBusy(true);
        setFormError(null);
        try {
            const next = await proposalsApi.updateItem(
                companyId,
                proposal.id,
                mode.item.id,
                parsed.value,
            );
            onMutated(next);
            toast.show('Item updated.', 'success');
            setMode({ kind: 'idle' });
        } catch (err) {
            const msg =
                err instanceof ApiError ? err.toUserMessage() : 'Could not update item.';
            toast.show(msg, 'danger');
            setFormError(msg);
        } finally {
            setBusy(false);
        }
    }

    async function submitDelete() {
        if (busy || mode.kind !== 'delete') return;
        setBusy(true);
        try {
            const next = await proposalsApi.removeItem(
                companyId,
                proposal.id,
                mode.item.id,
            );
            onMutated(next);
            toast.show('Item removed.', 'success');
            setMode({ kind: 'idle' });
        } catch (err) {
            const msg =
                err instanceof ApiError ? err.toUserMessage() : 'Could not remove item.';
            toast.show(msg, 'danger');
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <div className="flex flex-col">
                {isEmpty ? (
                    <div className="flex flex-col items-start gap-3 px-5 py-6">
                        <p className="text-sm text-ink-subtle">
                            No items added yet.
                        </p>
                        {editable ? (
                            <Button variant="primary" onClick={() => open({ kind: 'add' })}>
                                Add first item
                            </Button>
                        ) : null}
                    </div>
                ) : (
                    <Table>
                        <Table.Head>
                            <tr>
                                <Table.Cell head>Description</Table.Cell>
                                <Table.Cell head>Unit</Table.Cell>
                                <Table.Cell head align="right">
                                    Qty
                                </Table.Cell>
                                <Table.Cell head align="right">
                                    Unit price
                                </Table.Cell>
                                <Table.Cell head align="right">
                                    Discount
                                </Table.Cell>
                                {showInternalCost ? (
                                    <Table.Cell head align="right">
                                        Internal cost
                                    </Table.Cell>
                                ) : null}
                                <Table.Cell head align="right">
                                    Subtotal
                                </Table.Cell>
                                {editable ? <Table.Cell head align="right">{''}</Table.Cell> : null}
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
                                    {editable ? (
                                        <Table.Cell align="right">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() =>
                                                        open({ kind: 'edit', item })
                                                    }
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    tone="danger"
                                                    onClick={() =>
                                                        open({ kind: 'delete', item })
                                                    }
                                                >
                                                    Remove
                                                </Button>
                                            </div>
                                        </Table.Cell>
                                    ) : null}
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                )}

                {editable && !isEmpty ? (
                    <div className="flex justify-end px-5 py-3">
                        <Button variant="secondary" onClick={() => open({ kind: 'add' })}>
                            Add item
                        </Button>
                    </div>
                ) : null}
            </div>

            {/* ── Add / Edit modal ─────────────────────────────────────────── */}
            <Modal
                open={mode.kind === 'add' || mode.kind === 'edit'}
                onClose={close}
                title={mode.kind === 'edit' ? 'Edit item' : 'Add item'}
                description={
                    mode.kind === 'edit'
                        ? 'Subtotals are recalculated by the server after saving.'
                        : 'Subtotals are calculated by the server when the item is added.'
                }
                busy={busy}
                footer={
                    <>
                        <Button variant="secondary" onClick={close} disabled={busy}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            loading={busy}
                            onClick={mode.kind === 'edit' ? submitEdit : submitAdd}
                            disabled={busy}
                        >
                            {mode.kind === 'edit' ? 'Save item' : 'Add item'}
                        </Button>
                    </>
                }
            >
                <ItemForm
                    draft={draft}
                    onChange={setDraft}
                    formError={formError}
                    showInternalCost={showInternalCost}
                    disabled={busy}
                />
            </Modal>

            {/* ── Delete confirmation ──────────────────────────────────────── */}
            <Modal
                open={mode.kind === 'delete'}
                onClose={close}
                title="Remove item?"
                description={
                    mode.kind === 'delete'
                        ? `"${truncate(mode.item.description, 80)}" will be removed from this proposal.`
                        : undefined
                }
                busy={busy}
                footer={
                    <>
                        <Button variant="secondary" onClick={close} disabled={busy}>
                            Back
                        </Button>
                        <Button
                            variant="primary"
                            tone="danger"
                            loading={busy}
                            onClick={submitDelete}
                            disabled={busy}
                        >
                            Remove item
                        </Button>
                    </>
                }
            />
        </>
    );
}

function truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
}

function ItemForm({
    draft,
    onChange,
    formError,
    showInternalCost,
    disabled,
}: {
    draft: ItemDraft;
    onChange: (next: ItemDraft) => void;
    formError: string | null;
    showInternalCost: boolean;
    disabled: boolean;
}) {
    function set<K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) {
        onChange({ ...draft, [key]: value });
    }

    // Note: this is intentional — we never compute the line subtotal here,
    // even as a hint, to avoid drifting from the server's authoritative
    // arithmetic. The new value will appear in the table after the save.
    const previewNote = useMemo(() => {
        const q = Number(draft.quantity);
        const p = Number(draft.unitPrice);
        if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p < 0) return null;
        return `Server will compute: ${formatNumber(q, 2)} × ${formatCurrency(p)}` +
            (draft.discountPct.trim() ? ` − ${draft.discountPct.trim()}%` : '');
    }, [draft.quantity, draft.unitPrice, draft.discountPct]);

    return (
        <div className="flex flex-col gap-3">
            <Field label="Description" htmlFor="item-description">
                <Textarea
                    id="item-description"
                    value={draft.description}
                    onChange={(e) => set('description', e.target.value)}
                    rows={2}
                    maxLength={1024}
                    disabled={disabled}
                    required
                />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Unit" htmlFor="item-unit" helper="e.g. h, day, item">
                    <Input
                        id="item-unit"
                        value={draft.unit}
                        onChange={(e) => set('unit', e.target.value)}
                        maxLength={32}
                        disabled={disabled}
                    />
                </Field>
                <Field label="Quantity" htmlFor="item-quantity">
                    <Input
                        id="item-quantity"
                        type="number"
                        inputMode="decimal"
                        step="0.0001"
                        min={0.0001}
                        value={draft.quantity}
                        onChange={(e) => set('quantity', e.target.value)}
                        disabled={disabled}
                        required
                    />
                </Field>
                <Field label="Unit price" htmlFor="item-unit-price">
                    <Input
                        id="item-unit-price"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        value={draft.unitPrice}
                        onChange={(e) => set('unitPrice', e.target.value)}
                        disabled={disabled}
                        required
                    />
                </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Discount %" htmlFor="item-discount-pct">
                    <Input
                        id="item-discount-pct"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        max={100}
                        value={draft.discountPct}
                        onChange={(e) => set('discountPct', e.target.value)}
                        disabled={disabled}
                        placeholder="0–100"
                    />
                </Field>
                {showInternalCost ? (
                    <Field
                        label="Internal cost / unit"
                        htmlFor="item-internal-cost"
                        helper="Privileged-only. Hidden from non-admins."
                    >
                        <Input
                            id="item-internal-cost"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min={0}
                            value={draft.internalCost}
                            onChange={(e) => set('internalCost', e.target.value)}
                            disabled={disabled}
                        />
                    </Field>
                ) : null}
                <Field
                    label="Sort order"
                    htmlFor="item-sort-order"
                    helper="Lower values appear first."
                >
                    <Input
                        id="item-sort-order"
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min={0}
                        value={draft.sortOrder}
                        onChange={(e) => set('sortOrder', e.target.value)}
                        disabled={disabled}
                        placeholder="0"
                    />
                </Field>
            </div>

            {previewNote ? (
                <p className="text-xs text-ink-subtle">{previewNote}</p>
            ) : null}
            {formError ? (
                <p className="text-xs text-state-danger" role="alert">
                    {formError}
                </p>
            ) : null}
        </div>
    );
}
