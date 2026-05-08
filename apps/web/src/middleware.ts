import { NextResponse, type NextRequest } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Edge middleware. Two responsibilities:
//
// 1. Auth gate (Phase 5) — single cookie (`orkestree_session`, written by
//    /api/auth/login route handler) carries the JWT. Middleware does NOT
//    validate the JWT; it only checks "is the cookie present?" and routes.
//    Every API call still goes through the JwtAuthGuard server-side, which
//    is the only authority on signature, expiry, and revocation.
//
// 2. CSP nonce (AUDIT-7) — generates a per-request nonce, propagates it to
//    the SSR tree via the `x-nonce` request header (root layout reads it
//    via `headers()` to opt into dynamic rendering), and emits a strict
//    Content-Security-Policy-Report-Only header so the browser reports
//    violations without blocking. PR follow-up flips Report-Only →
//    enforcing once 24-48h of Preview/prod telemetry is clean.
//
// Edge runtime caveat: Node `crypto.randomBytes` is unavailable, so nonce
// generation uses Web Crypto's `getRandomValues` + `btoa`.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'orkestree_session';

function generateNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

function buildCspPolicy(nonce: string): string {
    const isProd = process.env.NODE_ENV === 'production';

    // Dev needs `'unsafe-eval'` for Next fast refresh and `'unsafe-inline'`
    // for HMR-injected styles. Prod is strict: nonce-only inline, no eval.
    const scriptSrc = isProd
        ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
        : `'self' 'unsafe-eval' 'unsafe-inline'`;
    const styleSrc = isProd
        ? `'self' 'nonce-${nonce}'`
        : `'self' 'unsafe-inline'`;

    const directives = [
        `default-src 'none'`,
        `script-src ${scriptSrc}`,
        `style-src ${styleSrc}`,
        `img-src 'self' data: blob:`,
        `font-src 'self'`,
        `connect-src 'self' https://orkestree-api.onrender.com`,
        `frame-ancestors 'none'`,
        `base-uri 'none'`,
        `form-action 'self'`,
        `object-src 'none'`,
    ];
    if (isProd) directives.push(`upgrade-insecure-requests`);

    return directives.join('; ');
}

function applyCspHeaders(request: NextRequest): NextResponse {
    const nonce = generateNonce();
    const policy = buildCspPolicy(nonce);

    // Forwarding modified request headers is what makes `headers().get('x-nonce')`
    // in the root layout return the value. Without this, the layout would see
    // the original incoming headers and Next's auto-nonce propagation wouldn't
    // pick up our value.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy-Report-Only', policy);
    return response;
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

    // Auth-gate redirects don't render HTML, so CSP isn't applied to them.
    if (pathname === '/login' && hasSession) {
        return NextResponse.redirect(new URL('/', request.url));
    }
    if (pathname !== '/login' && !hasSession) {
        // Phase 6 follow-up: capture pathname as `?next=` so the operator
        // returns to the deep link they tried to reach.
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return applyCspHeaders(request);
}

export const config = {
    // Match every route except Next internals, /api, and /favicon.ico.
    // /api is excluded because Route Handlers return JSON, not HTML — CSP
    // there would be defense-in-depth only and nonce propagation doesn't
    // apply (no SSR tree). The /api/proxy forwarder handles its own headers.
    //
    // Phase 6 follow-up: when files land in apps/web/public, extend with
    //   '/((?!_next|api|favicon.ico|images|fonts).*)'
    matcher: ['/((?!_next|api|favicon.ico).*)'],
};
