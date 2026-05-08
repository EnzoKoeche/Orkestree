import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Logout Route Handler — TASK-AUDIT-3.
//
// Single responsibility: clear the orkestree_session HttpOnly cookie.
// The cookie was the only authority for "logged in" after the AUDIT-3
// migration, so wiping it server-side is sufficient — no backend round
// trip needed. Backend revocation lists are out of scope for V1; if/when
// they ship, this handler grows a fetch to /auth/logout.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'orkestree_session';

export async function POST(): Promise<NextResponse> {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
    });
    return response;
}
