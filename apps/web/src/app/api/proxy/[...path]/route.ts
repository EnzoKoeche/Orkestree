import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated API proxy — TASK-AUDIT-3.
//
// After the HttpOnly migration, client components have no JWT in JavaScript.
// This handler forwards arbitrary same-origin requests under /api/proxy/*
// to the backend, attaching Authorization: Bearer <token> from the
// orkestree_session cookie. The browser sends the cookie automatically
// because /api/proxy is same-origin to the page.
//
// Why a single catch-all instead of one Route Handler per endpoint:
//   - Adding a new client-side mutation (e.g. proposal item CRUD) doesn't
//     require a new file. Keeps the auth boundary in one place.
//   - The backend remains the source of truth for routing / permissions /
//     tenant scoping. We only translate transport (cookie → header).
//   - Server Components keep using `tokenOverride` to hit the backend
//     directly — they have a JWT already via lib/server-session, and going
//     through the proxy would add an unnecessary network hop.
//
// What is NOT forwarded:
//   - Hop-by-hop headers (host, connection, content-length) — the runtime
//     sets fresh ones for the upstream request.
//   - The session cookie itself — we extract the JWT and put it on
//     Authorization, where the backend's JwtAuthGuard expects it.
//
// 401 from the backend means the JWT is expired or revoked. We forward
// the 401 untouched; lib/http surfaces it as ApiError.isUnauthorized()
// and the existing UI handling kicks in.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'orkestree_session';

// Per RFC 7230 these are connection-specific and must not be forwarded.
const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    // Set fresh by fetch, copying ours leaks browser-quirky values.
    'host',
    'content-length',
    // Cookie is not forwarded — we strip down to Authorization only.
    'cookie',
]);

function getApiBase(): string {
    const fromEnv = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
    return (fromEnv && fromEnv.length > 0 ? fromEnv : 'http://localhost:3000').replace(
        /\/+$/,
        '',
    );
}

function buildUpstreamHeaders(req: NextRequest, token: string): Headers {
    const out = new Headers();
    req.headers.forEach((value, key) => {
        if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
            out.set(key, value);
        }
    });
    out.set('Authorization', `Bearer ${token}`);
    return out;
}

interface RouteContext {
    params: { path: string[] };
}

async function forward(req: NextRequest, context: RouteContext): Promise<NextResponse> {
    const token = cookies().get(SESSION_COOKIE)?.value;
    if (!token) {
        return NextResponse.json(
            { message: 'No session', error: 'Unauthorized', statusCode: 401 },
            { status: 401 },
        );
    }

    const segments = context.params.path.map((p) => encodeURIComponent(p)).join('/');
    const upstreamUrl = `${getApiBase()}/${segments}${req.nextUrl.search}`;

    // Body handling: GET/HEAD never carry one, the rest stream through.
    // Using `req.body` (a ReadableStream) preserves uploads and JSON alike
    // without an extra parse/stringify round-trip.
    const method = req.method.toUpperCase();
    const init: RequestInit & { duplex?: 'half' } = {
        method,
        headers: buildUpstreamHeaders(req, token),
        cache: 'no-store',
    };
    if (method !== 'GET' && method !== 'HEAD' && req.body) {
        init.body = req.body;
        // `duplex: 'half'` is required by Node's undici when streaming a
        // request body; without it the fetch throws synchronously.
        init.duplex = 'half';
    }

    let upstream: Response;
    try {
        upstream = await fetch(upstreamUrl, init);
    } catch {
        return NextResponse.json(
            { message: 'Upstream unreachable', error: 'Bad Gateway', statusCode: 502 },
            { status: 502 },
        );
    }

    // Stream the response body back. Headers are copied except hop-by-hop;
    // we also drop `content-encoding` because Next will re-encode.
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (HOP_BY_HOP_HEADERS.has(lower) || lower === 'content-encoding') return;
        responseHeaders.set(key, value);
    });

    return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
    });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
