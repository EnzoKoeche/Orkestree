import { Settings } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PlaceholderPage } from '@/components/layout/PlaceholderPage';

export default async function SettingsPlaceholderPage() {
    const t = await getTranslations('placeholder.settings');
    return (
        <PlaceholderPage
            title={t('title')}
            description={t('description')}
            icon={Settings}
        />
    );
}
