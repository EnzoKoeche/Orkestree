import { ClientType } from '@prisma/client';
import { ClientsService } from './clients.service';
import type { ClientFieldValuesService } from './client-field-values.service';
import { createMockAudit } from '../../test/__mocks__/audit.mock';
import { createMockEvents } from '../../test/__mocks__/events.mock';
import { createMockPrisma } from '../../test/__mocks__/prisma.mock';

// ─────────────────────────────────────────────────────────────────────────────
// ClientsService.listClients spec
//
// listClients is a thin pass-through to prisma.client.findMany, but the
// `where` it constructs encodes the filter contract: which fields are
// applied conditionally, how `search` ORs over name + taxId, and the
// pagination defaults. Lock those down so a refactor that drops a filter
// fails its own test instead of silently returning the wrong slice.
// ─────────────────────────────────────────────────────────────────────────────

const COMPANY_ID = 'co-1';

describe('ClientsService.listClients', () => {
    let prisma: ReturnType<typeof createMockPrisma>;
    let service: ClientsService;

    beforeEach(() => {
        prisma = createMockPrisma();
        const fieldValues = {
            validateAndLoad: jest.fn(),
            writeFieldValues: jest.fn(),
        } as unknown as ClientFieldValuesService;
        service = new ClientsService(
            prisma as never,
            fieldValues,
            createMockAudit() as never,
            createMockEvents() as never,
        );
        prisma.client.findMany.mockResolvedValue([]);
    });

    it('applies type, isActive, and pagination defaults to the where clause', async () => {
        await service.listClients(COMPANY_ID, {
            type: ClientType.BUSINESS,
            isActive: true,
        });

        expect(prisma.client.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    companyId: COMPANY_ID,
                    type: ClientType.BUSINESS,
                    isActive: true,
                },
                take: 50, // default limit
                skip: 0, // default skip
                orderBy: [{ name: 'asc' }, { number: 'asc' }],
            }),
        );
    });

    it('builds an OR clause for search across name and taxId', async () => {
        await service.listClients(COMPANY_ID, { search: 'Hosp' });

        expect(prisma.client.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    companyId: COMPANY_ID,
                    OR: [
                        { name: { contains: 'Hosp', mode: 'insensitive' } },
                        { taxId: { contains: 'Hosp' } },
                    ],
                },
            }),
        );
    });

    it('honours custom limit and skip when provided', async () => {
        await service.listClients(COMPANY_ID, { limit: 25, skip: 100 });

        expect(prisma.client.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 25,
                skip: 100,
            }),
        );
    });
});
