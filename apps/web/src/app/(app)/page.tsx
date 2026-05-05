import { getTranslations } from 'next-intl/server';
import { PageContainer } from '@/components/layout/PageContainer';
import { EmptyState } from '@/components/ui/States';

// Dashboard root. For Fase 4 this is an EmptyState — the operator hasn't
// done anything yet, and the microcopy explicitly disarms the "I should be
// doing something" feeling that an empty SaaS dashboard otherwise creates.
//
// Server component (no `'use client'`); next-intl exposes `getTranslations`
// for RSC pages, which is the canonical pattern in App Router.
export default async function DashboardPage() {
    const t = await getTranslations('empty.dashboard');

    return (
        <PageContainer>
            <div className="flex min-h-[60vh] items-center justify-center">
                <EmptyState title={t('title')} description={t('description')} />
            </div>
        </PageContainer>
    );
}
