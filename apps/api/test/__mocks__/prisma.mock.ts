// ─────────────────────────────────────────────────────────────────────────────
// PrismaService mock factory.
//
// Returns a permissive object where every method used by services under
// test is a Jest mock fn. Each spec extends this with the specific
// per-method behavior it cares about (mockResolvedValue / mockRejectedValue /
// mockImplementation), keeping spec setup terse.
//
// We deliberately do NOT type this as `jest.Mocked<Partial<PrismaService>>`:
// Prisma's generated method signatures (e.g. `count`) return branded
// PrismaPromise types whose intersection with jest.Mock breaks TypeScript's
// inference (`.mockResolvedValue` becomes inaccessible). The factory exposes
// `MockedPrismaService` with `[model: string]: ModelMockMethods` so specs can
// chain `.mockResolvedValue` directly on `prisma.user.findUnique`.
//
// $transaction handling: callers pass either an array (Promise.all-shaped
// batch) or a callback that receives a tx client. The mock supports both
// shapes — array path resolves all promises, callback path invokes the
// callback with the mock itself (so writes inside the tx hit the same mocks).
//
// $queryRaw / $executeRaw default to no-ops returning empty arrays / 0;
// specs that care about the raw response override per-call.
// ─────────────────────────────────────────────────────────────────────────────

interface ModelMockMethods {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
}

export interface MockedPrismaService {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    // `any` on the model index signature so callers can chain
    // `.mockResolvedValue` on `prisma.user.findUnique` without TypeScript
    // narrowing to a union that lacks the jest.Mock surface.
    [model: string]: any;
}

export function createMockPrisma(): MockedPrismaService {
    const modelMethods = (): ModelMockMethods => ({
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

    const prisma: MockedPrismaService = {
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

    return prisma;
}
