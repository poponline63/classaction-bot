import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { NextRequest } from 'next/server';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-billing-checkout-route-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;
process.env.SINGLE_USER_EMAIL = 'billing-checkout-route@example.com';
process.env.CLAIMBOT_BILLING_PRO_MONTHLY_URL = 'https://checkout.example.com/pro';
process.env.CLAIMBOT_LEGAL_REVIEW_ACK = 'reviewed';
process.env.CLAIMBOT_WORKER_RUNTIME = 'scheduled-worker';
process.env.CLAIMBOT_WORKER_RUNTIME_RECEIPT = 'verified';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
let GET: typeof import('../../src/app/api/billing/checkout/route').GET;

beforeAll(async () => {
  const clientMod = await import('../../src/db/client');
  db = clientMod.db;
  schema = clientMod.schema;
  GET = (await import('../../src/app/api/billing/checkout/route')).GET;

  const { migrate } = await import('drizzle-orm/libsql/migrator');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
});

afterAll(() => {
  delete process.env.CLAIMBOT_BILLING_PRO_MONTHLY_URL;
  delete process.env.CLAIMBOT_BILLING_SYNC_SECRET;
  delete process.env.CLAIMBOT_BETA_NO_BILLING;
  delete process.env.CLAIMBOT_LEGAL_REVIEW_ACK;
  delete process.env.CLAIMBOT_WORKER_RUNTIME;
  delete process.env.CLAIMBOT_WORKER_RUNTIME_RECEIPT;
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('/api/billing/checkout', () => {
  it('audits an authenticated checkout handoff before redirecting to the processor-hosted checkout', async () => {
    process.env.CLAIMBOT_BILLING_SYNC_SECRET = 'a-long-random-billing-sync-secret-for-tests';
    const request = new NextRequest('http://localhost:3100/api/billing/checkout?plan=pro_monthly');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();

    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('billing-checkout-route@example.com');
    const redirectUrl = new URL(location!);
    expect(redirectUrl.origin + redirectUrl.pathname).toBe('https://checkout.example.com/pro');
    expect(redirectUrl.searchParams.get('clientReferenceId')).toBe(`claimbot_user_${users[0].id}`);
    expect(redirectUrl.searchParams.get('client_reference_id')).toBe(`claimbot_user_${users[0].id}`);
    expect(redirectUrl.searchParams.get('claimbotUserId')).toBe(String(users[0].id));

    const auditRows = await db.select().from(schema.auditLog);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      userId: users[0].id,
      eventType: 'BILLING_CHECKOUT_STARTED',
      entityType: 'user',
      entityId: users[0].id,
      actor: 'user',
    });
    expect(auditRows[0].payloadJson).toMatchObject({
      plan: 'pro_monthly',
      tier: 'Pro',
      envKey: 'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
      configured: true,
      processorHostedRedirect: true,
      checkoutBlockReason: null,
      signedEntitlementSyncReady: true,
      paidAutomationWorkerVerified: true,
      clientReferenceId: `claimbot_user_${users[0].id}`,
      claimbotUserReferencePresent: true,
    });
    expect(JSON.stringify(auditRows[0].payloadJson)).not.toContain('checkout.example.com/pro');
  });

  it('routes configured checkout links to billing support until signed entitlement sync is configured', async () => {
    delete process.env.CLAIMBOT_BILLING_SYNC_SECRET;
    const request = new NextRequest('http://localhost:3100/api/billing/checkout?plan=pro_monthly');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location!);
    expect(redirectUrl.pathname).toBe('/contact');
    expect(redirectUrl.searchParams.get('topic')).toBe('billing');
    expect(redirectUrl.searchParams.get('plan')).toBe('pro_monthly');
    expect(redirectUrl.searchParams.get('reason')).toBe('signed-sync-not-configured');

    const auditRows = await db.select().from(schema.auditLog);
    const latest = auditRows[auditRows.length - 1];
    expect(latest?.payloadJson).toMatchObject({
      plan: 'pro_monthly',
      configured: true,
      processorHostedRedirect: false,
      checkoutBlockReason: 'signed-sync-not-configured',
      signedEntitlementSyncReady: false,
      paidAutomationWorkerVerified: true,
    });
  });

  it('routes beta no-billing checkout attempts to support instead of payment', async () => {
    process.env.CLAIMBOT_BETA_NO_BILLING = 'true';
    process.env.CLAIMBOT_BILLING_SYNC_SECRET = 'a-long-random-billing-sync-secret-for-tests';
    process.env.CLAIMBOT_LEGAL_REVIEW_ACK = 'reviewed';
    process.env.CLAIMBOT_WORKER_RUNTIME_RECEIPT = 'verified';
    const request = new NextRequest('http://localhost:3100/api/billing/checkout?plan=pro_monthly');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location!);
    expect(redirectUrl.pathname).toBe('/contact');
    expect(redirectUrl.searchParams.get('topic')).toBe('billing');
    expect(redirectUrl.searchParams.get('plan')).toBe('pro_monthly');
    expect(redirectUrl.searchParams.get('reason')).toBe('beta-no-billing');

    const auditRows = await db.select().from(schema.auditLog);
    const latest = auditRows[auditRows.length - 1];
    expect(latest?.payloadJson).toMatchObject({
      plan: 'pro_monthly',
      configured: true,
      processorHostedRedirect: false,
      checkoutBlockReason: 'beta-no-billing',
      signedEntitlementSyncReady: true,
    });

    delete process.env.CLAIMBOT_BETA_NO_BILLING;
  });

  it('routes configured paid checkout to billing support until legal review is recorded', async () => {
    process.env.CLAIMBOT_BILLING_SYNC_SECRET = 'a-long-random-billing-sync-secret-for-tests';
    delete process.env.CLAIMBOT_LEGAL_REVIEW_ACK;
    const request = new NextRequest('http://localhost:3100/api/billing/checkout?plan=pro_monthly');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location!);
    expect(redirectUrl.pathname).toBe('/contact');
    expect(redirectUrl.searchParams.get('topic')).toBe('billing');
    expect(redirectUrl.searchParams.get('plan')).toBe('pro_monthly');
    expect(redirectUrl.searchParams.get('reason')).toBe('legal-review-not-recorded');

    const auditRows = await db.select().from(schema.auditLog);
    const latest = auditRows[auditRows.length - 1];
    expect(latest?.payloadJson).toMatchObject({
      plan: 'pro_monthly',
      configured: true,
      processorHostedRedirect: false,
      checkoutBlockReason: 'legal-review-not-recorded',
      signedEntitlementSyncReady: true,
    });

    process.env.CLAIMBOT_LEGAL_REVIEW_ACK = 'reviewed';
  });

  it('routes Pro checkout to billing support until worker runtime proof is verified', async () => {
    process.env.CLAIMBOT_BILLING_SYNC_SECRET = 'a-long-random-billing-sync-secret-for-tests';
    process.env.CLAIMBOT_LEGAL_REVIEW_ACK = 'reviewed';
    delete process.env.CLAIMBOT_WORKER_RUNTIME_RECEIPT;
    const request = new NextRequest('http://localhost:3100/api/billing/checkout?plan=pro_monthly');
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location!);
    expect(redirectUrl.pathname).toBe('/contact');
    expect(redirectUrl.searchParams.get('topic')).toBe('billing');
    expect(redirectUrl.searchParams.get('plan')).toBe('pro_monthly');
    expect(redirectUrl.searchParams.get('reason')).toBe('worker-runtime-not-verified');

    const auditRows = await db.select().from(schema.auditLog);
    const latest = auditRows[auditRows.length - 1];
    expect(latest?.payloadJson).toMatchObject({
      plan: 'pro_monthly',
      configured: true,
      processorHostedRedirect: false,
      checkoutBlockReason: 'worker-runtime-not-verified',
      signedEntitlementSyncReady: true,
      paidAutomationWorkerVerified: false,
    });

    process.env.CLAIMBOT_WORKER_RUNTIME_RECEIPT = 'verified';
  });
});
