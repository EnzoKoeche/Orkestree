'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ─────────────────────────────────────────────────────────────────────────────
// RequestTabs — controlled Radix Tabs that drives the URL.
//
// The Server Component upstream picks the active tab from `?tab=` and renders
// each tab's content with full server data. This client island is just the
// nav: clicking a trigger replaces the URL (router.replace, no history bloat
// — operators tab-hop a lot), and Next re-runs the page with the new
// searchParams. Server-rendered children are passed in as props so they
// remain inside the React tree across tab switches and stay cached by
// Next's router.
//
// `router.replace` over `router.push` because tab nav is a viewport change,
// not a navigation event — a back button that walks through every tab the
// operator clicked would feel broken.
// ─────────────────────────────────────────────────────────────────────────────

const TAB_KEYS = ['details', 'workflow', 'tasks', 'history'] as const;
type TabKey = (typeof TAB_KEYS)[number];

interface Props {
    activeTab: TabKey;
    labels: Record<TabKey, string>;
    details: ReactNode;
    workflow: ReactNode;
    tasks: ReactNode;
    history: ReactNode;
}

export function RequestTabs({ activeTab, labels, details, workflow, tasks, history }: Props) {
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
            <TabsContent value="workflow">{workflow}</TabsContent>
            <TabsContent value="tasks">{tasks}</TabsContent>
            <TabsContent value="history">{history}</TabsContent>
        </Tabs>
    );
}
