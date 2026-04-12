// Append-only audit log. Intentionally exposes only insert + read.
// No update(), no delete(). If you need to "correct" a prior event, emit a
// new SETTLEMENT_UPDATED / MATCH_VERDICT_CHANGED event instead.

import { db, schema } from '@db/client';
import type { AuditEventType } from '@db/schema';
import { desc, eq, and } from 'drizzle-orm';

export type AuditActor = 'scraper' | 'matcher' | 'filer' | 'user' | 'system';
export type AuditEntityType =
  | 'settlement'
  | 'claim'
  | 'match'
  | 'authorization'
  | 'job'
  | 'system';

export interface WriteAuditArgs {
  userId: number;
  eventType: AuditEventType;
  entityType: AuditEntityType;
  entityId: number;
  payload: unknown;
  actor: AuditActor;
}

export async function writeAudit(args: WriteAuditArgs): Promise<void> {
  await db
    .insert(schema.auditLog)
    .values({
      userId: args.userId,
      eventType: args.eventType,
      entityType: args.entityType,
      entityId: args.entityId,
      payloadJson: args.payload,
      actor: args.actor,
    });
}

export async function readRecentAudit(userId: number, limit = 100) {
  return db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.userId, userId))
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(limit);
}

export async function readAuditForEntity(
  userId: number,
  entityType: AuditEntityType,
  entityId: number,
) {
  return db
    .select()
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.userId, userId),
        eq(schema.auditLog.entityType, entityType),
        eq(schema.auditLog.entityId, entityId),
      ),
    )
    .orderBy(desc(schema.auditLog.occurredAt));
}
