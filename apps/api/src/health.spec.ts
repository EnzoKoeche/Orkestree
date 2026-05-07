// ─────────────────────────────────────────────────────────────────────────────
// Smoke spec — validates the Jest + ts-jest + paths mapping setup runs green
// before the real specs land in TASK-AUDIT-1. If this file fails to even
// register, jest.config.ts or ts-jest is mis-wired and the broader suite
// won't help debug; this spec is the canary.
//
// Will be deleted (or absorbed into a real spec) once the suite is stable.
// ─────────────────────────────────────────────────────────────────────────────

import { createMockPrisma } from '../test/__mocks__/prisma.mock';

describe('jest infrastructure smoke', () => {
    it('runs a passing assertion', () => {
        expect(true).toBe(true);
    });

    it('loads the prisma mock factory with expected shape', () => {
        const prisma = createMockPrisma();
        expect(prisma.$transaction).toBeDefined();
        expect(typeof prisma.$transaction).toBe('function');
        expect(prisma.client).toBeDefined();
        expect(prisma.serviceRequest).toBeDefined();
        expect(prisma.user).toBeDefined();
    });

    it('prisma mock $transaction supports callback form', async () => {
        const prisma = createMockPrisma();
        // Cast to any: the strict PrismaService['$transaction'] overload set
        // doesn't accept our deliberately permissive mock invocation, but
        // the runtime behaviour is what we care about here.
        const tx = prisma.$transaction as unknown as (
            cb: (p: typeof prisma) => Promise<number>,
        ) => Promise<number>;
        const result = await tx(async (p) => {
            expect(p.client).toBeDefined();
            return 42;
        });
        expect(result).toBe(42);
    });
});
