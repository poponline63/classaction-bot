import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { eq } from 'drizzle-orm';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-current-user-identity-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
let ensureUserForEmail: typeof import('../../src/db/seed').ensureUserForEmail;
let ensureUserForIdentity: typeof import('../../src/db/seed').ensureUserForIdentity;
let fallbackEmailForIdentitySubject: typeof import('../../src/db/seed').fallbackEmailForIdentitySubject;

async function clearDb() {
  await db.delete(schema.auditLog);
  await db.delete(schema.users);
}

beforeAll(async () => {
  const clientMod = await import('../../src/db/client');
  db = clientMod.db;
  schema = clientMod.schema;
  const seed = await import('../../src/db/seed');
  ensureUserForEmail = seed.ensureUserForEmail;
  ensureUserForIdentity = seed.ensureUserForIdentity;
  fallbackEmailForIdentitySubject = seed.fallbackEmailForIdentitySubject;

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

describe('hosted identity user resolution', () => {
  it('creates hosted users with a stable external subject and normalized contact email', async () => {
    const userId = await ensureUserForIdentity(' netlify-user-1 ', ' Client@Example.COM ', 'Client');

    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      id: userId,
      externalSubject: 'netlify-user-1',
      email: 'client@example.com',
      displayName: 'Client',
    });
  });

  it('keeps the same user when the identity provider email changes', async () => {
    const firstId = await ensureUserForIdentity('netlify-user-2', 'first@example.com');
    const secondId = await ensureUserForIdentity('netlify-user-2', 'second@example.com');

    expect(secondId).toBe(firstId);
    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      id: firstId,
      externalSubject: 'netlify-user-2',
      email: 'second@example.com',
    });
  });

  it('links an existing billing-created user to the hosted identity subject', async () => {
    const billingUserId = await ensureUserForEmail('billing-link@example.com', 'Billing Link');
    const hostedUserId = await ensureUserForIdentity('netlify-billing-link', 'BILLING-LINK@example.com');

    expect(hostedUserId).toBe(billingUserId);
    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      id: billingUserId,
      externalSubject: 'netlify-billing-link',
      email: 'billing-link@example.com',
    });
  });

  it('uses a valid synthetic email when the provider omits email', async () => {
    const subject = 'netlify-user-no-email';
    const userId = await ensureUserForIdentity(subject);
    const fallbackEmail = fallbackEmailForIdentitySubject(subject);

    const users = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    expect(users[0]).toMatchObject({
      externalSubject: subject,
      email: fallbackEmail,
      displayName: 'Identity user',
    });
    expect(fallbackEmail).toMatch(/^identity\+[a-f0-9]{24}@claimbot\.local$/);
  });
});
