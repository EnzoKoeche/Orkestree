import { CompanyResource, PermissionAction, Role, SensitiveField } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// RoleCategory collapses the five roles into four authorization buckets.
// Services use this to build role-scoped Prisma select objects.
// ─────────────────────────────────────────────────────────────────────────────

export enum RoleCategory {
    PRIVILEGED = 'PRIVILEGED',   // OWNER, ADMIN
    FINANCIAL = 'FINANCIAL',     // FINANCEIRO
    OPERATIONAL = 'OPERATIONAL', // OPERACIONAL
    CLIENT = 'CLIENT',           // CLIENTE
}

export function toRoleCategory(role: Role): RoleCategory {
    switch (role) {
        case Role.OWNER:
        case Role.ADMIN:
            return RoleCategory.PRIVILEGED;
        case Role.FINANCEIRO:
            return RoleCategory.FINANCIAL;
        case Role.OPERACIONAL:
            return RoleCategory.OPERATIONAL;
        case Role.CLIENTE:
            return RoleCategory.CLIENT;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hardcoded system defaults. DB tables store overrides only.
// Safe defaults: deny unless explicitly granted.
// ─────────────────────────────────────────────────────────────────────────────

type DefaultMap = Partial<Record<CompanyResource, Partial<Record<PermissionAction, boolean>>>>;

export const SYSTEM_DEFAULTS: Record<Role, DefaultMap> = {
    [Role.OWNER]: {
        [CompanyResource.REQUEST]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true, [PermissionAction.DELETE]: true, [PermissionAction.ASSIGN]: true, [PermissionAction.APPROVE]: true, [PermissionAction.REJECT]: true },
        [CompanyResource.CLIENT]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true, [PermissionAction.DELETE]: true },
        [CompanyResource.PROPOSAL]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true, [PermissionAction.DELETE]: true, [PermissionAction.APPROVE]: true, [PermissionAction.REJECT]: true, [PermissionAction.PUBLISH]: true },
        [CompanyResource.FINANCIAL]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true, [PermissionAction.EXPORT]: true },
        [CompanyResource.TASK]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true, [PermissionAction.DELETE]: true, [PermissionAction.ASSIGN]: true },
        [CompanyResource.DOCUMENT]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.DELETE]: true, [PermissionAction.PUBLISH]: true },
        [CompanyResource.CHAT]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true },
        [CompanyResource.SETTINGS]: { [PermissionAction.VIEW]: true, [PermissionAction.EDIT]: true },
        [CompanyResource.COMPANY_CONFIG]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true, [PermissionAction.DELETE]: true },
        [CompanyResource.USER_MANAGEMENT]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true, [PermissionAction.DELETE]: true },
        [CompanyResource.AUDIT_LOG]: { [PermissionAction.VIEW]: true },
    },
    [Role.ADMIN]: {
        [CompanyResource.REQUEST]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true, [PermissionAction.DELETE]: true, [PermissionAction.ASSIGN]: true, [PermissionAction.APPROVE]: true, [PermissionAction.REJECT]: true },
        [CompanyResource.CLIENT]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true, [PermissionAction.DELETE]: true },
        [CompanyResource.PROPOSAL]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true, [PermissionAction.DELETE]: true, [PermissionAction.APPROVE]: true, [PermissionAction.REJECT]: true, [PermissionAction.PUBLISH]: true },
        [CompanyResource.FINANCIAL]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true, [PermissionAction.EXPORT]: true },
        [CompanyResource.TASK]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true, [PermissionAction.DELETE]: true, [PermissionAction.ASSIGN]: true },
        [CompanyResource.DOCUMENT]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.DELETE]: true, [PermissionAction.PUBLISH]: true },
        [CompanyResource.CHAT]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true },
        [CompanyResource.SETTINGS]: { [PermissionAction.VIEW]: true, [PermissionAction.EDIT]: true },
        [CompanyResource.COMPANY_CONFIG]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true, [PermissionAction.DELETE]: true },
        [CompanyResource.USER_MANAGEMENT]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true },
        [CompanyResource.AUDIT_LOG]: { [PermissionAction.VIEW]: true },
    },
    [Role.FINANCEIRO]: {
        [CompanyResource.REQUEST]: { [PermissionAction.VIEW]: true },
        [CompanyResource.CLIENT]: { [PermissionAction.VIEW]: true },
        [CompanyResource.PROPOSAL]: { [PermissionAction.VIEW]: true, [PermissionAction.APPROVE]: true, [PermissionAction.REJECT]: true },
        [CompanyResource.FINANCIAL]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true, [PermissionAction.EXPORT]: true },
        [CompanyResource.TASK]: { [PermissionAction.VIEW]: true },
        [CompanyResource.DOCUMENT]: { [PermissionAction.VIEW]: true },
        [CompanyResource.CHAT]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true },
        [CompanyResource.AUDIT_LOG]: { [PermissionAction.VIEW]: true },
    },
    [Role.OPERACIONAL]: {
        [CompanyResource.REQUEST]: { [PermissionAction.VIEW]: true, [PermissionAction.EDIT]: true },
        [CompanyResource.CLIENT]: { [PermissionAction.VIEW]: true },
        // OPERACIONAL is the pilot's hands-on operator: they build the proposal
        // from the request. CREATE (not yet EDIT — DRAFT item editing lands with
        // the proposal-editing UI). EDIT/APPROVE stay with OWNER/ADMIN.
        [CompanyResource.PROPOSAL]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true },
        [CompanyResource.TASK]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true, [PermissionAction.EDIT]: true },
        [CompanyResource.DOCUMENT]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true },
        [CompanyResource.CHAT]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true },
    },
    [Role.CLIENTE]: {
        [CompanyResource.REQUEST]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true },
        [CompanyResource.PROPOSAL]: { [PermissionAction.VIEW]: true },
        [CompanyResource.DOCUMENT]: { [PermissionAction.VIEW]: true },
        [CompanyResource.CHAT]: { [PermissionAction.VIEW]: true, [PermissionAction.CREATE]: true },
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Field defaults. OWNER/ADMIN see all sensitive fields.
// All others are denied by default.
// ─────────────────────────────────────────────────────────────────────────────

export const FIELD_DEFAULTS: Record<Role, Partial<Record<SensitiveField, boolean>>> = {
    [Role.OWNER]: {
        [SensitiveField.INTERNAL_COST]: true,
        [SensitiveField.MARGIN]: true,
        [SensitiveField.SUPPLIER_PRICE]: true,
        [SensitiveField.GROSS_PROFIT]: true,
        [SensitiveField.NET_PROFIT]: true,
        [SensitiveField.PAYMENT_METHOD]: true,
        [SensitiveField.BANK_ACCOUNT]: true,
        [SensitiveField.FISCAL_KEY]: true,
    },
    [Role.ADMIN]: {
        [SensitiveField.INTERNAL_COST]: true,
        [SensitiveField.MARGIN]: true,
        [SensitiveField.SUPPLIER_PRICE]: true,
        [SensitiveField.GROSS_PROFIT]: true,
        [SensitiveField.NET_PROFIT]: true,
        [SensitiveField.PAYMENT_METHOD]: true,
        [SensitiveField.BANK_ACCOUNT]: true,
        [SensitiveField.FISCAL_KEY]: true,
    },
    [Role.FINANCEIRO]: {
        [SensitiveField.PAYMENT_METHOD]: true,
        [SensitiveField.BANK_ACCOUNT]: true,
    },
    [Role.OPERACIONAL]: {},
    [Role.CLIENTE]: {},
};
