'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Session context
//
// Single source of truth for "which workspace + token am I using right now?".
// Reads/writes localStorage via `lib/http`, exposes a tiny imperative API
// (sign in / sign out / switch workspace), and re-renders subscribers when
// the session changes.
//
// IMPORTANT: this is NOT real auth. There is no /auth/login backend endpoint
// today (no AuthController exists in apps/api). The operator pastes a JWT
// they obtained out-of-band (developer mint, integration test fixture, ...)
// plus the companyId they want to enter. The backend re-validates both the
// JWT signature (JwtAuthGuard) and the membership (CompanyMemberGuard) on
// every request, so a forged or stale token simply fails server-side.
// ─────────────────────────────────────────────────────────────────────────────

import {
    clearStoredSession,
    readStoredSession,
    writeStoredSession,
} from '@/lib/http';
import { Role, Session } from '@/types/domain';
import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';

interface SessionContextValue {
    /** Loaded once on mount; null while loading, then Session | null. */
    session: Session | null;
    /** True until the first localStorage read completes. */
    loading: boolean;
    signIn: (input: {
        token: string;
        companyId: string;
        role?: Role | null;
        workspaceLabel?: string | null;
    }) => void;
    signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Hydration: pull whatever was stored. We do this in an effect, not
        // useState's initializer, because localStorage is browser-only and
        // would crash a server render.
        const stored = readStoredSession();
        if (stored) {
            setSession({
                token: stored.token,
                companyId: stored.companyId,
                role: (stored.role as Role | null) ?? null,
                workspaceLabel: stored.workspaceLabel,
            });
        }
        setLoading(false);
    }, []);

    const signIn = useCallback(
        (input: {
            token: string;
            companyId: string;
            role?: Role | null;
            workspaceLabel?: string | null;
        }) => {
            const next: Session = {
                token: input.token.trim(),
                companyId: input.companyId.trim(),
                role: input.role ?? null,
                workspaceLabel: input.workspaceLabel ?? null,
            };
            writeStoredSession({
                token: next.token,
                companyId: next.companyId,
                role: next.role,
                workspaceLabel: next.workspaceLabel,
            });
            setSession(next);
        },
        [],
    );

    const signOut = useCallback(() => {
        clearStoredSession();
        setSession(null);
    }, []);

    const value = useMemo<SessionContextValue>(
        () => ({ session, loading, signIn, signOut }),
        [session, loading, signIn, signOut],
    );

    return (
        <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
    );
}

export function useSession(): SessionContextValue {
    const ctx = useContext(SessionContext);
    if (!ctx) {
        throw new Error('useSession() must be used inside <SessionProvider>.');
    }
    return ctx;
}

/**
 * Convenience accessor for pages that should never render without a session.
 * The AppShell wraps all authenticated routes and redirects to /sign-in
 * when no session is present, so by the time a page calls this it is safe.
 */
export function useRequiredSession(): Session {
    const { session } = useSession();
    if (!session) {
        // This is a programming error, not a runtime auth failure. The shell
        // is responsible for keeping unauthenticated users out.
        throw new Error('useRequiredSession() called without an active session.');
    }
    return session;
}
