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
import { SkipThrottle, Throttle } from '@nestjs/throttler';
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

    // Rate-limited: 5 attempts per 60s per client IP. The throttler keys on
    // the request IP by default (X-Forwarded-For-aware when Express trust
    // proxy is on — wire that at the platform edge in production). This is
    // a brute-force speed bump, not a substitute for account-lockout, which
    // is out of scope here. 429 responses are emitted automatically by
    // ThrottlerGuard with a Retry-After header.
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() body: LoginDto) {
        return this.authService.login(body.email, body.password);
    }

    /**
     * Lightweight whoami. The full membership directory is at
     * GET /memberships/me — kept separate so that a frontend that already
     * knows the active workspace can re-validate the token cheaply.
     *
     * Skipped by the throttler: this endpoint is hit on every full reload
     * and inside the session-bootstrap useEffect, so a low ceiling here
     * would manifest as random sign-out loops in the UI. The JwtAuthGuard
     * is the rate-control gate for authenticated routes (invalid tokens
     * 401 immediately, with negligible work).
     */
    @SkipThrottle()
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
