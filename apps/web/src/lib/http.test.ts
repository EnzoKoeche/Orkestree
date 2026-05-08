import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request } from './http';

// ─────────────────────────────────────────────────────────────────────────────
// lib/http spec — fetch transport + ApiError shape.
//
// Strategy:
//   - fetch is the only external surface; stub it via vi.stubGlobal so each
//     case fully controls the wire response (status, body, headers).
//   - Post-AUDIT-3 the JWT lives in an HttpOnly cookie that JS can't read,
//     so we no longer test "stored token → Authorization header" — that
//     header is set by the /api/proxy Route Handler server-side. The
//     client-side surface is tested for routing (/api/proxy prefix +
//     credentials: 'same-origin'). The tokenOverride path is tested
//     because Server Components still go through this transport.
//
// Paths intentionally exercised here that smokes / page tests can't reach:
//   - the fetch-rejected branch (status=0 ApiError) — needs an artificial
//     network failure no real run produces.
//   - the Retry-After parsing on 429 — needs precise control over headers.
//   - querystring dropping for undefined/null/"" — visible only via the
//     URL passed to fetch.
// ─────────────────────────────────────────────────────────────────────────────

function makeResponse(init: {
    status: number;
    body?: unknown;
    headers?: Record<string, string>;
}): Response {
    const hasBody = init.body !== undefined;
    const text = !hasBody
        ? ''
        : typeof init.body === 'string'
          ? (init.body as string)
          : JSON.stringify(init.body);
    return new Response(text || null, {
        status: init.status,
        headers: init.headers,
    });
}

describe('lib/http', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('request() — transport routing', () => {
        it('client path hits /api/proxy with credentials: same-origin and no Authorization header', async () => {
            const fetchMock = vi
                .fn()
                .mockResolvedValue(makeResponse({ status: 200, body: { ok: true } }));
            vi.stubGlobal('fetch', fetchMock);

            await request('/foo');

            expect(fetchMock).toHaveBeenCalledOnce();
            const url = fetchMock.mock.calls[0][0] as string;
            const init = fetchMock.mock.calls[0][1] as RequestInit;
            const headers = init.headers as Record<string, string>;

            // Client-side default base is the same-origin Next proxy. The
            // browser ships the HttpOnly orkestree_session cookie via the
            // 'same-origin' credentials mode; we never set Authorization
            // ourselves because JS has no access to the JWT.
            expect(url).toBe('/api/proxy/foo');
            expect(init.credentials).toBe('same-origin');
            expect(headers.Authorization).toBeUndefined();
        });

        it('tokenOverride path uses backend URL + Authorization header (Server Component flow)', async () => {
            const fetchMock = vi
                .fn()
                .mockResolvedValue(makeResponse({ status: 200, body: { ok: true } }));
            vi.stubGlobal('fetch', fetchMock);

            await request('/foo', { tokenOverride: 'srv.jwt' });

            const url = fetchMock.mock.calls[0][0] as string;
            const init = fetchMock.mock.calls[0][1] as RequestInit;
            const headers = init.headers as Record<string, string>;

            // tokenOverride means we have a JWT in hand already (read from
            // cookies() server-side). Skip the proxy entirely and call the
            // backend directly — saves a hop and avoids forwarding cookies
            // we already extracted.
            expect(url).toMatch(/\/foo$/);
            expect(url).not.toContain('/api/proxy');
            expect(init.credentials).toBe('omit');
            expect(headers.Authorization).toBe('Bearer srv.jwt');
        });
    });

    describe('request() — response handling', () => {
        it('returns undefined for 204 No Content', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
            );

            const result = await request('/foo', { method: 'DELETE' });

            expect(result).toBeUndefined();
        });

        it('builds querystring dropping undefined / null / "" entries', async () => {
            const fetchMock = vi
                .fn()
                .mockResolvedValue(makeResponse({ status: 200, body: {} }));
            vi.stubGlobal('fetch', fetchMock);

            await request('/foo', {
                query: {
                    keep: 'x',
                    zero: 0,
                    bool: true,
                    drop_undef: undefined,
                    drop_null: null,
                    drop_empty: '',
                },
            });

            const url = fetchMock.mock.calls[0][0] as string;
            expect(url).toContain('?');
            expect(url).toContain('keep=x');
            expect(url).toContain('zero=0');
            expect(url).toContain('bool=true');
            expect(url).not.toContain('drop_undef');
            expect(url).not.toContain('drop_null');
            expect(url).not.toContain('drop_empty');
        });
    });

    describe('request() — errors', () => {
        it('throws ApiError(status=0) with isNetworkError() when fetch rejects', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockRejectedValue(new TypeError('network down')),
            );

            await expect(request('/foo')).rejects.toMatchObject({
                name: 'ApiError',
                status: 0,
                message: 'network down',
            });

            // Re-issue the call to inspect helpers — rejects.toMatchObject can't
            // cleanly test instance methods on the thrown error.
            try {
                await request('/foo');
                expect.fail('expected ApiError');
            } catch (err) {
                expect(err).toBeInstanceOf(ApiError);
                expect((err as ApiError).isNetworkError()).toBe(true);
            }
        });

        it('throws ApiError with retryAfter parsed from Retry-After header on 429', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    makeResponse({
                        status: 429,
                        body: { message: 'Too many', error: 'Too Many Requests' },
                        headers: { 'Retry-After': '7' },
                    }),
                ),
            );

            try {
                await request('/foo');
                expect.fail('expected ApiError');
            } catch (err) {
                expect(err).toBeInstanceOf(ApiError);
                const apiErr = err as ApiError;
                expect(apiErr.status).toBe(429);
                expect(apiErr.isThrottled()).toBe(true);
                expect(apiErr.retryAfter).toBe(7);
            }
        });
    });

    describe('ApiError.toUserMessage()', () => {
        it('joins string[] body.message with "; " (Nest ValidationPipe shape)', () => {
            const err = new ApiError('fallback', 400, {
                message: [
                    'email must be an email',
                    'password must be at least 6 characters',
                ],
                error: 'Bad Request',
            });

            expect(err.toUserMessage()).toBe(
                'email must be an email; password must be at least 6 characters',
            );
        });

        it('returns body.message string and falls back to ctor message when body is null', () => {
            const fromBody = new ApiError('ignored', 401, {
                message: 'Invalid credentials',
                error: 'Unauthorized',
            });
            expect(fromBody.toUserMessage()).toBe('Invalid credentials');

            const fromCtor = new ApiError('Network error', 0, null);
            expect(fromCtor.toUserMessage()).toBe('Network error');
        });
    });
});
