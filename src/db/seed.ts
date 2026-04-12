// Seed the single MVP user. Idempotent.
import { db, schema } from './client';
import { eq } from 'drizzle-orm';

let cachedUserId: number | null = null;

export async function ensureSingleUser(): Promise<number> {
  if (cachedUserId != null) return cachedUserId;
  const email = process.env.SINGLE_USER_EMAIL ?? 'you@example.com';
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (existing.length > 0) {
    cachedUserId = existing[0]!.id;
    return cachedUserId;
  }
  const inserted = await db
    .insert(schema.users)
    .values({ email, displayName: 'MVP User' })
    .returning();
  cachedUserId = inserted[0]!.id;
  return cachedUserId;
}
