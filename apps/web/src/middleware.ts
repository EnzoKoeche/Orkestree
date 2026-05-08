import { NextResponse, type NextRequest } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Auth gate (Phase 5).
//
// Single cookie (`orkestree_session`, written by lib/http.ts) carries the
// JWT. We DO NOT validate the JWT here — middleware only checks "is the
// cookie present?" and routes accordingly. Every API call still goes
// through the JwtAuthGuard server-side, which is the only authority on
// signature, expiry, and revocation.
//
// Two redirects:
//   - Unauthenticated user hits anything under the (app) group → /login
//   - Authenticated user hits /login → / (dashboard)
//
// The matcher runs on every request that isn't /api, /_next, or a static
// file. /login is included so we can short-circuit the second redirect.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'orkestree_session';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

    if (pathname === '/login') {
        if (hasSession) {
            return NextResponse.redirect(new URL('/', request.url));
        }
        return NextResponse.next();
    }

    if (!hasSession) {
        const loginUrl = new URL('/login', request.url);
        // Phase 6 follow-up: capture pathname as `?next=` so the operator
        // returns to the deep link they tried to reach. Trivial change here,
        // but pointless until there's more than one route to land on.
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    // Match every route except Next internals, /api, and /favicon.ico.
    // The previous pattern excluded any dot-containing path; that variant
    // failed to fire on `/` reliably on the Edge runtime. Simpler exclusion
    // list reads cleanly and covers the only static asset shipped today.
    //
    // Phase 6 follow-up: when files land in apps/web/public (logo PNG,
    // OG image, …), extend this to skip them, e.g.
    //   '/((?!_next|api|favicon.ico|images|fonts).*)'
    matcher: ['/((?!_next|api|favicon.ico).*)'],
};
