import { Building2, User } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { DateCell } from '@/components/ui/DateCell';
import { formatTaxId } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ClientDetail } from '@/types/domain';
import { EditClientButton } from './EditClientButton';

// ─────────────────────────────────────────────────────────────────────────────
// ClientDetailHeader — top of the client detail page.
//
// Layout: 2-column flex on sm+. Left column owns the info stack (number +
// status badge above, name as h1, info row below). Right column is the
// action zone — placeholders only in Commit B; EditClientButton (Commit C)
// and DeactivateClientButton/ReactivateClientButton (Commit D) plug in.
//
// Hierarchy (P2):
//   1. Title h1 (text-2xl semibold) — operator's anchor.
//   2. Number + type icon + isActive badge inline above — secondary.
//   3. Info row — taxId / email / phone / createdAt (text-sm muted).
// ─────────────────────────────────────────────────────────────────────────────

export async function ClientDetailHeader({ client }: { client: ClientDetail }) {
    const t = await getTranslations('clients');
    const tHeader = await getTranslations('clients.detail.header');

    const isPF = client.type === 'INDIVIDUAL';
    const TypeIcon = isPF ? User : Building2;
    const typeShort = isPF
        ? t('type.individualShort')
        : t('type.businessShort');
    const typeFull = isPF ? t('type.individual') : t('type.business');

    return (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium tabular-nums text-muted-foreground">
                        C-{client.number}
                    </span>
                    <span
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
                        title={typeFull}
                    >
                        <TypeIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{typeShort}</span>
                    </span>
                    <ClientStatusBadge isActive={client.isActive} t={t} />
                </div>

                <h1 className="text-2xl font-semibold leading-tight text-foreground">
                    {client.name}
                </h1>

                <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <InfoItem
                        label={tHeader('taxId')}
                        value={client.taxId ? formatTaxId(client.taxId) : null}
                        valueClass="tabular-nums"
                    />
                    <InfoItem
                        label={tHeader('email')}
                        value={client.email}
                    />
                    <InfoItem
                        label={tHeader('phone')}
                        value={client.phone}
                    />
                    <div className="inline-flex items-baseline gap-2">
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            {tHeader('createdAt')}
                        </dt>
                        <dd>
                            <DateCell iso={client.createdAt} />
                        </dd>
                    </div>
                </dl>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
                <EditClientButton client={client} />
                {/* DeactivateClientButton / ReactivateClientButton placeholder — Commit D */}
            </div>
        </header>
    );
}

function InfoItem({
    label,
    value,
    valueClass,
}: {
    label: string;
    value: string | null;
    valueClass?: string;
}) {
    return (
        <div className="inline-flex items-baseline gap-2">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {label}
            </dt>
            <dd className={cn('text-sm text-foreground', valueClass)}>
                {value ?? <span className="text-muted-foreground">—</span>}
            </dd>
        </div>
    );
}

// Neutral pair (active / inactive) — distinct from /requests StatusBadge.
// Deactivation is reversible; red is reserved for irreversible actions.

function ClientStatusBadge({
    isActive,
    t,
}: {
    isActive: boolean;
    t: (key: string) => string;
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1',
                isActive
                    ? 'bg-secondary text-secondary-foreground ring-border'
                    : 'bg-muted text-muted-foreground ring-border',
            )}
        >
            {isActive ? t('status.active') : t('status.inactive')}
        </span>
    );
}
