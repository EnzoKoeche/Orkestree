import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { SessionProvider } from '@/lib/session';
import './globals.css';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
    display: 'swap',
});

export const metadata: Metadata = {
    title: 'Orkestree',
    description: 'Operação organizada para empresas de serviço.',
};

// Forced dark for now — light variables exist in globals.css and are wired
// through the tokens, but we'll only expose the toggle as a feature when a
// future plan tier (Enterprise white-label) ships. Until then `className="dark"`
// pins the app to the dark theme without hiding the work that's already done.
//
// Async because next-intl reads locale + messages from the request scope.
// Single locale today (pt-BR), but the shape stays correct for the day a
// second locale lands.
export default async function RootLayout({ children }: { children: ReactNode }) {
    const locale = await getLocale();
    const messages = await getMessages();

    return (
        <html
            lang={locale}
            className={`dark ${inter.variable}`}
            suppressHydrationWarning
        >
            <body className="min-h-screen bg-background font-sans text-foreground antialiased">
                <NextIntlClientProvider locale={locale} messages={messages}>
                    <SessionProvider>{children}</SessionProvider>
                </NextIntlClientProvider>
                {/* Toast surface — sonner replaces the genspark Toast.tsx. Theme
                    pinned to dark since the app is dark-only for now; align
                    with the global theme switch when light mode ships. */}
                <Toaster theme="dark" position="bottom-right" richColors closeButton />
            </body>
        </html>
    );
}
