// Placeholder root. Real routing (auth gate, dashboard redirect) lands in
// the auth + dashboard fases; this file exists only so `next build` succeeds
// at the foundation commit.
export default function RootPlaceholderPage() {
    return (
        <main className="flex min-h-screen items-center justify-center">
            <p className="text-sm text-muted-foreground">
                orkestree — foundation scaffold
            </p>
        </main>
    );
}
