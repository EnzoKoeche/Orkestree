import { Injectable } from '@nestjs/common';
import { AuditOperation, Prisma } from '@prisma/client';

export interface WriteAuditParams {
    companyId: string;
    actorId: string;
    operation: AuditOperation;
    entityType: string;
    entityId: string;
    entityCode?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ConfigAuditService
//
// Writes audit log entries WITHIN the same Prisma transaction as the
// configuration change. If the transaction rolls back, the audit entry
// disappears with it. This is the only model that guarantees consistency.
//
// Usage: inject into any service that writes config, pass the tx client.
//
// Example:
//   await this.prisma.$transaction(async (tx) => {
//     await tx.workflowStage.update({ ... });
//     await this.auditService.write(tx, { ... });
//   });
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ConfigAuditService {
    async write(
        tx: Prisma.TransactionClient,
        params: WriteAuditParams,
    ): Promise<void> {
        await tx.configAuditLog.create({
            data: {
                companyId: params.companyId,
                actorId: params.actorId,
                operation: params.operation,
                entityType: params.entityType,
                entityId: params.entityId,
                entityCode: params.entityCode,
                before: params.before as Prisma.InputJsonValue | undefined,
                after: params.after as Prisma.InputJsonValue | undefined,
            },
        });
    }
}
