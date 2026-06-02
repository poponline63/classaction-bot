import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { eq } from 'drizzle-orm';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-auth-route-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;
process.env.SINGLE_USER_EMAIL = 'authorization-route-test@example.com';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
let postAuthorization: (req: Request) => Promise<Response>;

function requestFor(values: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.append(key, value);
  return new Request('http://localhost/api/setup/authorization', {
    method: 'POST',
    body: fd,
  });
}

async function readAuth() {
  const rows = await db
    .select()
    .from(schema.classAuthorizations)
    .where(eq(schema.classAuthorizations.category, 'CONSUMER_PRODUCT_PURCHASE'))
    .limit(1);
  return rows[0] ?? null;
}

async function auditCount() {
  const rows = await db.select().from(schema.auditLog);
  return rows.length;
}

beforeAll(async () => {
  const clientMod = await import('../../src/db/client');
  db = clientMod.db;
  schema = clientMod.schema;
  const routeMod = await import('../../src/app/api/setup/authorization/route');
  postAuthorization = routeMod.POST;

  const { migrate } = await import('drizzle-orm/libsql/migrator');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
});

beforeEach(async () => {
  await db.delete(schema.auditLog);
  await db.delete(schema.classAuthorizations);
});

afterAll(() => {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('POST /api/setup/authorization', () => {
  it('enables and then revokes an existing category authorization', async () => {
    const enableResponse = await postAuthorization(requestFor({
      category: 'CONSUMER_PRODUCT_PURCHASE',
      enabled: 'on',
      manualConsent: 'on',
      attestationText: 'I certify under penalty of perjury that this category is supported.',
    }));
    expect(enableResponse.status).toBe(200);

    const enabled = await readAuth();
    expect(enabled.enabled).toBe(true);
    expect(enabled.revokedAt).toBeNull();
    expect(await auditCount()).toBe(1);

    const revokeResponse = await postAuthorization(requestFor({
      category: 'CONSUMER_PRODUCT_PURCHASE',
      attestationText: '',
    }));
    expect(revokeResponse.status).toBe(200);

    const revoked = await readAuth();
    expect(revoked.enabled).toBe(false);
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    expect(await auditCount()).toBe(2);
  });

  it('does not create duplicate audit noise when disabling an already blocked authorization', async () => {
    await postAuthorization(requestFor({
      category: 'CONSUMER_PRODUCT_PURCHASE',
      enabled: 'on',
      manualConsent: 'on',
      attestationText: 'I certify under penalty of perjury that this category is supported.',
    }));
    await postAuthorization(requestFor({
      category: 'CONSUMER_PRODUCT_PURCHASE',
      attestationText: '',
    }));
    const auditAfterRevoke = await auditCount();

    const duplicateRevokeResponse = await postAuthorization(requestFor({
      category: 'CONSUMER_PRODUCT_PURCHASE',
      attestationText: '',
    }));
    expect(duplicateRevokeResponse.status).toBe(200);
    await expect(duplicateRevokeResponse.json()).resolves.toMatchObject({ skipped: true });

    const stillRevoked = await readAuth();
    expect(stillRevoked.enabled).toBe(false);
    expect(await auditCount()).toBe(auditAfterRevoke);
  });

  it('does not create a disabled row when revoking a category that was never authorized', async () => {
    const response = await postAuthorization(requestFor({
      category: 'CONSUMER_PRODUCT_PURCHASE',
      attestationText: '',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ skipped: true });
    expect(await readAuth()).toBeNull();
    expect(await auditCount()).toBe(0);
  });
});
