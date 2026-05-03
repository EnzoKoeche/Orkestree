import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { AuthenticatedRequestUser } from './strategies/jwt.strategy';

// ─────────────────────────────────────────────────────────────────────────────
// AuthController
//
// Two endpoints, both deliberately small:
//
//   POST /auth/login       — email + password → { accessToken, user }
//   GET  /auth/me          — current user identity (whoami)
//
// Workspace listing lives in MembershipsController under /memberships/me to
// keep concerns separate (auth = identity; memberships = tenant directory).
// Both are protected by the same JwtAuthGuard.
// ─────────────────────────────────────────────────────────────────────────────

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly prisma: PrismaService,
    ) { }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() body: LoginDto) {
        return this.authService.login(body.email, body.password);
    }

    /**
     * Lightweight whoami. The full membership directory is at
     * GET /memberships/me — kept separate so that a frontend that already
     * knows the active workspace can re-validate the token cheaply.
     */
    @Get('me')
    @UseGuards(JwtAuthGuard)
    async me(@Req() req: { user: AuthenticatedRequestUser }) {
        const user = await this.prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                isActive: true,
            },
        });
        if (!user || !user.isActive) {
            // JwtStrategy already 401s on inactive users; this branch is
            // defensive only — keeps the controller truthful if the DB
            // changes between strategy validate() and handler dispatch.
            return null;
        }
        const activeMemberships = await this.prisma.companyMembership.count({
            where: { userId: user.id, status: MembershipStatus.ACTIVE },
        });
        return { ...user, activeMembershipCount: activeMemberships };
    }
}
