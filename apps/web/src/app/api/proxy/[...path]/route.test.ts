import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Hoisted mock state — vi.mock factories run before module imports, so the
// shared cookie mock function is created via vi.hoisted to be in scope when
// the factory executes. Per-test we set the return value via mockCookieGet.
// ─────────────────────────────────────────────────────────────────────────────
const { mockCookieGet } = vi.hoisted(() => ({
    mockCookieGet: vi.fn(),
}));

vi.mock('next/headers', () => ({
    cookies: () => ({ get: mockCookieGet }),
}));

// Imported AFTER the mocks are registered so the route file picks up the
// mocked `next/headers`.
import { DELETE, GET, PATCH, POST, PUT } from './route';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'jwt-token-payload';
const SESSION_COOKIE = 'orkestree_session';

const mockFetch = vi.fn();

function setSessionCookie(value: string | undefined): void {
    if (value === undefined) {
        mockCookieGet.mockReturnValue(undefined);
    } else {
        mockCookieGet.mockImplementation((name: string) =>
            name === SESSION_COOKIE ? { name, value } : undefined,
        );
    }
}

interface BuildRequestOpts {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: BodyInit;
}

function buildRequest(opts: BuildRequestOpts = {}): NextRequest {
    const url = opts.url ?? 'http://localhost/api/proxy/foo';
    const init: RequestInit & { duplex?: 'half' } = {
        method: opts.method ?? 'GET',
        headers: opts.headers,
    };
    if (opts.body !== undefined) {
        init.body = opts.body;
        init.duplex = 'half';
    }
    // DOM `RequestInit.signal` is `AbortSignal | null` while NextRequest's
    // constructor uses an internal `RequestInit` with `AbortSignal | undefined`.
    // The two are structurally compatible for everything we use; the test
    // helper sidesteps the narrow `signal` mismatch with a cast.
    return new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]);
}

function buildContext(path: string[]): { params: { path: string[] } } {
    return { params: { path } };
}

function streamFrom(text: string): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
        },
    });
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    let total = 0;
    for (const c of chunks) total += c.byteLength;
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        merged.set(c, offset);
        offset += c.byteLength;
    }
    return new TextDecoder().decode(merged);
}

beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockCookieGet.mockReset();
    mockFetch.mockReset();
    // Default: valid session, upstream 200 with empty body.
    setSessionCookie(VALID_TOKEN);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 1 — Auth gate
// ─────────────────────────────────────────────────────────────────────────────

