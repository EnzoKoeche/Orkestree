import type { Config } from 'jest';

// ─────────────────────────────────────────────────────────────────────────────
// Jest configuration — apps/api
//
// V1 strategy: unit tests with Prisma mocked manually (factories live under
// test/__mocks__/). NOT integration tests against a real DB. Trade-off:
// ~70% confidence on the paths that have business logic; raw SQL paths
// (advisory locks, FOR UPDATE, composite FKs) won't be exercised here —
// they're exercised by the manual smoke flow already.
//
// ts-jest@29.x supports jest@30 (peer ^29.0.0 || ^30.0.0). Preset wires
// TypeScript compilation transparently; no custom transform needed.
//
// Coverage thresholds intentionally not set in V1: the spec set is small,
// arbitrary minimums would either fail CI noisily or be cargo-culted low.
// Re-evaluate when the suite grows past ~50 specs.
// ─────────────────────────────────────────────────────────────────────────────

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: '.',
    testRegex: '.*\\.spec\\.ts$',
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    moduleNameMapper: {
        // Mirrors apps/api/tsconfig.json paths config so specs can import
        // from `@/foo` if they want; existing src/ uses relative imports.
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/main.ts',
        '!src/**/*.module.ts',
        '!src/**/*.dto.ts',
        '!src/**/index.ts',
    ],
    coverageDirectory: 'coverage',
    // Discover specs under both src/ (colocated unit tests) and test/
    // (integration / e2e if those land later).
    roots: ['<rootDir>/src', '<rootDir>/test'],
};

export default config;
