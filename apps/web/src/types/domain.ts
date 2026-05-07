// ─────────────────────────────────────────────────────────────────────────────
// Domain types — wire shapes the @orkestree/api backend speaks.
//
// Hand-written to match the explicit Prisma `select` projections at
// apps/api/src/auth/* and apps/api/src/memberships/*. NOT generated — the
// Prisma client is server-side only. Drift surfaces here as a TypeScript
// error at the call site, which is the right place to notice it.
// ─────────────────────────────────────────────────────────────────────────────

// ── Roles (mirrors the @prisma/client enum) ─────────────────────────────────

export type Role = 'OWNER' | 'ADMIN' | 'FINANCEIRO' | 'OPERACIONAL' | 'CLIENTE';
export type MembershipStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

// ── User (matches POST /auth/login → user + GET /auth/me) ───────────────────

export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
}

// ── Session (client-side persistent state) ──────────────────────────────────
//
// Held in localStorage (for client hydration) and in a non-HttpOnly
// `orkestree_session` cookie (for the middleware auth gate). Phase 5 ships
// this dual-write deliberately; before the pilot, migrate to HttpOnly via a
// Route Handler proxy — see Notion follow-up.
//
// Membership / activeCompanyId is intentionally NOT in this shape yet. The
// /memberships/me endpoint hands back the workspace list, and Fase 6 lifts
// the active selection into a separate "active workspace" slot. Login alone
// has no opinion about which company the operator wants to enter.
export interface Session {
    token: string;
    user: User;
}

// ── Membership (used by GET /memberships/me — Fase 6 wires real consumer) ──

export interface MembershipCompany {
    id: string;
    legalName: string;
    tradeName: string | null;
    taxId: string;
}

export interface Membership {
    id: string;
    role: Role;
    status: MembershipStatus;
    createdAt: string;
    company: MembershipCompany;
}

export interface MembershipsMeResponse {
    user: User;
    memberships: Membership[];
}

// ── Pagination wrapper ──────────────────────────────────────────────────────
//
// All list endpoints return this shape. Frontend computes hasMore /
// currentPage / totalPages from (total, limit, skip) — keeping the wire shape
// minimal lets us add new derived values without churning the API.
//
// Mirrors the backend's `prisma.$transaction([findMany, count])` contract:
// items and total were captured in the same DB snapshot, so pagination math
// stays consistent under concurrent writes.

export interface Paginated<T> {
    items: T[];
    total: number;
    limit: number;
    skip: number;
}

// ── Service Request (mirror of LIST_SELECT in apps/api/src/service-requests) ──

export type ClientType = 'INDIVIDUAL' | 'BUSINESS';

export interface ServiceRequestStage {
    id: string;
    code: string;
    name: string;
    /** Hex token (e.g. "#3b82f6") or null. Backend stores brand-tinted hints
     *  for the Stage column; UI must treat null as "no color provided". */
    color: string | null;
    /** True when the stage is terminal in its workflow (success leg). Drives
     *  the StatusBadge → "Concluído" branch on the list. */
    isFinal: boolean;
}

export interface ServiceRequestType {
    id: string;
    code: string;
    name: string;
}

export interface ServiceRequestClient {
    id: string;
    /** Per-tenant sequential identifier (1, 2, …) — display as "C-12". */
    number: number;
    name: string;
    type: ClientType;
}

/** Membership reference shaped exactly like the API's MEMBERSHIP_USER_SELECT. */
export interface MembershipRef {
    id: string;
    user: {
        id: string;
        firstName: string;
        lastName: string;
        avatarUrl: string | null;
    };
}

export interface ServiceRequestListItem {
    id: string;
    /** Per-tenant sequential identifier — display as "#1234". */
    number: number;
    title: string;
    description: string | null;
    isCancelled: boolean;
    cancellationReason: string | null;
    createdAt: string;
    updatedAt: string;
    /** FK to the workflow this request belongs to — fixed at creation time.
     *  Used by the detail page to load valid stage transitions without an
     *  extra serviceType→workflow lookup hop. */
    workflowId: string;
    serviceType: ServiceRequestType;
    currentStage: ServiceRequestStage;
    client: ServiceRequestClient | null;
    assignedMembership: MembershipRef | null;
    createdByMembership: MembershipRef | null;
}

/** Filter shape consumed by GET /companies/:companyId/requests. All optional;
 *  omitted keys are dropped by the http querystring builder. */
export interface ListServiceRequestsParams {
    stageId?: string;
    serviceTypeId?: string;
    /** Used by client-detail "Pedidos" tab to surface a single client's
     *  requests. Tenant scoping is applied alongside server-side. */
    clientId?: string;
    assignedMembershipId?: string;
    isCancelled?: boolean;
    limit?: number;
    skip?: number;
}

