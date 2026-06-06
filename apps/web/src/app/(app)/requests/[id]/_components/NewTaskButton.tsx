'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { tasksApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import type { Role, TaskPriority } from '@/types/domain';
import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// NewTaskButton — "Nova tarefa" on the request's Tarefas tab (EPIC C / C1).
//
// Creates an internal task anchored to the current request. Role-gated to
// TASK.CREATE (OWNER/ADMIN/OPERACIONAL — mirror of permission.defaults.ts),
// disabled for cancelled requests. On success: toast + router.refresh() so the
// server-rendered tasks list re-fetches. No assignee here — assignment lands in
// C2 (needs the membership directory endpoint).
// ─────────────────────────────────────────────────────────────────────────────

const CAN_CREATE_TASK_ROLES: readonly Role[] = ['OWNER', 'ADMIN', 'OPERACIONAL'];
const PRIORITIES: readonly TaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

interface FormValues {
    title: string;
    description: string;
    priority: TaskPriority;
    dueAt: string;
}

export function NewTaskButton({
    requestId,
    isCancelled,
}: {
    requestId: string;
    isCancelled: boolean;
}) {
    const t = useTranslations('requests.detail.tasks.create');
    const router = useRouter();
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;
    const role = activeMembership?.role;

    const [open, setOpen] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        defaultValues: { title: '', description: '', priority: 'NORMAL', dueAt: '' },
        mode: 'onSubmit',
    });

    useEffect(() => {
        if (open) reset({ title: '', description: '', priority: 'NORMAL', dueAt: '' });
    }, [open, reset]);

    if (!role || !CAN_CREATE_TASK_ROLES.includes(role) || !companyId) {
        return null;
    }

    const schema = z.object({
        title: z.string().trim().min(1, t('errors.titleRequired')).max(256, t('errors.titleTooLong')),
        description: z.string().max(4096, t('errors.descriptionTooLong')),
        priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
        dueAt: z.string(),
    });

    const onSubmit = handleSubmit(async (raw) => {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
            for (const issue of parsed.error.issues) {
                setError(issue.path[0] as keyof FormValues, { message: issue.message });
            }
            return;
        }

        let dueAtIso: string | undefined;
        if (parsed.data.dueAt) {
            const d = new Date(`${parsed.data.dueAt}T00:00:00Z`);
            if (Number.isNaN(d.getTime())) {
                setError('dueAt', { message: t('errors.dueAtInvalid') });
                return;
            }
            dueAtIso = d.toISOString();
        }

        try {
            await tasksApi.create(companyId, {
                requestId,
                title: parsed.data.title.trim(),
                description: parsed.data.description.trim() || undefined,
                priority: parsed.data.priority,
                dueAt: dueAtIso,
            });
            toast.success(t('success'));
            setOpen(false);
            router.refresh();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.toUserMessage() : t('error'));
        }
    });

    return (
        <Dialog open={open} onOpenChange={(next) => !isSubmitting && setOpen(next)}>
            <Button
                size="sm"
                onClick={() => setOpen(true)}
                disabled={isCancelled}
                title={isCancelled ? t('cancelledTooltip') : undefined}
            >
                <Plus aria-hidden="true" />
                {t('trigger')}
            </Button>

            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-4" noValidate>
                    <div className="space-y-1.5">
                        <Label htmlFor="task-title">{t('fields.title')}</Label>
                        <Input id="task-title" {...register('title')} autoFocus />
                        {errors.title ? (
                            <p role="alert" className="text-sm text-destructive">
                                {errors.title.message}
                            </p>
                        ) : null}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="task-description">{t('fields.description')}</Label>
                        <Textarea id="task-description" rows={3} {...register('description')} />
                        {errors.description ? (
                            <p role="alert" className="text-sm text-destructive">
                                {errors.description.message}
                            </p>
                        ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="task-priority">{t('fields.priority')}</Label>
                            <select
                                id="task-priority"
                                {...register('priority')}
                                className={cn(
                                    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm',
                                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                                )}
                            >
                                {PRIORITIES.map((p) => (
                                    <option key={p} value={p}>
                                        {t(`priority.${p}`)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="task-due">{t('fields.dueAt')}</Label>
                            <Input id="task-due" type="date" {...register('dueAt')} />
                            {errors.dueAt ? (
                                <p role="alert" className="text-sm text-destructive">
                                    {errors.dueAt.message}
                                </p>
                            ) : null}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setOpen(false)}
                            disabled={isSubmitting}
                        >
                            {t('cancel')}
                        </Button>
                        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                            {isSubmitting ? t('submitting') : t('submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
