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
