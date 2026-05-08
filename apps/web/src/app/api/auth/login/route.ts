import { NextResponse, type NextRequest } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Login Route Handler — TASK-AUDIT-3.
//
// Replaces the direct browser → backend POST that lived in lib/api.authApi
// before the HttpOnly migration. Flow:
//
//   1. Client (login page) POSTs { email, password } to this same-origin
//      Route Handler.
//   2. Route Handler forwards to the NestJS backend's POST /auth/login.
//   3. On 2xx, the JWT comes back in `accessToken`. We DROP it from the
//      response body and persist it as an HttpOnly + Secure (in prod) +
//      SameSite=Lax cookie. JavaScript on the client never sees the token.
//   4. The client receives only `{ user, expiresIn }` — enough to populate
//      the SessionProvider's identity slot without exposing credentials.
//
// Backend errors (401 invalid credentials, 429 throttled, 5xx) are
// forwarded verbatim so the existing toast handling in the login page
// keeps working. Network failure between this Route Handler and the
// backend surfaces as 502.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'orkestree_session';
// Mirrors backend JWT_EXPIRES_IN (7d). Cookie max-age expressed in seconds.
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getApiBase(): string {
    const fromEnv = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
    return (fromEnv && fromEnv.length > 0 ? fromEnv : 'http://localhost:3000').replace(
        /\/+$/,
        '',
    );
}

interface LoginRequestBody {
    email?: unknown;
    password?: unknown;
}

interface BackendLoginResponse {
    accessToken: string;
    expiresIn: string;
    user: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    let body: LoginRequestBody;
    try {
        body = (await req.json()) as LoginRequestBody;
    } catch {
        return NextResponse.json(
            { message: 'Invalid JSON body', error: 'Bad Request', statusCode: 400 },
            { status: 400 },
        );
    }

    if (typeof body.email !== 'string' || typeof body.password !== 'string') {
        return NextResponse.json(
            {
                message: 'email and password must be strings',
                error: 'Bad Request',
                statusCode: 400,
            },
            { status: 400 },
        );
    }

    let upstream: Response;
    try {
        upstream = await fetch(`${getApiBase()}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ email: body.email, password: body.password }),
            cache: 'no-store',
        });
    } catch {
        return NextResponse.json(
            { message: 'Upstream unreachable', error: 'Bad Gateway', statusCode: 502 },
            { status: 502 },
        );
    }

    const text = await upstream.text();
    let parsed: unknown = null;
    if (text.length > 0) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = text;
        }
    }

    if (!upstream.ok) {
        // Forward the backend's error body verbatim — the login page's
        // ApiError-handling toast switch keys off `message` and `statusCode`,
        // and our wrapping would only strip useful detail.
        return NextResponse.json(parsed, { status: upstream.status });
    }

    const data = parsed as BackendLoginResponse;
    if (typeof data.accessToken !== 'string' || !data.user) {
        // Defensive: the backend contract drift would corrupt the cookie.
        return NextResponse.json(
            {
                message: 'Upstream returned an unexpected shape',
                error: 'Bad Gateway',
                statusCode: 502,
            },
            { status: 502 },
        );
    }

    const response = NextResponse.json({ user: data.user, expiresIn: data.expiresIn });
    response.cookies.set(SESSION_COOKIE, data.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_COOKIE_MAX_AGE,
    });
    return response;
}
