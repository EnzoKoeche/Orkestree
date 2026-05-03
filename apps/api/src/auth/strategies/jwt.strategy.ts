import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────
// JwtStrategy
//
// Validates the bearer token signed by AuthService and resolves it back to a
// "user context" attached to req.user under the shape the existing
// CompanyMemberGuard already expects: { userId: string }.
//
// The shared secret is read from JWT_SECRET on construction. We refuse to
// boot if it's missing in production-like environments — a hard-coded
// fallback would let an unconfigured deploy mint tokens that other services
// can't validate, which is worse than crashing.
//
// The strategy ALSO re-checks that the user still exists and is active.
// This is one extra DB read per request, but it's the cheap end of the
// safety scale: if a user is deactivated, every token they hold becomes
// invalid immediately, instead of the JWT_EXPIRES_IN window.
// ─────────────────────────────────────────────────────────────────────────────

export interface JwtPayload {
    /** Subject = User.id (cuid). */
    sub: string;
    /** Email at the time of token issue — informational only. */
    email: string;
    iat?: number;
    exp?: number;
}

export interface AuthenticatedRequestUser {
    /** Matches the property CompanyMemberGuard reads. */
    userId: string;
    email: string;
}

function loadJwtSecret(): string {
    const secret = process.env['JWT_SECRET'];
    if (!secret || secret.length < 16) {
        // 16 chars is a soft floor. The .env.example shipped a 40-char value;
        // anything shorter is almost certainly a misconfiguration.
        throw new Error(
            'JWT_SECRET is missing or too short (need at least 16 chars). ' +
                'Refusing to start: an unconfigured signing key is unsafe.',
        );
    }
    return secret;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(private readonly prisma: PrismaService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: loadJwtSecret(),
        });
    }

    async validate(payload: JwtPayload): Promise<AuthenticatedRequestUser> {
        if (!payload?.sub || typeof payload.sub !== 'string') {
            throw new UnauthorizedException('Malformed token payload.');
        }

        // Re-check the global user record — a deactivated User must not be
        // able to keep using a token that was minted while they were active.
        // Membership-level isActive is re-checked in CompanyMemberGuard on
        // every tenant-scoped route, so this layer is intentionally global.
        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, email: true, isActive: true },
        });

        if (!user || !user.isActive) {
            throw new UnauthorizedException('Account not available.');
        }

        return { userId: user.id, email: user.email };
    }
}
