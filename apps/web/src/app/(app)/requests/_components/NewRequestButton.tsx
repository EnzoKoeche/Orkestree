'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreateRequestDialog } from './CreateRequestDialog';

// ─────────────────────────────────────────────────────────────────────────────
// NewRequestButton — client wrapper that owns the dialog open state.
//
// The page (Server Component) renders this in two positions: as the primary
// header action when the list has items, and inside the empty-state action
// slot when the list is empty. The button itself stays minimal — it just
// flips a boolean and lets <CreateRequestDialog/> own the form, fetches,
// and submit lifecycle.
//
// `controlled` semantics: this wrapper is the source of truth for `open`
// because the dialog's submit handler needs to close it after a successful
// router.push to the new request's detail page. Letting Radix own the open
// state would race that navigation.
// ─────────────────────────────────────────────────────────────────────────────

export function NewRequestButton() {
    const t = useTranslations('requests.create');
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('trigger')}
            </Button>
            <CreateRequestDialog open={open} onOpenChange={setOpen} />
        </>
    );
}
