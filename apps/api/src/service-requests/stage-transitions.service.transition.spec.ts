import {
    ForbiddenException,
    UnprocessableEntityException,
} from '@nestjs/common';
import {
    CompanyResource,
    PermissionAction,
    Role,
} from '@prisma/client';
import { StageTransitionsService } from './stage-transitions.service';
import type { PermissionResolverService } from '../company-config/permissions/permission-resolver.service';
import { createMockAudit } from '../../test/__mocks__/audit.mock';
import { createMockEvents } from '../../test/__mocks__/events.mock';
import { createMockPrisma } from '../../test/__mocks__/prisma.mock';

// ─────────────────────────────────────────────────────────────────────────────
// transitionStage spec — state-machine integrity
//
// Five paths, each guarding a different invariant:
//   1. Valid edge happy — currentStage updates, history appended, audit
//      written, event emitted post-commit.
//   2. Edge not declared in the workflow → 422 (state machine integrity:
//      operator can only advance through declared transitions).
//   3. requiresApproval=true + APPROVE permission missing → 403 (defense
//      in depth: UI badges these but backend enforces).
//   4. Cancelled request → 422 (terminal state; transitions are blocked).
//   5. Same stage requested → 422 (no-op transitions don't write history).
// ─────────────────────────────────────────────────────────────────────────────

const ACTOR = {
    id: 'mem-1',
    companyId: 'co-1',
    userId: 'user-1',
    role: Role.OPERACIONAL,
};

const REQUEST_ID = 'req-1';
const COMPANY_ID = 'co-1';

describe('StageTransitionsService.transitionStage', () => {
    let prisma: ReturnType<typeof createMockPrisma>;
    let permissionResolver: jest.Mocked<
        Pick<PermissionResolverService, 'isAllowed'>
    >;
    let audit: ReturnType<typeof createMockAudit>;
    let events: ReturnType<typeof createMockEvents>;
    let service: StageTransitionsService;

    beforeEach(() => {
        prisma = createMockPrisma();
        permissionResolver = {
            isAllowed: jest.fn().mockResolvedValue(true),
        };
        audit = createMockAudit();
        events = createMockEvents();
        service = new StageTransitionsService(
            prisma as never,
            permissionResolver as never,
            audit as never,
            events as never,
        );
    });

    it('valid edge happy path: updates currentStage, history, audit, event', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([
            {
                id: REQUEST_ID,
                currentStageId: 'stage-from',
                workflowId: 'wf-1',
                isCancelled: false,
            },
        ]);
        prisma.stageTransition.findFirst.mockResolvedValue({
            id: 'transition-1',
            requiresApproval: false,
        });
        prisma.workflowStage.findFirst.mockResolvedValue({
            id: 'stage-to',
            code: 'stage_to',
        });
        // resolveAssigneeRule queries stageAssigneeRule — null = no auto-assign,
        // simplifies the case to the core update + history + audit path.
        prisma.stageAssigneeRule.findFirst.mockResolvedValue(null);

        await service.transitionStage(COMPANY_ID, REQUEST_ID, ACTOR, {
            toStageId: 'stage-to',
        });

        expect(prisma.serviceRequest.update).toHaveBeenCalledWith({
            where: { id: REQUEST_ID },
            data: { currentStageId: 'stage-to' },
        });
        expect(prisma.requestStageHistory.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    fromStageId: 'stage-from',
                    toStageId: 'stage-to',
                    actorMembershipId: ACTOR.id,
                }),
            }),
        );
        expect(audit.write).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                operation: 'TRANSITION',
                before: { stageId: 'stage-from' },
                after: expect.objectContaining({ stageId: 'stage-to' }),
            }),
        );
        expect(events.emit).toHaveBeenCalledWith(
            'request.transitioned',
            expect.objectContaining({
                requestId: REQUEST_ID,
                fromStageId: 'stage-from',
                toStageId: 'stage-to',
            }),
        );
    });

    it('throws 422 when the edge is not declared in the workflow', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([
            {
                id: REQUEST_ID,
                currentStageId: 'stage-from',
                workflowId: 'wf-1',
                isCancelled: false,
            },
        ]);
        // No StageTransition row for (workflowId, fromStageId, toStageId)
        prisma.stageTransition.findFirst.mockResolvedValue(null);

        await expect(
            service.transitionStage(COMPANY_ID, REQUEST_ID, ACTOR, {
                toStageId: 'stage-to',
            }),
        ).rejects.toThrow(UnprocessableEntityException);

        expect(prisma.serviceRequest.update).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
    });

    it('throws 403 when transition requires APPROVE and actor lacks it', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([
            {
                id: REQUEST_ID,
                currentStageId: 'stage-from',
                workflowId: 'wf-1',
                isCancelled: false,
            },
        ]);
        prisma.stageTransition.findFirst.mockResolvedValue({
            id: 'transition-1',
            requiresApproval: true,
        });
        permissionResolver.isAllowed.mockResolvedValue(false);

        await expect(
            service.transitionStage(COMPANY_ID, REQUEST_ID, ACTOR, {
                toStageId: 'stage-to',
            }),
        ).rejects.toThrow(ForbiddenException);

        expect(permissionResolver.isAllowed).toHaveBeenCalledWith(
            ACTOR,
            CompanyResource.REQUEST,
            PermissionAction.APPROVE,
        );
        expect(prisma.serviceRequest.update).not.toHaveBeenCalled();
    });

    it('throws 422 on a cancelled request (terminal state)', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([
            {
                id: REQUEST_ID,
                currentStageId: 'stage-from',
                workflowId: 'wf-1',
                isCancelled: true,
            },
        ]);

        await expect(
            service.transitionStage(COMPANY_ID, REQUEST_ID, ACTOR, {
                toStageId: 'stage-to',
            }),
        ).rejects.toThrow(/Cannot transition a cancelled service request/);

        // Cancelled-check fires before transition lookup — no findFirst on
        // stageTransition, no update.
        expect(prisma.stageTransition.findFirst).not.toHaveBeenCalled();
        expect(prisma.serviceRequest.update).not.toHaveBeenCalled();
    });

    it('throws 422 when toStageId equals currentStageId (no-op transition)', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([
            {
                id: REQUEST_ID,
                currentStageId: 'stage-same',
                workflowId: 'wf-1',
                isCancelled: false,
            },
        ]);

        await expect(
            service.transitionStage(COMPANY_ID, REQUEST_ID, ACTOR, {
                toStageId: 'stage-same',
            }),
        ).rejects.toThrow(/Target stage is the same as the current stage/);

        // No-op detection fires before transition lookup.
        expect(prisma.stageTransition.findFirst).not.toHaveBeenCalled();
        expect(prisma.serviceRequest.update).not.toHaveBeenCalled();
    });
});
