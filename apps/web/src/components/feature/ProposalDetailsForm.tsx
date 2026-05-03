'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { proposalsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { ProposalDetail, UpdateProposalPayload } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalDetailsForm
//
// Edits the proposal-level mutable draft fields:
//   - title
//   - notes (internal)
//   - clientNotes (client-facing)
//   - validUntil
//   - discountPct / discountAmount  (mutually exclusive on the backend)
//
// Why this is a controlled "draft buffer" rather than an inline-per-field
// editor:
//
//   * The backend's discount validation is cross-field: the API rejects a
//     request that sets one discount type while the other is still set,
//     unless the same payload also clears it. Bundling all changes into a
//     single PATCH lets us honour that with one round-trip.
//
//   * Save is the only state-changing action — every other affordance is
//     either Reset (drops local edits) or Cancel (does the same and lets
//     the rest of the page render the canonical snapshot).
//
// On success the parent receives the full ProposalDetail returned by the
// API and re-renders. We do NOT recompute totals locally — those come from
// the response, which is the only authoritative source.
// ─────────────────────────────────────────────────────────────────────────────

interface ProposalDetailsFormProps {
    proposal: ProposalDetail;
    companyId: string;
    onSaved: (next: ProposalDetail) => void;
}

interface FormState {
    title: string;
    notes: string;
    clientNotes: string;
    validUntil: string; // YYYY-MM-DD or '' for "no value"
    discountKind: 'none' | 'pct' | 'amount';
    discountValue: string; // raw input, parsed only on submit
}

function buildInitialState(proposal: ProposalDetail): FormState {
    return {
        title: proposal.title ?? '',
        notes: proposal.notes ?? '',
        clientNotes: proposal.clientNotes ?? '',
        validUntil: toDateInputValue(proposal.validUntil),
        discountKind: proposal.discountPct
            ? 'pct'
            : proposal.discountAmount
                ? 'amount'
                : 'none',
        discountValue: proposal.discountPct
            ? proposal.discountPct
            : proposal.discountAmount
                ? proposal.discountAmount
                : '',
    };
}

/**
 * The backend stores `validUntil` as a timestamp. The HTML date input wants
 * YYYY-MM-DD. We trim the time portion off the ISO string; if parsing fails
 * (e.g. malformed string from a future schema change), we fall back to
 * empty rather than crash the form.
 */
