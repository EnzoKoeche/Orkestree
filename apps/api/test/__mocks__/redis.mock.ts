import type Redis from 'ioredis';

// ─────────────────────────────────────────────────────────────────────────────
// Redis (ioredis) mock factory.
//
// PermissionResolverService and any future cache-aware service uses
// `@InjectRedis()` + `Redis` from ioredis. The methods we currently exercise
// in tests:
//   - get(key)                 → cache lookup (returns string or null)
//   - setex(key, ttl, value)   → cache write with TTL
//   - scan(cursor, ...)        → invalidation (cursor + matching keys)
//   - del(...keys)             → invalidation delete
//
// Default mocks: `get` returns null (cache miss), others are no-op
// successes. Specs override per-call as needed.
// ─────────────────────────────────────────────────────────────────────────────

export type MockedRedis = jest.Mocked<
    Pick<Redis, 'get' | 'setex' | 'scan' | 'del'>
>;

export function createMockRedis(): MockedRedis {
    return {
        get: jest.fn().mockResolvedValue(null),
        setex: jest.fn().mockResolvedValue('OK'),
        // scan returns [nextCursor, keys[]] — default: empty result, cursor 0
        // (single-iteration with no matches).
        scan: jest.fn().mockResolvedValue(['0', []]),
        del: jest.fn().mockResolvedValue(0),
    } as unknown as MockedRedis;
}
