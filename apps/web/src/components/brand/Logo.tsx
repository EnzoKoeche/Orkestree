import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Logo — orkestree wordmark + "O" symbol
//
// Storyline: a hollow ring is the letterform "O". A single indigo dot,
// deliberately offset to the right (not centered), reads as the
// orchestrating point — the centre that conducts everything around it.
// Off-centre placement avoids two false readings the centred version would
// invite: a loading spinner and a power button. Maximum colour restraint —
// one neutral ring + one chromatic point — lets the mark scale cleanly
// without losing identity at favicon sizes.
//
// Colour split:
//   - ring:  `currentColor` → resolves to text-foreground on the parent.
//            Keeps the mark monochrome on neutral surfaces.
//   - dot:   `text-primary` → resolves to indigo-500 (`#6366f1`) via the
//            brand override in globals.css. The only chromatic accent in
//            the logo, matching how primary actions surface in the app.
//
// Three variants:
//   - 'symbol'   :  ring + dot only. Sidebar collapsed, favicon, splash.
//   - 'wordmark' :  "orkestree" lowercase, Inter 600. Used rarely — most
//                   places want 'full'.
//   - 'full'     :  symbol + wordmark side-by-side. Default.
// ─────────────────────────────────────────────────────────────────────────────

type LogoSize = 'sm' | 'md' | 'lg';
type LogoVariant = 'full' | 'symbol' | 'wordmark';

interface LogoProps {
    size?: LogoSize;
    variant?: LogoVariant;
    className?: string;
}

// 20 / 28 / 40 px hits the three real contexts: sm = sidebar collapsed and
// list-row leading icon (minimum legible for the dot to read), md = header
// default, lg = sign-in hero. All multiples of 4. lg=40 is intentionally
// confident-but-not-shouty so the dark-minimalist aesthetic is preserved.
const SYMBOL_PX: Record<LogoSize, number> = {
    sm: 20,
    md: 28,
    lg: 40,
};

// Wordmark sizes track the body / large / page-title rhythm of the rest of
// the type system — 14 / 18 / 24 px — so the logo never looks "off scale"
// next to nearby text.
const WORDMARK_TEXT_CLASS: Record<LogoSize, string> = {
    sm: 'text-sm leading-none',
    md: 'text-lg leading-none',
    lg: 'text-2xl leading-none',
};

const GAP_CLASS: Record<LogoSize, string> = {
    sm: 'gap-2',
    md: 'gap-2',
    lg: 'gap-3',
};

function Symbol({ size = 'md', className }: { size?: LogoSize; className?: string }) {
    const px = SYMBOL_PX[size];
    return (
        <svg
            role="img"
            aria-label="Orkestree"
            viewBox="0 0 24 24"
            width={px}
            height={px}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn('shrink-0', className)}
        >
            {/* Ring — neutral "O" letterform. */}
            <circle
                cx="12"
                cy="12"
                r="7"
                stroke="currentColor"
                strokeWidth="2"
            />
            {/* Conducting dot — single indigo point offset to the right of
                the ring's geometric centre. The off-centre position is
                deliberate: a centred dot reads as a loading spinner or
                power button; pushing it east turns it into "the centre
                that orchestrates", anchored without being symmetrical. */}
            <circle
                cx="16.5"
                cy="12"
                r="2"
                fill="currentColor"
                className="text-primary"
            />
        </svg>
    );
}

function Wordmark({ size = 'md', className }: { size?: LogoSize; className?: string }) {
    return (
        <span
            className={cn(
                'font-sans font-semibold tracking-tight text-foreground',
                WORDMARK_TEXT_CLASS[size],
                className,
            )}
        >
            orkestree
        </span>
    );
}

export function Logo({ size = 'md', variant = 'full', className }: LogoProps) {
    if (variant === 'symbol') {
        return <Symbol size={size} className={cn('text-foreground', className)} />;
    }
    if (variant === 'wordmark') {
        return <Wordmark size={size} className={className} />;
    }
    return (
        <div
            className={cn(
                'inline-flex items-center text-foreground',
                GAP_CLASS[size],
                className,
            )}
        >
            <Symbol size={size} />
            <Wordmark size={size} />
        </div>
    );
}
