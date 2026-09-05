import { randomUUID } from "node:crypto";
import type { Database } from "../db/client.js";
import { platformAuditLog } from "../db/schema.js";

export interface AuditEntry {
  platformAdminUserId: string;
  action: string;
  targetAccountId: string;
  targetStoreId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * The single place a platform_admin action becomes an audit row. Called
 * from inside the same mutation that performs the change, before
 * returning — an action whose audit write fails should fail the whole
 * mutation rather than silently going unlogged.
 */
export async function writeAuditLog(db: Database, entry: AuditEntry): Promise<void> {
  await db.insert(platformAuditLog).values({
    id: randomUUID(),
    platformAdminUserId: entry.platformAdminUserId,
    action: entry.action,
    targetAccountId: entry.targetAccountId,
    targetStoreId: entry.targetStoreId ?? null,
    metadata: entry.metadata ?? null,
  });
}
