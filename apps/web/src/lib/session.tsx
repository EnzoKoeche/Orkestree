'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Session context
//
// Single source of truth for the authenticated session in the operator UI.
// Owns three pieces of state that the rest of the app subscribes to:
//
//   1. token             — JWT issued by POST /auth/login. Sent on every
//                          request as Authorization: Bearer …
//   2. user / memberships — bootstrap result from GET /memberships/me, refreshed
//                          on mount and after every signIn / switchWorkspace.
//   3. activeMembership  — the workspace currently being entered. The
//                          backend re-validates this on every tenant-scoped
//                          route (CompanyMemberGuard), so the frontend's
//                          choice is a UX gate, not an authorization one.
//
// Persistence model
// -----------------
// Token + activeCompanyId live in localStorage under
// `orkestree.session.v1`. Identity + the membership directory are NOT
// persisted: they are fetched from the backend on every full reload, which
// guarantees that a user whose role changes server-side immediately sees
// the right shell after a refresh, instead of waiting for a TTL.
//
// Why not httpOnly cookies?
// -------------------------
// Three reasons: (1) the API is configured for `Authorization: Bearer …`
// today, with `credentials: 'omit'` everywhere; switching to cookies needs
// CORS allowCredentials + a CSRF surface that is intentionally out of scope
// for this phase. (2) The operator console runs on a separate origin from
// the API in dev, which makes cookie scoping awkward without a same-site
// reverse proxy. (3) The product is internal-operator today, not
// end-customer; localStorage is acceptable here in a way it would NOT be
// for a public client portal. Plan: migrate to cookies the same week the
// auth module ships SSO/refresh tokens.
// ─────────────────────────────────────────────────────────────────────────────

import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { authApi, membershipsApi } from '@/lib/api';
import {
    ApiError,
    clearStoredSession,
    readStoredSession,
    writeStoredSession,
} from '@/lib/http';
import { AuthUser, MembershipSummary, Role } from '@/types/domain';

// ── Types ────────────────────────────────────────────────────────────────────

export type SessionPhase =
    | 'loading' // hydrating from localStorage / probing the token
    | 'unauthenticated'
    | 'no-workspaces' // signed in, but the user has zero ACTIVE memberships
    | 'authenticated';

export interface AuthenticatedSnapshot {
    phase: 'authenticated';
    token: string;
    user: AuthUser;
    memberships: MembershipSummary[];
    /** Currently active workspace; always one of `memberships`. */
    active: MembershipSummary;
}

export interface UnauthenticatedSnapshot {
    phase: 'unauthenticated' | 'no-workspaces' | 'loading';
}

export type SessionSnapshot = AuthenticatedSnapshot | UnauthenticatedSnapshot;

