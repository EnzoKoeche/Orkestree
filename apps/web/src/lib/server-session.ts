import { cookies } from 'next/headers';

// ─────────────────────────────────────────────────────────────────────────────
// Server-side session reader.
//
// Reads the orkestree_session cookie for Server Components / Server Actions /
// Route Handlers. Post-AUDIT-3 the cookie is HttpOnly — JS can't read it, but
// `cookies()` from next/headers runs server-side and has full access. Client
// Components that need authenticated transport go through the /api/proxy
// Route Handler instead.
//
// Cookie name is intentionally hardcoded here (and mirrored in
// app/api/auth/login/route.ts, app/api/me/route.ts, app/api/proxy/[...path]/
// route.ts, and middleware.ts) instead of imported from a shared module
// because some consumers are 'use client'-bound and importing across that
// boundary would drag server-only modules into the client bundle. The cookie
// name is a stable wire contract — keep all five spots in sync manually if
// it ever changes.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'orkestree_session';
const ACTIVE_COMPANY_COOKIE = 'orkestree_active_company';

function readCookie(name: string): string | null {
    const raw = cookies().get(name)?.value;
    if (!raw) return null;
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/**
 * Returns the JWT from the session cookie, or null if absent. Safe to call
 * from any server-only context (Server Component, Route Handler, Server
 * Action). NOT safe to import into 'use client' files — `next/headers` is
 * server-only and bundling will fail loudly if you try.
 */
export function getServerToken(): string | null {
    return readCookie(SESSION_COOKIE);
}

/**
 * Returns the active workspace id the operator picked client-side. The
 * cookie is dual-written by lib/http.writeStoredActiveCompanyId — both
 * sides of the membership swap (localStorage for SessionProvider hydration,
 * cookie for Server Components like this page). Returns null when no
 * workspace has been selected yet (first load before /memberships/me
 * resolves).
 */
export function getServerActiveCompanyId(): string | null {
    return readCookie(ACTIVE_COMPANY_COOKIE);
}

/** Convenience pair for pages that need both at once. */
export function getServerSession(): {
    token: string | null;
    activeCompanyId: string | null;
} {
    return {
        token: getServerToken(),
        activeCompanyId: getServerActiveCompanyId(),
    };
}
