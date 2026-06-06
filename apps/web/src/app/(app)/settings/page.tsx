import { ListChecks, Wrench } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyTable } from '@/components/ui/EmptyTable';
import { LoadingState } from '@/components/ui/States';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { PageContainer } from '@/components/layout/PageContainer';
import { customFieldsApi, serviceTypesApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { getServerSession } from '@/lib/server-session';
import { cn } from '@/lib/utils';
import type { CustomFieldListItem, ServiceTypeListItem } from '@/types/domain';
import { CustomFieldFormDialog } from './_components/CustomFieldFormDialog';
import { CustomFieldStatusToggle } from './_components/CustomFieldStatusToggle';
import { ServiceTypeFormDialog } from './_components/ServiceTypeFormDialog';
import { ServiceTypeStatusToggle } from './_components/ServiceTypeStatusToggle';

// ─────────────────────────────────────────────────────────────────────────────
// Configurações page — Server Component (EPIC D / D1).
//
// First config surface: service types (CRUD + activate/deactivate). The whole
// company-config area is OWNER/ADMIN (COMPANY_CONFIG permission); a non-admin
// who navigates here gets a 403 on the list fetch, which we render as a calm
// "no access" panel rather than an error. Custom fields and workflows (D2/D3)
// will join as additional sections/tabs.
// ─────────────────────────────────────────────────────────────────────────────

export default async function SettingsPage() {
    const t = await getTranslations('settings');
    const { token, activeCompanyId } = getServerSession();

    if (!token || !activeCompanyId) {
        return (
            <PageContainer>
                <LoadingState label="Carregando empresa…" />
            </PageContainer>
        );
    }

    let serviceTypes: ServiceTypeListItem[];
    let customFields: CustomFieldListItem[];
    try {
        [serviceTypes, customFields] = await Promise.all([
            serviceTypesApi.list(activeCompanyId, { tokenOverride: token }),
            customFieldsApi.list(activeCompanyId, {}, { tokenOverride: token }),
        ]);
    } catch (err) {
        const noAccess = err instanceof ApiError && err.status === 403;
        return (
            <PageContainer>
                <Header t={t} />
                <div className="mt-6 rounded-md border bg-card p-6 text-center">
                    <h3 className="text-base font-semibold text-foreground">
                        {noAccess ? t('noAccess.title') : t('serviceTypes.errorTitle')}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {noAccess
                            ? t('noAccess.description')
                            : err instanceof ApiError
                              ? err.toUserMessage()
                              : t('serviceTypes.errorFallback')}
                    </p>
                </div>
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <Header t={t} />

            <section className="mt-8">
                <div className="mb-3 flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">
                            {t('serviceTypes.title')}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {t('serviceTypes.subtitle')}
                        </p>
                    </div>
                    <ServiceTypeFormDialog />
                </div>

                <div className="overflow-hidden rounded-md border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[200px]">
                                    {t('serviceTypes.columns.code')}
                                </TableHead>
                                <TableHead>{t('serviceTypes.columns.name')}</TableHead>
                                <TableHead className="w-[110px]">
                                    {t('serviceTypes.columns.status')}
                                </TableHead>
                                <TableHead className="w-[200px] text-right">
                                    {t('serviceTypes.columns.actions')}
                                </TableHead>
                            </TableRow>
                        </TableHeader>

                        {serviceTypes.length === 0 ? (
                            <TableBody>
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={4} className="p-0">
                                        <EmptyTable
                                            icon={Wrench}
                                            title={t('serviceTypes.empty.title')}
                                            description={t('serviceTypes.empty.description')}
                                            action={<ServiceTypeFormDialog />}
                                        />
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        ) : (
                            <TableBody>
                                {serviceTypes.map((st) => (
                                    <TableRow key={st.id} className={cn(!st.isActive && 'opacity-60')}>
                                        <TableCell className="font-mono text-sm text-muted-foreground">
                                            {st.code}
                                        </TableCell>
                                        <TableCell className="font-medium text-foreground">
                                            {st.name}
                                        </TableCell>
                                        <TableCell>
                                            <span
                                                className={cn(
                                                    'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                                                    st.isActive
                                                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                                        : 'bg-muted text-muted-foreground ring-1 ring-border',
                                                )}
                                            >
                                                {st.isActive
                                                    ? t('serviceTypes.status.active')
                                                    : t('serviceTypes.status.inactive')}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <ServiceTypeFormDialog serviceType={st} />
                                                <ServiceTypeStatusToggle serviceType={st} />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        )}
                    </Table>
                </div>
            </section>

            <section className="mt-10">
                <div className="mb-3 flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">
                            {t('customFields.title')}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {t('customFields.subtitle')}
                        </p>
                    </div>
                    <CustomFieldFormDialog />
                </div>

                <div className="overflow-hidden rounded-md border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('customFields.columns.label')}</TableHead>
                                <TableHead className="w-[120px]">
                                    {t('customFields.columns.type')}
                                </TableHead>
                                <TableHead className="w-[120px]">
                                    {t('customFields.columns.target')}
                                </TableHead>
                                <TableHead className="w-[110px]">
                                    {t('customFields.columns.required')}
                                </TableHead>
                                <TableHead className="w-[100px]">
                                    {t('customFields.columns.status')}
                                </TableHead>
                                <TableHead className="w-[180px] text-right">
                                    {t('customFields.columns.actions')}
                                </TableHead>
                            </TableRow>
                        </TableHeader>

                        {customFields.length === 0 ? (
                            <TableBody>
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={6} className="p-0">
                                        <EmptyTable
                                            icon={ListChecks}
                                            title={t('customFields.empty.title')}
                                            description={t('customFields.empty.description')}
                                            action={<CustomFieldFormDialog />}
                                        />
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        ) : (
                            <TableBody>
                                {customFields.map((f) => (
                                    <TableRow key={f.id} className={cn(!f.isActive && 'opacity-60')}>
                                        <TableCell className="font-medium text-foreground">
                                            {f.label}
                                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                                                {f.code}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {t(`customFields.types.${f.type}`)}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {t(`customFields.targets.${f.target}`)}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {f.isRequired ? t('customFields.required') : '—'}
                                        </TableCell>
                                        <TableCell>
                                            <span
                                                className={cn(
                                                    'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                                                    f.isActive
                                                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                                        : 'bg-muted text-muted-foreground ring-1 ring-border',
                                                )}
                                            >
                                                {f.isActive
                                                    ? t('serviceTypes.status.active')
                                                    : t('serviceTypes.status.inactive')}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <CustomFieldFormDialog field={f} />
                                                <CustomFieldStatusToggle field={f} />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        )}
                    </Table>
                </div>
            </section>
        </PageContainer>
    );
}

async function Header({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
    return (
        <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
    );
}
