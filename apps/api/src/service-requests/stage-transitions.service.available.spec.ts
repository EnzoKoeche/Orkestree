import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { StageTransitionsService } from './stage-transitions.service';
import type { PermissionResolverService } from '../company-config/permissions/permission-resolver.service';
import { createMockAudit } from '../../test/__mocks__/audit.mock';
import { createMockEvents } from '../../test/__mocks__/events.mock';
import { createMockPrisma } from '../../test/__mocks__/prisma.mock';

// ─────────────────────────────────────────────────────────────────────────────
// getAvailableTransitions spec
//
// The endpoint feeds the request-detail "Mover para…" dropdown. Four
// contracts the UI assumes:
//   1. Returns the legal transitions for the request's current stage,
//      sorted by toStage.sortOrder ASC (so the dropdown reads top-to-bottom
//      in workflow order).
//   2. Returns [] for a cancelled request — the UI gates the action
//      upstream (TransitionMenu hides itself when isCancelled), but the
//      endpoint is honest about there being nothing to do.
//   3. CLIENTE row-level isolation enforced BEFORE the transition lookup
//      — a forged requestId belonging to another member should resolve
//      to NotFound, not leak transitions.
//   4. NotFound when the request doesn't exist (or wrong tenant).
// ─────────────────────────────────────────────────────────────────────────────

const OWNER = {
    id: 'mem-owner',
    role: Role.OWNER,
};

const CLIENTE = {
    id: 'mem-cliente',
    role: Role.CLIENTE,
};

const COMPANY_ID = 'co-1';
const REQUEST_ID = 'req-1';

describe('StageTransitionsService.getAvailableTransitions', () => {
    let prisma: ReturnType<typeof createMockPrisma>;
    let permissionResolver: jest.Mocked<
        Pick<PermissionResolverService, 'isAllowed'>
    >;
    let service: StageTransitionsService;

    beforeEach(() => {
        prisma = createMockPrisma();
        permissionResolver = {
            isAllowed: jest.fn().mockResolvedValue(true),
        };
        service = new StageTransitionsService(
            prisma as never,
            permissionResolver as never,
            createMockAudit() as never,
            createMockEvents() as never,
        );
    });

    it('returns transitions sorted by toStage.sortOrder ASC', async () => {
        prisma.serviceRequest.findFirst.mockResolvedValue({
            id: REQUEST_ID,
            currentStageId: 'stage-current',
            workflowId: 'wf-1',
            isCancelled: false,
        });
        // Backend issues an orderBy: { toStage: { sortOrder: 'asc' } }, so the
        // returned array IS already sorted at the Prisma layer. Mock returns
        // them in correct order; spec verifies the orderBy was passed.
        prisma.stageTransition.findMany.mockResolvedValue([
            {
                toStageId: 'stage-2',
                requiresApproval: false,
                toStage: { name: 'Em análise', isFinal: false, sortOrder: 1 },
            },
            {
                toStageId: 'stage-3',
                requiresApproval: true,
                toStage: { name: 'Concluído', isFinal: true, sortOrder: 2 },
            },
        ]);

        const result = await service.getAvailableTransitions(
            COMPANY_ID,
            REQUEST_ID,
            OWNER,
        );

        expect(result).toEqual([
            {
                toStageId: 'stage-2',
                toStageName: 'Em análise',
                toStageIsFinal: false,
                requiresApproval: false,
            },
            {
                toStageId: 'stage-3',
                toStageName: 'Concluído',
                toStageIsFinal: true,
                requiresApproval: true,
            },
        ]);
        expect(prisma.stageTransition.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    workflowId: 'wf-1',
                    fromStageId: 'stage-current',
                    toStage: { isActive: true },
                }),
                orderBy: { toStage: { sortOrder: 'asc' } },
            }),
        );
    });

    it('returns [] for a cancelled request without querying transitions', async () => {
        prisma.serviceRequest.findFirst.mockResolvedValue({
            id: REQUEST_ID,
            currentStageId: 'stage-current',
            workflowId: 'wf-1',
            isCancelled: true,
        });

        const result = await service.getAvailableTransitions(
            COMPANY_ID,
            REQUEST_ID,
            OWNER,
        );

        expect(result).toEqual([]);
        // Skipping the second query is what makes the [] response cheap;
        // codify that no transition lookup happens at all.
        expect(prisma.stageTransition.findMany).not.toHaveBeenCalled();
    });

    it('CLIENTE row-level: where includes createdByMembershipId', async () => {
        prisma.serviceRequest.findFirst.mockResolvedValue(null);

        await expect(
            service.getAvailableTransitions(COMPANY_ID, REQUEST_ID, CLIENTE),
        ).rejects.toThrow(NotFoundException);

        // The where on the existence check must include createdByMembershipId
        // gated to the CLIENTE's own membership — this is the defense-in-depth
        // layer even when permission gate at the controller is bypassed.
        expect(prisma.serviceRequest.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: REQUEST_ID,
                    companyId: COMPANY_ID,
                    createdByMembershipId: CLIENTE.id,
                },
            }),
        );
    });

    it('throws NotFound when the request lookup returns null', async () => {
        prisma.serviceRequest.findFirst.mockResolvedValue(null);

        await expect(
            service.getAvailableTransitions(COMPANY_ID, 'unknown', OWNER),
        ).rejects.toThrow(NotFoundException);
    });
});
