import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { membershipsApi } from '@/lib/api';
import type { Membership, Session } from '@/types/domain';
import { SessionProvider, useSession } from './session';

// ─────────────────────────────────────────────────────────────────────────────
// lib/session spec — useSession() lifecycle through SessionProvider.
//
// Strategy:
//   - Post-AUDIT-3 hydration is async: the provider fetches /api/me on
//     mount instead of reading localStorage. We stub global fetch so each
//     case drives that probe (200 with user / 401 / network failure) plus
//     the logout POST that signOut fires.
//   - vi.mock('@/lib/api') replaces membershipsApi.me with a vi.fn so
//     useEffect-2 (memberships fetch on session change) is observable.
//   - renderHook + wrapper mounts the real SessionProvider; the hook is
//     tested through its actual context plumbing, not in isolation.
//   - localStorage is jsdom-native; we still clear it so the active-
//     workspace slot doesn't bleed between cases.
//
// Paths intentionally exercised here that the page tests can't reach:
//   - the persisted-active id resolution + stale-id fallback.
//   - the loading: true→false transition gated on the first /api/me probe.
//   - the cleanup branch when session is set back to null.
//   - the logout POST being fire-and-forgotten rather than awaited.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api', () => ({
    membershipsApi: {
        me: vi.fn(),
    },
}));

const ACTIVE_COMPANY_KEY = 'orkestree.active_company.v1';

const sampleUser = {
    id: 'u1',
    email: 'a@b.c',
    firstName: 'A',
    lastName: 'B',
    avatarUrl: null,
};

const sampleSession: Session = { user: sampleUser };

function makeMembership(id: string, companyId: string): Membership {
    return {
        id,
        role: 'OWNER',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
        company: {
            id: companyId,
            legalName: `Company ${companyId}`,
            tradeName: null,
            taxId: '00000000000000',
        },
    };
}

function wrapper({ children }: { children: ReactNode }) {
    return <SessionProvider>{children}</SessionProvider>;
}

/**
 * Stub fetch with two known endpoints. /api/me returns the supplied
 * status + optional user (200 ⇒ logged in, 401 ⇒ no session). /api/auth/
 * logout always returns 200 — signOut is fire-and-forget but tests need
 * the promise to resolve so the URLSearchParams cleanup can land.
 */
