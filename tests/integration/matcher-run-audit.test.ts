import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-matcher-audit-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;
process.env.SINGLE_USER_EMAIL = 'matcher-audit-test@example.com';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
let runMatcher: (userId: number) => Promise<{
  settlementsProcessed: number;
  matchesInserted: number;
  matchesUpdated: number;
  verdictsChanged: number;
}>;

async function clearDb() {
  await db.delete(schema.auditLog);
  await db.delete(schema.matches);
  await db.delete(schema.classAuthorizations);
  await db.delete(schema.purchases);
  await db.delete(schema.profile);
  await db.delete(schema.settlements);
  await db.delete(schema.users);
}

async function seedMatcherUser() {
  const users = await db
    .insert(schema.users)
    .values({
      email: 'matcher-audit-test@example.com',
      displayName: 'Matcher Audit Test',
    })
    .returning();
  const userId = users[0].id;

  await db.insert(schema.profile).values({
    userId,
    legalName: 'Matcher Audit User',
    emailsJson: ['matcher-audit-test@example.com'],
    phonesJson: [],
    addressesJson: [],
  });

  await db.insert(schema.settlements).values({
    canonicalKey: `matcher-audit-${Date.now()}-${Math.random()}`,
    source: 'manual',
    sourceUrl: 'https://example.com/matcher-audit',
    caseName: 'Matcher Audit Settlement',
    defendant: 'Matcher Audit Co',
    defendantAliases: [],
    category: 'CONSUMER_PRODUCT_PURCHASE',
    classDefinition: 'All eligible customers.',
    proofRequired: false,
    claimFormUrl: 'https://example.com/claim',
    administrator: 'unknown',
  });

  return userId;
}

beforeAll(async () => {
  const clientMod = await import('../../src/db/client');
  db = clientMod.db;
  schema = clientMod.schema;
  const matcherMod = await import('../../src/lib/matcher/run-matcher');
  runMatcher = matcherMod.runMatcher;

  const { migrate } = await import('drizzle-orm/libsql/migrator');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
});

beforeEach(async () => {
  await clearDb();
});

afterAll(() => {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('runMatcher audit receipt', () => {
  it('writes a completion audit receipt even when no verdict changes', async () => {
    const userId = await seedMatcherUser();

    const firstRun = await runMatcher(userId);
    const secondRun = await runMatcher(userId);

    expect(firstRun.settlementsProcessed).toBe(1);
    expect(firstRun.matchesInserted).toBe(1);
    expect(secondRun.settlementsProcessed).toBe(1);
    expect(secondRun.matchesUpdated).toBe(1);
    expect(secondRun.verdictsChanged).toBe(0);

    const events = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.userId, userId));

    const receipts = events.filter((event: { eventType: string }) => event.eventType === 'MATCHER_RUN_COMPLETED');
    expect(receipts).toHaveLength(2);
    expect(receipts[1].payloadJson).toMatchObject({
      settlementsProcessed: 1,
      matchesUpdated: 1,
      verdictsChanged: 0,
      errorCount: 0,
    });
  });
});
