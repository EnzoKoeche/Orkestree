import { describe, expect, it } from 'vitest';
import { formatTaxId } from './format';

// ─────────────────────────────────────────────────────────────────────────────
// formatTaxId spec — pure function, doubles as the Vitest infrastructure
// smoke. If this file fails to register, vitest.config.ts or the alias
// resolver is mis-wired and other specs would fail more confusingly.
//
// The function is defensive about length mismatches (returns input as-is
// rather than throwing) — important because clients in the seed and from
// real users can have null taxId or, in rare drift cases, a malformed
// stored value. The display surface should never crash on data quirks.
// ─────────────────────────────────────────────────────────────────────────────

describe('formatTaxId', () => {
    it('formats a CPF (11 digits) as XXX.XXX.XXX-XX', () => {
        expect(formatTaxId('12345678901')).toBe('123.456.789-01');
    });

    it('formats a CNPJ (14 digits) as XX.XXX.XXX/XXXX-XX', () => {
        expect(formatTaxId('12345678000190')).toBe('12.345.678/0001-90');
    });

    it('returns an empty string for empty input', () => {
        expect(formatTaxId('')).toBe('');
    });

    it('returns input as-is on length mismatch (defensive — no throw)', () => {
        // 5 digits — neither CPF nor CNPJ. The surface gives the operator
        // a "—" treatment via the caller's null-coalesce, but on the off
        // chance bad data arrives, we don't crash.
        expect(formatTaxId('12345')).toBe('12345');
    });

    it('returns input as-is on overlong input (defensive)', () => {
        // 16 digits — nothing in the schema permits this, but defensive
        // anyway. The function is display-only and downstream rendering
        // can't recover from a thrown error mid-table.
        expect(formatTaxId('1234567890123456')).toBe('1234567890123456');
    });
});
