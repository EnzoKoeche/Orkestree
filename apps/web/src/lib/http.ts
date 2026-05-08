// ─────────────────────────────────────────────────────────────────────────────
// HTTP client — single source of truth for the @orkestree/api transport.
//
// Owns: base URL resolution, error normalization (typed ApiError), and a
// helper pair for the active-workspace cookie+localStorage slot.
//
// Post-AUDIT-3 transport split:
//   - Client-side calls go through /api/proxy/* (same-origin Next Route
//     Handler). The browser ships the HttpOnly orkestree_session cookie
//     automatically; the proxy translates it into Authorization on the
//     upstream backend call. JS never touches the JWT.
//   - Server Components call the backend directly via NEXT_PUBLIC_API_URL,
//     pulling the JWT through `tokenOverride` from lib/server-session.
//     They have a JWT already and a same-origin proxy hop would just add
//     latency.
//
// Intentionally framework-free: no React, no SWR, no React Query. Each page
// composes this via lib/api.ts, which means swapping out a data fetcher
// later doesn't ripple into endpoints.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVE_COMPANY_KEY = 'orkestree.active_company.v1';
const ACTIVE_COMPANY_COOKIE = 'orkestree_active_company';

// Active-company cookie is kept aligned with the JWT's 7d window so the
// middleware sees both expire together — no half-state where the operator
// is "logged in but workspace forgotten".
const ACTIVE_COMPANY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

// ── Active company persistence ──────────────────────────────────────────────
//
// The active workspace lives OUTSIDE the Session shape so a memberships
// refresh never invalidates the user identity. Only the company id is
// stored here; the full Membership object is hydrated on every load via
// /memberships/me, then matched to this id.
//
// Dual-write: localStorage for client SessionProvider hydration,
// orkestree_active_company cookie for Server Components (which can't read
// localStorage). Cookie is intentionally NON-HttpOnly — it carries no
// secret, just a public id, and same-tab JS reads it during workspace
// switching.

export function readStoredActiveCompanyId(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(ACTIVE_COMPANY_KEY);
        return raw && raw.length > 0 ? raw : null;
    } catch {
        return null;
    }
}

export function writeStoredActiveCompanyId(companyId: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ACTIVE_COMPANY_KEY, companyId);
    document.cookie = [
        `${ACTIVE_COMPANY_COOKIE}=${encodeURIComponent(companyId)}`,
        'path=/',
        'SameSite=Lax',
        `max-age=${ACTIVE_COMPANY_COOKIE_MAX_AGE_SECONDS}`,
    ].join('; ');
}

export function clearStoredActiveCompanyId(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ACTIVE_COMPANY_KEY);
    document.cookie = `${ACTIVE_COMPANY_COOKIE}=; path=/; max-age=0`;
}

// ── Errors ──────────────────────────────────────────────────────────────────

export class ApiError extends Error {
    public readonly status: number;
    public readonly body: unknown;
    /** Seconds the client should wait before retrying — populated for 429. */
    public readonly retryAfter: number | null;

    constructor(
        message: string,
        status: number,
        body: unknown,
        retryAfter: number | null = null,
    ) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
        this.retryAfter = retryAfter;
    }

    /** Network errors (DNS / TLS / fetch threw) report status 0. */
    public isNetworkError(): boolean {
        return this.status === 0;
    }

    public isUnauthorized(): boolean {
        return this.status === 401;
    }

    public isThrottled(): boolean {
        return this.status === 429;
    }

    public isServerError(): boolean {
        return this.status >= 500;
    }

    /**
     * Best-effort user-facing extraction from a NestJS-shaped body. Nest's
     * default exceptions return either:
     *   { message: string,    error: string, statusCode: number }
     *   { message: string[],  error: string, statusCode: number } // ValidationPipe
     */
    public toUserMessage(): string {
        const body = this.body as
            | { message?: string | string[]; error?: string }
            | null
            | undefined;
        if (body && Array.isArray(body.message)) return body.message.join('; ');
        if (body && typeof body.message === 'string') return body.message;
        return this.message;
    }
}

// ── Core request ────────────────────────────────────────────────────────────

export interface RequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'HEAD';
    body?: unknown;
    /** Querystring params — undefined / null / "" entries are dropped. */
    query?: Record<string, string | number | boolean | undefined | null>;
    /**
     * Server Components pass the JWT pulled from lib/server-session here.
     * When present, the request bypasses /api/proxy and goes straight to
     * the backend. Client callers leave this undefined; the proxy handles
     * cookie → Authorization translation server-side.
     */
    tokenOverride?: string;
    signal?: AbortSignal;
}

