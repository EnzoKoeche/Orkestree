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
    CreateProposalItemPayload,
    CreateProposalPayload,
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
    ServiceTypeOption,
    UpdateProposalItemPayload,
    UpdateProposalPayload,
    WorkflowSummary,
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

    /**
     * POST /companies/:companyId/proposals
     *
     * Creates a DRAFT proposal anchored to an existing ServiceRequest. The
     * backend derives `clientId` from that request and rejects requests that
     * are cancelled or not visible to the actor (CLIENTE row-level
     * isolation). Returns the full ProposalDetail projection so the caller
     * can navigate straight into the editor without a follow-up GET.
     */
    create(companyId: string, body: CreateProposalPayload, signal?: AbortSignal) {
        return request<ProposalDetail>(
            `/companies/${companyId}/proposals`,
            { method: 'POST', body, signal },
        );
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

    // ── Draft mutations ────────────────────────────────────────────────────
    //
    // All four endpoints below are DRAFT-only on the backend (enforced under
    // SELECT FOR UPDATE inside the service transaction). The UI hides them
    // when status !== 'DRAFT', but the backend remains the source of truth:
    // a stale tab that calls them will get a 422 with a clear message.
    //
    // Each one returns the full ProposalDetail projection (the controller
    // refetches via getProposal after the mutation), so callers should
    // replace local state with the returned value — that's the canonical
    // post-mutation totals + items + status snapshot.

    /**
     * PATCH /companies/:companyId/proposals/:proposalId
     *
     * Updates proposal-level mutable fields (title, notes, clientNotes,
     * validUntil, discountPct/discountAmount). Pricing totals are
     * recomputed server-side when discount fields change.
     */
    update(
        companyId: string,
        proposalId: string,
        body: UpdateProposalPayload,
    ) {
        return request<ProposalDetail>(
            `/companies/${companyId}/proposals/${proposalId}`,
            { method: 'PATCH', body },
        );
    },

    /**
     * POST /companies/:companyId/proposals/:proposalId/items
     *
     * Adds an item to a DRAFT proposal. The controller returns the full
     * proposal after the items service has recomputed totals.
     */
    addItem(
        companyId: string,
        proposalId: string,
        body: CreateProposalItemPayload,
    ) {
        return request<ProposalDetail>(
            `/companies/${companyId}/proposals/${proposalId}/items`,
            { method: 'POST', body },
        );
    },

    /**
     * PATCH /companies/:companyId/proposals/:proposalId/items/:itemId
     *
     * Updates a single item. Backend rejects empty bodies with 422; the
     * caller is responsible for sending only changed fields.
     */
    updateItem(
        companyId: string,
        proposalId: string,
        itemId: string,
        body: UpdateProposalItemPayload,
    ) {
        return request<ProposalDetail>(
            `/companies/${companyId}/proposals/${proposalId}/items/${itemId}`,
            { method: 'PATCH', body },
        );
    },

    /**
     * DELETE /companies/:companyId/proposals/:proposalId/items/:itemId
     *
     * Removes an item from a DRAFT proposal. Returns the full proposal
     * with totals recomputed.
     */
    removeItem(companyId: string, proposalId: string, itemId: string) {
        return request<ProposalDetail>(
            `/companies/${companyId}/proposals/${proposalId}/items/${itemId}`,
            { method: 'DELETE' },
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

// ── Reference data (read-only) ─────────────────────────────────────────────
//
// Thin read-only slice of the existing config admin endpoints. Used by list
// pages to render human-readable filters/labels and by the proposal-creation
// flow to reach the right shape without spawning new backend endpoints.
//
// Permission semantics:
//   COMPANY_CONFIG.VIEW is required server-side. By default that's only
//   OWNER and ADMIN per `permission.defaults.ts`. OPERACIONAL / FINANCEIRO /
//   CLIENTE will receive 403 — callers must catch and degrade (e.g., hide
//   the filter, show raw ids). Never branch on the session role to decide
//   whether to call: the backend ResourcePermissionGuard is the only source
//   of truth.
//
// We do not expose the create/update/delete admin actions here on purpose:
// the operator console is not a configuration tool today, and keeping this
// surface narrow prevents accidental privilege escalation in the UI.

export const serviceTypesApi = {
    /**
     * GET /companies/:companyId/config/service-types
     *
     * Returns all service types for the workspace (active + inactive),
     * sorted by sortOrder/name on the server. Callers wanting only active
     * options should filter client-side: the backend does not currently
     * accept an `isActive` query parameter on this route.
     */
    list(companyId: string, signal?: AbortSignal) {
        return request<ServiceTypeOption[]>(
            `/companies/${companyId}/config/service-types`,
            { signal },
        );
    },
};

export const workflowsApi = {
    /**
     * GET /companies/:companyId/config/workflows
     *
     * Returns workflows with their stages eagerly included (Prisma
     * `include: { stages }` ordered by sortOrder). The default workflow
     * comes first.
     */
    list(companyId: string, signal?: AbortSignal) {
        return request<WorkflowSummary[]>(
            `/companies/${companyId}/config/workflows`,
            { signal },
        );
    },
};
