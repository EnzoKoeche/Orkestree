'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { proposalsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { ProposalDetail, ProposalStatus } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalActions
//
// Status-driven action bar for the proposal detail page. Each action maps
// 1:1 to a backend endpoint:
//
//   send    → POST /proposals/:id/send     (DRAFT → SENT)
//   approve → POST /proposals/:id/approve  (SENT  → APPROVED)
//   reject  → POST /proposals/:id/reject   (SENT  → REJECTED)
//   cancel  → POST /proposals/:id/cancel   (DRAFT|SENT → CANCELLED)
//
// The frontend disables actions that don't make sense for the current
// status — but the backend re-validates everything, so a stale UI tab
// can never push a forbidden transition through.
// ─────────────────────────────────────────────────────────────────────────────

type ActionKind = 'send' | 'approve' | 'reject' | 'cancel';

interface ProposalActionsProps {
    proposal: ProposalDetail;
    companyId: string;
    onMutated: (next: ProposalDetail) => void;
}

const ALLOWED: Record<ActionKind, ProposalStatus[]> = {
    send: ['DRAFT'],
    approve: ['SENT'],
    reject: ['SENT'],
    cancel: ['DRAFT', 'SENT'],
};

const LABELS: Record<ActionKind, { button: string; title: string; confirm: string; helper?: string; reasonLabel?: string }> = {
    send: {
        button: 'Send to client',
        title: 'Send proposal?',
        confirm: 'Send',
        helper:
            'The proposal becomes immutable for items, totals, and discount fields once sent.',
    },
    approve: {
        button: 'Approve',
        title: 'Approve proposal?',
        confirm: 'Approve',
        helper:
            'Approving will trigger the PDF render in the background. The PDF action becomes available once the worker finishes.',
    },
    reject: {
        button: 'Reject',
        title: 'Reject proposal?',
        confirm: 'Reject',
        reasonLabel: 'Rejection reason',
    },
    cancel: {
        button: 'Cancel proposal',
        title: 'Cancel proposal?',
        confirm: 'Cancel proposal',
        reasonLabel: 'Cancellation reason',
    },
};

export function ProposalActions({ proposal, companyId, onMutated }: ProposalActionsProps) {
    const toast = useToast();
    const [open, setOpen] = useState<ActionKind | null>(null);
    const [reason, setReason] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    function startAction(kind: ActionKind) {
        setReason('');
        setNote('');
        setOpen(kind);
    }

    async function runAction() {
        if (!open) return;
        setBusy(true);
        try {
            let next: ProposalDetail;
            const trimmedReason = reason.trim() || undefined;
            const trimmedNote = note.trim() || undefined;
            switch (open) {
                case 'send':
                    next = await proposalsApi.send(companyId, proposal.id, { note: trimmedNote });
                    toast.show('Proposal sent.', 'success');
                    break;
                case 'approve':
                    next = await proposalsApi.approve(companyId, proposal.id, {
                        note: trimmedNote,
                    });
                    toast.show('Proposal approved. PDF generation queued.', 'success');
                    break;
                case 'reject':
                    next = await proposalsApi.reject(companyId, proposal.id, {
                        reason: trimmedReason,
                        note: trimmedNote,
                    });
                    toast.show('Proposal rejected.', 'success');
                    break;
                case 'cancel':
                    next = await proposalsApi.cancel(companyId, proposal.id, {
                        reason: trimmedReason,
                        note: trimmedNote,
                    });
                    toast.show('Proposal cancelled.', 'success');
                    break;
            }
            onMutated(next);
            setOpen(null);
        } catch (err) {
            const msg = err instanceof ApiError ? err.toUserMessage() : 'Operation failed.';
            toast.show(msg, 'danger');
        } finally {
            setBusy(false);
        }
    }

    const status = proposal.status;
    const can = (k: ActionKind) => ALLOWED[k].includes(status);

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                {can('send') ? (
                    <Button variant="primary" onClick={() => startAction('send')}>
                        {LABELS.send.button}
                    </Button>
                ) : null}
                {can('approve') ? (
                    <Button variant="primary" onClick={() => startAction('approve')}>
                        {LABELS.approve.button}
                    </Button>
                ) : null}
                {can('reject') ? (
                    <Button
                        variant="secondary"
                        tone="danger"
                        onClick={() => startAction('reject')}
                    >
                        {LABELS.reject.button}
                    </Button>
                ) : null}
                {can('cancel') ? (
                    <Button variant="ghost" tone="danger" onClick={() => startAction('cancel')}>
                        {LABELS.cancel.button}
                    </Button>
                ) : null}
            </div>

            <Modal
                open={open !== null}
                onClose={() => (busy ? undefined : setOpen(null))}
                title={open ? LABELS[open].title : ''}
                description={open ? LABELS[open].helper : undefined}
                busy={busy}
                footer={
                    open && (
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => setOpen(null)}
                                disabled={busy}
                            >
                                Back
                            </Button>
                            <Button
                                variant="primary"
                                tone={open === 'reject' || open === 'cancel' ? 'danger' : 'neutral'}
                                loading={busy}
                                onClick={runAction}
                            >
                                {LABELS[open].confirm}
                            </Button>
                        </>
                    )
                }
            >
                {open ? (
                    <div className="flex flex-col gap-3">
                        {LABELS[open].reasonLabel ? (
                            <Field
                                label={LABELS[open].reasonLabel}
                                htmlFor="reason"
                                helper="Stored on the proposal and visible in the status history."
                            >
                                <Textarea
                                    id="reason"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    rows={3}
                                    placeholder=""
                                />
                            </Field>
                        ) : null}
                        <Field
                            label="Internal note (optional)"
                            htmlFor="note"
                            helper="Recorded in the audit trail; not shown to the client."
                        >
                            <Textarea
                                id="note"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                rows={3}
                            />
                        </Field>
                    </div>
                ) : null}
            </Modal>
        </>
    );
}
