import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/States';

// ─────────────────────────────────────────────────────────────────────────────
// DashboardEmpty — first-load state when the company has zero pedidos.
//
// The microcopy intentionally disarms the "I should be doing something"
// anxiety an empty SaaS dashboard otherwise creates: "Nenhuma ação necessária
// por enquanto" gives the operator permission to wait.
//
// No greeting on this branch — when there's nothing to greet about, jumping
// straight to the empty-state framing is more honest than personalising a
// blank canvas.
//
// A11y (P8): a sr-only <h1> ("Início") gives the page a single top-level
// heading even on this empty branch. Without it, the EmptyState's <h3> was
// the highest heading the screen reader announced — violating the
// document-outline rule and silently breaking landmark navigation. Visual
// presentation is unchanged; only the a11y tree gains the heading.
// ─────────────────────────────────────────────────────────────────────────────

export async function DashboardEmpty() {
    const t = await getTranslations('empty.dashboard');
    const tNav = await getTranslations('nav');
    return (
        <>
            <h1 className="sr-only">{tNav('home')}</h1>
            <div className="flex min-h-[60vh] items-center justify-center">
                <EmptyState title={t('title')} description={t('description')} />
            </div>
        </>
    );
}
