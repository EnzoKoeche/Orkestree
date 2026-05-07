'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session';
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
//
// Role gate: the modal needs COMPANY_CONFIG.VIEW (service-types +
// custom-fields list endpoints) AND REQUEST.CREATE (POST /requests). Only
// OWNER and ADMIN have all three by default. Linear pattern: actions you
// can't perform don't appear — better than rendering a button that errors
// on click. Hidden also for FINANCEIRO/OPERACIONAL/CLIENTE: each is missing
// at least REQUEST.CREATE in the role defaults; CLIENTE has CREATE on the
// wire but the client-facing flow lives in a separate V2 surface.
// ─────────────────────────────────────────────────────────────────────────────

// Mirror of permission.defaults.ts:37-87. Update both together when role
// defaults change. CLIENTE has REQUEST.CREATE in backend but client-facing
// UX is V2 — V1 hides for them too until we ship the cliente-final dashboard.
const CAN_CREATE_REQUEST_ROLES = ['OWNER', 'ADMIN'] as const;

export function NewRequestButton() {
    const t = useTranslations('requests.create');
    const { activeMembership } = useSession();
    const [open, setOpen] = useState(false);

    const role = activeMembership?.role;
    // Hide while the session still hydrates (role === undefined) so the
    // button doesn't flash in then disappear once we know the role can't
    // create.
    if (!role || !CAN_CREATE_REQUEST_ROLES.some((r) => r === role)) {
        return null;
    }

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
