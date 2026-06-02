import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-setup-intake-audit-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;
process.env.SINGLE_USER_EMAIL = 'setup-intake-audit@example.com';
process.env.CLAIMBOT_FEATURE_BREACH_IMPORT = 'true';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
let postProfile: (req: Request) => Promise<Response>;
let postBreach: (req: Request) => Promise<Response>;

function requestFor(url: string, values: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.append(key, value);
  return new Request(url, {
    method: 'POST',
    body: fd,
  });
}

async function clearDb() {
  await db.delete(schema.auditLog);
  await db.delete(schema.dataBreachExposure);
  await db.delete(schema.profile);
  await db.delete(schema.jobs);
  await db.delete(schema.matches);
  await db.delete(schema.classAuthorizations);
  await db.delete(schema.settlements);
}

beforeAll(async () => {
  const clientMod = await import('../../src/db/client');
  db = clientMod.db;
  schema = clientMod.schema;
  postProfile = (await import('../../src/app/api/setup/profile/route')).POST;
  postBreach = (await import('../../src/app/api/setup/breach/route')).POST;

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

describe('setup intake audit events', () => {
  it('audits profile updates with counts and digests instead of raw profile facts', async () => {
    const response = await postProfile(requestFor('http://localhost/api/setup/profile', {
      legalName: 'Jane Example',
      dateOfBirth: '1990-01-02',
      emails: 'jane@example.com',
      phones: '555-123-4567',
      addressesJson: JSON.stringify([{ street: '123 Main St', city: 'Phoenix', state: 'AZ', zip: '85001', country: 'US' }]),
    }));

    expect(response.status).toBe(200);
    const profiles = await db.select().from(schema.profile);
    expect(profiles).toHaveLength(1);

    const audit = await db.select().from(schema.auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      eventType: 'PROFILE_UPDATED',
      entityType: 'profile',
      entityId: profiles[0].id,
      actor: 'user',
    });
    expect(audit[0].payloadJson).toMatchObject({
      operation: 'created',
      hasLegalName: true,
      hasDateOfBirth: true,
      emailCount: 1,
      phoneCount: 1,
      addressCount: 1,
    });
    const serialized = JSON.stringify(audit[0].payloadJson);
    expect(serialized).not.toContain('Jane Example');
    expect(serialized).not.toContain('jane@example.com');
    expect(serialized).not.toContain('123 Main St');
  });

  it('audits breach evidence intake with digests instead of raw exposure facts', async () => {
    const response = await postBreach(requestFor('http://localhost/api/setup/breach', {
      breachName: 'Example Breach',
      email: 'breached@example.com',
      breachDate: '2026-05-25',
    }));

    expect(response.status).toBe(200);
    const breaches = await db.select().from(schema.dataBreachExposure);
    expect(breaches).toHaveLength(1);

    const audit = await db.select().from(schema.auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      eventType: 'BREACH_ADDED',
      entityType: 'breach',
      entityId: breaches[0].id,
      actor: 'user',
    });
    expect(audit[0].payloadJson).toMatchObject({
      breachDatePresent: true,
      source: 'manual',
    });
    const serialized = JSON.stringify(audit[0].payloadJson);
    expect(serialized).not.toContain('Example Breach');
    expect(serialized).not.toContain('breached@example.com');
  });
});
