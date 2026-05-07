import type { ConfigAuditService } from '../../src/company-config/audit/config-audit.service';

// ─────────────────────────────────────────────────────────────────────────────
// ConfigAuditService stub.
//
// Services under test write to audit inside the same tx as their lifecycle
// mutation. Tests verify the audit was called with the right shape rather
// than the persisted side effect (which is Prisma's job and we mock that).
// ─────────────────────────────────────────────────────────────────────────────

export function createMockAudit(): jest.Mocked<Pick<ConfigAuditService, 'write'>> {
    return {
        write: jest.fn().mockResolvedValue(undefined),
    };
}
