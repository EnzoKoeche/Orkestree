// ─────────────────────────────────────────────────────────────────────────────
// Domain types — wire shapes the @orkestree/api backend speaks.
//
// Hand-written to match the explicit Prisma `select` projections at
// apps/api/src/auth/* and apps/api/src/memberships/*. NOT generated — the
// Prisma client is server-side only. Drift surfaces here as a TypeScript
// error at the call site, which is the right place to notice it.
// ─────────────────────────────────────────────────────────────────────────────

// ── Roles (mirrors the @prisma/client enum) ─────────────────────────────────

export type Role = 'OWNER' | 'ADMIN' | 'FINANCEIRO' | 'OPERACIONAL' | 'CLIENTE';
export type MembershipStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

// ── User (matches POST /auth/login → user + GET /auth/me) ───────────────────

export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
}

// ── Session (client-side persistent state) ──────────────────────────────────
//
// Held in localStorage (for client hydration) and in a non-HttpOnly
// `orkestree_session` cookie (for the middleware auth gate). Phase 5 ships
// this dual-write deliberately; before the pilot, migrate to HttpOnly via a
// Route Handler proxy — see Notion follow-up.
//
// Membership / activeCompanyId is intentionally NOT in this shape yet. The
// /memberships/me endpoint hands back the workspace list, and Fase 6 lifts
// the active selection into a separate "active workspace" slot. Login alone
// has no opinion about which company the operator wants to enter.
export interface Session {
    token: string;
    user: User;
}

// ── Membership (used by GET /memberships/me — Fase 6 wires real consumer) ──

export interface MembershipCompany {
    id: string;
    legalName: string;
    tradeName: string | null;
    taxId: string;
}

export interface Membership {
    id: string;
    role: Role;
    status: MembershipStatus;
    createdAt: string;
    company: MembershipCompany;
}

export interface MembershipsMeResponse {
    user: User;
    memberships: Membership[];
}

// ── Pagination wrapper ──────────────────────────────────────────────────────
//
// All list endpoints return this shape. Frontend computes hasMore /
// currentPage / totalPages from (total, limit, skip) — keeping the wire shape
// minimal lets us add new derived values without churning the API.
//
// Mirrors the backend's `prisma.$transaction([findMany, count])` contract:
// items and total were captured in the same DB snapshot, so pagination math
// stays consistent under concurrent writes.

export interface Paginated<T> {
    items: T[];
    total: number;
    limit: number;
    skip: number;
}

// ── Service Request (mirror of LIST_SELECT in apps/api/src/service-requests) ──

export type ClientType = 'INDIVIDUAL' | 'BUSINESS';

export interface ServiceRequestStage {
    id: string;
    code: string;
    name: string;
    /** Hex token (e.g. "#3b82f6") or null. Backend stores brand-tinted hints
     *  for the Stage column; UI must treat null as "no color provided". */
    color: string | null;
    /** True when the stage is terminal in its workflow (success leg). Drives
     *  the StatusBadge → "Concluído" branch on the list. */
    isFinal: boolean;
}

export interface ServiceRequestType {
    id: string;
    code: string;
    name: string;
}

export interface ServiceRequestClient {
    id: string;
    /** Per-tenant sequential identifier (1, 2, …) — display as "C-12". */
    number: number;
    name: string;
    type: ClientType;
}

/** Membership reference shaped exactly like the API's MEMBERSHIP_USER_SELECT. */
export interface MembershipRef {
    id: string;
    user: {
        id: string;
        firstName: string;
        lastName: string;
        avatarUrl: string | null;
    };
}

export interface ServiceRequestListItem {
    id: string;
    /** Per-tenant sequential identifier — display as "#1234". */
    number: number;
    title: string;
    description: string | null;
    isCancelled: boolean;
    cancellationReason: string | null;
    createdAt: string;
    updatedAt: string;
    serviceType: ServiceRequestType;
    currentStage: ServiceRequestStage;
    client: ServiceRequestClient | null;
    assignedMembership: MembershipRef | null;
    createdByMembership: MembershipRef | null;
}

/** Filter shape consumed by GET /companies/:companyId/requests. All optional;
 *  omitted keys are dropped by the http querystring builder. */
export interface ListServiceRequestsParams {
    stageId?: string;
    serviceTypeId?: string;
    assignedMembershipId?: string;
    isCancelled?: boolean;
    limit?: number;
    skip?: number;
}
