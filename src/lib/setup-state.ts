import { and, eq } from 'drizzle-orm';
import { db, schema } from '@db/client';

export async function hasUserStartedSetupShadowReview(userId: number) {
  const rows = await db
    .select({ id: schema.auditLog.id })
    .from(schema.auditLog)
    .where(and(
      eq(schema.auditLog.userId, userId),
      eq(schema.auditLog.eventType, 'SETUP_SHADOW_REVIEW_STARTED'),
    ))
    .limit(1);

  return rows.length > 0;
}
