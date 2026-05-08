import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

function buildRequest(path: string, withSession: boolean): NextRequest {
    const req = new NextRequest(new URL(path, 'http://localhost'));
    if (withSession) req.cookies.set('orkestree_session', 'jwt-token-payload');
    return req;
}

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('middleware — auth gate (existing behavior preserved)', () => {
    it('redirects unauthenticated request to /login', () => {
        const res = middleware(buildRequest('/dashboard', false));
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('http://localhost/login');
    });

    it('redirects authenticated request from /login to /', () => {
        const res = middleware(buildRequest('/login', true));
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('http://localhost/');
    });

    it('passes through /login without session', () => {
        const res = middleware(buildRequest('/login', false));
        expect(res.status).toBe(200);
    });

    it('passes through authenticated request to protected route', () => {
        const res = middleware(buildRequest('/clients', true));
        expect(res.status).toBe(200);
    });

    it('does NOT emit CSP on redirect responses (browser does not render them)', () => {
        const res = middleware(buildRequest('/dashboard', false));
        expect(res.headers.get('Content-Security-Policy-Report-Only')).toBeNull();
    });
});

describe('middleware — CSP nonce + Report-Only header', () => {
    it('emits Content-Security-Policy-Report-Only on rendered responses, not enforcing', () => {
        const res = middleware(buildRequest('/clients', true));
        const reportOnly = res.headers.get('Content-Security-Policy-Report-Only');
        expect(reportOnly).toBeTruthy();
        // Phase 1 = Report-Only ONLY. Phase 2 (1-line PR) flips to enforcing.
        expect(res.headers.get('Content-Security-Policy')).toBeNull();
    });

    it('contains the strict directive set', () => {
        const res = middleware(buildRequest('/clients', true));
        const csp = res.headers.get('Content-Security-Policy-Report-Only')!;
        expect(csp).toContain("default-src 'none'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("base-uri 'none'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("form-action 'self'");
        expect(csp).toContain("img-src 'self' data: blob:");
        expect(csp).toContain("font-src 'self'");
        expect(csp).toContain("connect-src 'self' https://orkestree-api.onrender.com");
    });

    it('embeds a base64 nonce in script-src and the same nonce in style-src (production)', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const res = middleware(buildRequest('/clients', true));
        const csp = res.headers.get('Content-Security-Policy-Report-Only')!;

        const match = csp.match(/script-src [^;]*'nonce-([A-Za-z0-9+/=]+)'/);
        expect(match).not.toBeNull();
        const nonce = match![1];
        // 16 random bytes → 24 base64 chars (with `==` padding).
        expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
        expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`);
    });

    it('generates a fresh nonce per request (production)', () => {
        // In dev/test the policy uses `'unsafe-inline'` instead of `'nonce-...'`,
        // so this assertion only makes sense under the prod branch.
        vi.stubEnv('NODE_ENV', 'production');
        const r1 = middleware(buildRequest('/clients', true));
        const r2 = middleware(buildRequest('/clients', true));
        const csp1 = r1.headers.get('Content-Security-Policy-Report-Only')!;
        const csp2 = r2.headers.get('Content-Security-Policy-Report-Only')!;
        const n1 = csp1.match(/'nonce-([^']+)'/)![1];
        const n2 = csp2.match(/'nonce-([^']+)'/)![1];
        expect(n1).not.toEqual(n2);
    });

    it('production policy: strict-dynamic, no unsafe-*, upgrade-insecure-requests', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const res = middleware(buildRequest('/clients', true));
        const csp = res.headers.get('Content-Security-Policy-Report-Only')!;
        expect(csp).toContain("'strict-dynamic'");
        expect(csp).not.toContain("'unsafe-eval'");
        expect(csp).not.toContain("'unsafe-inline'");
        expect(csp).toContain('upgrade-insecure-requests');
    });

    it('dev policy: unsafe-eval + unsafe-inline (Next fast refresh needs them), no upgrade', () => {
        vi.stubEnv('NODE_ENV', 'development');
        const res = middleware(buildRequest('/clients', true));
        const csp = res.headers.get('Content-Security-Policy-Report-Only')!;
        expect(csp).toContain("'unsafe-eval'");
        expect(csp).toContain("'unsafe-inline'");
        expect(csp).not.toContain('upgrade-insecure-requests');
    });
});
