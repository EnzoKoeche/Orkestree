import { getTranslations } from 'next-intl/server';
import { DateCell } from '@/components/ui/DateCell';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { MembershipRef, TaskListItem, TaskStatus } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// TasksTab — read-only list of tasks attached to this request.
//
// Read-only by design in this commit: task creation/assignment lives in its
// own UX surface (a future tasks-detail flow), not piggybacked into the
// request detail page. Here the operator just sees what already exists.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_PILL_CLASS: Record<TaskStatus, string> = {
    OPEN: 'bg-secondary text-secondary-foreground ring-1 ring-border',
    IN_PROGRESS: 'bg-secondary text-secondary-foreground ring-1 ring-border',
    DONE: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    CANCELLED: 'bg-red-50 text-red-700 ring-1 ring-red-200',
};

function memberName(m: MembershipRef | null): string | null {
    if (!m) return null;
    return `${m.user.firstName} ${m.user.lastName}`.trim() || m.user.firstName;
}

export async function TasksTab({ tasks }: { tasks: TaskListItem[] }) {
    const t = await getTranslations('requests.detail.tasks');

    if (tasks.length === 0) {
        return (
            <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
                {t('empty')}
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-md border bg-card">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[80px]">{t('columns.number')}</TableHead>
                        <TableHead>{t('columns.title')}</TableHead>
                        <TableHead className="w-[140px]">{t('columns.status')}</TableHead>
                        <TableHead>{t('columns.assignee')}</TableHead>
                        <TableHead className="w-[140px]">{t('columns.createdAt')}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {tasks.map((task) => {
                        const assignee = memberName(task.assignedMembership);
                        return (
                            <TableRow key={task.id}>
                                <TableCell className="font-medium tabular-nums text-muted-foreground">
                                    #{task.number}
                                </TableCell>
                                <TableCell className="font-medium text-foreground">
                                    {task.title}
                                </TableCell>
                                <TableCell>
                                    <span
                                        className={cn(
                                            'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                                            STATUS_PILL_CLASS[task.status],
                                        )}
                                    >
                                        {t(`status.${task.status}`)}
                                    </span>
                                </TableCell>
                                <TableCell className="text-sm text-foreground">
                                    {assignee ?? (
                                        <span className="text-muted-foreground">
                                            {t('noAssignee')}
                                        </span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <DateCell iso={task.createdAt} />
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