interface SessionContextValue {
    snapshot: SessionSnapshot;
    /** True until the first hydration probe resolves. */
    loading: boolean;
    /** Sign in with email + password. Throws ApiError on bad credentials. */
    signIn: (email: string, password: string) => Promise<void>;
    /** Switch the active workspace. Persists across reloads. */
    switchWorkspace: (membershipId: string) => void;
    /** Re-fetch /memberships/me without re-authenticating. */
    refreshMemberships: () => Promise<void>;
    signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickActiveMembership(
    memberships: MembershipSummary[],
    preferredCompanyId: string | null,
): MembershipSummary | null {
    if (memberships.length === 0) return null;
    if (preferredCompanyId) {
        const match = memberships.find((m) => m.company.id === preferredCompanyId);
        if (match) return match;
    }
    // Stable default: the first ACTIVE membership the backend returned. Server
    // sorts by createdAt asc, so this is the user's oldest workspace — a
    // deterministic choice across reloads.
    return memberships[0] ?? null;
}

export function workspaceLabel(m: MembershipSummary): string {
    const c = m.company;
    return c.tradeName?.trim() || c.legalName.trim() || c.taxId;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function SessionProvider({ children }: { children: ReactNode }) {
    const [snapshot, setSnapshot] = useState<SessionSnapshot>({ phase: 'loading' });
    const [loading, setLoading] = useState(true);

    // Track the in-flight bootstrap so signOut() can ignore stale results.
    const bootstrapTokenRef = useRef(0);

    /**
     * Probe `/memberships/me` with the supplied (or stored) token and update
     * state to either `authenticated`, `no-workspaces`, or `unauthenticated`.
     */
    const bootstrap = useCallback(
        async (token: string, preferredCompanyId: string | null): Promise<void> => {
            const bootstrapId = ++bootstrapTokenRef.current;
            try {
                const me = await membershipsApi.me(undefined, token);
                if (bootstrapTokenRef.current !== bootstrapId) return;

                if (!me) {
                    // Token decoded but the user record disappeared. Treat as logged out.
                    clearStoredSession();
                    setSnapshot({ phase: 'unauthenticated' });
                    return;
                }

                if (me.memberships.length === 0) {
                    // Signed in but nowhere to go. Keep the token in memory so
                    // any future endpoint the user gets invited to can be probed,
                    // but DO NOT enter the shell.
                    setSnapshot({ phase: 'no-workspaces' });
                    return;
                }

                const active = pickActiveMembership(me.memberships, preferredCompanyId);
                if (!active) {
                    setSnapshot({ phase: 'no-workspaces' });
                    return;
                }

                writeStoredSession({
                    token,
                    companyId: active.company.id,
                    role: active.role,
                    workspaceLabel: workspaceLabel(active),
                });

                setSnapshot({
                    phase: 'authenticated',
                    token,
                    user: me.user,
                    memberships: me.memberships,
                    active,
                });
            } catch (err) {
                if (bootstrapTokenRef.current !== bootstrapId) return;
                // 401 / 403 → token is no longer valid. Anything else (network
                // failure, 5xx) we also treat as logged-out for simplicity:
                // the sign-in page will re-probe and surface the real error.
                if (err instanceof ApiError) {
                    if (err.status === 401 || err.status === 403) {
                        clearStoredSession();
                        setSnapshot({ phase: 'unauthenticated' });
                        return;
                    }
                }
                clearStoredSession();
                setSnapshot({ phase: 'unauthenticated' });
            }
        },
        [],
    );

    // Initial hydration: pull token + last-active companyId from localStorage,
    // then bootstrap. We do this in an effect (not useState's initializer)
    // because localStorage is browser-only and would crash on a server render.
    useEffect(() => {
        const stored = readStoredSession();
        if (!stored) {
            setSnapshot({ phase: 'unauthenticated' });
            setLoading(false);
            return;
        }
        bootstrap(stored.token, stored.companyId).finally(() => setLoading(false));
    }, [bootstrap]);

    // ── Imperative API ─────────────────────────────────────────────────────

    const signIn = useCallback(
        async (email: string, password: string): Promise<void> => {
            // Login does NOT trust any existing stored session: skipAuth is on
            // in authApi.login, and we explicitly do not read the old token.
            const res = await authApi.login({ email, password });
            // Bootstrap with the freshly issued token. Pass null preferred id
            // so the user always lands on their first workspace right after
            // sign-in (they can switch from there).
            await bootstrap(res.accessToken, null);
        },
        [bootstrap],
    );

    const switchWorkspace = useCallback((membershipId: string): void => {
        setSnapshot((prev) => {
            if (prev.phase !== 'authenticated') return prev;
            const next = prev.memberships.find((m) => m.id === membershipId);
            if (!next || next.id === prev.active.id) return prev;
            writeStoredSession({
                token: prev.token,
                companyId: next.company.id,
                role: next.role,
                workspaceLabel: workspaceLabel(next),
            });
            return { ...prev, active: next };
        });
    }, []);

    const refreshMemberships = useCallback(async (): Promise<void> => {
        // Re-read the token from storage so a freshly-issued one (e.g. after
        // signIn() resolved) is picked up here without prop-drilling.
        const stored = readStoredSession();
        if (!stored) return;
        await bootstrap(stored.token, stored.companyId);
    }, [bootstrap]);

    const signOut = useCallback((): void => {
        // Bump the bootstrap token so any in-flight probe is ignored on resolve.
        bootstrapTokenRef.current++;
        clearStoredSession();
        setSnapshot({ phase: 'unauthenticated' });
    }, []);

    const value = useMemo<SessionContextValue>(
        () => ({ snapshot, loading, signIn, switchWorkspace, refreshMemberships, signOut }),
        [snapshot, loading, signIn, switchWorkspace, refreshMemberships, signOut],
    );

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useSession(): SessionContextValue {
    const ctx = useContext(SessionContext);
    if (!ctx) throw new Error('useSession() must be used inside <SessionProvider>.');
    return ctx;
}

/**
 * Convenience accessor for pages that should never render without an active
 * authenticated session. The AppShell wraps every authenticated route and
 * gates on `phase === 'authenticated'`, so calling this from a page is safe.
 */
export interface ActiveSession {
    token: string;
    user: AuthUser;
    memberships: MembershipSummary[];
    active: MembershipSummary;
    /** Active workspace's companyId — passed to every domain API call. */
    companyId: string;
    /** Active membership role — UX hint only; backend enforces the rest. */
    role: Role;
}

export function useRequiredSession(): ActiveSession {
    const { snapshot } = useSession();
    if (snapshot.phase !== 'authenticated') {
        throw new Error(
            'useRequiredSession() called without an authenticated session. ' +
                'Wrap your route in <AppShell /> so the gate runs first.',
        );
    }
    return {
        token: snapshot.token,
        user: snapshot.user,
        memberships: snapshot.memberships,
        active: snapshot.active,
        companyId: snapshot.active.company.id,
        role: snapshot.active.role,
    };
}
