import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { MembershipStatus } from '@prisma/client';
import { AuthService } from './auth.service';
import { createMockPrisma } from '../../test/__mocks__/prisma.mock';

// ─────────────────────────────────────────────────────────────────────────────
// AuthService.login spec
//
// Covers the four permutations the operator can hit:
//   1. Happy path — known user, correct password, ≥1 ACTIVE membership.
//   2. Wrong password — generic 401 (no leak distinguishing email vs password).
//   3. Inactive user — generic 401 (same opaque error as wrong password).
//   4. No active memberships — explicit 401 ("no active workspaces"); a user
//      with zero memberships can't actually use the app.
//
// Real scrypt is used (no crypto mocking): the verify path costs ~50 ms per
// case, acceptable. We pre-compute a known scrypt hash once at file load so
// each spec re-uses it.
// ─────────────────────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'CorrectPassword123!';
const TEST_USER = {
    id: 'user-123',
    email: 'enzo@orkestree.dev',
    firstName: 'Enzo',
    lastName: 'Koeche',
    avatarUrl: null,
    isActive: true,
};

describe('AuthService.login', () => {
    let prisma: ReturnType<typeof createMockPrisma>;
    let jwt: jest.Mocked<Pick<JwtService, 'signAsync'>>;
    let service: AuthService;
    let knownHash: string;

    beforeAll(async () => {
        // Pre-compute the scrypt hash once: verifyPassword on the real path
        // matches plain → stored. Built via the service's own hashPassword to
        // ensure the format matches the verifier (scrypt$<keylen>$<salt>$<hash>).
        const bootstrap = new AuthService(
            createMockPrisma() as never,
            { signAsync: jest.fn().mockResolvedValue('token') } as never,
        );
        knownHash = await bootstrap.hashPassword(TEST_PASSWORD);
    });

    beforeEach(() => {
        prisma = createMockPrisma();
        jwt = {
            signAsync: jest.fn().mockResolvedValue('test-jwt-token'),
        };
        service = new AuthService(prisma as never, jwt as never);
    });

    it('returns accessToken + user on credentials valid + active membership', async () => {
        prisma.user.findUnique.mockResolvedValue({
            ...TEST_USER,
            passwordHash: knownHash,
        });
        prisma.companyMembership.count.mockResolvedValue(1);

        const result = await service.login(TEST_USER.email, TEST_PASSWORD);

        expect(result.accessToken).toBe('test-jwt-token');
        expect(result.user).toEqual({
            id: TEST_USER.id,
            email: TEST_USER.email,
            firstName: TEST_USER.firstName,
            lastName: TEST_USER.lastName,
            avatarUrl: TEST_USER.avatarUrl,
        });
        // Email is normalised to lowercase + trimmed before lookup
        expect(prisma.user.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { email: TEST_USER.email },
            }),
        );
        expect(prisma.companyMembership.count).toHaveBeenCalledWith({
            where: { userId: TEST_USER.id, status: MembershipStatus.ACTIVE },
        });
    });

    it('throws 401 with opaque message on wrong password', async () => {
        prisma.user.findUnique.mockResolvedValue({
            ...TEST_USER,
            passwordHash: knownHash,
        });

        await expect(
            service.login(TEST_USER.email, 'WrongPassword'),
        ).rejects.toThrow(UnauthorizedException);
        await expect(
            service.login(TEST_USER.email, 'WrongPassword'),
        ).rejects.toThrow(/Invalid credentials/);
        // No JWT signed on failure
        expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('throws 401 generic when user is inactive (no leak vs wrong-password)', async () => {
        prisma.user.findUnique.mockResolvedValue({
            ...TEST_USER,
            isActive: false,
            passwordHash: knownHash,
        });

        await expect(
            service.login(TEST_USER.email, TEST_PASSWORD),
        ).rejects.toThrow(/Invalid credentials/);
        // Same opaque error as wrong-password — operator can't probe whether
        // the account exists.
        expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('throws 401 with explicit message when user has zero active memberships', async () => {
        prisma.user.findUnique.mockResolvedValue({
            ...TEST_USER,
            passwordHash: knownHash,
        });
        prisma.companyMembership.count.mockResolvedValue(0);

        await expect(
            service.login(TEST_USER.email, TEST_PASSWORD),
        ).rejects.toThrow(/no active workspaces/);
        // Distinct from wrong-credentials — at this point we've confirmed the
        // password, so leaking "your account exists but is workspace-less"
        // is acceptable (and friendlier).
        expect(jwt.signAsync).not.toHaveBeenCalled();
    });
});