function isServer(): boolean {
    return typeof window === 'undefined';
}

function getServerApiBase(): string {
    const fromEnv = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
    return (fromEnv && fromEnv.length > 0 ? fromEnv : 'http://localhost:3000').replace(
        /\/+$/,
        '',
    );
}

/**
 * Resolve the absolute base URL for an outgoing request:
 *   - Server-side (Server Components / Route Handlers): point at the backend.
 *   - Client-side: point at our same-origin Next proxy. Browser ships the
 *     session cookie automatically.
 *
 * `tokenOverride` only makes sense from the server (only place we have a
 * raw JWT to pass). When set, we call the backend directly even though
 * nothing else changes about the calling code.
 */
function resolveBase(opts: RequestOptions): string {
    if (opts.tokenOverride !== undefined || isServer()) {
        return getServerApiBase();
    }
    return '/api/proxy';
}

function buildQueryString(query?: RequestOptions['query']): string {
    if (!query) return '';
    const parts: string[] = [];
    for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === '') continue;
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

/**
 * Issue a request to the API and return the parsed JSON body. Non-2xx
 * responses throw ApiError with the parsed body attached. A failed fetch
 * (network down, DNS error) throws ApiError with status 0 so callers can
 * branch on `err.isNetworkError()` instead of catching arbitrary
 * TypeError shapes.
 *
 * `path` MUST start with `/`. The function prefixes it with the resolved
 * base URL — never accepts a full URL, so a forgotten leading slash can't
 * silently leak the bearer token to a third-party origin.
 */
export async function request<T>(
    path: string,
    opts: RequestOptions = {},
): Promise<T> {
    if (!path.startsWith('/')) {
        throw new Error(`request(): path must start with "/", got "${path}".`);
    }

    const headers: Record<string, string> = {
        Accept: 'application/json',
    };

    if (opts.tokenOverride !== undefined) {
        headers.Authorization = `Bearer ${opts.tokenOverride}`;
    }

    let serializedBody: string | undefined;
    if (opts.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        serializedBody = JSON.stringify(opts.body);
    }

    const url = `${resolveBase(opts)}${path}${buildQueryString(opts.query)}`;

    let res: Response;
    try {
        res = await fetch(url, {
            method: opts.method ?? 'GET',
            headers,
            body: serializedBody,
            // Client-side: same-origin proxy. The browser must include the
            // HttpOnly orkestree_session cookie — `same-origin` is the
            // narrowest credentials mode that does the right thing here.
            // Server-side: there's no cookie jar to forward; tokenOverride
            // is on the Authorization header.
            credentials: opts.tokenOverride === undefined ? 'same-origin' : 'omit',
            cache: 'no-store',
            signal: opts.signal,
        });
    } catch (err) {
        // Fetch only throws for network-level failures (no DNS, TLS abort).
        // Surface them with status=0 so error handlers can branch on a
        // single shape.
        throw new ApiError(
            err instanceof Error ? err.message : 'Network error',
            0,
            null,
        );
    }

    // 204 No Content (e.g. some DELETE endpoints) — return undefined safely.
    if (res.status === 204) {
        return undefined as unknown as T;
    }

    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = text;
        }
    }

    if (!res.ok) {
        let retryAfter: number | null = null;
        if (res.status === 429) {
            const header = res.headers.get('Retry-After');
            const seconds = header ? Number(header) : NaN;
            retryAfter = Number.isFinite(seconds) ? seconds : null;
        }
        throw new ApiError(
            `Request failed (${res.status}) ${opts.method ?? 'GET'} ${path}`,
            res.status,
            parsed,
            retryAfter,
        );
    }

    return parsed as T;
}

/**
 * Build the full URL of an API path. Used for endpoints that can't be
 * fetched as JSON (e.g. PDF downloads where the browser navigates with
 * <a href>). On the client this returns the same-origin /api/proxy URL so
 * the cookie-derived auth flows through; on the server it returns the
 * direct backend URL since Server Components can't initiate browser
 * navigations anyway.
 */
export function buildApiUrl(path: string): string {
    if (!path.startsWith('/')) {
        throw new Error(`buildApiUrl(): path must start with "/", got "${path}".`);
    }
    if (isServer()) {
        return `${getServerApiBase()}${path}`;
    }
    return `/api/proxy${path}`;
}
