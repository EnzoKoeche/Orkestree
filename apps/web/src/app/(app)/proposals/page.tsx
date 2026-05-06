import { FileText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PlaceholderPage } from '@/components/layout/PlaceholderPage';

export default async function ProposalsPlaceholderPage() {
    const t = await getTranslations('placeholder.proposals');
    return (
        <PlaceholderPage
            title={t('title')}
            description={t('description')}
            icon={FileText}
        />
    );
}
