// ─────────────────────────────────────────────────────────────────────────────
// Domain types
//
// Hand-written to match the backend's explicit Prisma `select` projections at
// apps/api/src/{service-requests,clients,proposals}/*.service.ts. These are
// NOT generated — Prisma client types are not exposed to the browser. Any
// drift surfaces here as a TypeScript error at the call site, which is the
// correct place to notice it.
//
// Naming: the API returns Decimal as string, ISO timestamps as string. We
// keep them as strings on the wire and only parse where a component renders
// them, so the round-trip never loses precision.
// ─────────────────────────────────────────────────────────────────────────────

export type Role = 'OWNER' | 'ADMIN' | 'FINANCEIRO' | 'OPERACIONAL' | 'CLIENTE';

export type ProposalStatus =
    | 'DRAFT'
    | 'SENT'
    | 'APPROVED'
    | 'REJECTED'
    | 'EXPIRED'
    | 'CANCELLED';

export type ClientType = 'INDIVIDUAL' | 'BUSINESS';

// ── Auth / session ──────────────────────────────────────────────────────────

export type MembershipStatus = 'ACTIVE' | 'INACTIVE' | 'INVITED';

/**
 * Identity returned by POST /auth/login and GET /auth/me.
 */
export interface AuthUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
}

/**
 * Workspace + membership shape returned by GET /memberships/me. The list
 * is already filtered server-side to ACTIVE memberships of ACTIVE companies,
 * so the frontend doesn't have to re-filter for "switchable" workspaces.
 */
export interface MembershipSummary {
    id: string;
    role: Role;
    status: MembershipStatus;
    createdAt: string;
    company: {
        id: string;
        legalName: string;
        tradeName: string | null;
        taxId: string;
    };
}

export interface MembershipsMeResponse {
    user: AuthUser;
    memberships: MembershipSummary[];
}

export interface LoginResponse {
    accessToken: string;
    expiresIn: string;
    user: AuthUser;
}

/**
 * Frontend session shape. The token comes from POST /auth/login;
 * `companyId` is the active workspace (one of the user's memberships).
 * Identity + memberships are loaded by the SessionProvider on mount and
 * after every workspace switch.
 *
 * `role` mirrors the active membership's role — UX hint only. The backend
 * re-validates every permission via ResourcePermissionGuard on every call.
 */
export interface Session {
    token: string;
    companyId: string;
    role: Role | null;
    workspaceLabel: string | null;
}

// ── Reusable nested shapes ──────────────────────────────────────────────────

export interface MembershipRef {
    id: string;
    user: {
        id: string;
        firstName: string;
        lastName: string;
        avatarUrl: string | null;
    };
}

export interface ServiceRequestRef {
    id: string;
    number: number;
    title: string;
}

export interface ClientRef {
    id: string;
    number: number;
    name: string;
    type: ClientType;
}

// ── Service Requests ────────────────────────────────────────────────────────

export interface ServiceRequestListItem {
    id: string;
    number: number;
    title: string;
    description: string | null;
    isCancelled: boolean;
    cancellationReason: string | null;
    createdAt: string;
    updatedAt: string;
    serviceType: { id: string; code: string; name: string } | null;
    currentStage: {
        id: string;
        code: string;
        name: string;
        color: string | null;
        isFinal: boolean;
    } | null;
    client: ClientRef | null;
    assignedMembership: MembershipRef | null;
    createdByMembership: MembershipRef | null;
}

export interface ServiceRequestStageHistoryEntry {
    id: string;
    fromStageId: string | null;
    note: string | null;
    createdAt: string;
    toStage: { id: string; code: string; name: string };
    actorMembership: MembershipRef | null;
}

export interface ServiceRequestAssignment {
    id: string;
    createdAt: string;
    membership: MembershipRef | null;
    assignedByMembership: MembershipRef | null;
}

export interface ServiceRequestDetail extends ServiceRequestListItem {
    stageHistory: ServiceRequestStageHistoryEntry[];
    assignments: ServiceRequestAssignment[];
}

export interface ListServiceRequestsQuery {
    stageId?: string;
    serviceTypeId?: string;
    assignedMembershipId?: string;
    isCancelled?: boolean;
    limit?: number;
    skip?: number;
}

// ── Clients ─────────────────────────────────────────────────────────────────

