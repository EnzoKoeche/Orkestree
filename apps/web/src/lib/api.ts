import type { MembershipsMeResponse, User } from '@/types/domain';
import { request } from './http';

// ─────────────────────────────────────────────────────────────────────────────
// API client
//
// Tenant-scoped wrappers for the endpoints the app actually uses today.
// Intentionally lean for Fase 5: only auth + memberships. List/detail
// endpoints (clients, requests, proposals) land as the corresponding feature
// pages do — adding them here pre-emptively bloats the surface.
// ─────────────────────────────────────────────────────────────────────────────

// ── Auth ────────────────────────────────────────────────────────────────────

export interface LoginResponse {
    accessToken: string;
    /** ISO duration (e.g. "7d") — informational; the JWT itself owns expiry. */
    expiresIn: string;
    user: User;
}

export const authApi = {
    /**
     * Exchange email + password for a JWT and the user identity. `skipAuth`
     * is critical: no bearer token exists yet, and sending an Authorization
     * header with the empty session would 400 the throttler counting.
     */
    login(email: string, password: string) {
        return request<LoginResponse>('/auth/login', {
            method: 'POST',
            body: { email, password },
            skipAuth: true,
        });
    },
};

// ── Memberships ─────────────────────────────────────────────────────────────

export const membershipsApi = {
    /**
     * Fetches the authenticated user plus every ACTIVE membership. Used by
     * Fase 6's workspace switcher; defined here so api.ts is the canonical
     * place to grow the surface and Fase 6 doesn't need to revisit lib/.
     */
    me(signal?: AbortSignal) {
        return request<MembershipsMeResponse>('/memberships/me', { signal });
    },
};