// ── Service Request detail (mirror of DETAIL_SELECT) ────────────────────────
//
// Adds stageHistory and assignments on top of the list shape. stageHistory is
// ordered ASC (origin → current) so the workflow tab can render a forward
// timeline; assignments DESC (most recent first). Backend never includes
// fieldValues here — those land via the dedicated /field-values endpoint
// because they are role-aware in their own way.

export interface RequestStageHistoryEntry {
    id: string;
    /** null on the very first row — that one stamps the request's initial
     *  placement when it was created (no fromStage exists). */
    fromStageId: string | null;
    note: string | null;
    createdAt: string;
    toStage: { id: string; code: string; name: string };
    /** actorMembershipId is NOT NULL in the schema; the actor is always the
     *  membership that triggered the transition. */
    actorMembership: MembershipRef;
}

export interface RequestAssignmentEntry {
    id: string;
    createdAt: string;
    membership: MembershipRef;
    /** assignedByMembershipId is NOT NULL in the schema. */
    assignedByMembership: MembershipRef;
}

export interface ServiceRequestDetail extends ServiceRequestListItem {
    stageHistory: RequestStageHistoryEntry[];
    assignments: RequestAssignmentEntry[];
}

// ── Custom field values (GET /requests/:id/field-values) ─────────────────────

/** Mirrors @prisma/client CustomFieldType. Hand-typed to avoid pulling the
 *  Prisma client into the web bundle. Validated against schema.prisma. */
export type CustomFieldType =
    | 'TEXT'
    | 'TEXTAREA'
    | 'NUMBER'
    | 'DECIMAL'
    | 'DATE'
    | 'DATETIME'
    | 'SELECT'
    | 'MULTISELECT'
    | 'BOOLEAN'
    | 'FILE'
    | 'PHONE'
    | 'EMAIL'
    | 'URL';

/** Mirrors @prisma/client CustomFieldTarget — full enum, even though the
 *  current frontend only consumes REQUEST. Keeping the type honest about
 *  the domain avoids silent narrowing if a future surface starts reading
 *  CLIENT/PROPOSAL/SERVICE_ORDER/CONTACT custom fields. */
export type CustomFieldTarget =
    | 'REQUEST'
    | 'CLIENT'
    | 'PROPOSAL'
    | 'SERVICE_ORDER'
    | 'CONTACT';

/** Option row for SELECT / MULTISELECT custom fields. value is the wire
 *  identifier persisted in valueText / valueMulti; label is what the user
 *  sees. */
export interface CustomFieldOption {
    id: string;
    label: string;
    value: string;
    sortOrder: number;
}

/** Wire shape returned by GET /companies/:companyId/config/custom-fields.
 *  options is always present (Commit Ab) — empty array for non-option field
 *  types. serviceType is null when the field applies globally to its target
 *  (e.g. all REQUESTs regardless of serviceType). */
export interface CustomFieldListItem {
    id: string;
    code: string;
    label: string;
    target: CustomFieldTarget;
    type: CustomFieldType;
    isRequired: boolean;
    isActive: boolean;
    sortOrder: number;
    placeholder: string | null;
    helpText: string | null;
    createdAt: string;
    updatedAt: string;
    serviceType: {
        id: string;
        code: string;
        name: string;
        isActive: boolean;
    } | null;
    options: CustomFieldOption[];
}

export interface ListCustomFieldsParams {
    target?: CustomFieldTarget;
    serviceTypeId?: string;
    isActive?: boolean;
}

/** Wire shape returned by GET /requests/:id/field-values. Backend stores
 *  values in typed columns (only one is set per row depending on fieldType);
 *  the frontend reads the matching one based on customField.type. */
export interface RequestFieldValue {
    id: string;
    customFieldId: string;
    valueText: string | null;
    valueNumber: string | null;
    valueBoolean: boolean | null;
    valueDate: string | null;
    valueMulti: string[];
    customField: {
        id: string;
        code: string;
        label: string;
        type: CustomFieldType;
    };
}

// ── Tasks (mirror of GET /companies/:companyId/tasks?requestId=…) ────────────
//
// Endpoint returns a plain array (no pagination wrapper) — Tasks are scoped to
// a single request in this view, so the count is small.

export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface TaskListItem {
    id: string;
    number: number;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    createdAt: string;
    updatedAt: string;
    request: { id: string; number: number; title: string };
    assignedMembership: MembershipRef | null;
    createdByMembership: MembershipRef;
}

export interface ListTasksParams {
    requestId?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    assignedMembershipId?: string;
    limit?: number;
    skip?: number;
}

// ── Clients (mirror of GET /companies/:companyId/clients) ───────────────────
//
// Plain array response (no pagination wrapper). search query is server-side
// case-insensitive over name + taxId — used by the request creation modal's
// client picker via debounced fetches.

