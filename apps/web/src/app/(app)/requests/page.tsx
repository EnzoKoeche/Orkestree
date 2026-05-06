import { ClipboardList } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PlaceholderPage } from '@/components/layout/PlaceholderPage';

// Server Component — pulls copy from messages/pt.json via getTranslations,
// hands the icon component to the shared PlaceholderPage shell. When the
// real Pedidos UI ships, this file's body becomes the list/kanban; the
// shell pattern dies cleanly.
export default async function RequestsPlaceholderPage() {
    const t = await getTranslations('placeholder.requests');
    return (
        <PlaceholderPage
            title={t('title')}
            description={t('description')}
            icon={ClipboardList}
        />
    );
}
