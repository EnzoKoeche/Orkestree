import type {
    AvailableTransition,
    CancelRequestPayload,
    ClientDetail,
    ClientFieldValue,
    ClientListItem,
    CreateClientPayload,
    CreateProposalItemPayload,
    CreateProposalPayload,
    CreateServiceRequestPayload,
    CreateTaskPayload,
    CustomFieldListItem,
    ListClientsParams,
    ListCustomFieldsParams,
    ListProposalsParams,
    ListServiceRequestsParams,
    ListTasksParams,
    MembershipsMeResponse,
    Paginated,
    ProposalDetail,
    ProposalListItem,
    RequestFieldValue,
    ServiceRequestDetail,
    ServiceRequestListItem,
    ServiceTypeListItem,
    SetFieldValueItem,
    TaskListItem,
    TransitionStagePayload,
    TransitionTaskPayload,
    UpdateClientPayload,
    UpdateProposalItemPayload,
} from '@/types/domain';
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
//
// Login no longer lives here: post-AUDIT-3, the credentials POST goes to
// the same-origin Next Route Handler /api/auth/login (which mints the
// HttpOnly cookie server-side). The login page calls fetch() directly so
// no JWT ever transits this module. See app/api/auth/login/route.ts.

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

// ── Service Requests ────────────────────────────────────────────────────────
//
// `tokenOverride` is the seam that lets Server Components fetch with the
// session JWT pulled from cookies() (via lib/server-session.getServerToken).
// Client-side callers omit it and fall back to the localStorage-backed
// session in lib/http.ts. Same client surface, two transport contexts.

export interface ListServiceRequestsOptions {
    /** Server Components pass the JWT explicitly here (lib/http can't read
     *  localStorage server-side). */
    tokenOverride?: string;
    signal?: AbortSignal;
}

