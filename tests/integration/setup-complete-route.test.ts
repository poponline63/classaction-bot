import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { SETUP_SHADOW_REVIEW_ACK, TERMS_BOUNDARY_ACK } from '../../src/lib/claim-filer/request-boundary';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-setup-complete-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;
process.env.SINGLE_USER_EMAIL = 'setup-complete-route@example.com';
process.env.CLAIMBOT_FEATURE_SETTLEMENT_SEARCH = 'false';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
let postSetupComplete: (req: Request) => Promise<Response>;
let hasUserStartedSetupShadowReview: (userId: number) => Promise<boolean>;

function jsonRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/setup/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(async () => {
  const clientMod = await import('../../src/db/client');
  db = clientMod.db;
  schema = clientMod.schema;
  postSetupComplete = (await import('../../src/app/api/setup/complete/route')).POST;
  hasUserStartedSetupShadowReview = (await import('../../src/lib/setup-state')).hasUserStartedSetupShadowReview;

  const { migrate } = await import('drizzle-orm/libsql/migrator');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
});

beforeEach(async () => {
  await db.delete(schema.jobs);
  await db.delete(schema.auditLog);
  await db.delete(schema.claims);
  await db.delete(schema.matches);
  await db.delete(schema.classAuthorizations);
  await db.delete(schema.purchases);
  await db.delete(schema.profile);
  await db.delete(schema.settings);
  await db.delete(schema.users);
});

afterAll(() => {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore Windows file locks from libSQL during test shutdown
  }
});

describe('POST /api/setup/complete', () => {
  it('requires the setup shadow-review acknowledgement before starting automation', async () => {
    const response = await postSetupComplete(jsonRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: 'setup shadow-review acknowledgement required',
      requiredAck: SETUP_SHADOW_REVIEW_ACK,
    });
    expect(await db.select().from(schema.settings)).toHaveLength(0);
  });

  it('requires the terms boundary acknowledgement before starting automation', async () => {
    const response = await postSetupComplete(jsonRequest({
      setupShadowReviewAck: SETUP_SHADOW_REVIEW_ACK,
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: 'terms boundary acknowledgement required',
      requiredAck: TERMS_BOUNDARY_ACK,
    });
    expect(await db.select().from(schema.settings)).toHaveLength(0);
    expect(await db.select().from(schema.auditLog)).toHaveLength(0);
  });

  it('accepts the acknowledgement and marks setup complete', async () => {
    const response = await postSetupComplete(jsonRequest({
      setupShadowReviewAck: SETUP_SHADOW_REVIEW_ACK,
      termsBoundaryAck: TERMS_BOUNDARY_ACK,
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, discoverySkipped: true });
    expect(body.planGate).toMatchObject({
      automationEnabled: false,
      plan: 'free',
      status: 'inactive',
    });

    // The route starts the match/queue pipeline in the background; the setting is
    // written synchronously and proves the server accepted the guarded launch.
    await wait(50);
    const settings = await db.select().from(schema.settings);
    expect(settings).toContainEqual(expect.objectContaining({
      key: 'setup_completed',
      value: 'true',
    }));

    const audit = await db.select().from(schema.auditLog);
    const termsAudit = audit.find((event: { eventType: string }) => event.eventType === 'USER_TERMS_ACKNOWLEDGED');
    const setupAudit = audit.find((event: { eventType: string }) => event.eventType === 'SETUP_SHADOW_REVIEW_STARTED');
    expect(termsAudit).toMatchObject({
      eventType: 'USER_TERMS_ACKNOWLEDGED',
      entityType: 'system',
      actor: 'user',
    });
    expect(termsAudit.payloadJson).toMatchObject({
      requiredAck: TERMS_BOUNDARY_ACK,
      termsVersion: 'claimbot-terms-v1',
    });
    expect(setupAudit).toMatchObject({
      eventType: 'SETUP_SHADOW_REVIEW_STARTED',
      entityType: 'system',
      actor: 'user',
    });
    expect(setupAudit.payloadJson).toMatchObject({
      requiredAck: SETUP_SHADOW_REVIEW_ACK,
      termsBoundaryAck: TERMS_BOUNDARY_ACK,
      discoverySkipped: true,
      settlementSearchEnabled: false,
      liveFilingEnabled: false,
      planGate: {
        automationEnabled: false,
        plan: 'free',
        status: 'inactive',
      },
    });
    expect(setupAudit.payloadJson.boundary).toContain('shadow-mode review only');
    expect(setupAudit.payloadJson.planGate.boundary).toContain('5 guarded filings per month');
    await expect(hasUserStartedSetupShadowReview(setupAudit.userId)).resolves.toBe(true);
    await expect(hasUserStartedSetupShadowReview(setupAudit.userId + 1)).resolves.toBe(false);
  });
});
