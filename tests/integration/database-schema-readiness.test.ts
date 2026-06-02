import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-schema-readiness-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;

let getDatabaseSchemaReadiness: typeof import('../../src/lib/database-schema-readiness').getDatabaseSchemaReadiness;

beforeAll(async () => {
  const clientMod = await import('../../src/db/client');
  getDatabaseSchemaReadiness = (await import('../../src/lib/database-schema-readiness')).getDatabaseSchemaReadiness;

  const { migrate } = await import('drizzle-orm/libsql/migrator');
  await migrate(clientMod.db, { migrationsFolder: './drizzle/migrations' });
});

afterAll(() => {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('database schema readiness', () => {
  it('proves hosted identity, subscription, and billing schema probes pass after migrations', async () => {
    const readiness = await getDatabaseSchemaReadiness();

    expect(readiness.ok).toBe(true);
    expect(readiness.failures).toEqual([]);
    expect(readiness.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'identity-subject-column', status: 'pass' }),
      expect.objectContaining({ key: 'subscription-entitlement-columns', status: 'pass' }),
      expect.objectContaining({ key: 'billing-event-ledger', status: 'pass' }),
    ]));
  });
});