export interface ClientListItem {
    id: string;
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

export interface ListClientsQuery {
    type?: ClientType;
    isActive?: boolean;
    search?: string;
    limit?: number;
    skip?: number;
}

// ── Proposals ───────────────────────────────────────────────────────────────

export interface ProposalListItem {
    id: string;
    number: number;
    status: ProposalStatus;
    title: string;
    /** Decimal serialized as string. */
    subtotal: string;
    /** Decimal serialized as string. */
    totalPrice: string;
    /**
     * Privileged view (OWNER/ADMIN) only. Backend strips this for everyone
     * else at the Prisma `select` layer.
     */
    totalCost?: string;
    discountPct: string | null;
    discountAmount: string | null;
    validUntil: string | null;
    sentAt: string | null;
    approvedAt: string | null;
    rejectedAt: string | null;
    expiredAt: string | null;
    cancelledAt: string | null;
    createdAt: string;
    updatedAt: string;
    serviceRequest: ServiceRequestRef | null;
    client: ClientRef | null;
    createdByMembership: MembershipRef | null;
}

export interface ProposalItem {
    id: string;
    description: string;
    unit: string | null;
    /** Decimal as string. */
    quantity: string;
    unitPrice: string;
    discountPct: string | null;
    /**
     * Privileged view only. Backend strips this for non-OWNER/ADMIN roles.
     */
    internalCost?: string;
    subtotal: string;
    sortOrder: number;
}

export interface ProposalStatusHistoryEntry {
    id: string;
    fromStatus: ProposalStatus | null;
    toStatus: ProposalStatus;
    note: string | null;
    createdAt: string;
    actorMembership: MembershipRef | null;
}

export interface ProposalDetail extends ProposalListItem {
    notes: string | null;
    clientNotes: string | null;
    pdfUrl: string | null;
    pdfGeneratedAt: string | null;
    rejectionReason: string | null;
    cancellationReason: string | null;
    approvedByMembership: MembershipRef | null;
    rejectedByMembership: MembershipRef | null;
    items: ProposalItem[];
    statusHistory: ProposalStatusHistoryEntry[];
}

export interface ListProposalsQuery {
    serviceRequestId?: string;
    clientId?: string;
    status?: ProposalStatus;
    limit?: number;
    skip?: number;
}

// ── Proposal mutation DTOs ──────────────────────────────────────────────────
//
// Mirror apps/api/src/proposals/dto/*.ts exactly. Keeping these as
// hand-written shapes (rather than generated) makes the wire contract
// reviewable in one place and surfaces drift as a TS error.
//
// All money fields are typed as `number` because that's what
// class-validator's @IsNumber expects on the wire. The backend converts
// them to Prisma.Decimal in-service, so JS-float quirks at intermediate
// values are still caught (validation rejects > maxDecimalPlaces).

/**
 * PATCH /companies/:companyId/proposals/:proposalId
 *
 * Backend invariants surfaced here:
 *   - Only DRAFT proposals are editable; the API returns 422 otherwise.
 *   - `discountPct` and `discountAmount` are mutually exclusive. To switch
 *     from one to the other, the request must explicitly set the other to
 *     null in the same call (see ProposalsService.updateProposal).
 *   - `null` clears a nullable field; `undefined` (key omitted) leaves it
 *     unchanged. We model "clear" as `| null` on every nullable field.
 *   - Pricing totals (subtotal/totalPrice/totalCost) are NEVER part of the
 *     payload — they are recomputed server-side.
 */
export interface UpdateProposalPayload {
    title?: string;
    notes?: string | null;
    clientNotes?: string | null;
    discountPct?: number | null;
    discountAmount?: number | null;
    /** ISO-8601 string. `null` clears the field. */
    validUntil?: string | null;
}

/**
 * POST /companies/:companyId/proposals/:proposalId/items
 *
 * `subtotal` is intentionally not part of the payload — it is computed by
 * the backend as quantity × unitPrice × (1 − discountPct/100).
 *
 * `internalCost` is accepted at write time only when the caller has
 * PROPOSAL.EDIT permission and the field-write authorization in
 * ProposalItemsService approves it. The UI surfaces the field only to
 * roles whose detail-projection includes it (Mechanism A).
 */
export interface CreateProposalItemPayload {
    description: string;
    unit?: string;
    quantity: number;
    unitPrice: number;
    discountPct?: number | null;
    internalCost?: number | null;
    sortOrder?: number;
}

/**
 * PATCH /companies/:companyId/proposals/:proposalId/items/:itemId
 *
 * Backend rejects empty bodies with 422 to avoid silent no-ops. Setting
 * a nullable field to `null` clears it; omitting the key leaves the
 * stored value unchanged.
 */
export interface UpdateProposalItemPayload {
    description?: string;
    unit?: string | null;
    quantity?: number;
    unitPrice?: number;
    discountPct?: number | null;
    internalCost?: number | null;
    sortOrder?: number;
}

export interface SendProposalDto {
    note?: string;
}

export interface ApproveProposalDto {
    note?: string;
}

export interface RejectProposalDto {
    reason?: string;
    note?: string;
}

export interface CancelProposalDto {
    reason?: string;
    note?: string;
}
