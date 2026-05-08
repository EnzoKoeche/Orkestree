import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request } from './http';

// ─────────────────────────────────────────────────────────────────────────────
// lib/http spec — fetch transport + ApiError shape.
//
// Strategy:
//   - fetch is the only external surface; stub it via vi.stubGlobal so each
//     case fully controls the wire response (status, body, headers).
//   - localStorage is jsdom-native; clear between cases so a stored session
//     from one test never bleeds into the auth header check of the next.
//   - ApiError tests are pure constructors — no fetch, no DOM.
//
// Paths intentionally exercised here that smokes / page tests can't reach:
//   - the fetch-rejected branch (status=0 ApiError) — needs an artificial
//     network failure no real run produces.
//   - the Retry-After parsing on 429 — needs precise control over headers.
//   - querystring dropping for undefined/null/"" — visible only via the
//     URL passed to fetch.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = 'orkestree.session.v1';

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

    describe('request() — auth header', () => {
        it('adds Authorization: Bearer <token> from stored session', async () => {
            window.localStorage.setItem(
                SESSION_KEY,
                JSON.stringify({
                    token: 't0k3n',
                    user: {
                        id: 'u1',
                        email: 'a@b.c',
                        firstName: 'A',
                        lastName: 'B',
                        avatarUrl: null,
                    },
                }),
            );
            const fetchMock = vi
                .fn()
                .mockResolvedValue(makeResponse({ status: 200, body: { ok: true } }));
            vi.stubGlobal('fetch', fetchMock);

            await request('/foo');

            expect(fetchMock).toHaveBeenCalledOnce();
            const init = fetchMock.mock.calls[0][1] as RequestInit;
            const headers = init.headers as Record<string, string>;
            expect(headers.Authorization).toBe('Bearer t0k3n');
        });

        it('skips Authorization header when skipAuth is true', async () => {
            window.localStorage.setItem(
                SESSION_KEY,
                JSON.stringify({
                    token: 't0k3n',
                    user: {
                        id: 'u1',
                        email: 'a@b.c',
                        firstName: 'A',
                        lastName: 'B',
                        avatarUrl: null,
                    },
                }),
            );
            const fetchMock = vi
                .fn()
                .mockResolvedValue(makeResponse({ status: 200, body: {} }));
            vi.stubGlobal('fetch', fetchMock);

            await request('/auth/login', {
                method: 'POST',
                body: { email: 'x', password: 'y' },
                skipAuth: true,
            });

            const init = fetchMock.mock.calls[0][1] as RequestInit;
            const headers = init.headers as Record<string, string>;
            expect(headers.Authorization).toBeUndefined();
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