export interface ClientListItem {
    id: string;
    /** Per-tenant sequential identifier — display as "C-12". */
    number: number;
    type: ClientType;
    name: string;
    email: string | null;
    phone: string | null;
    taxId: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ListClientsParams {
    type?: ClientType;
    isActive?: boolean;
    search?: string;
    limit?: number;
    skip?: number;
}

// ── Client detail (mirror of CLIENT_DETAIL_SELECT) ──────────────────────────
//
// Extends list shape with notes, denormalized BUSINESS fields (legalName,
// tradeName, stateRegistration, municipalRegistration), INDIVIDUAL-only
// dateOfBirth, and the full address block. All of the additional fields are
// nullable because they're optional at create time.

export interface ClientDetail extends ClientListItem {
    notes: string | null;
    legalName: string | null;
    tradeName: string | null;
    dateOfBirth: string | null;
    stateRegistration: string | null;
    municipalRegistration: string | null;
    addressStreet: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    addressNeighborhood: string | null;
    addressCity: string | null;
    addressState: string | null;
    addressPostalCode: string | null;
    addressCountry: string | null;
}

// ── Create / Update Client payloads ─────────────────────────────────────────
//
// CreateClientPayload mirrors backend's CreateClientDto (28 campos). Service
// computes the denormalized `name` (PF: dto.name; PJ: dto.tradeName ??
// dto.legalName), so frontend doesn't send a redundant `name` field.
//
// UpdateClientPayload omits `type` (immutable post-creation, enforced
// server-side) and `fieldValues` (separate PUT /:id/field-values endpoint).

export interface CreateClientPayload {
    type: ClientType;
    // PF
    name?: string;
    dateOfBirth?: string;
    // PJ
    legalName?: string;
    tradeName?: string;
    stateRegistration?: string;
    municipalRegistration?: string;
    // Document + contact
    taxId?: string;
    email?: string;
    phone?: string;
    notes?: string;
    // Address
    addressStreet?: string;
    addressNumber?: string;
    addressComplement?: string;
    addressNeighborhood?: string;
    addressCity?: string;
    addressState?: string;
    addressPostalCode?: string;
    addressCountry?: string;
    // Custom field values (only on create — edit uses separate endpoint)
    fieldValues?: SetFieldValueItem[];
}

export type UpdateClientPayload = Omit<
    CreateClientPayload,
    'type' | 'fieldValues'
>;

// ── Client field values (GET /clients/:id/field-values) ─────────────────────
//
// Wire shape is identical to RequestFieldValue (same typed-columns model on
// the backend). Kept as a distinct interface for domain clarity — values
// returned here belong to a Client, not a ServiceRequest, even if the
// columns coincide.

export interface ClientFieldValue {
    id: string;
    customFieldId: string;
    valueText: string | null;
    valueNumber: string | null;
    valueBoolean: boolean | null;
    valueDate: string | null;
    valueMulti: string[];
    customField: {
        id: string;
        code: string;
        label: string;
        type: CustomFieldType;
    };
}

// ── Service Types (mirror of GET /companies/:companyId/config/service-types) ─
//
// Returns full LIST_SELECT projection — workflowId is exposed because some
// service types pin a specific workflow, others fall back to the company
// default (workflowId = null on the row).

export interface ServiceTypeListItem {
    id: string;
    code: string;
    name: string;
    workflowId: string | null;
    isActive: boolean;
}

// ── Create Service Request payload ──────────────────────────────────────────

export interface SetFieldValueItem {
    customFieldId: string;
    valueText?: string | null;
    valueNumber?: number | null;
    valueBoolean?: boolean | null;
    /** ISO 8601 string (DATE → YYYY-MM-DD, DATETIME → full ISO). */
    valueDate?: string | null;
    valueMulti?: string[];
}

export interface CreateServiceRequestPayload {
    serviceTypeId: string;
    clientId?: string;
    title: string;
    description?: string;
    fieldValues?: SetFieldValueItem[];
}

// ── Available Transitions (mirror of GET /requests/:id/available-transitions) ─
//
// Server-side filtered: only transitions whose toStage is active and whose
// fromStageId matches the request's currentStage. Cancelled requests get an
// empty array. requiresApproval is NOT filtered by APPROVE permission — the
// UI badges it and surfaces a friendly 403 toast on click for users without
// REQUEST.APPROVE.

export interface AvailableTransition {
    toStageId: string;
    toStageName: string;
    toStageIsFinal: boolean;
    requiresApproval: boolean;
}

export interface TransitionStagePayload {
    toStageId: string;
    note?: string;
}

export interface CancelRequestPayload {
    /** Optional free-text reason persisted as request.cancellationReason
     *  and surfaced in the detail page's Cancelamento section. Max 1024
     *  chars per backend DTO. */
    reason?: string;
}
