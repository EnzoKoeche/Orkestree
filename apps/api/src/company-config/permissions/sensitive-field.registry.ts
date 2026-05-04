import { SensitiveField } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Central registry mapping response field names to SensitiveField enum values.
// FieldFilterInterceptor uses this to identify and strip sensitive fields
// from outgoing responses without any per-DTO registration.
// Adding a new sensitive field: one entry here, no DTO changes required.
// ─────────────────────────────────────────────────────────────────────────────

export const SENSITIVE_FIELD_REGISTRY: Readonly<Record<string, SensitiveField>> = {
    internalCost: SensitiveField.INTERNAL_COST,
    totalCost: SensitiveField.INTERNAL_COST,
    margin: SensitiveField.MARGIN,
    supplierPrice: SensitiveField.SUPPLIER_PRICE,
    grossProfit: SensitiveField.GROSS_PROFIT,
    netProfit: SensitiveField.NET_PROFIT,
    paymentMethod: SensitiveField.PAYMENT_METHOD,
    bankAccount: SensitiveField.BANK_ACCOUNT,
    fiscalKey: SensitiveField.FISCAL_KEY,
};
