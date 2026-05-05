import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
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
export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="pt-BR" className={`dark ${inter.variable}`} suppressHydrationWarning>
            <body className="min-h-screen bg-background font-sans text-foreground antialiased">
                {children}
            </body>
        </html>
    );
}
