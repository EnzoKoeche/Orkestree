import type { LucideIcon } from 'lucide-react';
import { PageContainer } from './PageContainer';

// ─────────────────────────────────────────────────────────────────────────────
// PlaceholderPage — shared shell for routes that exist but aren't built yet.
//
// Replaces the 404s the operator was hitting on every sidebar nav item that
// pointed at an unbuilt feature (Pedidos, Clientes, Propostas, Configurações).
// Each route file imports this and supplies its own copy + icon, so when
// the real feature ships the route just stops calling PlaceholderPage and
// renders its real content — no shell rewrite needed.
//
// Hierarchy choices (P2):
//   - icon at h-12 (48 px) sits at muted-foreground/50 — visible but
//     clearly secondary. Anchor identitário, not protagonist.
//   - title in `text-2xl font-medium` (24 px / 500). Medium, not semibold,
//     because this is informational chrome — real-page titles get
//     semibold so the rendered hierarchy is "real page > placeholder".
//   - description in `text-sm text-muted-foreground` clamps line length
//     at max-w-md so the reading rhythm stays comfortable on wide
//     monitors.
//
// Layout choice (P3): `min-h-[60vh] + flex items-center justify-center`
// instead of a literal `padding-top: 25vh`. The vh-based offset breaks on
// short viewports (small laptops / mobile landscape); 60vh + centring
// scales cleanly across breakpoints.
//
// Restraint (P5): zero indigo. Placeholders aren't events — they're
// states of waiting. Adding the brand colour here would dilute it.
// ─────────────────────────────────────────────────────────────────────────────

interface PlaceholderPageProps {
    title: string;
    description: string;
    icon: LucideIcon;
}

export function PlaceholderPage({ title, description, icon: Icon }: PlaceholderPageProps) {
    return (
        <PageContainer>
            <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
                <Icon
                    className="h-12 w-12 text-muted-foreground/50"
                    aria-hidden="true"
                    strokeWidth={1.5}
                />
                <h1 className="mt-6 text-2xl font-medium text-foreground">{title}</h1>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
            </div>
        </PageContainer>
    );
}
