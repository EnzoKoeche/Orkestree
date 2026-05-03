// ─────────────────────────────────────────────────────────────────────────────
// API client
//
// Tenant-scoped wrappers for every endpoint the app actually uses today. Each
// function takes the companyId explicitly: even though the session also holds
// a companyId, requiring it at the call site means a mistake (e.g. forgetting
// to wait for the session) surfaces as a TypeScript error rather than a 401.
//
// Endpoints intentionally NOT wrapped:
//   - field-values (custom fields not yet surfaced in UI)
//   - permission / config admin endpoints
//   - tasks (no module yet)
// They will be added incrementally; this file is the only place to grow.
// ─────────────────────────────────────────────────────────────────────────────

import {
    ApproveProposalDto,
    AuthUser,
    CancelProposalDto,
    ClientDetail,
    ClientListItem,
    ListClientsQuery,
    ListProposalsQuery,
    ListServiceRequestsQuery,
    LoginResponse,
    MembershipsMeResponse,
    ProposalDetail,
    ProposalListItem,
    RejectProposalDto,
    SendProposalDto,
    ServiceRequestDetail,
    ServiceRequestListItem,
} from '@/types/domain';
import { buildApiUrl, request } from './http';

// ── Auth ───────────────────────────────────────────────────────────────────
//
// /auth/login is the only endpoint that does NOT require a Bearer token —
// it issues one. /auth/me + /memberships/me are the bootstrap pair every
// authenticated screen waits for after sign-in or page reload.

export const authApi = {
    login(body: { email: string; password: string }, signal?: AbortSignal) {
        return request<LoginResponse>('/auth/login', {
            method: 'POST',
            body,
            skipAuth: true,
            signal,
        });
    },

    me(signal?: AbortSignal, tokenOverride?: string) {
        return request<AuthUser & { isActive: boolean; activeMembershipCount: number } | null>(
            '/auth/me',
            { signal, tokenOverride },
        );
    },
};

export const membershipsApi = {
    /**
     * Bootstrap: returns the authenticated user + their ACTIVE memberships
     * across ACTIVE companies. The list is server-filtered, so the UI does
     * not need to drop INVITED / INACTIVE rows.
     */
    me(signal?: AbortSignal, tokenOverride?: string) {
        return request<MembershipsMeResponse | null>('/memberships/me', {
            signal,
            tokenOverride,
        });
    },
};

// ── Service Requests ───────────────────────────────────────────────────────

export const serviceRequestsApi = {
    list(companyId: string, query: ListServiceRequestsQuery = {}, signal?: AbortSignal) {
        return request<ServiceRequestListItem[]>(
            `/companies/${companyId}/requests`,
            { query: query as Record<string, string | number | boolean | undefined>, signal },
        );
    },

    get(companyId: string, requestId: string, signal?: AbortSignal) {
        return request<ServiceRequestDetail>(
            `/companies/${companyId}/requests/${requestId}`,
            { signal },
        );
    },

    cancel(
        companyId: string,
        requestId: string,
        body: { cancellationReason?: string },
    ) {
        return request<ServiceRequestDetail>(
            `/companies/${companyId}/requests/${requestId}/cancel`,
            { method: 'POST', body },
        );
    },
};

// ── Clients ────────────────────────────────────────────────────────────────

export const clientsApi = {
    list(companyId: string, query: ListClientsQuery = {}, signal?: AbortSignal) {
        return request<ClientListItem[]>(`/companies/${companyId}/clients`, {
            query: query as Record<string, string | number | boolean | undefined>,
            signal,
        });
    },

    get(companyId: string, clientId: string, signal?: AbortSignal) {
        return request<ClientDetail>(
            `/companies/${companyId}/clients/${clientId}`,
            { signal },
        );
    },

    deactivate(companyId: string, clientId: string) {
        return request<ClientDetail>(
            `/companies/${companyId}/clients/${clientId}/deactivate`,
            { method: 'POST' },
        );
    },

    reactivate(companyId: string, clientId: string) {
        return request<ClientDetail>(
            `/companies/${companyId}/clients/${clientId}/reactivate`,
            { method: 'POST' },
        );
    },
};

// ── Proposals ──────────────────────────────────────────────────────────────

export const proposalsApi = {
    list(companyId: string, query: ListProposalsQuery = {}, signal?: AbortSignal) {
        return request<ProposalListItem[]>(`/companies/${companyId}/proposals`, {
            query: query as Record<string, string | number | boolean | undefined>,
            signal,
        });
    },

    get(companyId: string, proposalId: string, signal?: AbortSignal) {
        return request<ProposalDetail>(
            `/companies/${companyId}/proposals/${proposalId}`,
            { signal },
        );
    },

    send(companyId: string, proposalId: string, body: SendProposalDto = {}) {
        return request<ProposalDetail>(
            `/companies/${companyId}/proposals/${proposalId}/send`,
            { method: 'POST', body },
        );
    },

    approve(companyId: string, proposalId: string, body: ApproveProposalDto = {}) {
        return request<ProposalDetail>(
            `/companies/${companyId}/proposals/${proposalId}/approve`,
            { method: 'POST', body },
        );
    },

    reject(companyId: string, proposalId: string, body: RejectProposalDto = {}) {
        return request<ProposalDetail>(
            `/companies/${companyId}/proposals/${proposalId}/reject`,
            { method: 'POST', body },
        );
    },

    cancel(companyId: string, proposalId: string, body: CancelProposalDto = {}) {
        return request<ProposalDetail>(
            `/companies/${companyId}/proposals/${proposalId}/cancel`,
            { method: 'POST', body },
        );
    },

    /**
     * URL of the PDF endpoint. The download itself goes through
     * `openAuthenticatedDownload(path)` so the bearer token is sent.
     */
    pdfPath(companyId: string, proposalId: string): string {
        return `/companies/${companyId}/proposals/${proposalId}/pdf`;
    },

    /** Full absolute URL — handy for `window.open()` when needed. */
    pdfUrl(companyId: string, proposalId: string): string {
        return buildApiUrl(this.pdfPath(companyId, proposalId));
    },
};