function toDateInputValue(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Convert a date-input value back to an ISO-8601 string at UTC midnight.
 * The backend uses `new Date(dto.validUntil)` so we send a parseable value;
 * choosing midnight UTC keeps the displayed date stable across timezones
 * for the operator console (an internal tool — no client-facing locale
 * roundtrip in scope here).
 */
function fromDateInputValue(s: string): string | null {
    if (!s) return null;
    // Construct as UTC to avoid yesterday-at-23:00 surprises in negative
    // offsets when the server stores it back.
    return new Date(`${s}T00:00:00.000Z`).toISOString();
}

export function ProposalDetailsForm({
    proposal,
    companyId,
    onSaved,
}: ProposalDetailsFormProps) {
    const toast = useToast();
    const initial = useMemo(() => buildInitialState(proposal), [proposal]);
    const [state, setState] = useState<FormState>(initial);
    const [busy, setBusy] = useState(false);
    const [fieldError, setFieldError] = useState<string | null>(null);

    // Re-seed local state when the proposal changes (e.g. after the items
    // editor refetches and the parent passes a new snapshot in). Only does
    // so when the form is idle — otherwise an in-flight edit would clobber
    // user input mid-typing.
    useEffect(() => {
        if (busy) return;
        setState(initial);
        setFieldError(null);
    }, [initial, busy]);

    const dirty = useMemo(() => {
        return (
            state.title !== initial.title ||
            state.notes !== initial.notes ||
            state.clientNotes !== initial.clientNotes ||
            state.validUntil !== initial.validUntil ||
            state.discountKind !== initial.discountKind ||
            state.discountValue !== initial.discountValue
        );
    }, [state, initial]);

    function buildPayload(): UpdateProposalPayload | { error: string } {
        const payload: UpdateProposalPayload = {};

        const trimmedTitle = state.title.trim();
        if (trimmedTitle.length === 0) {
            return { error: 'Title cannot be empty.' };
        }
        if (trimmedTitle !== initial.title) {
            payload.title = trimmedTitle;
        }

        if (state.notes !== initial.notes) {
            payload.notes = state.notes.length === 0 ? null : state.notes;
        }
        if (state.clientNotes !== initial.clientNotes) {
            payload.clientNotes =
                state.clientNotes.length === 0 ? null : state.clientNotes;
        }
        if (state.validUntil !== initial.validUntil) {
            payload.validUntil = fromDateInputValue(state.validUntil);
        }

        // Discount: model the cross-field invariant explicitly. The backend
        // rejects setting one type while the other is still non-null, so
        // when we switch types or clear we always send BOTH keys in the
        // same request.
        if (
            state.discountKind !== initial.discountKind ||
            state.discountValue !== initial.discountValue
        ) {
            if (state.discountKind === 'none') {
                payload.discountPct = null;
                payload.discountAmount = null;
            } else {
                const trimmed = state.discountValue.trim();
                if (trimmed.length === 0) {
                    return { error: 'Enter a discount value, or choose "No discount".' };
                }
                const parsed = Number(trimmed);
                if (!Number.isFinite(parsed) || parsed < 0) {
                    return { error: 'Discount must be a non-negative number.' };
                }
                if (state.discountKind === 'pct') {
                    if (parsed > 100) {
                        return { error: 'Percentage discount cannot exceed 100.' };
                    }
                    payload.discountPct = parsed;
                    payload.discountAmount = null;
                } else {
                    payload.discountAmount = parsed;
                    payload.discountPct = null;
                }
            }
        }

        return payload;
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (busy || !dirty) return;

        const built = buildPayload();
        if ('error' in built) {
            setFieldError(built.error);
            return;
        }
        if (Object.keys(built).length === 0) {
            // Nothing to send. Treat as a no-op rather than calling the API
            // (the backend would still respond OK, but we save the round-trip).
            return;
        }

        setBusy(true);
        setFieldError(null);
        try {
            const next = await proposalsApi.update(companyId, proposal.id, built);
            onSaved(next);
            toast.show('Proposal updated.', 'success');
        } catch (err) {
            const msg =
                err instanceof ApiError
                    ? err.toUserMessage()
                    : 'Could not save changes.';
            toast.show(msg, 'danger');
            setFieldError(msg);
        } finally {
            setBusy(false);
        }
    }

    function onReset() {
        if (busy) return;
        setState(initial);
        setFieldError(null);
    }

    return (
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <Field label="Title" htmlFor="proposal-title">
                <Input
                    id="proposal-title"
                    value={state.title}
                    onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
                    maxLength={256}
                    disabled={busy}
                    required
                />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                    label="Valid until"
                    htmlFor="proposal-valid-until"
                    helper="Leave empty if the proposal does not expire."
                >
                    <Input
                        id="proposal-valid-until"
                        type="date"
                        value={state.validUntil}
                        onChange={(e) =>
                            setState((s) => ({ ...s, validUntil: e.target.value }))
                        }
                        disabled={busy}
                    />
                </Field>

                <Field
                    label="Discount"
                    helper="Percentage and fixed amount are mutually exclusive."
                >
                    <div className="flex gap-2">
                        <select
                            value={state.discountKind}
                            onChange={(e) =>
                                setState((s) => ({
                                    ...s,
                                    discountKind: e.target.value as FormState['discountKind'],
                                    discountValue:
                                        e.target.value === 'none' ? '' : s.discountValue,
                                }))
                            }
                            disabled={busy}
                            className="rounded-md border border-border bg-surface-base px-3 py-2 text-sm text-ink focus-ring disabled:bg-surface-sunken"
                        >
                            <option value="none">No discount</option>
                            <option value="pct">Percentage (%)</option>
                            <option value="amount">Fixed amount</option>
                        </select>
                        <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min={0}
                            max={state.discountKind === 'pct' ? 100 : undefined}
                            value={state.discountValue}
                            onChange={(e) =>
                                setState((s) => ({ ...s, discountValue: e.target.value }))
                            }
                            disabled={busy || state.discountKind === 'none'}
                            placeholder={state.discountKind === 'pct' ? '0–100' : '0.00'}
                            aria-label="Discount value"
                        />
                    </div>
                </Field>
            </div>

            <Field
                label="Internal notes"
                htmlFor="proposal-notes"
                helper="Visible to the operator team only. Not included in the PDF."
            >
                <Textarea
                    id="proposal-notes"
                    value={state.notes}
                    onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
                    maxLength={4096}
                    rows={3}
                    disabled={busy}
                />
            </Field>

            <Field
                label="Client-facing notes"
                htmlFor="proposal-client-notes"
                helper="Shown to the client and rendered on the PDF after approval."
            >
                <Textarea
                    id="proposal-client-notes"
                    value={state.clientNotes}
                    onChange={(e) =>
                        setState((s) => ({ ...s, clientNotes: e.target.value }))
                    }
                    maxLength={4096}
                    rows={3}
                    disabled={busy}
                />
            </Field>

            {fieldError ? (
                <p className="text-xs text-state-danger" role="alert">
                    {fieldError}
                </p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
                <Button
                    variant="ghost"
                    onClick={onReset}
                    disabled={busy || !dirty}
                    type="button"
                >
                    Reset
                </Button>
                <Button
                    variant="primary"
                    type="submit"
                    loading={busy}
                    disabled={busy || !dirty}
                >
                    Save changes
                </Button>
            </div>
        </form>
    );
}