function stubAuthFetch(meStatus: number, meUser?: typeof sampleUser): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/me') {
            if (meStatus === 200 && meUser) {
                return new Response(JSON.stringify({ user: meUser }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return new Response(
                JSON.stringify({ message: 'No session', error: 'Unauthorized', statusCode: 401 }),
                { status: meStatus, headers: { 'Content-Type': 'application/json' } },
            );
        }
        if (url === '/api/auth/logout') {
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        throw new Error(`Unexpected fetch URL in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

describe('lib/session — useSession()', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.mocked(membershipsApi.me).mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('no cookie / 401 from /api/me: loading settles false, no memberships fetch', async () => {
        stubAuthFetch(401);
        const { result } = renderHook(() => useSession(), { wrapper });

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.session).toBeNull();
        expect(result.current.memberships).toEqual([]);
        expect(result.current.activeMembership).toBeNull();
        // No session = useEffect-2's early-return branch ran; me() never fired.
        expect(membershipsApi.me).not.toHaveBeenCalled();
    });

    it('signIn(s) after probe: sets session, fetches memberships, picks list[0] as active', async () => {
        stubAuthFetch(401); // first paint: not logged in yet
        const memA = makeMembership('m-a', 'c-a');
        const memB = makeMembership('m-b', 'c-b');
        vi.mocked(membershipsApi.me).mockResolvedValue({
            user: sampleUser,
            memberships: [memA, memB],
        });

        const { result } = renderHook(() => useSession(), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.signIn(sampleSession);
        });

        await waitFor(() => expect(result.current.session).toEqual(sampleSession));
        await waitFor(() => expect(result.current.memberships).toHaveLength(2));
        // No persisted active company id → fall back to list[0].
        expect(result.current.activeMembership).toEqual(memA);
        expect(membershipsApi.me).toHaveBeenCalledOnce();
    });

    it('cookie alive: /api/me 200 hydrates session and triggers memberships fetch', async () => {
        const fetchMock = stubAuthFetch(200, sampleUser);
        const memA = makeMembership('m-a', 'c-a');
        vi.mocked(membershipsApi.me).mockResolvedValue({
            user: sampleUser,
            memberships: [memA],
        });

        const { result } = renderHook(() => useSession(), { wrapper });

        await waitFor(() => expect(result.current.loading).toBe(false));
        await waitFor(() => expect(result.current.session).toEqual(sampleSession));
        await waitFor(() => expect(result.current.activeMembership).toEqual(memA));

        // /api/me probed exactly once; no logout call yet.
        const calls = fetchMock.mock.calls.map(([url]) => url);
        expect(calls).toContain('/api/me');
        expect(calls).not.toContain('/api/auth/logout');
    });

    it('signOut(): fires POST /api/auth/logout and clears session + storage', async () => {
        const fetchMock = stubAuthFetch(200, sampleUser);
        const memA = makeMembership('m-a', 'c-a');
        vi.mocked(membershipsApi.me).mockResolvedValue({
            user: sampleUser,
            memberships: [memA],
        });
        // Pre-populate active workspace slot so signOut has something to clear.
        window.localStorage.setItem(ACTIVE_COMPANY_KEY, 'c-a');

        const { result } = renderHook(() => useSession(), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));
        await waitFor(() => expect(result.current.activeMembership).toEqual(memA));

        act(() => {
            result.current.signOut();
        });

        // Local state clears synchronously — the network call is fire-and-forget.
        expect(result.current.session).toBeNull();
        expect(result.current.memberships).toEqual([]);
        expect(result.current.activeMembership).toBeNull();
        expect(window.localStorage.getItem(ACTIVE_COMPANY_KEY)).toBeNull();

        // Logout POST must have been issued. Wait for it because signOut
        // doesn't await — without the waitFor the assertion races the void.
        await waitFor(() =>
            expect(
                fetchMock.mock.calls.some(
                    ([url, init]) =>
                        url === '/api/auth/logout' &&
                        (init as RequestInit | undefined)?.method === 'POST',
                ),
            ).toBe(true),
        );
    });

    it('persisted activeCompanyId: match wins; stale id falls back to list[0]', async () => {
        const memA = makeMembership('m-a', 'c-a');
        const memB = makeMembership('m-b', 'c-b');

        // ── Case 1: persisted id matches an existing membership ────────────
        stubAuthFetch(200, sampleUser);
        vi.mocked(membershipsApi.me).mockResolvedValueOnce({
            user: sampleUser,
            memberships: [memA, memB],
        });
        window.localStorage.setItem(ACTIVE_COMPANY_KEY, 'c-b');

        const first = renderHook(() => useSession(), { wrapper });
        await waitFor(() =>
            expect(first.result.current.activeMembership).toEqual(memB),
        );
        first.unmount();

        // ── Case 2: persisted id no longer exists in memberships → fallback ─
        vi.unstubAllGlobals();
        window.localStorage.clear();
        window.localStorage.setItem(ACTIVE_COMPANY_KEY, 'c-deleted');
        stubAuthFetch(200, sampleUser);
        vi.mocked(membershipsApi.me).mockResolvedValueOnce({
            user: sampleUser,
            memberships: [memA, memB],
        });

        const second = renderHook(() => useSession(), { wrapper });
        await waitFor(() =>
            expect(second.result.current.activeMembership).toEqual(memA),
        );
        // Hook rewrote the persisted id to the resolved fallback.
        expect(window.localStorage.getItem(ACTIVE_COMPANY_KEY)).toBe('c-a');
    });
});
