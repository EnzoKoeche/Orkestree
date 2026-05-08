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
//   - vi.mock('@/lib/api') replaces membershipsApi.me with a vi.fn so each
//     case fully owns the wire response. session.tsx is the only consumer
//     of that import in this provider's reach.
//   - renderHook + wrapper mounts the real SessionProvider; the hook is
//     tested through its actual context plumbing, not in isolation. That's
//     what makes useEffect-2 (memberships fetch on session change) and the
//     persisted-active-company resolution observable.
//   - localStorage is jsdom-native; clear between cases so a session left
//     by one test doesn't auto-hydrate the next.
//
// Paths intentionally exercised here that the page tests can't reach:
//   - the persisted-active id resolution + stale-id fallback (lines 107-120).
//   - the loading: true→false transition gated on the first localStorage
//     read (line 78).
//   - the cleanup branch when session is set back to null (lines 85-89).
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api', () => ({
    membershipsApi: {
        me: vi.fn(),
    },
}));

const SESSION_KEY = 'orkestree.session.v1';
const ACTIVE_COMPANY_KEY = 'orkestree.active_company.v1';

const sampleUser = {
    id: 'u1',
    email: 'a@b.c',
    firstName: 'A',
    lastName: 'B',
    avatarUrl: null,
};

const sampleSession: Session = {
    token: 'tk',
    user: sampleUser,
};

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

describe('lib/session — useSession()', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.mocked(membershipsApi.me).mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('initial state without stored session: loading settles false, no fetch', async () => {
        const { result } = renderHook(() => useSession(), { wrapper });

        // RTL renderHook flushes useEffect-1 synchronously, so loading
        // settles to false on the first observable render. The transition
        // is implementation-detail; what matters is the post-hydration
        // shape: no session, no fetch, no active membership.
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.session).toBeNull();
        expect(result.current.memberships).toEqual([]);
        expect(result.current.activeMembership).toBeNull();
        // No session = useEffect-2's early-return branch ran; me() never fired.
        expect(membershipsApi.me).not.toHaveBeenCalled();
    });

    it('signIn(s): writes localStorage, fetches memberships, picks list[0] as active', async () => {
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
        // writeStoredSession dual-writes to localStorage.
        expect(window.localStorage.getItem(SESSION_KEY)).toContain('tk');

        await waitFor(() => expect(result.current.memberships).toHaveLength(2));
        // No persisted active company id → fall back to list[0].
        expect(result.current.activeMembership).toEqual(memA);
        expect(membershipsApi.me).toHaveBeenCalledOnce();
    });

    it('signOut(): clears session, memberships, activeMembership, and storage', async () => {
        const memA = makeMembership('m-a', 'c-a');
        vi.mocked(membershipsApi.me).mockResolvedValue({
            user: sampleUser,
            memberships: [memA],
        });

        // Pre-populate localStorage so useEffect-1 hydrates with a real session.
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(sampleSession));
        window.localStorage.setItem(ACTIVE_COMPANY_KEY, 'c-a');

        const { result } = renderHook(() => useSession(), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));
        await waitFor(() =>
            expect(result.current.activeMembership).toEqual(memA),
        );

        act(() => {
            result.current.signOut();
        });

        expect(result.current.session).toBeNull();
        expect(result.current.memberships).toEqual([]);
        expect(result.current.activeMembership).toBeNull();
        expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
        expect(window.localStorage.getItem(ACTIVE_COMPANY_KEY)).toBeNull();
    });

    it('persisted activeCompanyId: match wins; stale id falls back to list[0]', async () => {
        const memA = makeMembership('m-a', 'c-a');
        const memB = makeMembership('m-b', 'c-b');

        // ── Case 1: persisted id matches an existing membership ────────────
        vi.mocked(membershipsApi.me).mockResolvedValueOnce({
            user: sampleUser,
            memberships: [memA, memB],
        });
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(sampleSession));
        window.localStorage.setItem(ACTIVE_COMPANY_KEY, 'c-b');

        const first = renderHook(() => useSession(), { wrapper });
        await waitFor(() =>
            expect(first.result.current.activeMembership).toEqual(memB),
        );
        first.unmount();

        // ── Case 2: persisted id no longer exists in memberships → fallback ─
        window.localStorage.clear();
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(sampleSession));
        window.localStorage.setItem(ACTIVE_COMPANY_KEY, 'c-deleted');
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
