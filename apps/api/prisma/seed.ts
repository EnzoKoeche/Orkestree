/* eslint-disable no-console */
/**
 * Minimal, deterministic dev seed.
 *
 * Goal: give a reviewer enough data to exercise the full auth + workspace
 * bootstrap loop end-to-end:
 *
 *   1. POST /auth/login   (email + password)
 *   2. GET  /auth/me      (whoami)
 *   3. GET  /memberships/me     (workspace directory — must return 2 entries)
 *   4. GET  /companies/:companyId/clients   (tenant-scoped sanity check)
 *
 * Design rules:
 *   - Idempotent: re-running `prisma db seed` against an existing DB must not
 *     duplicate rows. We use `upsert` keyed on the schema's natural unique
 *     constraints (email, taxId, (companyId, userId), …).
 *   - No NestJS runtime: this script is invoked by `prisma db seed`, which
 *     does not boot the app. We therefore inline the password-hash formula
 *     used by AuthService — `scrypt$<keylen>$<saltHex>$<hashHex>` — so the
 *     hash format stays a single source of truth.
 *   - No business logic / no permission overrides: SYSTEM_DEFAULTS already
 *     grant OWNER and FINANCEIRO everything they need for the smoke test.
 *     We seed exactly the rows that are required by FK constraints.
 *   - Stable IDs / values: emails, CNPJs, role choices are constants so
 *     reviewers and the smoke-test script can hard-code them.
 *
 * Out of scope (intentionally): workflows, stages, service-types, custom
 * fields, requests, proposals, clients. The smoke test only needs the
 * tenant-scoped GET /clients endpoint, which returns an empty list happily
 * when no clients exist. Anything more would be feature seeding, not auth
 * seeding.
 */

import { MembershipStatus, PrismaClient, Role } from '@prisma/client';
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
    password: string | Buffer,
    salt: string | Buffer,
    keylen: number,
) => Promise<Buffer>;

// Must mirror SCRYPT_PARAMS in apps/api/src/auth/auth.service.ts. Drift here
// would silently break login. If you change the parameters there, update
// here too — and write a re-hash migration.
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

async function hashPassword(plain: string): Promise<string> {
    const salt = randomBytes(SCRYPT_SALT_BYTES);
    const derived = await scrypt(plain, salt, SCRYPT_KEYLEN);
    return `scrypt$${SCRYPT_KEYLEN}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

// ─── Constants the smoke test depends on ────────────────────────────────────
// Read from SEED_USER_* env vars when present, falling back to the original
// hardcoded defaults so a fresh clone with no .env still seeds successfully.
// apps/api/scripts/smoke-auth.sh honours the same env vars with the same
// fallback semantics — keep the two in lockstep.
const SEED_USER = {
    email: process.env['SEED_USER_EMAIL'] ?? 'owner@orkestree.dev',
    password: process.env['SEED_USER_PASSWORD'] ?? 'orkestree-dev-password',
    firstName: process.env['SEED_USER_FIRST_NAME'] ?? 'Olivia',
    lastName: process.env['SEED_USER_LAST_NAME'] ?? 'Owner',
};

// CNPJs are syntactically valid 14-digit strings. We don't compute the
// check digits because the schema only enforces uniqueness, not validity.
// If a downstream module starts validating CNPJs, swap these for real ones.
const SEED_COMPANIES = [
    {
        legalName: 'Orkestree Studio LTDA',
        tradeName: 'Orkestree Studio',
        taxId: '00000000000001',
        financialEmail: 'finance+studio@orkestree.dev',
        role: Role.OWNER,
    },
    {
        legalName: 'Orkestree Atelier LTDA',
        tradeName: 'Orkestree Atelier',
        taxId: '00000000000002',
        financialEmail: 'finance+atelier@orkestree.dev',
        role: Role.FINANCEIRO,
    },
] as const;

// Shared placeholder address — companies with no fiscal address will
// 500 on later modules that read these columns. Filling them with stable
// dev values keeps the seed self-contained.
const PLACEHOLDER_ADDRESS = {
    addressStreet: 'Rua de Teste',
    addressNumber: '100',
    addressNeighborhood: 'Centro',
    addressCity: 'São Paulo',
    addressState: 'SP',
    addressPostalCode: '01000-000',
    addressCountry: 'BR',
} as const;

async function main(): Promise<void> {
    const prisma = new PrismaClient();
    try {
        const passwordHash = await hashPassword(SEED_USER.password);

        // 1) User — upsert by unique email. We DO NOT overwrite the
        //    passwordHash on update: a reviewer who already changed their
        //    seed password locally shouldn't have it silently reset.
        const user = await prisma.user.upsert({
            where: { email: SEED_USER.email },
            update: {
                firstName: SEED_USER.firstName,
                lastName: SEED_USER.lastName,
                isActive: true,
            },
            create: {
                email: SEED_USER.email,
                passwordHash,
                firstName: SEED_USER.firstName,
                lastName: SEED_USER.lastName,
                isActive: true,
            },
            select: { id: true, email: true, passwordHash: true },
        });

        // If the row pre-existed with a stale or non-scrypt hash, force-fix
        // it so the documented seed credentials always work after running
        // the seed. This is the only field we will overwrite.
        if (!user.passwordHash.startsWith('scrypt$')) {
            await prisma.user.update({
                where: { id: user.id },
                data: { passwordHash },
            });
            console.log(`  · re-hashed legacy password for ${user.email}`);
        }

        console.log(`✓ user        ${user.email}  (id=${user.id})`);

        // 2) Companies — upsert by unique taxId.
        // 3) Memberships — upsert by composite unique (companyId, userId).
        //    Status ACTIVE so memberships.controller surfaces them and the
        //    CompanyMemberGuard accepts them.
        for (const c of SEED_COMPANIES) {
            const company = await prisma.company.upsert({
                where: { taxId: c.taxId },
                update: {
                    legalName: c.legalName,
                    tradeName: c.tradeName,
                    isActive: true,
                },
                create: {
                    legalName: c.legalName,
                    tradeName: c.tradeName,
                    taxId: c.taxId,
                    financialEmail: c.financialEmail,
                    isActive: true,
                    ...PLACEHOLDER_ADDRESS,
                },
                select: { id: true, legalName: true, taxId: true },
            });

            const membership = await prisma.companyMembership.upsert({
                where: {
                    companyId_userId: {
                        companyId: company.id,
                        userId: user.id,
                    },
                },
                update: {
                    role: c.role,
                    status: MembershipStatus.ACTIVE,
                },
                create: {
                    companyId: company.id,
                    userId: user.id,
                    role: c.role,
                    status: MembershipStatus.ACTIVE,
                },
                select: { id: true, role: true },
            });

            console.log(
                `✓ company     ${company.legalName.padEnd(28)}  ` +
                    `(id=${company.id})  role=${membership.role}`,
            );
        }

        console.log('');
        console.log('Seed complete. Sign in with:');
        console.log(`  email    : ${SEED_USER.email}`);
        console.log(`  password : ${SEED_USER.password}`);
        console.log('');
        console.log(
            'GET /memberships/me will return 2 ACTIVE workspaces ' +
                '(OWNER on Studio, FINANCEIRO on Atelier).',
        );
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
