'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DateCell } from '@/components/ui/DateCell';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { tasksApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import type { Role, TaskComment, TaskListItem, TaskStatus } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// TaskCommentsDialog — task detail + comment thread (EPIC C / C3).
//
// The task title is the trigger; opening fetches the comment thread client-side
// (via the proxy). Add is gated TASK.EDIT (OWNER/ADMIN/OPERACIONAL) and hidden
// for CANCELLED tasks (the backend rejects comments there). Delete is shown
// only for the comment's author or an OWNER/ADMIN — mirror of the backend's
// author-or-admin rule. The thread is dialog-local state; no page refresh
// needed.
// ─────────────────────────────────────────────────────────────────────────────

const CAN_COMMENT_ROLES: readonly Role[] = ['OWNER', 'ADMIN', 'OPERACIONAL'];
const ADMIN_ROLES: readonly Role[] = ['OWNER', 'ADMIN'];
const MAX_BODY = 4096;

const STATUS_PILL_CLASS: Record<TaskStatus, string> = {
    OPEN: 'bg-secondary text-secondary-foreground ring-1 ring-border',
    IN_PROGRESS: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    DONE: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    CANCELLED: 'bg-muted text-muted-foreground ring-1 ring-border',
};

function authorName(c: TaskComment): string {
    const u = c.authorMembership.user;
    return `${u.firstName} ${u.lastName}`.trim() || u.firstName;
}

export function TaskCommentsDialog({ task }: { task: TaskListItem }) {
    const t = useTranslations('requests.detail.tasks.comments');
    const tStatus = useTranslations('requests.detail.tasks.status');
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;
    const role = activeMembership?.role;
    const myMembershipId = activeMembership?.id ?? null;

    const [open, setOpen] = useState(false);
    const [comments, setComments] = useState<TaskComment[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [body, setBody] = useState('');
    const [posting, setPosting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const canComment =
        Boolean(role && CAN_COMMENT_ROLES.includes(role)) && task.status !== 'CANCELLED';
    const isAdmin = Boolean(role && ADMIN_ROLES.includes(role));

    useEffect(() => {
        if (!open || !companyId) return;
        let active = true;
        setComments(null);
        setLoadError(null);
        tasksApi
            .listComments(companyId, task.id)
            .then((data) => {
                if (active) setComments(data);
            })
            .catch((err) => {
                if (active) setLoadError(err instanceof ApiError ? err.toUserMessage() : t('loadError'));
            });
        return () => {
            active = false;
        };
    }, [open, companyId, task.id, t]);

    async function submit() {
        const trimmed = body.trim();
        if (!companyId || !trimmed || posting) return;
        setPosting(true);
        try {
            const created = await tasksApi.addComment(companyId, task.id, { body: trimmed });
            setComments((prev) => [...(prev ?? []), created]);
            setBody('');
        } catch (err) {
            toast.error(err instanceof ApiError ? err.toUserMessage() : t('addError'));
        } finally {
            setPosting(false);
        }
    }

    async function remove(commentId: string) {
        if (!companyId || deletingId) return;
        setDeletingId(commentId);
        try {
            await tasksApi.deleteComment(companyId, task.id, commentId);
            setComments((prev) => (prev ?? []).filter((c) => c.id !== commentId));
        } catch (err) {
            toast.error(err instanceof ApiError ? err.toUserMessage() : t('deleteError'));
        } finally {
            setDeletingId(null);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(next) => !posting && setOpen(next)}>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="block max-w-full truncate rounded-sm text-left font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
                {task.title}
            </button>

            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span className="tabular-nums text-muted-foreground">#{task.number}</span>
                        <span className="truncate">{task.title}</span>
                    </DialogTitle>
                    <DialogDescription className="flex items-center gap-2">
                        <span
                            className={cn(
                                'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                                STATUS_PILL_CLASS[task.status],
                            )}
                        >
                            {tStatus(task.status)}
                        </span>
                        <span>{t('subtitle')}</span>
                    </DialogDescription>
                </DialogHeader>

                {/* Thread */}
                <div className="max-h-[320px] space-y-3 overflow-y-auto">
                    {comments === null && !loadError ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            {t('loading')}
                        </div>
                    ) : loadError ? (
                        <p role="alert" className="py-6 text-center text-sm text-destructive">
                            {loadError}
                        </p>
                    ) : comments && comments.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
                    ) : (
                        comments?.map((c) => {
                            const canDelete = isAdmin || c.authorMembership.id === myMembershipId;
                            return (
                                <div key={c.id} className="rounded-md border bg-card p-3">
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-foreground">
                                            {authorName(c)}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                <DateCell iso={c.createdAt} />
                                            </span>
                                            {canDelete ? (
                                                <button
                                                    type="button"
                                                    onClick={() => void remove(c.id)}
                                                    disabled={deletingId === c.id}
                                                    aria-label={t('delete')}
                                                    className="rounded-sm text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                                                >
                                                    {deletingId === c.id ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                                    ) : (
                                                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                                    )}
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                    <p className="whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Add */}
                {canComment ? (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void submit();
                        }}
                        className="space-y-2"
                    >
                        <Textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={2}
                            maxLength={MAX_BODY}
                            placeholder={t('placeholder')}
                            aria-label={t('addLabel')}
                        />
                        <div className="flex justify-end">
                            <Button type="submit" size="sm" disabled={posting || !body.trim()} aria-busy={posting}>
                                {posting ? t('sending') : t('send')}
                            </Button>
                        </div>
                    </form>
                ) : task.status === 'CANCELLED' ? (
                    <p className="text-xs text-muted-foreground">{t('cancelledHint')}</p>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
