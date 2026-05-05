import { NextResponse } from 'next/server';

// Pass-through middleware. Phase 5 will turn this into the auth gate
// that redirects unauthenticated traffic away from app routes to /login,
// using the canonical Next.js cookie-based pattern.
export function middleware() {
    return NextResponse.next();
}

// Empty matcher: middleware does not run on any request right now. Phase 5
// will widen the matcher to cover authenticated routes — typically:
//   matcher: ['/((?!api|_next|.*\\..*|login).*)']
// which excludes API routes, Next internals, static files, and the login
// page itself.
export const config = {
    matcher: [],
};
