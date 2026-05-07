import {
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ServiceRequestsService } from './service-requests.service';
import type { FieldValuesService } from './field-values.service';
import type { StageTransitionsService } from './stage-transitions.service';
import { createMockAudit } from '../../test/__mocks__/audit.mock';
import { createMockEvents } from '../../test/__mocks__/events.mock';
import { createMockPrisma } from '../../test/__mocks__/prisma.mock';

// ─────────────────────────────────────────────────────────────────────────────
// createServiceRequest spec — 11-step transaction
//
// Service is the operational entrypoint of the product. The 11 steps inside
// the $transaction (validate serviceType → resolve workflow → find initial
// stage → validate fieldValues → advisory lock → MAX(number) → create row →
// write fieldValues → write initial stage history → resolve assignee rule
// → write audit) all run as one atomic unit.
//
// Cases:
//   1. Happy path with workflow-from-serviceType (step 2 short-circuit) and
//      no auto-assignee. Verifies create payload + history + audit + event.
//   2. ServiceType inactive → 404 (validation step 1).
//   3. ServiceType has null workflowId AND no default workflow exists for
//      the company → 422 (workflow resolution falls back).
//   4. Resolved workflow has no active initial stage → 422 (workflow
//      misconfigured, can't place new request anywhere).
//
// Mock strategy: stageTransitionsService.resolveAssigneeRule mocked at the
// service-injection level (mockResolvedValue(null) for default no-assignee
// path). FieldValuesService.validateAndLoad mocked as no-op when items=[].
// ─────────────────────────────────────────────────────────────────────────────

const ACTOR = {
    id: 'mem-1',
    companyId: 'co-1',
    userId: 'user-1',
    role: Role.OWNER,
};

const HAPPY_DTO = {
    serviceTypeId: 'st-1',
    title: 'Manutenção mensal — agosto',
};

describe('ServiceRequestsService.createServiceRequest', () => {
    let prisma: ReturnType<typeof createMockPrisma>;
    let fieldValues: jest.Mocked<
        Pick<FieldValuesService, 'validateAndLoad' | 'writeFieldValues'>
    >;
    let stageTransitions: jest.Mocked<
        Pick<StageTransitionsService, 'resolveAssigneeRule'>
    >;
    let audit: ReturnType<typeof createMockAudit>;
    let events: ReturnType<typeof createMockEvents>;
    let service: ServiceRequestsService;

    beforeEach(() => {
        prisma = createMockPrisma();
        fieldValues = {
            validateAndLoad: jest.fn().mockResolvedValue([]),
            writeFieldValues: jest.fn().mockResolvedValue(undefined),
        };
        stageTransitions = {
            resolveAssigneeRule: jest.fn().mockResolvedValue(null),
        };
        audit = createMockAudit();
        events = createMockEvents();
        service = new ServiceRequestsService(
            prisma as never,
            fieldValues as never,
            stageTransitions as never,
            audit as never,
            events as never,
        );

        // Happy-path defaults (specs override per-case).
        prisma.serviceType.findFirst.mockResolvedValue({
            id: 'st-1',
            workflowId: 'wf-1', // workflow resolved without default fallback
        });
        prisma.workflowStage.findFirst.mockResolvedValue({
            id: 'stage-initial',
            code: 'triagem',
        });
        prisma.$queryRaw.mockResolvedValue([{ max: 0 }]); // first request → number 1
        prisma.serviceRequest.create.mockResolvedValue({ id: 'req-new' });
        // getServiceRequest final read at the end of createServiceRequest.
        prisma.serviceRequest.findFirst.mockResolvedValue({
            id: 'req-new',
            number: 1,
        });
    });

    it('happy path: 11-step tx, creates request + initial history + audit + event', async () => {
        await service.createServiceRequest(ACTOR, HAPPY_DTO);

        // Step 7: ServiceRequest row created with denormalized fields and
        // currentStageId = initial stage from step 3.
        expect(prisma.serviceRequest.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    serviceTypeId: 'st-1',
                    workflowId: 'wf-1',
                    currentStageId: 'stage-initial',
                    title: HAPPY_DTO.title,
                    number: 1,
                    createdByMembershipId: ACTOR.id,
                    assignedMembershipId: null,
                }),
            }),
        );

        // Step 9: initial stage history with fromStageId=null marks the
        // creation event in the timeline (HistoryTab uses this).
        expect(prisma.requestStageHistory.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    requestId: 'req-new',
                    fromStageId: null,
                    toStageId: 'stage-initial',
                    actorMembershipId: ACTOR.id,
                }),
            }),
        );

        // Step 10: assignee rule resolved (returns null → no auto-assign).
        expect(stageTransitions.resolveAssigneeRule).toHaveBeenCalledWith(
            expect.anything(),
            ACTOR.companyId,
            'stage-initial',
        );
        expect(prisma.requestAssignment.create).not.toHaveBeenCalled();

        // Step 11: audit log written, then event emitted post-commit.
        expect(audit.write).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                operation: 'CREATE',
                entityType: 'ServiceRequest',
                entityId: 'req-new',
            }),
        );
        expect(events.emit).toHaveBeenCalledWith(
            'request.created',
            expect.objectContaining({ requestId: 'req-new' }),
        );

        // Advisory lock (step 5) before MAX(number) raw query (step 6).
        // Reordering would re-introduce the race; lock the ordering down.
        const execOrder = prisma.$executeRaw.mock.invocationCallOrder[0];
        const queryOrder = prisma.$queryRaw.mock.invocationCallOrder[0];
        expect(execOrder).toBeLessThan(queryOrder);
    });

    it('throws 404 NotFound when serviceType is inactive or wrong tenant', async () => {
        prisma.serviceType.findFirst.mockResolvedValue(null);

        await expect(
            service.createServiceRequest(ACTOR, HAPPY_DTO),
        ).rejects.toThrow(NotFoundException);

        expect(prisma.serviceRequest.create).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
        expect(events.emit).not.toHaveBeenCalled();
    });

    it('throws 422 when serviceType.workflowId is null AND no default workflow exists', async () => {
        // ServiceType with no pinned workflow → falls back to company default.
        prisma.serviceType.findFirst.mockResolvedValue({
            id: 'st-1',
            workflowId: null,
        });
        // No default workflow configured for the tenant → 422.
        prisma.workflow.findFirst.mockResolvedValue(null);

        await expect(
            service.createServiceRequest(ACTOR, HAPPY_DTO),
        ).rejects.toThrow(UnprocessableEntityException);
        await expect(
            service.createServiceRequest(ACTOR, HAPPY_DTO),
        ).rejects.toThrow(/No active default workflow/);

        expect(prisma.serviceRequest.create).not.toHaveBeenCalled();
    });

    it('throws 422 when the resolved workflow has no active initial stage', async () => {
        // Workflow resolves fine, but workflowStage.findFirst({ isInitial,
        // isActive }) returns nothing — workflow misconfigured.
        prisma.workflowStage.findFirst.mockResolvedValue(null);

        await expect(
            service.createServiceRequest(ACTOR, HAPPY_DTO),
        ).rejects.toThrow(UnprocessableEntityException);
        await expect(
            service.createServiceRequest(ACTOR, HAPPY_DTO),
        ).rejects.toThrow(/no active initial stage/);

        expect(prisma.serviceRequest.create).not.toHaveBeenCalled();
    });
});