export const requestsApi = {
    list(
        companyId: string,
        params: ListServiceRequestsParams = {},
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<Paginated<ServiceRequestListItem>>(
            `/companies/${encodeURIComponent(companyId)}/requests`,
            {
                query: {
                    stageId: params.stageId,
                    serviceTypeId: params.serviceTypeId,
                    clientId: params.clientId,
                    assignedMembershipId: params.assignedMembershipId,
                    isCancelled: params.isCancelled,
                    limit: params.limit,
                    skip: params.skip,
                },
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    get(companyId: string, requestId: string, opts: ListServiceRequestsOptions = {}) {
        return request<ServiceRequestDetail>(
            `/companies/${encodeURIComponent(companyId)}/requests/${encodeURIComponent(requestId)}`,
            {
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    /**
     * Field values are role-aware on the backend (CLIENTE row-level isolation
     * is enforced by getServiceRequest before the response is built); the
     * frontend just renders what comes back.
     */
    getFieldValues(
        companyId: string,
        requestId: string,
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<RequestFieldValue[]>(
            `/companies/${encodeURIComponent(companyId)}/requests/${encodeURIComponent(requestId)}/field-values`,
            {
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    create(
        companyId: string,
        payload: CreateServiceRequestPayload,
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<ServiceRequestDetail>(
            `/companies/${encodeURIComponent(companyId)}/requests`,
            {
                method: 'POST',
                body: payload,
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    /**
     * Lists the legal stage transitions a request can take from its current
     * stage. Server-side filtered (toStage active, fromStage matches current).
     * Returns [] for cancelled requests. Permission gate: REQUEST.EDIT.
     */
    getAvailableTransitions(
        companyId: string,
        requestId: string,
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<AvailableTransition[]>(
            `/companies/${encodeURIComponent(companyId)}/requests/${encodeURIComponent(requestId)}/available-transitions`,
            {
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    transition(
        companyId: string,
        requestId: string,
        payload: TransitionStagePayload,
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<void>(
            `/companies/${encodeURIComponent(companyId)}/requests/${encodeURIComponent(requestId)}/transition`,
            {
                method: 'POST',
                body: payload,
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    /**
     * Cancels a request. Idempotent backend-side: re-cancel of an already-
     * cancelled request returns 200 silently without changes. Permission
     * gate: REQUEST.EDIT.
     */
    cancel(
        companyId: string,
        requestId: string,
        payload: CancelRequestPayload,
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<void>(
            `/companies/${encodeURIComponent(companyId)}/requests/${encodeURIComponent(requestId)}/cancel`,
            {
                method: 'POST',
                body: payload,
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },
};

// ── Clients ─────────────────────────────────────────────────────────────────

export const clientsApi = {
    /** Plain array response (no pagination wrapper). search is server-side
     *  case-insensitive over name + taxId — see clients.service.ts:490. */
    list(
        companyId: string,
        params: ListClientsParams = {},
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<ClientListItem[]>(
            `/companies/${encodeURIComponent(companyId)}/clients`,
            {
                query: {
                    type: params.type,
                    isActive: params.isActive,
                    search: params.search,
                    limit: params.limit,
                    skip: params.skip,
                },
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    get(companyId: string, clientId: string, opts: ListServiceRequestsOptions = {}) {
        return request<ClientDetail>(
            `/companies/${encodeURIComponent(companyId)}/clients/${encodeURIComponent(clientId)}`,
            {
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    /** Custom field values for a client (target=CLIENT). Same wire shape
     *  as request field values; backend permission gate is CLIENT.VIEW. */
    getFieldValues(
        companyId: string,
        clientId: string,
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<ClientFieldValue[]>(
            `/companies/${encodeURIComponent(companyId)}/clients/${encodeURIComponent(clientId)}/field-values`,
            {
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    create(
        companyId: string,
        payload: CreateClientPayload,
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<ClientDetail>(
            `/companies/${encodeURIComponent(companyId)}/clients`,
            {
                method: 'POST',
                body: payload,
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    update(
        companyId: string,
        clientId: string,
        payload: UpdateClientPayload,
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<ClientDetail>(
            `/companies/${encodeURIComponent(companyId)}/clients/${encodeURIComponent(clientId)}`,
            {
                method: 'PATCH',
                body: payload,
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    /** Replace-all semantics: the items array overwrites the client's
     *  current custom field values entirely. Backend wraps in
     *  { items: [...] } per SetClientFieldValuesDto. Permission: CLIENT.EDIT. */
    setFieldValues(
        companyId: string,
        clientId: string,
        items: SetFieldValueItem[],
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<ClientFieldValue[]>(
            `/companies/${encodeURIComponent(companyId)}/clients/${encodeURIComponent(clientId)}/field-values`,
            {
                method: 'PUT',
                body: { items },
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    /** Soft-deletes the client (`isActive=false`). Idempotent backend-side:
     *  re-deactivate of an already-inactive client returns 200 silently
     *  without changes. Permission: CLIENT.DELETE. */
    deactivate(
        companyId: string,
        clientId: string,
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<ClientDetail>(
            `/companies/${encodeURIComponent(companyId)}/clients/${encodeURIComponent(clientId)}/deactivate`,
            {
                method: 'POST',
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    /** Restores a deactivated client (`isActive=true`). Idempotent
     *  backend-side. Permission: CLIENT.EDIT. */
    reactivate(
        companyId: string,
        clientId: string,
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<ClientDetail>(
            `/companies/${encodeURIComponent(companyId)}/clients/${encodeURIComponent(clientId)}/reactivate`,
            {
                method: 'POST',
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },
};

// ── Service Types ───────────────────────────────────────────────────────────

export const serviceTypesApi = {
    list(companyId: string, opts: ListServiceRequestsOptions = {}) {
        return request<ServiceTypeListItem[]>(
            `/companies/${encodeURIComponent(companyId)}/config/service-types`,
            {
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },
};

// ── Custom Fields ───────────────────────────────────────────────────────────

export const customFieldsApi = {
    /**
     * Backend filter quirk: passing serviceTypeId narrows to ONLY service-
     * specific fields and excludes globals (serviceTypeId IS NULL). To
     * collect every applicable field for a service type, fetch with
     * target=REQUEST + isActive=true (no serviceTypeId), then filter
     * client-side: f.serviceType === null OR f.serviceType.id === selectedId.
     * The frontend already has serviceType inline in the response.
     */
    list(
        companyId: string,
        params: ListCustomFieldsParams = {},
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<CustomFieldListItem[]>(
            `/companies/${encodeURIComponent(companyId)}/config/custom-fields`,
            {
                query: {
                    target: params.target,
                    serviceTypeId: params.serviceTypeId,
                    isActive: params.isActive,
                },
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },
};

// ── Tasks ───────────────────────────────────────────────────────────────────

export const tasksApi = {
    /** Backend returns a plain array (not Paginated) for tasks list. */
    list(
        companyId: string,
        params: ListTasksParams = {},
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<TaskListItem[]>(
            `/companies/${encodeURIComponent(companyId)}/tasks`,
            {
                query: {
                    requestId: params.requestId,
                    status: params.status,
                    priority: params.priority,
                    assignedMembershipId: params.assignedMembershipId,
                    limit: params.limit,
                    skip: params.skip,
                },
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    create(
        companyId: string,
        payload: CreateTaskPayload,
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<TaskListItem>(
            `/companies/${encodeURIComponent(companyId)}/tasks`,
            {
                method: 'POST',
                body: payload,
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    transition(
        companyId: string,
        taskId: string,
        payload: TransitionTaskPayload,
        opts: ListServiceRequestsOptions = {},
    ) {
        return request<TaskListItem>(
            `/companies/${encodeURIComponent(companyId)}/tasks/${encodeURIComponent(taskId)}/transition`,
            {
                method: 'POST',
                body: payload,
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },
};

// ── Proposals ───────────────────────────────────────────────────────────────
//
// The detail endpoint embeds items and statusHistory in a single payload, so
// the detail page needs exactly one fetch. Responses are role-aware on the
// backend (3-tier select); the client just renders what comes back. `list`
// returns a bare array — the endpoint does not yet wrap with a total count
// (tracked as TASK-AUDIT-8); when it does, switch the generic to Paginated<T>.

export interface ProposalApiOptions {
    /** Server Components pass the JWT explicitly (lib/http can't read
     *  localStorage server-side). */
    tokenOverride?: string;
    signal?: AbortSignal;
}

export const proposalsApi = {
    list(
        companyId: string,
        params: ListProposalsParams = {},
        opts: ProposalApiOptions = {},
    ) {
        return request<ProposalListItem[]>(
            `/companies/${encodeURIComponent(companyId)}/proposals`,
            {
                query: {
                    serviceRequestId: params.serviceRequestId,
                    clientId: params.clientId,
                    status: params.status,
                    limit: params.limit,
                    skip: params.skip,
                },
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    get(companyId: string, proposalId: string, opts: ProposalApiOptions = {}) {
        return request<ProposalDetail>(
            `/companies/${encodeURIComponent(companyId)}/proposals/${encodeURIComponent(proposalId)}`,
            {
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    /**
     * Creates a DRAFT proposal anchored to a service request. Returns the full
     * ProposalDetail so the caller can navigate straight to /proposals/:id.
     * Permission gate: PROPOSAL.CREATE (OWNER/ADMIN/OPERACIONAL). Client-side
     * callers omit tokenOverride and go through /api/proxy.
     */
    create(
        companyId: string,
        payload: CreateProposalPayload,
        opts: ProposalApiOptions = {},
    ) {
        return request<ProposalDetail>(
            `/companies/${encodeURIComponent(companyId)}/proposals`,
            {
                method: 'POST',
                body: payload,
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    // ── Items (DRAFT-only; gate PROPOSAL.EDIT) ───────────────────────────────
    //
    // Each item mutation returns the full ProposalDetail with totals already
    // recomputed by the backend — the editor renders that response verbatim
    // and never recomputes a total client-side.

    addItem(
        companyId: string,
        proposalId: string,
        payload: CreateProposalItemPayload,
        opts: ProposalApiOptions = {},
    ) {
        return request<ProposalDetail>(
            `/companies/${encodeURIComponent(companyId)}/proposals/${encodeURIComponent(proposalId)}/items`,
            {
                method: 'POST',
                body: payload,
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    updateItem(
        companyId: string,
        proposalId: string,
        itemId: string,
        payload: UpdateProposalItemPayload,
        opts: ProposalApiOptions = {},
    ) {
        return request<ProposalDetail>(
            `/companies/${encodeURIComponent(companyId)}/proposals/${encodeURIComponent(proposalId)}/items/${encodeURIComponent(itemId)}`,
            {
                method: 'PATCH',
                body: payload,
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    removeItem(
        companyId: string,
        proposalId: string,
        itemId: string,
        opts: ProposalApiOptions = {},
    ) {
        return request<ProposalDetail>(
            `/companies/${encodeURIComponent(companyId)}/proposals/${encodeURIComponent(proposalId)}/items/${encodeURIComponent(itemId)}`,
            {
                method: 'DELETE',
                tokenOverride: opts.tokenOverride,
                signal: opts.signal,
            },
        );
    },

    // ── Lifecycle transitions ────────────────────────────────────────────────
    //
    // Each has its own endpoint + permission (send=PUBLISH, approve=APPROVE,
    // reject=REJECT, cancel=EDIT) and returns the updated ProposalDetail. The
    // backend enforces the legal state machine (e.g. approve only from SENT);
    // the UI gates by status to avoid offering illegal transitions, but a stale
    // tab simply gets a 422 surfaced as a toast. Bodies carry only the fields
    // the endpoint's DTO whitelists (ValidationPipe forbids unknown keys).

    sendProposal(
        companyId: string,
        proposalId: string,
        payload: { note?: string } = {},
        opts: ProposalApiOptions = {},
    ) {
        return request<ProposalDetail>(
            `/companies/${encodeURIComponent(companyId)}/proposals/${encodeURIComponent(proposalId)}/send`,
            { method: 'POST', body: payload, tokenOverride: opts.tokenOverride, signal: opts.signal },
        );
    },

    approveProposal(
        companyId: string,
        proposalId: string,
        payload: { note?: string } = {},
        opts: ProposalApiOptions = {},
    ) {
        return request<ProposalDetail>(
            `/companies/${encodeURIComponent(companyId)}/proposals/${encodeURIComponent(proposalId)}/approve`,
            { method: 'POST', body: payload, tokenOverride: opts.tokenOverride, signal: opts.signal },
        );
    },

    rejectProposal(
        companyId: string,
        proposalId: string,
        payload: { reason?: string; note?: string } = {},
        opts: ProposalApiOptions = {},
    ) {
        return request<ProposalDetail>(
            `/companies/${encodeURIComponent(companyId)}/proposals/${encodeURIComponent(proposalId)}/reject`,
            { method: 'POST', body: payload, tokenOverride: opts.tokenOverride, signal: opts.signal },
        );
    },

    cancelProposal(
        companyId: string,
        proposalId: string,
        payload: { reason?: string; note?: string } = {},
        opts: ProposalApiOptions = {},
    ) {
        return request<ProposalDetail>(
            `/companies/${encodeURIComponent(companyId)}/proposals/${encodeURIComponent(proposalId)}/cancel`,
            { method: 'POST', body: payload, tokenOverride: opts.tokenOverride, signal: opts.signal },
        );
    },
};
