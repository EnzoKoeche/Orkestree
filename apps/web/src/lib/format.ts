// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
//
// All API decimals come over the wire as strings. We render them with
// Intl.NumberFormat so the precision is preserved up to the point of display.
// Default locale/currency are pt-BR / BRL because that's the operator's
// primary market; both are configurable per-call.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LOCALE = 'pt-BR';
const DEFAULT_CURRENCY = 'BRL';

export function formatCurrency(
    value: string | number | null | undefined,
    opts: { currency?: string; locale?: string } = {},
): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = typeof value === 'string' ? Number.parseFloat(value) : value;
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat(opts.locale ?? DEFAULT_LOCALE, {
        style: 'currency',
        currency: opts.currency ?? DEFAULT_CURRENCY,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n);
}

export function formatNumber(
    value: string | number | null | undefined,
    fractionDigits = 2,
): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = typeof value === 'string' ? Number.parseFloat(value) : value;
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat(DEFAULT_LOCALE, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(n);
}

export function formatPercent(
    value: string | number | null | undefined,
): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = typeof value === 'string' ? Number.parseFloat(value) : value;
    if (!Number.isFinite(n)) return '—';
    // The API stores discountPct as a 0-100 number, not 0-1 — keep that.
    return `${formatNumber(n, 2)}%`;
}

export function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(d);
}

export function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(d);
}

export function fullName(
    user: { firstName: string; lastName: string } | null | undefined,
): string {
    if (!user) return '—';
    const f = user.firstName?.trim() ?? '';
    const l = user.lastName?.trim() ?? '';
    return [f, l].filter(Boolean).join(' ') || '—';
}

export function initials(
    user: { firstName: string; lastName: string } | null | undefined,
): string {
    if (!user) return '?';
    const f = (user.firstName ?? '').trim();
    const l = (user.lastName ?? '').trim();
    const a = f.charAt(0);
    const b = l.charAt(0);
    return (a + b || '?').toUpperCase();
}
