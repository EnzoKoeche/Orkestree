import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────
// CompanyMemberGuard
//
// Resolves CompanyMembership for the authenticated user within the requested
// company and attaches it to the request object as `companyMembership`.
//
// CRITICAL: membership.isActive is ALWAYS read from DB here — never cached.
// A deactivated membership must be rejected immediately, not within a cache TTL.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class CompanyMemberGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<{
            user?: { userId: string };
            params?: { companyId?: string };
            companyMembership?: unknown;
        }>();

        const userId = request.user?.userId;
        const companyId = request.params?.companyId;

        if (!userId || !companyId) {
            throw new ForbiddenException('Company context required.');
        }

        // Always DB-read: membership.isActive must never be stale.
        const membership = await this.prisma.companyMembership.findUnique({
            where: { companyId_userId: { companyId, userId } },
            select: { id: true, companyId: true, userId: true, role: true, status: true },
        });

        if (!membership || membership.status !== MembershipStatus.ACTIVE) {
            throw new ForbiddenException('You are not an active member of this company.');
        }

        request.companyMembership = membership;
        return true;
    }
}
