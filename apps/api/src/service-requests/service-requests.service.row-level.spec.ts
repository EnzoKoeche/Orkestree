import { Role } from '@prisma/client';
import { ServiceRequestsService } from './service-requests.service';
import type { FieldValuesService } from './field-values.service';
import type { StageTransitionsService } from './stage-transitions.service';
import { createMockAudit } from '../../test/__mocks__/audit.mock';
import { createMockEvents } from '../../test/__mocks__/events.mock';
import { createMockPrisma } from '../../test/__mocks__/prisma.mock';

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTE row-level isolation spec — defense-in-depth invariant
//
// CLIENTE can only see service requests they themselves created. Two
// surfaces enforce this: getServiceRequest and listServiceRequests. Both
// inject `createdByMembershipId = actorMembership.id` into the Prisma
// `where` clause when role === CLIENTE — without it, a forged requestId or
// query could surface another tenant member's data. This spec codifies the
// where shape so a refactor that drops the gate fails its own test.
//
// Tenant scoping (companyId) is always present and comes from the
// authenticated membership; that's tested implicitly by every other spec.
// Here we focus on the row-level branch.
// ─────────────────────────────────────────────────────────────────────────────

const CLIENTE_MEMBERSHIP = {
    id: 'mem-cliente',
    companyId: 'co-1',
    userId: 'user-cliente',
    role: Role.CLIENTE,
};

const OWNER_MEMBERSHIP = {
    id: 'mem-owner',
    companyId: 'co-1',
    userId: 'user-owner',
    role: Role.OWNER,
};

describe('ServiceRequestsService — CLIENTE row-level isolation', () => {
    let prisma: ReturnType<typeof createMockPrisma>;
    let service: ServiceRequestsService;

    beforeEach(() => {
        prisma = createMockPrisma();
        const fieldValues = {} as FieldValuesService;
        const stageTransitions = {} as StageTransitionsService;
        service = new ServiceRequestsService(
            prisma as never,
            fieldValues,
            stageTransitions,
            createMockAudit() as never,
            createMockEvents() as never,
        );
    });

    it('getServiceRequest injects createdByMembershipId for CLIENTE role', async () => {
        prisma.serviceRequest.findFirst.mockResolvedValue({ id: 'req-1' });

        await service.getServiceRequest(CLIENTE_MEMBERSHIP, 'req-1');

        // The where clause must include createdByMembershipId scoped to the
        // CLIENTE's own membership id. Without this, a forged requestId would
        // surface another member's data.
        expect(prisma.serviceRequest.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: 'req-1',
                    companyId: CLIENTE_MEMBERSHIP.companyId,
                    createdByMembershipId: CLIENTE_MEMBERSHIP.id,
                },
            }),
        );

        // Sanity: OWNER on the same call shape gets the where without the
        // createdByMembershipId gate — confirms the branch is role-conditional.
        prisma.serviceRequest.findFirst.mockClear();
        prisma.serviceRequest.findFirst.mockResolvedValue({ id: 'req-1' });
        await service.getServiceRequest(OWNER_MEMBERSHIP, 'req-1');
        expect(prisma.serviceRequest.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: 'req-1',
                    companyId: OWNER_MEMBERSHIP.companyId,
                    // no createdByMembershipId for OWNER
                },
            }),
        );
    });

    it('listServiceRequests injects createdByMembershipId for CLIENTE role', async () => {
        // listServiceRequests wraps findMany + count in a $transaction array.
        // Default mock $transaction resolves the array form via Promise.all,
        // so both promises in the array need to be set up.
        prisma.serviceRequest.findMany.mockResolvedValue([]);
        prisma.serviceRequest.count.mockResolvedValue(0);

        await service.listServiceRequests(CLIENTE_MEMBERSHIP, {});

        // Both findMany and count receive the gated where clause — count is
        // important because pagination math is wrong if it counts other
        // members' rows.
        expect(prisma.serviceRequest.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    companyId: CLIENTE_MEMBERSHIP.companyId,
                    createdByMembershipId: CLIENTE_MEMBERSHIP.id,
                }),
            }),
        );
        expect(prisma.serviceRequest.count).toHaveBeenCalledWith({
            where: expect.objectContaining({
                companyId: CLIENTE_MEMBERSHIP.companyId,
                createdByMembershipId: CLIENTE_MEMBERSHIP.id,
            }),
        });
    });
});
