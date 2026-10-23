import type { Prisma } from '@prisma/client';

export interface AuditInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  correlationId?: string;
}

/** Writes one audit row. Pass the transaction client of the change it describes. */
export function recordAudit(tx: Prisma.TransactionClient, entry: AuditInput) {
  return tx.auditEntry.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      correlationId: entry.correlationId ?? null,
    },
  });
}