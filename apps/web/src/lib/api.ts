import type {
    AvailableTransition,
    CancelRequestPayload,
    ClientDetail,
    ClientFieldValue,
    ClientListItem,
    CreateClientPayload,
    CreateServiceRequestPayload,
    CustomFieldListItem,
    ListClientsParams,
    ListCustomFieldsParams,
    ListServiceRequestsParams,
    ListTasksParams,
    MembershipsMeResponse,
    Paginated,
    RequestFieldValue,
    ServiceRequestDetail,
    ServiceRequestListItem,
    ServiceTypeListItem,
    SetFieldValueItem,
    TaskListItem,
    TransitionStagePayload,
    UpdateClientPayload,
    User,
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
};
