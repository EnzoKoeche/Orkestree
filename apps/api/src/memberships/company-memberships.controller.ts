import { Controller, Get, UseGuards } from '@nestjs/common';
import { CompanyMembership, MembershipStatus, Role } from '@prisma/client';
import { CurrentMembership } from '../auth/decorators/current-membership.decorator';
import { CompanyMemberGuard } from '../auth/guards/company-member.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────
// CompanyMembershipsController — tenant-scoped member directory (EPIC B2).
//
// GET /companies/:companyId/memberships
//
// Lists the company's ACTIVE internal members (CLIENTE excluded) for assignee
// pickers (tasks, requests). Guard stack is JwtAuthGuard + CompanyMemberGuard
// only — NO ResourcePermissionGuard: any active member may see who their
// colleagues are in order to assign work. The projection is intentionally
// minimal (id, role, user identity) — no email/status/sensitive data — so a
// broad read here is safe.
//
// companyId comes from the resolved membership (CompanyMemberGuard already
// validated the :companyId param against the caller), never from raw input.
// ─────────────────────────────────────────────────────────────────────────────

@Controller('companies/:companyId/memberships')
@UseGuards(JwtAuthGuard, CompanyMemberGuard)
export class CompanyMembershipsController {
    constructor(private readonly prisma: PrismaService) {}

    @Get()
    async list(
        @CurrentMembership()
        membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
    ) {
        const members = await this.prisma.companyMembership.findMany({
            where: {
                companyId: membership.companyId,
                status: MembershipStatus.ACTIVE,
                role: { not: Role.CLIENTE },
            },
            select: {
                id: true,
                role: true,
                user: {
                    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
                },
            },
            orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
        });

        return members;
    }
}
