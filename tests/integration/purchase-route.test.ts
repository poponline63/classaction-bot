import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-purchase-route-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;
process.env.SINGLE_USER_EMAIL = 'purchase-route-test@example.com';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
let postPurchase: (req: Request) => Promise<Response>;

function requestFor(values: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.append(key, value);
  return new Request('http://localhost/api/setup/purchase', {
    method: 'POST',
    body: fd,
  });
}

async function clearDb() {
  await db.delete(schema.auditLog);
  await db.delete(schema.purchases);
  await db.delete(schema.jobs);
  await db.delete(schema.matches);
  await db.delete(schema.classAuthorizations);
  await db.delete(schema.settlements);
  await db.delete(schema.users);
}

beforeAll(async () => {
  const clientMod = await import('../../src/db/client');
  db = clientMod.db;
  schema = clientMod.schema;
  const routeMod = await import('../../src/app/api/setup/purchase/route');
  postPurchase = routeMod.POST;

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

describe('POST /api/setup/purchase', () => {
  it('saves an optional receipt reference for manual proof staging', async () => {
    const response = await postPurchase(requestFor({
      merchant: 'Example Co',
      productName: 'Example Product',
      category: 'CONSUMER_PRODUCT_PURCHASE',
      purchaseDate: '2026-05-25',
      amount: '12.34',
      receiptPath: 'receipts/example-product.pdf',
    }));

    expect(response.status).toBe(200);
    const rows = await db.select().from(schema.purchases);
    expect(rows).toHaveLength(1);
    expect(rows[0].receiptPath).toBe('receipts/example-product.pdf');

    const audit = await db.select().from(schema.auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      eventType: 'PURCHASE_ADDED',
      entityType: 'purchase',
      entityId: rows[0].id,
      actor: 'user',
    });
    expect(audit[0].payloadJson).toMatchObject({
      category: 'CONSUMER_PRODUCT_PURCHASE',
      productPresent: true,
      purchaseDate: '2026-05-25',
      amountPresent: true,
      receiptReferencePresent: true,
    });
    expect(JSON.stringify(audit[0].payloadJson)).not.toContain('Example Co');
    expect(JSON.stringify(audit[0].payloadJson)).not.toContain('Example Product');
  });

  it('rejects oversized receipt references', async () => {
    const response = await postPurchase(requestFor({
      merchant: 'Example Co',
      category: 'CONSUMER_PRODUCT_PURCHASE',
      purchaseDate: '2026-05-25',
      receiptPath: 'x'.repeat(501),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'receipt reference is too long' });
    expect(await db.select().from(schema.purchases)).toHaveLength(0);
  });
});
