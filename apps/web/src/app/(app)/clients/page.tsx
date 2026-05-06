import { Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PlaceholderPage } from '@/components/layout/PlaceholderPage';

export default async function ClientsPlaceholderPage() {
    const t = await getTranslations('placeholder.clients');
    return (
        <PlaceholderPage
            title={t('title')}
            description={t('description')}
            icon={Users}
        />
    );
}
