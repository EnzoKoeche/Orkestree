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
import { clientsApi, customFieldsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import type {
    ClientDetail,
    ClientFieldValue,
    CustomFieldListItem,
} from '@/types/domain';
import { ClientForm } from './ClientForm';

// ─────────────────────────────────────────────────────────────────────────────
// ClientFormDialog — Dialog wrapper that fetches form deps before mounting
// the form.
//
// Deps fetched lazily on open:
//   - customFields (target=CLIENT, isActive=true) — always.
//   - initialFieldValues — only in edit mode (we already know the clientId).
//
// Both are cached per-mount; reopening within the same mount reuses them.
// Dialog re-mount (operator closes + reopens after navigation) refetches.
//
// Why fetch HERE rather than in ClientForm: separates "ready to render"
// from "already rendering." ClientForm builds its zod schema from the
// applicable fields list — having the data resolved upfront keeps the form
// free of defensive null checks.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    initialData?: ClientDetail;
}

interface LoadedData {
    customFields: CustomFieldListItem[];
    fieldValues: ClientFieldValue[];
}

export function ClientFormDialog({ open, onOpenChange, mode, initialData }: Props) {
    const t = useTranslations('clients.form');
    const tErr = useTranslations('clients.form.errors');
    const { activeMembership } = useSession();
    const companyId = activeMembership?.company.id ?? null;

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<LoadedData | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Same anti-pattern guard as Sessão 10's CreateRequestDialog: do NOT
    // include `loading` in deps. Effect writes to it; including it as dep
    // creates a race where setLoading(true) re-runs the effect, the cleanup
    // aborts the original fetch, and `.finally`'s aborted-guard skips
    // setLoading(false) — leaving loading=true forever.
    useEffect(() => {
        if (!open || !companyId || data) return;

        const ac = new AbortController();
        setLoading(true);
        setError(null);

        const customFieldsPromise = customFieldsApi.list(
            companyId,
            { target: 'CLIENT', isActive: true },
            { signal: ac.signal },
        );

        const fieldValuesPromise =
            mode === 'edit' && initialData
                ? clientsApi
                    .getFieldValues(companyId, initialData.id, { signal: ac.signal })
                    .catch(() => [] as ClientFieldValue[])
                : Promise.resolve([] as ClientFieldValue[]);

        Promise.all([customFieldsPromise, fieldValuesPromise])
            .then(([customFields, fieldValues]) => {
                if (ac.signal.aborted) return;
                setData({ customFields, fieldValues });
            })
            .catch((err) => {
                if (ac.signal.aborted) return;
                const msg =
                    err instanceof ApiError
                        ? err.toUserMessage()
                        : tErr('loadCustomFields');
                setError(msg);
                toast.error(msg);
            })
            .finally(() => {
                if (ac.signal.aborted) return;
                setLoading(false);
            });

        return () => ac.abort();
    }, [open, companyId, data, mode, initialData, tErr]);

    const handleClose = (next: boolean) => {
        if (!next) {
            // Reset error + data on close so reopening triggers a fresh fetch
            // (e.g., admin added a new custom field while modal was closed).
            setError(null);
            setData(null);
        }
        onOpenChange(next);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'create' ? t('createTitle') : t('editTitle')}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'create'
                            ? t('createDescription')
                            : t('editDescription')}
                    </DialogDescription>
                </DialogHeader>

                {loading || !companyId ? (
                    <LoadingState />
                ) : error ? (
                    <div role="alert" className="py-6 text-sm text-destructive">
                        {error}
                    </div>
                ) : data ? (
                    <ClientForm
                        mode={mode}
                        companyId={companyId}
                        initialData={initialData}
                        initialFieldValues={data.fieldValues}
                        customFields={data.customFields}
                        onSuccess={() => onOpenChange(false)}
                        onCancel={() => onOpenChange(false)}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
