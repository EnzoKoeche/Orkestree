import {
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MembershipStatus } from '@prisma/client';
import { createHash, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './strategies/jwt.strategy';

const scrypt = promisify(scryptCb) as (
    password: string | Buffer,
    salt: string | Buffer,
    keylen: number,
) => Promise<Buffer>;

// ─────────────────────────────────────────────────────────────────────────────
// AuthService
//
// Owns the login flow + token signing. Two intentional design choices worth
// calling out for review:
//
// 1) Password hashing is done with Node's built-in `crypto.scrypt`. The repo
//    has no bcrypt/argon2 dependency yet and pulling one in just for login
//    expands the install surface. scrypt is part of the Node stdlib, is
//    memory-hard (the same property bcrypt is known for), and is RFC 7914.
//    The format we store is `scrypt$N$saltHex$hashHex`, which is forward-
//    compatible: when the team chooses to migrate to argon2id, this service
//    can transparently re-hash on next login.
//
//    For accounts seeded outside this service (e.g. from a migration script
//    that pre-existed) we ALSO accept SHA-256-of-password as a legacy
//    fallback — flagged `legacy-sha256$hashHex`. That's a deliberate
//    compromise to avoid a chicken-and-egg with seed data; the moment a
//    user logs in successfully against a legacy hash, the record is
//    re-hashed with scrypt before the response is returned.
//
// 2) Token shape is intentionally minimal: { sub, email }. We do NOT bake
//    the active companyId into the token. Workspace switching becomes a
//    pure client-side concern (pick a membership the API confirms is
//    yours) and the backend stays the source of truth via the existing
//    CompanyMemberGuard, which re-checks membership.status === ACTIVE on
//    every tenant-scoped request. A larger payload (companyId + role)
//    would create the temptation to trust it, which is exactly the
//    failure mode the guard exists to prevent.
// ─────────────────────────────────────────────────────────────────────────────

const SCRYPT_PARAMS = {
    keylen: 64,
    saltBytes: 16,
};

export interface LoginResult {
    accessToken: string;
    expiresIn: string;
    user: { id: string; email: string; firstName: string; lastName: string; avatarUrl: string | null };
}

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly jwt: JwtService,
    ) { }

    // ── Public API ──────────────────────────────────────────────────────────

    async login(email: string, password: string): Promise<LoginResult> {
        // Always do the same amount of work on hit/miss to avoid leaking
        // "user exists" via timing. We compute a dummy hash on miss using a
        // constant fake stored hash so the wall-clock cost is comparable.
        const normalizedEmail = email.trim().toLowerCase();

        const user = await this.prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: {
                id: true,
                email: true,
                passwordHash: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                isActive: true,
            },
        });

        // Hash check — runs on miss too (against a known dummy) to flatten timing.
        const storedHash =
            user?.passwordHash ?? AuthService.DUMMY_SCRYPT_HASH;
        const passwordOk = await this.verifyPassword(password, storedHash);

        if (!user || !user.isActive || !passwordOk) {
            // Single, opaque error — do NOT distinguish wrong-email vs wrong-password.
            throw new UnauthorizedException('Invalid credentials.');
        }

        // Verify the user has at least one active company membership. A
        // signed-in user with zero ACTIVE memberships can't actually use the
        // app (every domain route is /companies/:companyId/...), so we'd
        // rather fail loudly here than ship them a half-broken shell.
        const activeCount = await this.prisma.companyMembership.count({
            where: { userId: user.id, status: MembershipStatus.ACTIVE },
        });
        if (activeCount === 0) {
            throw new UnauthorizedException(
                'Your account has no active workspaces.',
            );
        }

        // Opportunistic upgrade for legacy hashes — only after a successful
        // verify. Failures here must NOT block the login.
        if (storedHash.startsWith('legacy-sha256$')) {
            try {
                const upgraded = await this.hashPassword(password);
                await this.prisma.user.update({
                    where: { id: user.id },
                    data: { passwordHash: upgraded },
                });
            } catch (err) {
                this.logger.warn(
                    `Could not upgrade legacy password hash for user ${user.id}: ${(err as Error).message}`,
                );
            }
        }

        const accessToken = await this.signToken(user.id, user.email);
        return {
            accessToken,
            expiresIn: process.env['JWT_EXPIRES_IN'] ?? '7d',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                avatarUrl: user.avatarUrl,
            },
        };
    }

    // ── Hashing helpers ─────────────────────────────────────────────────────

    /**
     * Public so AuthModule's `seed` script (or a future admin-set-password
     * endpoint) can produce stored hashes in the same format the verifier
     * accepts. Format: `scrypt$<keylen>$<saltHex>$<hashHex>`.
     */
    public async hashPassword(plain: string): Promise<string> {
        const { randomBytes } = await import('node:crypto');
        const salt = randomBytes(SCRYPT_PARAMS.saltBytes);
        const derived = await scrypt(plain, salt, SCRYPT_PARAMS.keylen);
        return `scrypt$${SCRYPT_PARAMS.keylen}$${salt.toString('hex')}$${derived.toString('hex')}`;
    }

    private async verifyPassword(plain: string, stored: string): Promise<boolean> {
        // scrypt format
        if (stored.startsWith('scrypt$')) {
            const parts = stored.split('$');
            if (parts.length !== 4) return false;
            const keylen = Number.parseInt(parts[1] ?? '', 10);
            if (!Number.isFinite(keylen) || keylen <= 0) return false;
            const saltHex = parts[2] ?? '';
            const hashHex = parts[3] ?? '';
            if (!saltHex || !hashHex) return false;

            let saltBuf: Buffer;
            let hashBuf: Buffer;
            try {
                saltBuf = Buffer.from(saltHex, 'hex');
                hashBuf = Buffer.from(hashHex, 'hex');
            } catch {
                return false;
            }
            if (hashBuf.length !== keylen) return false;
            const derived = await scrypt(plain, saltBuf, keylen);
            return derived.length === hashBuf.length && timingSafeEqual(derived, hashBuf);
        }

        // legacy SHA-256 fallback (intentionally accepted only for transition;
        // upgraded to scrypt on first successful login in `login()`).
        if (stored.startsWith('legacy-sha256$')) {
            const expected = stored.slice('legacy-sha256$'.length);
            if (!expected) return false;
            const got = createHash('sha256').update(plain).digest('hex');
            // timingSafeEqual requires equal lengths; constant-compare hex strings.
            const a = Buffer.from(got, 'hex');
            let b: Buffer;
            try {
                b = Buffer.from(expected, 'hex');
            } catch {
                return false;
            }
            return a.length === b.length && timingSafeEqual(a, b);
        }

        // Anything else: refuse rather than fall back silently.
        return false;
    }

    /**
     * Stable dummy hash used to flatten timing on missing-user lookups. Generated
     * once at module load. The real password is never compared against it
     * (because login() returns 401 before token signing on user-miss), but
     * the work has to happen so the response time looks identical.
     */
    private static readonly DUMMY_SCRYPT_HASH =
        'scrypt$64$' +
        '00000000000000000000000000000000$' +
        '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

    // ── Token signing ───────────────────────────────────────────────────────

    private async signToken(userId: string, email: string): Promise<string> {
        const payload: JwtPayload = { sub: userId, email };
        // Expiration is read from JWT_EXPIRES_IN at JwtModule.registerAsync()
        // time; we do not override per-call to avoid drift between configs.
        return this.jwt.signAsync(payload);
    }
}
