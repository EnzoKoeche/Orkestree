'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { proposalsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { ServiceRequestDetail } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// CreateProposalButton
//
// Mounted on the Service Request detail page. Opens a tiny modal that
// captures only what `CreateProposalDto` requires:
//
//   - `title`        : seeded with the request title so the operator can
//                       confirm or rewrite it; backend validates 1–256 chars.
//   - `validUntil`   : optional; HTML <input type="date"> — serialized to
//                       UTC midnight ISO-8601 to satisfy @IsISO8601().
//   - `clientNotes`  : optional client-facing notes; surfaces the same
//                       editor presented inside the proposal detail page.
//
// We deliberately do NOT collect items here — the proposal is created in
// DRAFT and the existing ProposalItemsEditor takes over on the detail page.
// Adding items inline would duplicate that surface and force us to recreate
// item-validation rules on the frontend.
//
// On success, the new ProposalDetail is returned by the backend and we
// navigate straight to /proposals/:id where the DRAFT editor (already
// shipped in the previous PR) takes over. We do NOT re-fetch on the SR
// detail page; the caller's `useResource` hook on the related-proposals
// list will refetch on next focus / mount, and stale data here is harmless
// because the SR page's other content is unaffected.
//
// Error handling mirrors ProposalActions: 422 surfaces the backend's clear
// rule message verbatim; 403 / 404 / 409 fall back to ApiError.toUserMessage.
// ─────────────────────────────────────────────────────────────────────────────

interface CreateProposalButtonProps {
    request: ServiceRequestDetail;
    companyId: string;
}

export function CreateProposalButton({ request, companyId }: CreateProposalButtonProps) {
    const toast = useToast();
    const router = useRouter();

    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState(request.title);
    const [validUntil, setValidUntil] = useState('');
    const [clientNotes, setClientNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [fieldError, setFieldError] = useState<string | null>(null);

    // Reset the form whenever the modal opens. Defaulting `title` to the
    // request title every time avoids stale state if the request title was
    // edited while the modal was closed.
    useEffect(() => {
        if (!open) return;
        setTitle(request.title);
        setValidUntil('');
        setClientNotes('');
        setFieldError(null);
        setBusy(false);
    }, [open, request.title]);

    // Cancelled requests are already filtered out by the page-level disable
    // in the parent, but be defensive: a stale tab where the request was
    // cancelled meanwhile would 404 the create call.
    const disabled = request.isCancelled;

    function close() {
        if (busy) return;
        setOpen(false);
    }

    async function submit() {
        const trimmed = title.trim();
        if (trimmed.length === 0) {
            setFieldError('Title is required.');
            return;
        }
        if (trimmed.length > 256) {
            setFieldError('Title must be at most 256 characters.');
            return;
        }
        setFieldError(null);

        // Convert the HTML date input ("YYYY-MM-DD") to a full UTC-midnight
        // ISO-8601 string. The backend DTO validates @IsISO8601() and only
        // a date is too short. UTC midnight matches how
        // ProposalDetailsForm serializes the same field.
        let validUntilIso: string | undefined;
        if (validUntil) {
            const candidate = new Date(`${validUntil}T00:00:00Z`);
            if (Number.isNaN(candidate.getTime())) {
                setFieldError('Valid-until is not a valid date.');
                return;
            }
            validUntilIso = candidate.toISOString();
        }

        setBusy(true);
        try {
            const proposal = await proposalsApi.create(companyId, {
                serviceRequestId: request.id,
                title: trimmed,
                clientNotes: clientNotes.trim() ? clientNotes.trim() : undefined,
                validUntil: validUntilIso,
            });
            toast.show(`Proposal #${proposal.number} created.`, 'success');
            // Navigate to the proposal detail page; the existing DRAFT
            // editor (ProposalDetailsForm + ProposalItemsEditor) takes
            // over from there.
            router.push(`/proposals/${proposal.id}`);
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.toUserMessage()
                    : 'Could not create proposal. Please try again.';
            toast.show(message, 'danger');
            setBusy(false);
        }
    }

    return (
        <>
            <Button
                variant="primary"
                size="sm"
                onClick={() => setOpen(true)}
                disabled={disabled}
                title={disabled ? 'Cancelled requests cannot create proposals.' : undefined}
            >
                Create proposal
            </Button>

            <Modal
                open={open}
                onClose={close}
                busy={busy}
                title="Create proposal"
                description="A new DRAFT proposal will be created and linked to this request. You can add items on the next screen."
                footer={
                    <>
                        <Button variant="secondary" onClick={close} disabled={busy}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={submit} loading={busy}>
                            Create
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    <Field
                        label="Title"
                        htmlFor="create-proposal-title"
                        helper="Defaults to the request title — feel free to rewrite."
                        error={fieldError ?? undefined}
                    >
                        <Input
                            id="create-proposal-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={256}
                            disabled={busy}
                            autoFocus
                        />
                    </Field>

                    <Field
                        label="Valid until"
                        htmlFor="create-proposal-valid-until"
                        helper="Optional. Editable later from the proposal page."
                    >
                        <Input
                            id="create-proposal-valid-until"
                            type="date"
                            value={validUntil}
                            onChange={(e) => setValidUntil(e.target.value)}
                            disabled={busy}
                        />
                    </Field>

                    <Field
                        label="Client-facing notes"
                        htmlFor="create-proposal-client-notes"
                        helper="Optional. Visible to the client on the rendered PDF."
                    >
                        <Textarea
                            id="create-proposal-client-notes"
                            value={clientNotes}
                            onChange={(e) => setClientNotes(e.target.value)}
                            maxLength={4096}
                            rows={4}
                            disabled={busy}
                        />
                    </Field>
                </div>
            </Modal>
        </>
    );
}
