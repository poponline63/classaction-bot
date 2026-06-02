// Seed the local development user. Idempotent.
import { db, schema } from './client';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';

let cachedUserId: number | null = null;
const cachedUserIdsByEmail = new Map<string, number>();

function normalizeEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase() ?? '';
  return normalized.includes('@') ? normalized : '';
}

function normalizeSubject(subject: string) {
  return subject.trim();
}

export function fallbackEmailForIdentitySubject(subject: string) {
  const normalizedSubject = normalizeSubject(subject);
  const digest = createHash('sha256').update(normalizedSubject).digest('hex').slice(0, 24);
  return `identity+${digest}@claimbot.local`;
}

export async function ensureSingleUser(): Promise<number> {
  if (cachedUserId != null) return cachedUserId;
  const email = process.env.SINGLE_USER_EMAIL ?? 'you@example.com';
  cachedUserId = await ensureUserForEmail(email, 'Local Dev User');
  return cachedUserId;
}

export async function ensureUserForEmail(email: string, displayName = email): Promise<number> {
  const normalizedEmail = email.trim().toLowerCase();
  const cached = cachedUserIdsByEmail.get(normalizedEmail);
  if (cached != null) return cached;

  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);
  if (existing.length > 0) {
    cachedUserIdsByEmail.set(normalizedEmail, existing[0]!.id);
    return existing[0]!.id;
  }
  const inserted = await db
    .insert(schema.users)
    .values({ email: normalizedEmail, displayName })
    .returning();
  cachedUserIdsByEmail.set(normalizedEmail, inserted[0]!.id);
  return inserted[0]!.id;
}

export async function ensureUserForIdentity(
  subject: string,
  email?: string | null,
  displayName?: string | null,
): Promise<number> {
  const externalSubject = normalizeSubject(subject);
  if (!externalSubject) {
    throw new Error('Hosted identity subject is required.');
  }

  const normalizedEmail = normalizeEmail(email);
  const preferredEmail = normalizedEmail || fallbackEmailForIdentitySubject(externalSubject);
  const preferredDisplayName = displayName?.trim() || normalizedEmail || 'Identity user';

  const userId = await db.transaction(async (tx) => {
    const bySubject = await tx
      .select()
      .from(schema.users)
      .where(eq(schema.users.externalSubject, externalSubject))
      .limit(1);

    if (bySubject.length > 0) {
      const user = bySubject[0]!;
      const update: Partial<typeof schema.users.$inferInsert> = {
        displayName: preferredDisplayName,
      };

      if (normalizedEmail && user.email !== normalizedEmail) {
        const emailOwner = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.email, normalizedEmail))
          .limit(1);

        if (!emailOwner[0] || emailOwner[0].id === user.id) {
          update.email = normalizedEmail;
        }
      }

      await tx.update(schema.users).set(update).where(eq(schema.users.id, user.id));
      return user.id;
    }

    if (normalizedEmail) {
      const byEmail = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, normalizedEmail))
        .limit(1);

      if (byEmail.length > 0) {
        const user = byEmail[0]!;
        await tx
          .update(schema.users)
          .set({
            externalSubject,
            displayName: preferredDisplayName,
          })
          .where(eq(schema.users.id, user.id));
        return user.id;
      }
    }

    const inserted = await tx
      .insert(schema.users)
      .values({
        email: preferredEmail,
        externalSubject,
        displayName: preferredDisplayName,
      })
      .returning({ id: schema.users.id });
    return inserted[0]!.id;
  });

  cachedUserIdsByEmail.set(preferredEmail, userId);
  return userId;
}
