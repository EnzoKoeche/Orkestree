import type { Session } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// HTTP client — single source of truth for the @orkestree/api transport.
//
// Owns: base URL, Authorization header (read from localStorage-backed
// session), error normalization (typed ApiError), and the pair of helpers
// that read/write the persistent session.
//
// Intentionally framework-free: no React, no SWR, no React Query. Each page
// composes this via lib/api.ts, which means swapping out a data fetcher
// later doesn't ripple into endpoints.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = 'orkestree.session.v1';
const SESSION_COOKIE = 'orkestree_session';
const ACTIVE_COMPANY_KEY = 'orkestree.active_company.v1';
const ACTIVE_COMPANY_COOKIE = 'orkestree_active_company';

// Cookie max-age aligned to the API's JWT_EXPIRES_IN (7d) — keeps the
// middleware gate consistent with what the server will actually accept.
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

// ── Persistent session helpers ──────────────────────────────────────────────
//
// Phase 5 SECURITY follow-up: the cookie is intentionally NOT HttpOnly so the
// client-side useEffect bootstrap can hydrate the SessionProvider in one tick
// without an extra round-trip. This trades XSS resistance for simplicity.
// Before the pilot, migrate to a Route Handler that mints an HttpOnly cookie
// server-side and have the SessionProvider read /api/me to hydrate. See the
// Notion follow-up filed in "🎨 Direção de Produto e Design".

export function readStoredSession(): Session | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Session;
        if (
            !parsed ||
            typeof parsed.token !== 'string' ||
            !parsed.user ||
            typeof parsed.user.id !== 'string' ||
            typeof parsed.user.email !== 'string'
        ) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function writeStoredSession(s: Session): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    document.cookie = [
        `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`,
        'path=/',
        'SameSite=Lax',
        `max-age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    ].join('; ');
}

export function clearStoredSession(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(SESSION_KEY);
    document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
}

// ── Active company persistence ──────────────────────────────────────────────
//
// The active workspace lives OUTSIDE the persisted Session so a memberships
// refresh never invalidates the JWT shape. Only the company id is stored
// here; the full Membership object is hydrated on every load via
// /memberships/me, then matched to this id.
//
// Dual-write: localStorage for client SessionProvider hydration,
// orkestree_active_company cookie for Server Components (which can't read
// localStorage). Server Components pull the id via lib/server-session.ts
// and pair it with the JWT cookie to scope tenant-aware fetches.

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
        `max-age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
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
    /** Override the Authorization token (used by the sign-in probe). */
    tokenOverride?: string;
    /** Skip the Authorization header altogether (e.g. /auth/login). */
    skipAuth?: boolean;
    signal?: AbortSignal;
}

function getApiBase(): string {
    const fromEnv = process.env.NEXT_PUBLIC_API_URL;
    return (fromEnv && fromEnv.length > 0 ? fromEnv : 'http://localhost:3000').replace(
        /\/+$/,
        '',
    );
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
 * (network down, DNS error, CORS reject) throws ApiError with status 0
 * so callers can branch on `err.isNetworkError()` instead of catching
 * arbitrary TypeError shapes.
 *
 * `path` MUST start with `/`. The function prefixes it with the configured
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

    if (!opts.skipAuth) {
        const token = opts.tokenOverride ?? readStoredSession()?.token ?? null;
        if (token) headers.Authorization = `Bearer ${token}`;
    }

    let serializedBody: string | undefined;
    if (opts.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        serializedBody = JSON.stringify(opts.body);
    }

    const url = `${getApiBase()}${path}${buildQueryString(opts.query)}`;

    let res: Response;
    try {
        res = await fetch(url, {
            method: opts.method ?? 'GET',
            headers,
            body: serializedBody,
            // Bearer auth, never cookies — keeps the call cors-safe.
            credentials: 'omit',
            cache: 'no-store',
            signal: opts.signal,
        });
    } catch (err) {
        // Fetch only throws for network-level failures (no DNS, TLS abort,
        // CORS preflight reject). Surface them with status=0 so error
        // handlers can branch on a single shape.
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
 * fetched as JSON (e.g. PDF downloads). The browser-level navigation must
 * still send the bearer token — this helper is paired with the
 * download-with-auth pattern that lands when PDF UI ships.
 */
export function buildApiUrl(path: string): string {
    if (!path.startsWith('/')) {
        throw new Error(`buildApiUrl(): path must start with "/", got "${path}".`);
    }
    return `${getApiBase()}${path}`;
}
