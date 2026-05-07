import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ServiceRequestsService } from './service-requests.service';
import type { FieldValuesService } from './field-values.service';
import type { StageTransitionsService } from './stage-transitions.service';
import { createMockAudit } from '../../test/__mocks__/audit.mock';
import { createMockEvents } from '../../test/__mocks__/events.mock';
import { createMockPrisma } from '../../test/__mocks__/prisma.mock';

// ─────────────────────────────────────────────────────────────────────────────
// cancelServiceRequest spec
//
// Three contracts the UI relies on:
//   1. Happy path — flips isCancelled, writes CANCEL audit, emits
//      `request.cancelled` event, returns the refreshed detail.
//   2. Idempotent on already-cancelled (silent return — no audit write,
//      no event, no second update). Mirror Sessão 10 D26: re-cancel from
//      a stale tab still shows toast success and the operator moves on.
//   3. NotFound when the FOR UPDATE raw query returns zero rows — could be
//      wrong tenant or invalid id, both surface the same 404.
// ─────────────────────────────────────────────────────────────────────────────

const ACTOR = {
    id: 'mem-1',
    companyId: 'co-1',
    userId: 'user-1',
    role: Role.OWNER,
};

const REQUEST_ID = 'req-1';

describe('ServiceRequestsService.cancelServiceRequest', () => {
    let prisma: ReturnType<typeof createMockPrisma>;
    let audit: ReturnType<typeof createMockAudit>;
    let events: ReturnType<typeof createMockEvents>;
    let service: ServiceRequestsService;

    beforeEach(() => {
        prisma = createMockPrisma();
        audit = createMockAudit();
        events = createMockEvents();
        const fieldValues = {} as FieldValuesService;
        const stageTransitions = {} as StageTransitionsService;
        service = new ServiceRequestsService(
            prisma as never,
            fieldValues,
            stageTransitions,
            audit as never,
            events as never,
        );

        // Final getServiceRequest read at the end of cancelServiceRequest.
        prisma.serviceRequest.findFirst.mockResolvedValue({
            id: REQUEST_ID,
            isCancelled: true,
        });
    });

    it('happy path: flips isCancelled, writes CANCEL audit, emits event', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([
            { id: REQUEST_ID, isCancelled: false, currentStageId: 'stage-1' },
        ]);

        await service.cancelServiceRequest(ACTOR, REQUEST_ID, {
            reason: 'Cliente desistiu',
        });

        expect(prisma.serviceRequest.update).toHaveBeenCalledWith({
            where: { id: REQUEST_ID },
            data: {
                isCancelled: true,
                cancellationReason: 'Cliente desistiu',
            },
        });
        expect(audit.write).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                operation: 'CANCEL',
                entityType: 'ServiceRequest',
                entityId: REQUEST_ID,
                after: expect.objectContaining({
                    isCancelled: true,
                    cancellationReason: 'Cliente desistiu',
                }),
            }),
        );
        expect(events.emit).toHaveBeenCalledWith(
            'request.cancelled',
            expect.objectContaining({ requestId: REQUEST_ID }),
        );
    });

    it('idempotent on already-cancelled: no update, no audit, no event', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([
            { id: REQUEST_ID, isCancelled: true, currentStageId: 'stage-1' },
        ]);

        await service.cancelServiceRequest(ACTOR, REQUEST_ID, {});

        // Tx returns silently when isCancelled is already true. The contract
        // is "second cancel is a no-op" — so the operator clicking the
        // disabled-since-stale-tab still sees the toast on the UI side, but
        // we don't double-write to audit or fire a second event.
        expect(prisma.serviceRequest.update).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
        expect(events.emit).not.toHaveBeenCalled();
    });

    it('throws NotFound when the FOR UPDATE query returns no rows', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([]);

        await expect(
            service.cancelServiceRequest(ACTOR, 'unknown', {}),
        ).rejects.toThrow(NotFoundException);

        expect(prisma.serviceRequest.update).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
        expect(events.emit).not.toHaveBeenCalled();
    });
});
