import type { ReactNode } from 'react';

// Minimal layout for unauthenticated routes (sign-in, future password-reset).
// No AppShell — the chrome belongs to authenticated routes only. The flex
// centring lives here so child pages can stay focused on their own form
// composition without each one re-implementing a viewport-tall wrapper.
export default function AuthLayout({ children }: { children: ReactNode }) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
            {children}
        </main>
    );
}
