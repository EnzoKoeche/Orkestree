'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { LoadingState } from '@/components/ui/States';
import { customFieldsApi, serviceTypesApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { ApiError } from '@/lib/http';
import type { CustomFieldListItem, ServiceTypeListItem } from '@/types/domain';
import { CreateRequestForm } from './CreateRequestForm';

// ─────────────────────────────────────────────────────────────────────────────
// CreateRequestDialog — owns the data fetches that the form depends on.
//
// Two parallel fetches on first open: service types (for the picker) and
// custom fields scoped to target=REQUEST + isActive=true (the full set; the
// form filters per selected serviceType client-side). Both are small lists
// (<100 items typically) and don't change during a session, so we keep them
// in dialog state across re-opens without an explicit cache layer.
//
// Why fetch here, not in the form: separates "ready to render" from "already
// rendering." The form mounts only when both reads have resolved, which
// makes the zod schema construction (which depends on applicableFields)
// straightforward — no defensive null checks scattered through the form.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface LoadedData {
    serviceTypes: ServiceTypeListItem[];
    customFields: CustomFieldListItem[];
}

export function CreateRequestDialog({ open, onOpenChange }: Props) {
    const t = useTranslations('requests.create');
    const tErr = useTranslations('requests.create.errors');
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<LoadedData | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !companyId || data || loading) return;

        const ac = new AbortController();
        setLoading(true);
        setError(null);

        Promise.all([
            serviceTypesApi.list(companyId, { signal: ac.signal }),
            customFieldsApi.list(
                companyId,
                { target: 'REQUEST', isActive: true },
                { signal: ac.signal },
            ),
        ])
            .then(([serviceTypes, customFields]) => {
                if (ac.signal.aborted) return;
                setData({
                    serviceTypes: serviceTypes.filter((s) => s.isActive),
                    customFields,
                });
            })
            .catch((err) => {
                if (ac.signal.aborted) return;
                const msg =
                    err instanceof ApiError
                        ? err.toUserMessage()
                        : tErr('loadServiceTypes');
                setError(msg);
                toast.error(msg);
            })
            .finally(() => {
                if (ac.signal.aborted) return;
                setLoading(false);
            });

        return () => ac.abort();
    }, [open, companyId, data, loading, tErr]);

    const handleClose = (next: boolean) => {
        if (!next) {
            // Reset error on close so the next open is clean. We keep `data`
            // cached intentionally — service types and custom fields don't
            // change between opens within a session.
            setError(null);
        }
        onOpenChange(next);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>

                {loading || !companyId ? (
                    <LoadingState />
                ) : error ? (
                    <div role="alert" className="py-6 text-sm text-destructive">
                        {error}
                    </div>
                ) : data ? (
                    <CreateRequestForm
                        companyId={companyId}
                        serviceTypes={data.serviceTypes}
                        customFields={data.customFields}
                        onSuccess={() => onOpenChange(false)}
                        onCancel={() => onOpenChange(false)}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
