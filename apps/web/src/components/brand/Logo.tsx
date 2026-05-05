import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Logo — orkestree wordmark + "O" symbol
//
// The symbol is a hollow ring (the "O") with four short radial ticks at the
// cardinal points, evoking orchestration / coordinated outputs without being
// busy. Stroke-width 2 in a 24-unit viewBox keeps the geometry legible from
// 16 px (sidebar collapsed, favicon) up to 64+ px (sign-in screen).
//
// Colour split:
//   - main ring:    `currentColor` → resolves to text-foreground on the
//                   parent element. Keeps the logo monochrome on neutral
//                   surfaces.
//   - radial ticks: `text-primary`  → resolves to indigo-500 via the brand
//                   override in globals.css. The only chromatic accent in
//                   the logo, matching how primary actions surface across
//                   the app.
//
// Three variants:
//   - 'symbol'   :  ring + ticks only. Use in sidebar collapsed, favicon,
//                   loading splashes. Square aspect.
//   - 'wordmark' :  "orkestree" lowercase, Inter 600. Use sparingly — most
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

const SYMBOL_PX: Record<LogoSize, number> = {
    sm: 20,
    md: 28,
    lg: 44,
};

const WORDMARK_TEXT_CLASS: Record<LogoSize, string> = {
    sm: 'text-base leading-none',
    md: 'text-xl leading-none',
    lg: 'text-3xl leading-none',
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
            {/* Main ring — letterform "O" */}
            <circle
                cx="12"
                cy="12"
                r="6"
                stroke="currentColor"
                strokeWidth="2"
            />
            {/* Cardinal ticks — orchestration accents in indigo */}
            <g className="text-primary" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1.5" x2="12" y2="4" />
                <line x1="22.5" y1="12" x2="20" y2="12" />
                <line x1="12" y1="22.5" x2="12" y2="20" />
                <line x1="1.5" y1="12" x2="4" y2="12" />
            </g>
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