describe('proxy route handler — auth gate', () => {
    it('returns 401 + does not call fetch when session cookie is missing', async () => {
        setSessionCookie(undefined);

        const res = await GET(buildRequest(), buildContext(['foo']));

        expect(res.status).toBe(401);
        expect(mockFetch).not.toHaveBeenCalled();
        const body = await res.json();
        expect(body).toEqual({
            message: 'No session',
            error: 'Unauthorized',
            statusCode: 401,
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 2 — Cookie strip + Authorization injection
// ─────────────────────────────────────────────────────────────────────────────

describe('proxy route handler — header sanitization', () => {
    it('injects Authorization: Bearer <token> from session cookie', async () => {
        await GET(buildRequest(), buildContext(['foo']));

        expect(mockFetch).toHaveBeenCalledOnce();
        const [, init] = mockFetch.mock.calls[0]!;
        const headers = init.headers as Headers;
        expect(headers.get('Authorization')).toBe(`Bearer ${VALID_TOKEN}`);
    });

    it('does not forward the Cookie header to upstream', async () => {
        await GET(
            buildRequest({
                headers: { cookie: 'orkestree_session=raw; tracker=1' },
            }),
            buildContext(['foo']),
        );

        const [, init] = mockFetch.mock.calls[0]!;
        const headers = init.headers as Headers;
        expect(headers.get('cookie')).toBeNull();
        expect(headers.get('Cookie')).toBeNull();
    });

    // Case 3 — HOP_BY_HOP_HEADERS strip (parametrized over the full list)
    it.each([
        'connection',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailers',
        'transfer-encoding',
        'upgrade',
        'host',
        'content-length',
        'cookie',
    ])('strips hop-by-hop header %s before forwarding', async (header) => {
        await GET(
            buildRequest({
                headers: {
                    [header]: 'should-not-leak',
                    'x-forward-me': 'allowed',
                },
            }),
            buildContext(['foo']),
        );

        const [, init] = mockFetch.mock.calls[0]!;
        const headers = init.headers as Headers;
        expect(headers.get(header)).toBeNull();
        expect(headers.get('x-forward-me')).toBe('allowed');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 4 — Method propagation
// ─────────────────────────────────────────────────────────────────────────────

describe('proxy route handler — method propagation', () => {
    const methodCases: Array<[string, typeof GET]> = [
        ['GET', GET],
        ['POST', POST],
        ['PATCH', PATCH],
        ['PUT', PUT],
        ['DELETE', DELETE],
    ];

    it.each(methodCases)('forwards %s to upstream with the same method', async (method, handler) => {
        const opts: BuildRequestOpts = { method };
        // Methods other than GET/HEAD typically carry a body in real traffic,
        // but the proxy must propagate the verb regardless. Body is optional.
        await handler(buildRequest(opts), buildContext(['foo']));

        const [, init] = mockFetch.mock.calls[0]!;
        expect(init.method).toBe(method);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 5 — Path encoding
// ─────────────────────────────────────────────────────────────────────────────

describe('proxy route handler — URL construction', () => {
    it('percent-encodes path segments without double-encoding', async () => {
        await GET(buildRequest(), buildContext(['café', 'foo bar', '50%']));

        const [url] = mockFetch.mock.calls[0]!;
        const path = new URL(url as string).pathname;
        // Tracked separately so we can read the assertion in plain text:
        // 'café'    → 'caf%C3%A9'
        // 'foo bar' → 'foo%20bar'
        // '50%'     → '50%25'
        expect(path).toBe('/caf%C3%A9/foo%20bar/50%25');
    });

    // Case 6 — Querystring forwarding
    it('forwards querystring intact', async () => {
        await GET(
            buildRequest({
                url: 'http://localhost/api/proxy/items?stageId=abc&limit=10&q=foo%20bar',
            }),
            buildContext(['items']),
        );

        const [url] = mockFetch.mock.calls[0]!;
        expect(String(url)).toMatch(/\?stageId=abc&limit=10&q=foo%20bar$/);
    });

    it('uses API_URL env var as upstream base, stripping trailing slashes', async () => {
        vi.stubEnv('API_URL', 'https://api.example.com//');

        await GET(buildRequest(), buildContext(['foo']));

        const [url] = mockFetch.mock.calls[0]!;
        expect(String(url)).toBe('https://api.example.com/foo');

        vi.unstubAllEnvs();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 7 — Body streaming
// ─────────────────────────────────────────────────────────────────────────────

describe('proxy route handler — body streaming', () => {
    it('streams request body with duplex:half and preserves payload bytes', async () => {
        let receivedBody: string | undefined;
        mockFetch.mockImplementation(async (_url, init) => {
            const body = (init as RequestInit).body as ReadableStream<Uint8Array>;
            receivedBody = await readStream(body);
            return new Response(null, { status: 200 });
        });

        await POST(
            buildRequest({
                method: 'POST',
                body: streamFrom('hello payload'),
            }),
            buildContext(['foo']),
        );

        const [, init] = mockFetch.mock.calls[0]!;
        expect((init as RequestInit & { duplex?: string }).duplex).toBe('half');
        expect(receivedBody).toBe('hello payload');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 8 — Status forwarding
// ─────────────────────────────────────────────────────────────────────────────

describe('proxy route handler — response forwarding', () => {
    it.each([200, 201, 204, 401, 429, 500])(
        'mirrors upstream status %i verbatim',
        async (status) => {
            mockFetch.mockResolvedValueOnce(new Response(null, { status }));

            const res = await GET(buildRequest(), buildContext(['foo']));

            expect(res.status).toBe(status);
        },
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 9 — Network failure
// ─────────────────────────────────────────────────────────────────────────────

describe('proxy route handler — error handling', () => {
    it('returns 502 Bad Gateway when upstream fetch rejects', async () => {
        mockFetch.mockRejectedValueOnce(new Error('connection refused'));

        const res = await GET(buildRequest(), buildContext(['foo']));

        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body).toEqual({
            message: 'Upstream unreachable',
            error: 'Bad Gateway',
            statusCode: 502,
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Response header sanitization (covers the response-side hop-by-hop filter
// and the content-encoding strip — the only branch missed by Cases 1-9 above)
// ─────────────────────────────────────────────────────────────────────────────

describe('proxy route handler — response header sanitization', () => {
    it('strips hop-by-hop and content-encoding from upstream response, passes others', async () => {
        mockFetch.mockResolvedValueOnce(
            new Response(null, {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                    'content-encoding': 'gzip',
                    'transfer-encoding': 'chunked',
                    'x-custom-header': 'pass-through',
                    connection: 'keep-alive',
                },
            }),
        );

        const res = await GET(buildRequest(), buildContext(['foo']));

        expect(res.headers.get('content-type')).toBe('application/json');
        expect(res.headers.get('x-custom-header')).toBe('pass-through');
        expect(res.headers.get('content-encoding')).toBeNull();
        expect(res.headers.get('transfer-encoding')).toBeNull();
        expect(res.headers.get('connection')).toBeNull();
    });

    it('forwards upstream body as-is to the response', async () => {
        const upstreamBody = streamFrom('{"data":"from-upstream"}');
        mockFetch.mockResolvedValueOnce(
            new Response(upstreamBody, {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
        );

        const res = await GET(buildRequest(), buildContext(['foo']));

        expect(res.body).not.toBeNull();
        const text = await readStream(res.body as ReadableStream<Uint8Array>);
        expect(text).toBe('{"data":"from-upstream"}');
    });
});
