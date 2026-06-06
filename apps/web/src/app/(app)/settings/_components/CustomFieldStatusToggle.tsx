'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { customFieldsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import type { CustomFieldListItem } from '@/types/domain';

// Activate/deactivate a custom field (EPIC D / D2). Reversible → no confirm.
export function CustomFieldStatusToggle({ field }: { field: CustomFieldListItem }) {
    const t = useTranslations('settings.customFields.toggle');
    const router = useRouter();
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;
    const [submitting, setSubmitting] = useState(false);

    if (!companyId) return null;

    const onClick = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            await customFieldsApi.setActive(companyId, field.id, !field.isActive);
            toast.success(field.isActive ? t('deactivated') : t('activated'));
            router.refresh();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.toUserMessage() : t('error'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Button variant="ghost" size="sm" onClick={onClick} disabled={submitting}>
            {field.isActive ? t('deactivate') : t('activate')}
        </Button>
    );
}
