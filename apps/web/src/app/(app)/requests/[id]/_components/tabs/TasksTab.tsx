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
import type {
    CompanyMember,
    ServiceRequestDetail,
    TaskListItem,
    TaskStatus,
} from '@/types/domain';
import { NewTaskButton } from '../NewTaskButton';
import { TaskAssigneePicker } from '../TaskAssigneePicker';
import { TaskTransitionMenu } from '../TaskTransitionMenu';

// ─────────────────────────────────────────────────────────────────────────────
// TasksTab — internal tasks for this request (EPIC C / C1).
//
// Server-rendered list + two client islands: "Nova tarefa" (create) and a
// per-row transition menu (move status). Both role-gate themselves (TASK.CREATE
// / TASK.EDIT) and refresh the page after a mutation, so non-editing roles
// (e.g. FINANCEIRO) just see the read-only table. Assignment + comments land
// in C2/C3.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_PILL_CLASS: Record<TaskStatus, string> = {
    OPEN: 'bg-secondary text-secondary-foreground ring-1 ring-border',
    IN_PROGRESS: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    DONE: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    CANCELLED: 'bg-muted text-muted-foreground ring-1 ring-border',
};

export async function TasksTab({
    tasks,
    request,
    members,
}: {
    tasks: TaskListItem[];
    request: ServiceRequestDetail;
    members: CompanyMember[];
}) {
    const t = await getTranslations('requests.detail.tasks');

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
                <NewTaskButton requestId={request.id} isCancelled={request.isCancelled} />
            </div>

            {tasks.length === 0 ? (
                <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
                    {t('empty')}
                </div>
            ) : (
                <div className="overflow-hidden rounded-md border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[70px]">{t('columns.number')}</TableHead>
                                <TableHead>{t('columns.title')}</TableHead>
                                <TableHead className="w-[130px]">{t('columns.status')}</TableHead>
                                <TableHead>{t('columns.assignee')}</TableHead>
                                <TableHead className="w-[130px]">{t('columns.createdAt')}</TableHead>
                                <TableHead className="w-[110px] text-right">
                                    {t('columns.actions')}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tasks.map((task) => {
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
                                        <TableCell>
                                            <TaskAssigneePicker
                                                taskId={task.id}
                                                assignedMembership={task.assignedMembership}
                                                members={members}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <DateCell iso={task.createdAt} />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end">
                                                <TaskTransitionMenu
                                                    taskId={task.id}
                                                    status={task.status}
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}
