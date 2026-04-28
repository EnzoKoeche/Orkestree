import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable } from '@nestjs/common';
import {
    CompanyMembership,
    CompanyResource,
    PermissionAction,
    Role,
    SensitiveField,
} from '@prisma/client';
import { Redis } from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { FIELD_DEFAULTS, SYSTEM_DEFAULTS } from './permission.defaults';

// ─────────────────────────────────────────────────────────────────────────────
// PermissionResolverService is the single source of truth for authorization.
//
// Resolution order for both layers:
//   UserOverride > RolePermission > hardcoded defaults
//
// Caching strategy:
//   - Redis-backed cache. TTL = 5 minutes.
//   - On permission change: DELETE all keys for the affected (companyId, membershipId).
//   - Multi-instance safe: all instances share the same Redis.
//   - CompanyMembership.isActive is NEVER cached — always DB-read in CompanyMemberGuard.
//
// Redis key formats:
//   perm:{companyId}:{membershipId}:{resource}:{action}  → "1" | "0"
//   field:{companyId}:{membershipId}:{field}              → "1" | "0"
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 300; // 5 minutes

@Injectable()
export class PermissionResolverService {
    constructor(
        private readonly prisma: PrismaService,
        @InjectRedis() private readonly redis: Redis,
    ) { }

    async isAllowed(
        membership: Pick<CompanyMembership, 'id' | 'companyId' | 'role'>,
        resource: CompanyResource,
        action: PermissionAction,
    ): Promise<boolean> {
        const cacheKey = `perm:${membership.companyId}:${membership.id}:${resource}:${action}`;
        const cached = await this.redis.get(cacheKey);
        if (cached !== null) return cached === '1';

        const result = await this.resolveAllowed(membership, resource, action);
        await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, result ? '1' : '0');
        return result;
    }

    async canSeeField(
        membership: Pick<CompanyMembership, 'id' | 'companyId' | 'role'>,
        field: SensitiveField,
    ): Promise<boolean> {
        const cacheKey = `field:${membership.companyId}:${membership.id}:${field}`;
        const cached = await this.redis.get(cacheKey);
        if (cached !== null) return cached === '1';

        const result = await this.resolveFieldAccess(membership, field);
        await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, result ? '1' : '0');
        return result;
    }

    async invalidateForMembership(companyId: string, membershipId: string): Promise<void> {
        const pattern = `perm:${companyId}:${membershipId}:*`;
        const fieldPattern = `field:${companyId}:${membershipId}:*`;
        await this.deleteByPattern(pattern);
        await this.deleteByPattern(fieldPattern);
    }

    async invalidateForCompany(companyId: string): Promise<void> {
        await this.deleteByPattern(`perm:${companyId}:*`);
        await this.deleteByPattern(`field:${companyId}:*`);
    }

    private async resolveAllowed(
        membership: Pick<CompanyMembership, 'id' | 'companyId' | 'role'>,
        resource: CompanyResource,
        action: PermissionAction,
    ): Promise<boolean> {
        // Layer 1: user-level override
        const userOverride = await this.prisma.userPermissionOverride.findUnique({
            where: {
                companyId_membershipId_resource_action: {
                    companyId: membership.companyId,
                    membershipId: membership.id,
                    resource,
                    action,
                },
            },
            select: { allowed: true },
        });
        if (userOverride !== null) return userOverride.allowed;

        // Layer 2: role-level override
        const rolePermission = await this.prisma.rolePermission.findUnique({
            where: {
                companyId_role_resource_action: {
                    companyId: membership.companyId,
                    role: membership.role,
                    resource,
                    action,
                },
            },
            select: { allowed: true },
        });
        if (rolePermission !== null) return rolePermission.allowed;

        // Layer 3: hardcoded defaults
        return SYSTEM_DEFAULTS[membership.role as Role]?.[resource]?.[action] ?? false;
    }

    private async resolveFieldAccess(
        membership: Pick<CompanyMembership, 'id' | 'companyId' | 'role'>,
        field: SensitiveField,
    ): Promise<boolean> {
        // Layer 1: user-level field override
        const userOverride = await this.prisma.userFieldPermissionOverride.findUnique({
            where: {
                companyId_membershipId_field: {
                    companyId: membership.companyId,
                    membershipId: membership.id,
                    field,
                },
            },
            select: { allowed: true },
        });
        if (userOverride !== null) return userOverride.allowed;

        // Layer 2: role-level field permission
        const rolePermission = await this.prisma.roleFieldPermission.findUnique({
            where: {
                companyId_role_field: {
                    companyId: membership.companyId,
                    role: membership.role,
                    field,
                },
            },
            select: { allowed: true },
        });
        if (rolePermission !== null) return rolePermission.allowed;

        // Layer 3: hardcoded field defaults
        return FIELD_DEFAULTS[membership.role as Role]?.[field] ?? false;
    }

    private async deleteByPattern(pattern: string): Promise<void> {
        let cursor = '0';
        do {
            const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = nextCursor;
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        } while (cursor !== '0');
    }
}
