'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ─────────────────────────────────────────────────────────────────────────────
// ClientTabs — controlled Radix Tabs that drives the URL.
//
// Mirror of RequestTabs (Sessão 10): server-rendered tab content passed in
// as props, this client island only owns the tab-nav state and pushes URL
// changes via router.replace (no history bloat — operators tab-hop a lot).
//
// Default tab `details` does NOT write `?tab=details` into the URL —
// canonical clean URL for the most common landing.
// ─────────────────────────────────────────────────────────────────────────────

const TAB_KEYS = ['details', 'requests'] as const;
type TabKey = (typeof TAB_KEYS)[number];

interface Props {
    activeTab: TabKey;
    labels: Record<TabKey, string>;
    details: ReactNode;
    requests: ReactNode;
}

export function ClientTabs({ activeTab, labels, details, requests }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const onValueChange = (next: string) => {
        if (!(TAB_KEYS as readonly string[]).includes(next)) return;
        const params = new URLSearchParams(searchParams.toString());
        if (next === 'details') {
            params.delete('tab');
        } else {
            params.set('tab', next);
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };

    return (
        <Tabs value={activeTab} onValueChange={onValueChange}>
            <TabsList>
                {TAB_KEYS.map((key) => (
                    <TabsTrigger key={key} value={key}>
                        {labels[key]}
                    </TabsTrigger>
                ))}
            </TabsList>
            <TabsContent value="details">{details}</TabsContent>
            <TabsContent value="requests">{requests}</TabsContent>
        </Tabs>
    );
}
