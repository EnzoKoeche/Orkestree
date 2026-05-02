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

// ── Membership / actor ──────────────────────────────────────────────────────

/**
 * Local view of the authenticated session. The backend does NOT yet expose a
 * `whoami`/`/auth/me` endpoint (no AuthController exists); we therefore store
 * the operator-supplied JWT plus the companyId they're entering as. Once a
 * proper auth module lands, this type evolves but the rest of the app keeps
 * using `useSession()` unchanged.
 */
export interface Session {
    token: string;
    companyId: string;
    /**
     * Best-effort role hint (read from the JWT or set manually). Drives only
     * UI affordances — the backend re-checks every permission server-side.
     * `null` means "unknown; show conservative defaults".
     */
    role: Role | null;
    /** Display label for the workspace. Pure UI sugar. */
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
