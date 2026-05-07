import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ClientsService } from './clients.service';
import type { ClientFieldValuesService } from './client-field-values.service';
import { createMockAudit } from '../../test/__mocks__/audit.mock';
import { createMockEvents } from '../../test/__mocks__/events.mock';
import { createMockPrisma } from '../../test/__mocks__/prisma.mock';

// ─────────────────────────────────────────────────────────────────────────────
// ClientsService.deactivate / reactivate spec
//
// Both endpoints are idempotent by contract: re-calling on a client that's
// already in the target state must be a silent no-op (not 409 / not 422 /
// not 200 with audit). Sessão 11 (D26 mirror) ships UI that depends on this:
// re-deactivate from a stale tab returns success, the UI surfaces a toast,
// and the user moves on.
//
// Cases:
//   1. deactivate active client → flips isActive=false + audit + getClient
//   2. deactivate already-inactive → no-op (no update, no audit, no event)
//   3. reactivate inactive client → flips + audit
//   4. reactivate already-active → no-op
//   5. NotFound (raw SQL returns no rows) bubbles up as 404
// ─────────────────────────────────────────────────────────────────────────────

const ACTOR = {
    id: 'mem-1',
    companyId: 'co-1',
    userId: 'user-1',
    role: Role.OWNER,
};

const CLIENT_ID = 'client-1';

describe('ClientsService deactivate / reactivate', () => {
    let prisma: ReturnType<typeof createMockPrisma>;
    let audit: ReturnType<typeof createMockAudit>;
    let service: ClientsService;

    beforeEach(() => {
        prisma = createMockPrisma();
        audit = createMockAudit();
        const fieldValues = {
            validateAndLoad: jest.fn(),
            writeFieldValues: jest.fn(),
        } as unknown as ClientFieldValuesService;
        service = new ClientsService(
            prisma as never,
            fieldValues,
            audit as never,
            createMockEvents() as never,
        );

        // getClient final read at the end of both methods.
        prisma.client.findFirst.mockImplementation((args: any) => {
            if (args?.where?.id) {
                return Promise.resolve({ id: CLIENT_ID, isActive: true });
            }
            return Promise.resolve(null);
        });
    });

    it('deactivate flips isActive=false and writes a DEACTIVATE audit', async () => {
        // The lock-and-read raw query returns the client as currently active.
        prisma.$queryRaw.mockResolvedValueOnce([
            { id: CLIENT_ID, isActive: true },
        ]);

        await service.deactivateClient(ACTOR, CLIENT_ID);

        expect(prisma.client.update).toHaveBeenCalledWith({
            where: { id: CLIENT_ID },
            data: { isActive: false },
        });
        expect(audit.write).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                operation: 'DEACTIVATE',
                entityType: 'Client',
                entityId: CLIENT_ID,
            }),
        );
    });

    it('deactivate is idempotent on an already-inactive client (no update, no audit)', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([
            { id: CLIENT_ID, isActive: false },
        ]);

        await service.deactivateClient(ACTOR, CLIENT_ID);

        // Early-return inside the tx: no flip, no audit. getClient still runs
        // afterwards (returns the still-inactive row) — the contract says the
        // method is silent, not that it short-circuits the response.
        expect(prisma.client.update).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
    });

    it('reactivate flips isActive=true and writes an ACTIVATE audit', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([
            { id: CLIENT_ID, isActive: false },
        ]);

        await service.reactivateClient(ACTOR, CLIENT_ID);

        expect(prisma.client.update).toHaveBeenCalledWith({
            where: { id: CLIENT_ID },
            data: { isActive: true },
        });
        expect(audit.write).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                operation: 'ACTIVATE',
                entityType: 'Client',
                entityId: CLIENT_ID,
            }),
        );
    });

    it('reactivate is idempotent on an already-active client (no update, no audit)', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([
            { id: CLIENT_ID, isActive: true },
        ]);

        await service.reactivateClient(ACTOR, CLIENT_ID);

        expect(prisma.client.update).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
    });

    it('throws NotFound when the lock-and-read query returns no rows', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([]);

        await expect(
            service.deactivateClient(ACTOR, 'unknown-id'),
        ).rejects.toThrow(NotFoundException);

        expect(prisma.client.update).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
    });
});
