import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequestUser } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────
// MembershipsController
//
// Read-only; service layer skipped per YAGNI. Add MembershipsService when
// invite/revoke/role-change endpoints arrive — at that point this controller
// will need transactional logic, audit, and event emission, which all belong
// in a service following the service-requests / proposals / clients pattern.
//
// GET /memberships/me — current user + their ACTIVE workspace memberships.
//
// This is the bootstrap endpoint the operator UI calls right after sign-in
// (and on every full reload, to re-verify the token). Returning ACTIVE-only
// memberships matches the semantics enforced everywhere else: the
// CompanyMemberGuard rejects non-ACTIVE on the actual tenant routes, so
// surfacing INVITED / INACTIVE workspaces would let the UI offer a switcher
// option that 403s the moment it's used.
//
// Shape is intentionally narrow:
//   - just enough company info for the workspace switcher (id + display label)
//   - the role for role-aware nav hints
//   - the membership id (not just userId+companyId) because every domain
//     row references CompanyMembership by id, never raw userId
//
// Permission resolution is NOT inlined here. Resolving every (resource,
// action) for every membership at bootstrap would couple this endpoint to
// every domain module's permission set and produce a fat response that
// becomes stale the moment a permission override changes. The frontend
// uses the `role` as a UX hint and lets the backend's existing
// ResourcePermissionGuard be the source of truth.
// ─────────────────────────────────────────────────────────────────────────────

@Controller('memberships')
export class MembershipsController {
    constructor(private readonly prisma: PrismaService) { }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async listMine(@Req() req: { user: AuthenticatedRequestUser }) {
        const userId = req.user.userId;

        // One round-trip: pull user identity + active memberships with the
        // workspace label fields needed by the shell. We intentionally do
        // not select inactive companies — a deactivated company can't be
        // meaningfully entered.
        const [user, memberships] = await Promise.all([
            this.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    avatarUrl: true,
                },
            }),
            this.prisma.companyMembership.findMany({
                where: {
                    userId,
                    status: MembershipStatus.ACTIVE,
                    company: { isActive: true },
                },
                select: {
                    id: true,
                    role: true,
                    status: true,
                    createdAt: true,
                    company: {
                        select: {
                            id: true,
                            legalName: true,
                            tradeName: true,
                            taxId: true,
                            isActive: true,
                        },
                    },
                },
                // Stable ordering so the frontend's "default workspace = first"
                // heuristic is deterministic across reloads.
                orderBy: [{ createdAt: 'asc' }],
            }),
        ]);

        // Belt-and-braces: JwtStrategy.validate() already guarantees the user
        // exists and is active, but if the row was deleted between strategy
        // resolution and handler dispatch we'd rather return null than crash.
        if (!user) return null;

        return {
            user,
            memberships: memberships.map((m) => ({
                id: m.id,
                role: m.role,
                status: m.status,
                createdAt: m.createdAt,
                company: {
                    id: m.company.id,
                    // Display label preference: tradeName > legalName.
                    // Both are surfaced so the frontend can pick its own
                    // policy without another round-trip.
                    legalName: m.company.legalName,
                    tradeName: m.company.tradeName,
                    taxId: m.company.taxId,
                },
            })),
        };
    }
}
