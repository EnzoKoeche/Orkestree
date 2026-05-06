import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/States';

// ─────────────────────────────────────────────────────────────────────────────
// DashboardEmpty — first-load state when the company has zero pedidos.
//
// Lifted from the original /(app)/page.tsx unchanged in copy and layout. The
// microcopy intentionally disarms the "I should be doing something" anxiety
// an empty SaaS dashboard otherwise creates: "Nenhuma ação necessária por
// enquanto" gives the operator permission to wait.
//
// No greeting on this branch — when there's nothing to greet about, jumping
// straight to the empty-state framing is more honest than personalising a
// blank canvas.
// ─────────────────────────────────────────────────────────────────────────────

export async function DashboardEmpty() {
    const t = await getTranslations('empty.dashboard');
    return (
        <div className="flex min-h-[60vh] items-center justify-center">
            <EmptyState title={t('title')} description={t('description')} />
        </div>
    );
}
