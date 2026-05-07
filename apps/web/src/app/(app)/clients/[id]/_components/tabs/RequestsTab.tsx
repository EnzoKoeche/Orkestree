import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { DateCell } from '@/components/ui/DateCell';
import {
    StatusBadge,
    deriveRequestStatus,
} from '@/components/ui/StatusBadge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { ServiceRequestListItem } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// RequestsTab — compact list of every request belonging to this client.
//
// Smaller column set than /requests (no client column — we ARE the client;
// no assignee column — less relevant in the client-context view). Number /
// title (clickable) / stage / status / created at.
//
// Uses the same StatusBadge as /requests because the request states are
// universal (in_progress / completed / cancelled) regardless of the
// surface.
// ─────────────────────────────────────────────────────────────────────────────

export async function RequestsTab({
    requests,
}: {
    requests: ServiceRequestListItem[];
}) {
    const t = await getTranslations('clients.detail.requests');

    if (requests.length === 0) {
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
                        <TableHead className="w-[88px]">{t('columns.number')}</TableHead>
                        <TableHead>{t('columns.title')}</TableHead>
                        <TableHead>{t('columns.stage')}</TableHead>
                        <TableHead className="w-[140px]">{t('columns.status')}</TableHead>
                        <TableHead className="w-[140px]">
                            {t('columns.createdAt')}
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {requests.map((req) => (
                        // Stretched-link pattern (same as other request lists).
                        <TableRow
                            key={req.id}
                            className="relative focus-within:bg-muted/50"
                        >
                            <TableCell className="font-medium tabular-nums text-muted-foreground">
                                #{req.number}
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                                <Link
                                    href={`/requests/${req.id}`}
                                    className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    {req.title}
                                </Link>
                            </TableCell>
                            <TableCell>
                                <span className="text-sm text-foreground">
                                    {req.currentStage.name}
                                </span>
                            </TableCell>
                            <TableCell>
                                <StatusBadge status={deriveRequestStatus(req)} />
                            </TableCell>
                            <TableCell>
                                <DateCell iso={req.createdAt} />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
