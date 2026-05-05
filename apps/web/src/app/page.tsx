import { Logo } from '@/components/brand/Logo';

// Placeholder root. Real routing (auth gate, dashboard redirect) lands in
// Fase 5 + Fase 6; this page exists to prove the design system foundation is
// wired — Inter font + dark tokens + indigo accent on the symbol — and so
// `next build` produces a non-empty static page at this commit.
export default function RootPlaceholderPage() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-background">
            <Logo size="lg" />
        </main>
    );
}
