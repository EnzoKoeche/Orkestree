import {
    ConflictException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { ClientType, Role } from '@prisma/client';
import { ClientsService } from './clients.service';
import type { ClientFieldValuesService } from './client-field-values.service';
import { createMockAudit } from '../../test/__mocks__/audit.mock';
import { createMockEvents } from '../../test/__mocks__/events.mock';
import { createMockPrisma } from '../../test/__mocks__/prisma.mock';

// ─────────────────────────────────────────────────────────────────────────────
// ClientsService.createClient spec
//
// Covers the validation branches + the happy-path plumbing:
//   1. PF success — display name = dto.name, taxId 11 digits accepted.
//   2. PJ success — display name = tradeName ?? legalName, taxId 14 accepted.
//   3. PF without name → 422 UnprocessableEntity.
//   4. taxId already in use → 409 Conflict (pre-flight inside tx, before
//      hitting the DB unique index).
//   5. Advisory lock fires before the number-generation query (the lock is
//      what makes MAX+1 race-safe; reordering would break the invariant).
//
// The .catch P2002 → 409 mapping is a safety net for concurrent creates that
// slip past the pre-flight; we don't exercise it here (would need to fake a
// PrismaClientKnownRequestError shape) — the pre-flight covers the
// observable user-facing case.
// ─────────────────────────────────────────────────────────────────────────────

const ACTOR = {
    id: 'mem-1',
    companyId: 'co-1',
    userId: 'user-1',
    role: Role.OWNER,
};

describe('ClientsService.createClient', () => {
    let prisma: ReturnType<typeof createMockPrisma>;
    let fieldValues: jest.Mocked<
        Pick<ClientFieldValuesService, 'validateAndLoad' | 'writeFieldValues'>
    >;
    let audit: ReturnType<typeof createMockAudit>;
    let events: ReturnType<typeof createMockEvents>;
    let service: ClientsService;

    beforeEach(() => {
        prisma = createMockPrisma();
        fieldValues = {
            validateAndLoad: jest.fn().mockResolvedValue([]),
            writeFieldValues: jest.fn().mockResolvedValue(undefined),
        };
        audit = createMockAudit();
        events = createMockEvents();
        service = new ClientsService(
            prisma as never,
            fieldValues as never,
            audit as never,
            events as never,
        );

        // Default happy-path mock setup. Specs override per-case.
        prisma.$queryRaw.mockResolvedValue([{ max: 0 }]); // first client → number 1
        prisma.client.create.mockResolvedValue({ id: 'client-new' });

        // findFirst is hit twice with different shapes:
        //   - inside-tx pre-flight (where: { taxId, companyId }) — return null
        //     so no ConflictException fires.
        //   - getClient final read (where: { id, companyId }) — return the
        //     created row so NotFoundException doesn't fire.
        // Single mockImplementation routes both based on call args.
        prisma.client.findFirst.mockImplementation((args: any) => {
            if (args?.where?.taxId !== undefined) return Promise.resolve(null);
            if (args?.where?.id) return Promise.resolve({ id: 'client-new', number: 1 });
            return Promise.resolve(null);
        });
    });

    it('creates an INDIVIDUAL client with name as the display name', async () => {
        await service.createClient(ACTOR, {
            type: ClientType.INDIVIDUAL,
            name: 'João Silva',
            taxId: '12345678901',
        });

        expect(prisma.client.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    type: ClientType.INDIVIDUAL,
                    name: 'João Silva',
                    taxId: '12345678901',
                    number: 1,
                    addressCountry: 'BR',
                }),
            }),
        );
        expect(audit.write).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                operation: 'CREATE',
                entityType: 'Client',
            }),
        );
        expect(events.emit).toHaveBeenCalledWith(
            'client.created',
            expect.objectContaining({ clientId: 'client-new' }),
        );
    });

    it('creates a BUSINESS client and uses tradeName as display name when present', async () => {
        await service.createClient(ACTOR, {
            type: ClientType.BUSINESS,
            legalName: 'Hospital São Paulo Serviços Médicos LTDA',
            tradeName: 'Hospital São Paulo',
            taxId: '12345678000190',
        });

        expect(prisma.client.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    type: ClientType.BUSINESS,
                    name: 'Hospital São Paulo', // tradeName wins over legalName
                    legalName: 'Hospital São Paulo Serviços Médicos LTDA',
                    tradeName: 'Hospital São Paulo',
                    taxId: '12345678000190',
                }),
            }),
        );
    });

    it('rejects INDIVIDUAL without name (UnprocessableEntity, no DB write)', async () => {
        await expect(
            service.createClient(ACTOR, {
                type: ClientType.INDIVIDUAL,
                // name omitted
            }),
        ).rejects.toThrow(UnprocessableEntityException);

        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.client.create).not.toHaveBeenCalled();
    });

    it('rejects PF taxId with non-11 digit length (UnprocessableEntity)', async () => {
        await expect(
            service.createClient(ACTOR, {
                type: ClientType.INDIVIDUAL,
                name: 'João',
                taxId: '12345678000190', // 14 digits — illegal for PF
            }),
        ).rejects.toThrow(/CPF must be exactly 11 digits/);

        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 409 Conflict when taxId already exists for the company', async () => {
        // Override the default mockImplementation: the next call (pre-flight)
        // returns an existing row, triggering ConflictException inside the tx.
        prisma.client.findFirst.mockResolvedValueOnce({ id: 'existing-client' });

        await expect(
            service.createClient(ACTOR, {
                type: ClientType.INDIVIDUAL,
                name: 'João',
                taxId: '12345678901',
            }),
        ).rejects.toThrow(ConflictException);

        // Pre-flight stops the flow before number generation + create.
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(prisma.client.create).not.toHaveBeenCalled();
    });

    it('acquires the advisory lock before the number-generation query', async () => {
        // The lock keyed by `${companyId}:clients` serialises concurrent creates
        // for the same tenant. Reordering this with MAX(number) would re-introduce
        // the race; lock the test ordering down.
        await service.createClient(ACTOR, {
            type: ClientType.INDIVIDUAL,
            name: 'João',
        });

        const execOrder = prisma.$executeRaw.mock.invocationCallOrder[0];
        const queryOrder = prisma.$queryRaw.mock.invocationCallOrder[0];
        expect(execOrder).toBeLessThan(queryOrder);
    });
});
