import { CompanyResource, PermissionAction, Role } from '@prisma/client';
import { PermissionResolverService } from './permission-resolver.service';
import { createMockPrisma } from '../../../test/__mocks__/prisma.mock';
import { createMockRedis } from '../../../test/__mocks__/redis.mock';

// ─────────────────────────────────────────────────────────────────────────────
// PermissionResolverService.isAllowed spec
//
// Validates the 3-layer precedence (UserOverride > RolePermission > hardcoded
// SYSTEM_DEFAULTS) plus the Redis cache short-circuit. Each case isolates one
// layer so a regression in any single layer fails its own test rather than
// hiding behind the others.
//
// Cache semantics:
//   - cache hit → returns the cached "1"/"0" without touching Prisma.
//   - cache miss → resolves through layers, writes "1"/"0" to Redis with
//     5-minute TTL, returns the resolved boolean.
// ─────────────────────────────────────────────────────────────────────────────

const MEMBERSHIP = {
    id: 'mem-1',
    companyId: 'co-1',
    role: Role.OPERACIONAL,
};

describe('PermissionResolverService.isAllowed', () => {
    let prisma: ReturnType<typeof createMockPrisma>;
    let redis: ReturnType<typeof createMockRedis>;
    let service: PermissionResolverService;

    beforeEach(() => {
        prisma = createMockPrisma();
        redis = createMockRedis();
        service = new PermissionResolverService(prisma as never, redis as never);
    });

    it('returns user-level override when present (overrides role + defaults)', async () => {
        prisma.userPermissionOverride.findUnique.mockResolvedValue({
            allowed: true, // user is explicitly granted DELETE on REQUEST
        });
        // role + defaults below would deny — they must NOT be consulted.

        const result = await service.isAllowed(
            MEMBERSHIP,
            CompanyResource.REQUEST,
            PermissionAction.DELETE,
        );

        expect(result).toBe(true);
        expect(prisma.userPermissionOverride.findUnique).toHaveBeenCalled();
        // Layer-2 (rolePermission) must short-circuit when user override hits.
        expect(prisma.rolePermission.findUnique).not.toHaveBeenCalled();
    });

    it('falls back to role-level override when no user override exists', async () => {
        prisma.userPermissionOverride.findUnique.mockResolvedValue(null);
        prisma.rolePermission.findUnique.mockResolvedValue({
            allowed: true, // role explicitly grants DELETE
        });

        const result = await service.isAllowed(
            MEMBERSHIP,
            CompanyResource.REQUEST,
            PermissionAction.DELETE,
        );

        expect(result).toBe(true);
        expect(prisma.rolePermission.findUnique).toHaveBeenCalled();
    });

    it('falls back to hardcoded SYSTEM_DEFAULTS when no overrides exist', async () => {
        prisma.userPermissionOverride.findUnique.mockResolvedValue(null);
        prisma.rolePermission.findUnique.mockResolvedValue(null);

        // Per permission.defaults.ts, OPERACIONAL has REQUEST.VIEW = true,
        // REQUEST.DELETE = (not set / falsy).
        const view = await service.isAllowed(
            MEMBERSHIP,
            CompanyResource.REQUEST,
            PermissionAction.VIEW,
        );
        const del = await service.isAllowed(
            MEMBERSHIP,
            CompanyResource.REQUEST,
            PermissionAction.DELETE,
        );

        expect(view).toBe(true);
        expect(del).toBe(false);
    });

    it('short-circuits on Redis cache hit (no Prisma calls)', async () => {
        redis.get.mockResolvedValueOnce('1');

        const result = await service.isAllowed(
            MEMBERSHIP,
            CompanyResource.REQUEST,
            PermissionAction.VIEW,
        );

        expect(result).toBe(true);
        expect(redis.get).toHaveBeenCalledWith(
            `perm:${MEMBERSHIP.companyId}:${MEMBERSHIP.id}:REQUEST:VIEW`,
        );
        // Cache hit must not touch the DB.
        expect(prisma.userPermissionOverride.findUnique).not.toHaveBeenCalled();
        expect(prisma.rolePermission.findUnique).not.toHaveBeenCalled();
    });

    it('writes cache with 5min TTL on cache miss', async () => {
        redis.get.mockResolvedValue(null);
        prisma.userPermissionOverride.findUnique.mockResolvedValue(null);
        prisma.rolePermission.findUnique.mockResolvedValue(null);

        // OPERACIONAL has REQUEST.VIEW per defaults → "1".
        const result = await service.isAllowed(
            MEMBERSHIP,
            CompanyResource.REQUEST,
            PermissionAction.VIEW,
        );

        expect(result).toBe(true);
        expect(redis.setex).toHaveBeenCalledWith(
            `perm:${MEMBERSHIP.companyId}:${MEMBERSHIP.id}:REQUEST:VIEW`,
            300,
            '1',
        );
    });
});
