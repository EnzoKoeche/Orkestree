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
// Post-AUDIT-3: the JWT lives ONLY in the HttpOnly orkestree_session cookie,
// minted by /api/auth/login server-side and unreadable from JavaScript.
// `Session` carries just the user identity that the SessionProvider hydrates
// from /api/me on mount. Authentication is implicit — if useSession() returns
// a non-null Session, the cookie is alive; if it returns null, it isn't.
//
// Membership / activeCompanyId is intentionally NOT in this shape. The
// /memberships/me endpoint hands back the workspace list, and the active
// selection lives in a separate "active workspace" slot in the provider.
export interface Session {
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

/** Payload for POST /companies/:companyId/tasks (mirror of CreateTaskDto). */
export interface CreateTaskPayload {
    requestId: string;
    /** 1–256 chars. */
    title: string;
    /** ≤4096 chars. */
    description?: string;
    priority?: TaskPriority;
    /** ISO-8601 datetime (date input serialized to UTC midnight). */
    dueAt?: string;
}

/** Payload for POST /tasks/:id/transition (mirror of TransitionTaskDto). The
 *  backend enforces the legal state machine; the UI offers only legal moves
 *  but a 422 is surfaced as a toast if it ever races. */
export interface TransitionTaskPayload {
    toStatus: TaskStatus;
    note?: string;
}

/** Payload for POST /tasks/:id/assign (mirror of AssignTaskDto). */
export interface AssignTaskPayload {
    membershipId: string;
}

// ── Company member directory (GET /companies/:companyId/memberships — EPIC B2) ─
//
// Active internal members (CLIENTE excluded) for assignee pickers. Minimal
// projection: membership id + role + user identity. Shaped as MembershipRef
// plus role, so it's assignable wherever a MembershipRef is rendered.
export interface CompanyMember {
    id: string;
    role: Role;
    user: {
        id: string;
        firstName: string;
        lastName: string;
        avatarUrl: string | null;
    };
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

// ── Proposals ────────────────────────────────────────────────────────────────
//
// Mirrors the backend's role-aware select shapes (PROPOSAL_*_SELECT_*). Money
// and quantity fields arrive as STRINGS — Prisma serializes Decimal to string
// over JSON. Format them with lib/format (formatBRL/formatQuantity/formatPercent);
// never do float math on them (totals are authoritative on the backend).
//
// Role-awareness is expressed via optional fields: the backend STRIPS columns
// from the projection per role (e.g. CLIENTE never receives notes/totalCost/
// statusHistory; only OWNER/ADMIN receive totalCost/internalCost). The UI
// renders whatever the backend chose to send — it must never assume a field
// is present, and the optional types enforce that at compile time.

export type ProposalStatus =
    | 'DRAFT'
    | 'SENT'
    | 'APPROVED'
    | 'REJECTED'
    | 'EXPIRED'
    | 'CANCELLED';

/** Linked service request summary carried on a proposal. */
export interface ProposalRequestRef {
    id: string;
    number: number;
    title: string;
}

/** Linked client summary (null when the anchoring request had no client). */
export interface ProposalClientRef {
    id: string;
    number: number;
    name: string;
    type: ClientType;
}

/**
 * A proposal line item. `internalCost` is PRIVILEGED-only (OWNER/ADMIN) — the
 * backend omits it from the select for every other role, so it is optional.
 */
export interface ProposalItem {
    id: string;
    description: string;
    unit: string | null;
    quantity: string;
    unitPrice: string;
    discountPct: string | null;
    subtotal: string;
    sortOrder: number;
    /** PRIVILEGED-only (OWNER/ADMIN). Absent for other roles. */
    internalCost?: string;
}

export interface ProposalStatusHistoryEntry {
    id: string;
    /** null on the very first row — the DRAFT placement at creation time. */
    fromStatus: ProposalStatus | null;
    toStatus: ProposalStatus;
    note: string | null;
    createdAt: string;
    actorMembership: MembershipRef;
}

/** List shape — mirror of PROPOSAL_LIST_SELECT_*. Returned as a bare array by
 *  GET /proposals (the endpoint does not yet wrap with a total count). */
export interface ProposalListItem {
    id: string;
    number: number;
    status: ProposalStatus;
    title: string;
    subtotal: string;
    totalPrice: string;
    discountPct: string | null;
    discountAmount: string | null;
    validUntil: string | null;
    sentAt: string | null;
    approvedAt: string | null;
    rejectedAt: string | null;
    expiredAt: string | null;
    /** Absent from the CLIENTE projection. */
    cancelledAt?: string | null;
    createdAt: string;
    updatedAt: string;
    serviceRequest: ProposalRequestRef;
    /** Absent from the CLIENTE projection. */
    client?: ProposalClientRef | null;
    /** Absent from the CLIENTE projection. */
    createdByMembership?: MembershipRef;
    /** PRIVILEGED-only (OWNER/ADMIN). */
    totalCost?: string;
}

/** Detail shape — mirror of PROPOSAL_DETAIL_SELECT_*. Adds notes, items, and
 *  status history on top of the list shape. Several fields are role-stripped
 *  (see per-field notes); render defensively. */
export interface ProposalDetail extends ProposalListItem {
    /** Internal notes — not sent to CLIENTE. */
    notes?: string | null;
    clientNotes?: string | null;
    pdfUrl?: string | null;
    /** Not sent to CLIENTE. */
    pdfGeneratedAt?: string | null;
    /** Not sent to CLIENTE. */
    rejectionReason?: string | null;
    /** Not sent to CLIENTE. */
    cancellationReason?: string | null;
    /** Not sent to CLIENTE. */
    approvedByMembership?: MembershipRef | null;
    /** Not sent to CLIENTE. */
    rejectedByMembership?: MembershipRef | null;
    items: ProposalItem[];
    /** Not sent to CLIENTE. */
    statusHistory?: ProposalStatusHistoryEntry[];
}

/** Filter shape consumed by GET /companies/:companyId/proposals. */
export interface ListProposalsParams {
    serviceRequestId?: string;
    clientId?: string;
    status?: ProposalStatus;
    limit?: number;
    skip?: number;
}

/** Payload for POST /companies/:companyId/proposals (mirror of CreateProposalDto).
 *  Pricing fields (subtotal/totalPrice/totalCost) are NOT here — computed
 *  server-side from items. clientId is NOT here either — derived from the
 *  linked service request at creation time. Items are intentionally omitted:
 *  the proposal is created in DRAFT and items are added afterwards via the
 *  dedicated items endpoints (DRAFT editing UI). */
export interface CreateProposalPayload {
    serviceRequestId: string;
    /** 1–256 chars (backend DTO). */
    title: string;
    /** Optional internal notes, ≤4096 chars. */
    notes?: string;
    /** Optional client-facing notes, ≤4096 chars. */
    clientNotes?: string;
    /** Optional ISO-8601 datetime; the create form serializes a date input to
     *  UTC midnight to satisfy the backend's @IsISO8601(). */
    validUntil?: string;
}

/** Payload for POST /proposals/:id/items (mirror of CreateProposalItemDto).
 *  Money/quantity are NUMBERS here (the DTO validates @IsNumber) — the editor
 *  parses its string inputs to numbers on submit. subtotal is NOT sent; the
 *  backend computes it. internalCost is accepted only from privileged callers. */
export interface CreateProposalItemPayload {
    /** 1–1024 chars. */
    description: string;
    /** ≤32 chars. */
    unit?: string;
    /** Decimal(12,4), ≥ 0.0001. */
    quantity: number;
    /** Decimal(12,2), ≥ 0. */
    unitPrice: number;
    /** 0–100; null clears. */
    discountPct?: number | null;
    /** PRIVILEGED-only at write time. null clears. */
    internalCost?: number | null;
    sortOrder?: number;
}

/** Payload for PATCH /proposals/:id/items/:itemId (mirror of UpdateProposalItemDto).
 *  All fields optional; the backend rejects an empty body. Sending null on
 *  discountPct/internalCost/unit clears the value; omitting leaves it unchanged. */
export interface UpdateProposalItemPayload {
    description?: string;
    unit?: string | null;
    quantity?: number;
    unitPrice?: number;
    discountPct?: number | null;
    internalCost?: number | null;
    sortOrder?: number;
}
