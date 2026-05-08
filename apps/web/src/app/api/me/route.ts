import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Identity probe Route Handler — TASK-AUDIT-3.
//
// Replaces the synchronous localStorage.getItem('orkestree.session.v1') the
// SessionProvider used to hydrate from. The new flow:
//
//   1. Provider mounts → fetch GET /api/me with credentials: 'include'.
//   2. We read the HttpOnly orkestree_session cookie, forward to the
//      backend with Authorization: Bearer <token>.
//   3. Backend echoes the user identity (and rejects expired/invalid
//      tokens with 401 — we forward that status untouched, which the
//      provider treats as "not logged in").
//
// Returns just { user } — not the full memberships list. The provider
// fetches memberships separately via the proxy (lib/api.membershipsApi.me)
// for two reasons:
//   - Existing code path stays intact: workspace switcher already calls
//     membershipsApi.me() to refresh after invitations land.
//   - Hydration stays cheap: 401 short-circuits without paying for the
//     memberships join.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'orkestree_session';

function getApiBase(): string {
    const fromEnv = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
    return (fromEnv && fromEnv.length > 0 ? fromEnv : 'http://localhost:3000').replace(
        /\/+$/,
        '',
    );
}

export async function GET(): Promise<NextResponse> {
    const token = cookies().get(SESSION_COOKIE)?.value;
    if (!token) {
        return NextResponse.json(
            { message: 'No session', error: 'Unauthorized', statusCode: 401 },
            { status: 401 },
        );
    }

    let upstream: Response;
    try {
        // /memberships/me is the canonical "who am I + which workspaces"
        // endpoint. We pull only the user portion here so the contract for
        // /api/me stays narrow ("am I logged in, and as whom?").
        upstream = await fetch(`${getApiBase()}/memberships/me`, {
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
            },
            cache: 'no-store',
        });
    } catch {
        return NextResponse.json(
            { message: 'Upstream unreachable', error: 'Bad Gateway', statusCode: 502 },
            { status: 502 },
        );
    }

    if (upstream.status === 401) {
        // Token expired or revoked — forward 401 verbatim so the provider
        // treats this exactly like "no cookie present".
        return NextResponse.json(
            { message: 'Session expired', error: 'Unauthorized', statusCode: 401 },
            { status: 401 },
        );
    }

    if (!upstream.ok) {
        const text = await upstream.text();
        let parsed: unknown = null;
        if (text.length > 0) {
            try {
                parsed = JSON.parse(text);
            } catch {
                parsed = text;
            }
        }
        return NextResponse.json(parsed, { status: upstream.status });
    }

    const data = (await upstream.json()) as { user?: unknown };
    if (!data.user) {
        return NextResponse.json(
            {
                message: 'Upstream returned an unexpected shape',
                error: 'Bad Gateway',
                statusCode: 502,
            },
            { status: 502 },
        );
    }

    return NextResponse.json({ user: data.user });
}
