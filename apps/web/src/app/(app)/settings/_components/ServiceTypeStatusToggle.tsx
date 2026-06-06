'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { serviceTypesApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import type { ServiceTypeListItem } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ServiceTypeStatusToggle — activate/deactivate a service type (EPIC D / D1).
//
// Reversible, so no confirm dialog. Deactivating keeps history but hides the
// type from request-creation pickers. On success: toast + router.refresh().
// ─────────────────────────────────────────────────────────────────────────────

export function ServiceTypeStatusToggle({
    serviceType,
}: {
    serviceType: ServiceTypeListItem;
}) {
    const t = useTranslations('settings.serviceTypes.toggle');
    const router = useRouter();
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;
    const [submitting, setSubmitting] = useState(false);

    if (!companyId) return null;

    const onClick = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            await serviceTypesApi.setActive(companyId, serviceType.id, !serviceType.isActive);
            toast.success(serviceType.isActive ? t('deactivated') : t('activated'));
            router.refresh();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.toUserMessage() : t('error'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Button variant="ghost" size="sm" onClick={onClick} disabled={submitting}>
            {serviceType.isActive ? t('deactivate') : t('activate')}
        </Button>
    );
}
