'use client';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import type { Session } from '@/types/domain';
import { clearStoredSession, readStoredSession, writeStoredSession } from './http';

// ─────────────────────────────────────────────────────────────────────────────
// Session context
//
// Single source of truth for "am I logged in, and as whom?" on the client.
// Reads/writes go through the helpers in lib/http so the localStorage key
// and the cookie name stay in lockstep with what the request layer reads
// for the Authorization header.
//
// Hydration runs in a useEffect (NOT useState's initializer) because
// localStorage is browser-only and would crash during SSR. While the effect
// is pending, `loading` is true and `session` is null.
//
// Phase 5 SECURITY follow-up: this lives next to the comment block in
// lib/http.ts — migrate the cookie to HttpOnly via a Route Handler that
// proxies POST /auth/login before the pilot. See Notion follow-up.
// ─────────────────────────────────────────────────────────────────────────────

interface SessionContextValue {
    session: Session | null;
    /** True until the first localStorage read completes. */
    loading: boolean;
    signIn: (session: Session) => void;
    signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const stored = readStoredSession();
        if (stored) setSession(stored);
        setLoading(false);
    }, []);

    const signIn = useCallback((next: Session) => {
        writeStoredSession(next);
        setSession(next);
    }, []);

    const signOut = useCallback(() => {
        clearStoredSession();
        setSession(null);
    }, []);

    const value = useMemo<SessionContextValue>(
        () => ({ session, loading, signIn, signOut }),
        [session, loading, signIn, signOut],
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
 * auth gate already keeps unauthenticated users out of the (app) group, so
 * by the time a page calls this it is safe.
 */
export function useRequiredSession(): Session {
    const { session } = useSession();
    if (!session) {
        // Programming error, not a runtime auth failure: the middleware is
        // responsible for keeping unauthenticated users out of (app).
        throw new Error('useRequiredSession() called without an active session.');
    }
    return session;
}
