'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { proposalsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import type { ProposalDetail, ProposalStatus, Role } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalActions — lifecycle transitions (EPIC A / A4).
//
// Mounted in the proposal header's action zone. Offers the legal transitions
// for the current status, gated by role to mirror the backend permissions:
//   send    PUBLISH  → OWNER/ADMIN
//   approve APPROVE  → OWNER/ADMIN/FINANCEIRO
//   reject  REJECT   → OWNER/ADMIN/FINANCEIRO
//   cancel  EDIT     → OWNER/ADMIN/OPERACIONAL
//
// Each opens a shared confirm dialog with an optional free-text field (a "note"
// for send/approve, a "reason" for reject/cancel — the body field the matching
// endpoint whitelists). On success: toast + router.refresh(), which re-renders
// the server page with the new status (e.g. SENT flips the DRAFT items editor
// to read-only). The backend is the state-machine authority — a stale tab gets
// a 422 surfaced as a toast rather than a silent wrong transition.
// ─────────────────────────────────────────────────────────────────────────────

type ActionKey = 'send' | 'approve' | 'reject' | 'cancel';

const ACTION_ROLES: Record<ActionKey, readonly Role[]> = {
    send: ['OWNER', 'ADMIN'],
    approve: ['OWNER', 'ADMIN', 'FINANCEIRO'],
    reject: ['OWNER', 'ADMIN', 'FINANCEIRO'],
    cancel: ['OWNER', 'ADMIN', 'OPERACIONAL'],
};

const STATUS_ACTIONS: Partial<Record<ProposalStatus, ActionKey[]>> = {
    DRAFT: ['send', 'cancel'],
    SENT: ['approve', 'reject', 'cancel'],
};

const TRIGGER_VARIANT: Record<ActionKey, 'default' | 'outline' | 'ghost'> = {
    send: 'default',
    approve: 'default',
    reject: 'outline',
    cancel: 'ghost',
};

const CONFIRM_VARIANT: Record<ActionKey, 'default' | 'destructive'> = {
    send: 'default',
    approve: 'default',
    reject: 'destructive',
    cancel: 'destructive',
};

// reject/cancel carry a "reason"; send/approve carry a "note".
function usesReason(action: ActionKey): boolean {
    return action === 'reject' || action === 'cancel';
}

export function ProposalActions({ proposal }: { proposal: ProposalDetail }) {
    const t = useTranslations('proposals.detail.actions');
    const router = useRouter();
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;
    const role = activeMembership?.role;

    const [active, setActive] = useState<ActionKey | null>(null);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);

    if (!role || !companyId) return null;

    const actions = (STATUS_ACTIONS[proposal.status] ?? []).filter((a) =>
        ACTION_ROLES[a].includes(role),
    );
    if (actions.length === 0) return null;

    function open(key: ActionKey) {
        setText('');
        setActive(key);
    }

    async function confirm() {
        if (!active || !companyId) return;
        setBusy(true);
        const value = text.trim() || undefined;
        try {
            if (active === 'send') {
                await proposalsApi.sendProposal(companyId, proposal.id, { note: value });
            } else if (active === 'approve') {
                await proposalsApi.approveProposal(companyId, proposal.id, { note: value });
            } else if (active === 'reject') {
                await proposalsApi.rejectProposal(companyId, proposal.id, { reason: value });
            } else {
                await proposalsApi.cancelProposal(companyId, proposal.id, { reason: value });
            }
            toast.success(t(`${active}.success`));
            setActive(null);
            router.refresh();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.toUserMessage() : t('error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <div className="flex flex-wrap gap-2">
                {actions.map((key) => {
                    // Can't send a proposal with no items — let the operator know
                    // before the backend 422s.
                    const disabled = key === 'send' && proposal.items.length === 0;
                    return (
                        <Button
                            key={key}
                            size="sm"
                            variant={TRIGGER_VARIANT[key]}
                            onClick={() => open(key)}
                            disabled={disabled}
                            title={disabled ? t('send.emptyTooltip') : undefined}
                        >
                            {t(`${key}.trigger`)}
                        </Button>
                    );
                })}
            </div>

            <Dialog open={active !== null} onOpenChange={(o) => !busy && !o && setActive(null)}>
                <DialogContent>
                    {active ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>{t(`${active}.title`)}</DialogTitle>
                                <DialogDescription>{t(`${active}.description`)}</DialogDescription>
                            </DialogHeader>

                            <div className="space-y-1.5">
                                <Label htmlFor="proposal-action-text">
                                    {t(usesReason(active) ? 'reasonLabel' : 'noteLabel')}
                                </Label>
                                <Textarea
                                    id="proposal-action-text"
                                    rows={3}
                                    maxLength={1024}
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder={t(
                                        usesReason(active) ? 'reasonPlaceholder' : 'notePlaceholder',
                                    )}
                                />
                            </div>

                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setActive(null)}
                                    disabled={busy}
                                >
                                    {t('cancelAction')}
                                </Button>
                                <Button
                                    type="button"
                                    variant={CONFIRM_VARIANT[active]}
                                    onClick={confirm}
                                    disabled={busy}
                                    aria-busy={busy}
                                >
                                    {busy ? t(`${active}.submitting`) : t(`${active}.confirm`)}
                                </Button>
                            </DialogFooter>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    );
}
