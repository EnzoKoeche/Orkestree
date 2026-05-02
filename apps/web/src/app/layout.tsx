import type { Metadata } from 'next';
import { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
    title: 'Orkestree',
    description: 'Internal operator console for Orkestree.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className="h-full">
            <body className="h-full antialiased">
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
