import { cookies } from 'next/headers';

// ─────────────────────────────────────────────────────────────────────────────
// Server-side session reader.
//
// Mirrors the client-side `readStoredSession()` for Server Components / Server
// Actions / Route Handlers. Only the JWT is exposed — the user object lives in
// localStorage on the client and isn't replicated to the cookie. Server
// Components that need the user identity should hit /memberships/me with the
// returned token, which is the canonical source.
//
// Cookie name is intentionally duplicated from lib/http.ts (instead of
// imported) because that file is 'use client'-bound: importing the constant
// here would drag the rest of the http module into the server bundle and
// confuse the bundler. The cookie name is a stable wire contract, not a
// shared symbol — keep them in sync manually if it ever changes.
//
// PHASE 5 / TASK-AUDIT-3: today the cookie is non-HttpOnly (so the client-side
// SessionProvider can hydrate without an extra round-trip). When the HttpOnly
// migration ships, this helper continues to work unchanged — the only thing
// that flips is the cookie's `httponly` flag at write time. That's exactly
// why server-side data fetches read from cookies() now: the migration becomes
// "flip a flag" instead of "rewrite every page".
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
