// ─────────────────────────────────────────────────────────────────────────────
// Format helpers — display-only, no mutation/parsing semantics.
//
// Scope: small, pure, framework-agnostic. Keep it boring; promote functions
// here only after they prove themselves in 2+ call sites (this file was
// promoted from inline copies in 3 client surfaces during Sessão 11).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a raw fiscal document string for display.
 *
 *   11 digits → CPF: XXX.XXX.XXX-XX
 *   14 digits → CNPJ: XX.XXX.XXX/XXXX-XX
 *
 * Anything else (length mismatch from a hypothetical bad row) is returned
 * as-is — defensive, doesn't crash if data drifts. Backend stores raw
 * digits; this is the read-side counterpart.
 */
export function formatTaxId(raw: string): string {
    if (raw.length === 11) {
        return `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6, 9)}-${raw.slice(9)}`;
    }
    if (raw.length === 14) {
        return `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5, 8)}/${raw.slice(8, 12)}-${raw.slice(12)}`;
    }
    return raw;
}

// ── Money / quantity / percent ──────────────────────────────────────────────
//
// The backend stores money/quantity as Postgres NUMERIC and Prisma serializes
// Decimal to a STRING over JSON. These helpers format those strings at the
// render edge. They are DISPLAY-ONLY: the value is parsed with Number() purely
// to feed Intl, never to do arithmetic. Pricing is authoritative on the
// backend (proposal totals are recomputed server-side) — the frontend must
// never recompute a total from these parsed floats. All output is pt-BR.

const BRL = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
});

const DECIMAL = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 4,
});

const EM_DASH = '—';

/**
 * Formats a Decimal money string (or number) as BRL, e.g. "1234.5" → "R$ 1.234,50".
 * Returns an em-dash for null/empty/unparseable input so tables never render
 * "R$ NaN".
 */
export function formatBRL(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return EM_DASH;
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(n)) return EM_DASH;
    return BRL.format(n);
}

/**
 * Formats a Decimal quantity string (12,4) for display, e.g. "2.5" → "2,5".
 * Trailing zeros are trimmed (maximumFractionDigits, no minimum).
 */
export function formatQuantity(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return EM_DASH;
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(n)) return EM_DASH;
    return DECIMAL.format(n);
}

/**
 * Formats a percent Decimal string, e.g. "10" → "10%", "10.5" → "10,5%".
 * Used for line-item and proposal-level discountPct, which arrives as a bare
 * number (the "%" is presentational, not stored).
 */
export function formatPercent(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return EM_DASH;
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(n)) return EM_DASH;
    return `${DECIMAL.format(n)}%`;
}
