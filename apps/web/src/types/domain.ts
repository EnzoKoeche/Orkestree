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
