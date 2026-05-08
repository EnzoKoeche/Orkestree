'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { membershipsApi } from '@/lib/api';
import type { Membership, Session, User } from '@/types/domain';
import {
    clearStoredActiveCompanyId,
    readStoredActiveCompanyId,
    writeStoredActiveCompanyId,
} from './http';

// ─────────────────────────────────────────────────────────────────────────────
// Session context
//
// Single source of truth for "am I logged in, as whom, and in which
// workspace?" on the client. Three orthogonal pieces of state, each with
// its own lifecycle:
//
//   - session            : { user } sourced from /api/me. The JWT itself
//                          lives only in the HttpOnly orkestree_session
//                          cookie — JavaScript never sees it. Hydration
//                          happens via fetch on mount; before AUDIT-3 it
//                          was a synchronous localStorage read, so the
//                          loading state covers a small extra round trip.
//   - memberships        : every workspace the user belongs to. Hydrated
//                          on every session change via /memberships/me.
//                          Not persisted — refetched on each app load so a
//                          newly-invited workspace shows up without a
//                          re-login.
//   - activeMembership   : the workspace the operator is currently working
//                          in. Persisted as a single company id (NOT the
//                          full Membership object) under
//                          orkestree.active_company.v1. Resolved against
//                          memberships at hydration time so a deactivated
//                          membership falls back to the first active one
//                          instead of crashing.
//
// signOut hits POST /api/auth/logout (server clears the HttpOnly cookie),
// then wipes local state. The active-workspace cookie is non-HttpOnly and
// gets cleared client-side via clearStoredActiveCompanyId.
// ─────────────────────────────────────────────────────────────────────────────

interface SessionContextValue {
    session: Session | null;
    /** True until the first /api/me probe completes. */
    loading: boolean;
    memberships: Membership[];
    activeMembership: Membership | null;
    /** True while /memberships/me is in flight after a session change. */
    membershipsLoading: boolean;
    signIn: (session: Session) => void;
    signOut: () => void;
    setActiveCompany: (companyId: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface MeResponse {
    user: User;
}

export function SessionProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [memberships, setMemberships] = useState<Membership[]>([]);
    const [activeMembership, setActiveMembership] = useState<Membership | null>(null);
    const [membershipsLoading, setMembershipsLoading] = useState(false);

    // Step 1 — probe /api/me on mount. The Route Handler reads the HttpOnly
    // cookie server-side; a 401 means "not logged in", anything else means
    // we got an identity back. Any non-401 failure (502, network) is also
    // treated as logged-out so we don't strand the user on a hung loader.
    useEffect(() => {
        let active = true;
        const ac = new AbortController();
        fetch('/api/me', {
            credentials: 'same-origin',
            cache: 'no-store',
            signal: ac.signal,
        })
            .then(async (res) => {
                if (!active) return;
                if (!res.ok) {
                    setSession(null);
                    return;
                }
                const data = (await res.json()) as MeResponse;
                if (!data.user) {
                    setSession(null);
                    return;
                }
                setSession({ user: data.user });
            })
            .catch(() => {
                if (!active) return;
                setSession(null);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
            ac.abort();
        };
    }, []);

    // Step 2 — whenever the session changes, refresh memberships and pick
    // an active workspace. Tracks an `active` flag to ignore stale results
    // from a logout that races a pending fetch.
    useEffect(() => {
        if (!session) {
            setMemberships([]);
            setActiveMembership(null);
            setMembershipsLoading(false);
            return;
        }

        let active = true;
        setMembershipsLoading(true);

        membershipsApi
            .me()
            .then((response) => {
                if (!active) return;
                const list = response.memberships;
                setMemberships(list);

                if (list.length === 0) {
                    setActiveMembership(null);
                    return;
                }

                const persistedId = readStoredActiveCompanyId();
                const fromPersisted = persistedId
                    ? list.find((m) => m.company.id === persistedId) ?? null
                    : null;
                const next = fromPersisted ?? list[0];
                setActiveMembership(next);
                if (!persistedId || persistedId !== next.company.id) {
                    writeStoredActiveCompanyId(next.company.id);
                    // First-login deep link or fallback after a deactivated
                    // membership: the Server Component already rendered with
                    // either no cookie or the stale id. Refresh so it re-fetches
                    // with the freshly-written orkestree_active_company cookie.
                    router.refresh();
                }
            })
            .catch((err) => {
                if (!active) return;
                // Surface in console for the dev — UI degrades to "—" muted in
                // the workspace switcher. A real recovery (toast + retry button)
                // ships when /memberships/me has more than 2 callers.
                // eslint-disable-next-line no-console
                console.error('Failed to load memberships', err);
                setMemberships([]);
                setActiveMembership(null);
            })
            .finally(() => {
                if (active) setMembershipsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [session, router]);

    // signIn is called by the login page right after POST /api/auth/login
    // succeeds. The Route Handler has already minted the HttpOnly cookie
    // server-side; we just lift the user identity into provider state so
    // the rest of the app re-renders without a refetch.
    const signIn = useCallback((next: Session) => {
        setSession(next);
    }, []);

    const signOut = useCallback(() => {
        // Fire-and-forget the cookie clear. We don't await — local state
        // wipes immediately so the operator sees the redirect even on a
        // slow network. Cookie clearing on the server is a hint, not a
        // contract: even if this POST fails, the JWT becomes inert because
        // the provider treats session=null as the source of truth and
        // future /api/me probes will short-circuit on the same expired
        // token.
        void fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
        }).catch(() => {
            // Network down on logout — local state is already cleared
            // below and the cookie expires on its own (max-age=7d) at
            // worst. Nothing user-actionable here.
        });
        clearStoredActiveCompanyId();
        setSession(null);
        setMemberships([]);
        setActiveMembership(null);
    }, []);

    const setActiveCompany = useCallback(
        (companyId: string) => {
            const target = memberships.find((m) => m.company.id === companyId);
            if (!target) return;
            // No-op if the operator picked the workspace they're already in.
            // Skipping the navigate avoids dropping their current filters when
            // they re-click the active row in the dropdown.
            if (activeMembership?.company.id === companyId) return;
            setActiveMembership(target);
            writeStoredActiveCompanyId(companyId);
            // Drop search params (filters/page belong to the previous tenant —
            // stage ids, member ids, even row counts won't match the new one)
            // and trigger a Server Component re-fetch with the new cookie.
            router.replace(pathname);
            router.refresh();
        },
        [memberships, activeMembership, router, pathname],
    );

    const value = useMemo<SessionContextValue>(
        () => ({
            session,
            loading,
            memberships,
            activeMembership,
            membershipsLoading,
            signIn,
            signOut,
            setActiveCompany,
        }),
        [
            session,
            loading,
            memberships,
            activeMembership,
            membershipsLoading,
            signIn,
            signOut,
            setActiveCompany,
        ],
    );

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
    const ctx = useContext(SessionContext);
    if (!ctx) {
        throw new Error('useSession() must be used inside <SessionProvider>.');
    }
    return ctx;
}

/**
 * For pages that should never render without a session. The middleware
 * auth gate plus the AuthGate client wrapper keep unauthenticated users
 * out of the (app) group, so by the time a page calls this it is safe.
 */
export function useRequiredSession(): Session {
    const { session } = useSession();
    if (!session) {
        throw new Error('useRequiredSession() called without an active session.');
    }
    return session;
}
