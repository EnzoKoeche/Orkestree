'use client';

import { useTranslations } from 'next-intl';
import { useSession } from '@/lib/session';

// ─────────────────────────────────────────────────────────────────────────────
// DashboardGreeting — Client island for the personalised "Olá, X" line.
//
// Why a Client component here in an otherwise server-rendered page:
// firstName lives in the client-side session (lib/session.tsx hydrates from
// localStorage on mount). The Server Component above doesn't have it without
// either parsing the JWT (extra dep) or hitting /auth/me (extra round-trip).
// Cost of doing it client-side: a tiny "Olá!" → "Olá, Enzo" flicker on first
// paint. Greeting isn't load-bearing data, so the tradeoff is clearly worth
// avoiding the round-trip.
//
// Hierarchy (P2): h1, text-2xl font-medium. NOT semibold — semibold is for
// real-page titles (/requests, /clients). Dashboard greeting is informational
// chrome, deliberately one notch below in weight so the stat number below
// becomes the focal point of the page.
//
// Microcopy (P9): "Olá, X" not "Bem-vindo de volta, X". Linear-tier brevity —
// warm without sounding like a hotel chatbot.
// ─────────────────────────────────────────────────────────────────────────────

export function DashboardGreeting() {
    const t = useTranslations('dashboard');
    const { session } = useSession();
    const firstName = session?.user.firstName?.trim() || '';

    return (
        <h1 className="text-2xl font-medium text-foreground">
            {firstName ? t('greeting', { firstName }) : t('greetingFallback')}
        </h1>
    );
}
