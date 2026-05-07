import type { PrismaService } from '../../src/prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────
// PrismaService mock factory.
//
// Returns a Partial<PrismaService> where every method used by services under
// test is a Jest mock fn. Each spec extends this with the specific
// per-method behavior it cares about (mockResolvedValue / mockRejectedValue /
// mockImplementation), keeping spec setup terse.
//
// $transaction handling: callers pass either an array (Promise.all-shaped
// batch) or a callback that receives a tx client. The mock supports both
// shapes — array path resolves all promises, callback path invokes the
// callback with the mock itself (so writes inside the tx hit the same mocks).
//
// $queryRaw / $executeRaw default to no-ops returning empty arrays / 0;
// specs that care about the raw response override per-call.
// ─────────────────────────────────────────────────────────────────────────────

export type MockedPrismaService = jest.Mocked<Partial<PrismaService>> & {
    [model: string]: any;
};

export function createMockPrisma(): MockedPrismaService {
    const tx: any = {};

    const modelMethods = (): any => ({
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
    });

    // Models touched by services under test. Add more here as new specs need
    // them — adding eagerly is cheaper than per-spec patching.
    const modelNames = [
        'user',
        'companyMembership',
        'serviceRequest',
        'serviceType',
        'workflow',
        'workflowStage',
        'stageTransition',
        'requestStageHistory',
        'requestAssignment',
        'requestFieldValue',
        'client',
        'clientFieldValue',
        'customField',
        'customFieldOption',
        'rolePermission',
        'userPermissionOverride',
    ];

    const prisma: any = {
        $transaction: jest.fn(async (arg: any) => {
            if (typeof arg === 'function') {
                return arg(prisma);
            }
            // Array form — Promise.all on the entries.
            return Promise.all(arg);
        }),
        $queryRaw: jest.fn().mockResolvedValue([]),
        $executeRaw: jest.fn().mockResolvedValue(0),
    };

    for (const name of modelNames) {
        prisma[name] = modelMethods();
    }

    // Wire tx alias for callbacks that destructure tx-only methods.
    Object.assign(tx, prisma);

    return prisma as MockedPrismaService;
}
