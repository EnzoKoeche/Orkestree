import { getTranslations } from 'next-intl/server';
import type { ProposalDetail } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalNotes — the two free-text note fields.
//
//   - clientNotes : shown on the client-facing proposal/PDF.
//   - notes       : internal-only; the backend omits it from the CLIENTE
//                   projection, so it simply won't render for that role.
//
// The parent only mounts this when at least one note is present, but each
// block guards itself too so the component is safe to render directly.
// ─────────────────────────────────────────────────────────────────────────────

export async function ProposalNotes({ proposal }: { proposal: ProposalDetail }) {
    const t = await getTranslations('proposals.detail.notes');

    const hasClientNotes = Boolean(proposal.clientNotes && proposal.clientNotes.trim());
    const hasInternalNotes = Boolean(proposal.notes && proposal.notes.trim());

    if (!hasClientNotes && !hasInternalNotes) return null;

    return (
        <section aria-labelledby="proposal-notes-heading" className="grid gap-4 sm:grid-cols-2">
            <h2 id="proposal-notes-heading" className="sr-only">
                {t('title')}
            </h2>

            {hasClientNotes ? (
                <NoteCard label={t('clientNotes')} text={proposal.clientNotes as string} />
            ) : null}

            {hasInternalNotes ? (
                <NoteCard label={t('internalNotes')} text={proposal.notes as string} internal />
            ) : null}
        </section>
    );
}

function NoteCard({
    label,
    text,
    internal = false,
}: {
    label: string;
    text: string;
    internal?: boolean;
}) {
    return (
        <div className="rounded-md border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                </span>
                {internal ? (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground ring-1 ring-border">
                        Interno
                    </span>
                ) : null}
            </div>
            <p className="whitespace-pre-wrap text-sm text-foreground">{text}</p>
        </div>
    );
}
