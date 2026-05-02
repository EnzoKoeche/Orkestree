// ─────────────────────────────────────────────────────────────────────────────
// HTTP client
//
// One thin wrapper over fetch(). Keeps a single source of truth for:
//   - the base URL (NEXT_PUBLIC_API_URL)
//   - the Authorization header (read from the session held in localStorage)
//   - error normalization (server errors are mapped to a typed ApiError)
//
// The wrapper is intentionally framework-free: it does NOT know about React,
// SWR, or React Query. Each page's data hook composes it. This keeps the
// boundary between "transport" and "state" sharp and lets us swap data
// fetchers later without rewriting endpoints.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = 'orkestree.session.v1';

export interface StoredSession {
    token: string;
    companyId: string;
    role: string | null;
    workspaceLabel: string | null;
}

export function readStoredSession(): StoredSession | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredSession;
        if (
            !parsed ||
            typeof parsed.token !== 'string' ||
            typeof parsed.companyId !== 'string'
        ) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function writeStoredSession(s: StoredSession): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearStoredSession(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(SESSION_KEY);
}

// ── Errors ──────────────────────────────────────────────────────────────────

export class ApiError extends Error {
    public readonly status: number;
    public readonly body: unknown;

    constructor(message: string, status: number, body: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
    }

    /**
     * The user-facing message extracted from a NestJS-shaped body, with safe
     * fallbacks. Nest's default exceptions return either:
     *   { message: string, error: string, statusCode: number }
     *   { message: string[], error: string, statusCode: number }   (validation)
     */
    public toUserMessage(): string {
        const body = this.body as
            | { message?: string | string[]; error?: string }
            | null
            | undefined;
        if (body && Array.isArray(body.message)) {
            return body.message.join('; ');
        }
        if (body && typeof body.message === 'string') {
            return body.message;
        }
        return this.message;
    }
}

// ── Core request ─────────────────────────────────────────────────────────────

export interface RequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'HEAD';
    body?: unknown;
    /** Querystring params. Undefined values are dropped. */
    query?: Record<string, string | number | boolean | undefined>;
    /** Override the Authorization token (used by the sign-in probe). */
    tokenOverride?: string;
    /** Skip Authorization header altogether (rare; e.g. health checks). */
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
 * responses throw ApiError with the parsed body attached.
 *
 * The path MUST start with `/`. The function prefixes it with the configured
 * base URL — never accepts a full URL, so a forgotten leading slash can't
 * silently leak the token to a third-party origin.
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
        const token =
            opts.tokenOverride ?? readStoredSession()?.token ?? null;
        if (token) headers.Authorization = `Bearer ${token}`;
    }

    let body: string | undefined;
    if (opts.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.body);
    }

    const url = `${getApiBase()}${path}${buildQueryString(opts.query)}`;
    const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers,
        body,
        // Tenant API uses Bearer auth, never cookies — keep the call cors-safe.
        credentials: 'omit',
        cache: 'no-store',
        signal: opts.signal,
    });

    // Some endpoints return 204 No Content (e.g. DELETE) — swallow safely.
    if (res.status === 204) {
        return undefined as unknown as T;
    }

    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
        try {
            parsed = JSON.parse(text);
        } catch {
            // Not JSON; surface raw text as the body.
            parsed = text;
        }
    }

    if (!res.ok) {
        throw new ApiError(
            `Request failed (${res.status}) ${opts.method ?? 'GET'} ${path}`,
            res.status,
            parsed,
        );
    }

    return parsed as T;
}

/**
 * Build the full URL of an API path. Used for endpoints that can't be
 * fetched as JSON — e.g. the proposal PDF endpoint, where we hand the
 * resulting URL to the browser to follow as a top-level navigation. The
 * browser will then send the bearer token via a fresh fetch (NOT this URL
 * directly): this helper is paired with `openWithAuth` below.
 */
export function buildApiUrl(path: string): string {
    if (!path.startsWith('/')) {
        throw new Error(`buildApiUrl(): path must start with "/", got "${path}".`);
    }
    return `${getApiBase()}${path}`;
}

/**
 * Open an authenticated GET in a new tab by fetching the bytes ourselves
 * and creating a blob URL. This is the only safe way to send a Bearer
 * token to a non-XHR navigation; <a href> can't carry custom headers.
 *
 * Used by the proposal PDF action. For the S3 storage driver, the API
 * returns 302 to a presigned URL — fetch will follow it transparently.
 */
export async function openAuthenticatedDownload(
    path: string,
    filename: string,
): Promise<void> {
    const url = buildApiUrl(path);
    const token = readStoredSession()?.token;
    const res = await fetch(url, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'omit',
        // follow the 302 from the s3 driver to the presigned URL transparently
        redirect: 'follow',
    });
    if (!res.ok) {
        let parsed: unknown = null;
        try {
            parsed = await res.json();
        } catch {
            // ignore
        }
        throw new ApiError(`Request failed (${res.status}) GET ${path}`, res.status, parsed);
    }

    const blob = await res.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Release the blob after a short delay so the click has had a chance to
    // hand it to the browser.
    setTimeout(() => window.URL.revokeObjectURL(objectUrl), 30_000);
}
