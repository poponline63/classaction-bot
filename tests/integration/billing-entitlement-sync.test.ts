import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-billing-sync-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;
delete process.env.CLAIMBOT_DEV_SUBSCRIPTION_PLAN;
delete process.env.CLAIMBOT_DEV_SUBSCRIPTION_STATUS;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
let syncBillingEntitlement: typeof import('../../src/lib/billing/entitlement-sync').syncBillingEntitlement;

async function clearDb() {
  await db.delete(schema.billingEvents);
  await db.delete(schema.auditLog);
  await db.delete(schema.users);
}

beforeAll(async () => {
  const clientMod = await import('../../src/db/client');
  db = clientMod.db;
  schema = clientMod.schema;
  syncBillingEntitlement = (await import('../../src/lib/billing/entitlement-sync')).syncBillingEntitlement;

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

describe('syncBillingEntitlement', () => {
  it('creates or updates a user subscription from a signed billing event payload', async () => {
    const result = await syncBillingEntitlement({
      email: 'PaidUser@example.com',
      displayName: 'Paid User',
      plan: 'pro',
      status: 'active',
      processor: 'stripe',
      eventId: 'evt_paid',
      externalCustomerId: 'cus_123',
      externalSubscriptionId: 'sub_123',
    });

    expect(result).toMatchObject({
      ok: true,
      email: 'paiduser@example.com',
      plan: 'pro',
      status: 'active',
      duplicate: false,
      eventId: 'evt_paid',
    });

    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('paiduser@example.com');
    expect(users[0].subscriptionPlan).toBe('pro');
    expect(users[0].subscriptionStatus).toBe('active');
    expect(users[0].subscriptionUpdatedAt).toBeInstanceOf(Date);

    const events = await db.select().from(schema.auditLog);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('BILLING_ENTITLEMENT_SYNCED');
    expect(events[0].payloadJson).toMatchObject({
      plan: 'pro',
      status: 'active',
      processor: 'stripe',
      eventId: 'evt_paid',
      duplicate: false,
      externalCustomerIdPresent: true,
      externalSubscriptionIdPresent: true,
    });

    const billingEvents = await db.select().from(schema.billingEvents);
    expect(billingEvents).toHaveLength(1);
    expect(billingEvents[0]).toMatchObject({
      eventId: 'evt_paid',
      email: 'paiduser@example.com',
      processor: 'stripe',
      plan: 'pro',
      status: 'active',
      externalCustomerIdPresent: true,
      externalSubscriptionIdPresent: true,
    });
  });

  it('syncs a nested Stripe checkout session payload using metadata account references', async () => {
    const hostedUser = (
      await db
        .insert(schema.users)
        .values({
          email: 'stripe-account@example.com',
          displayName: 'Stripe Account',
          externalSubject: 'netlify-stripe-account',
        })
        .returning()
    )[0];

    const result = await syncBillingEntitlement({
      id: 'evt_checkout_session_completed',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_stripe',
          subscription: 'sub_stripe',
          payment_status: 'paid',
          customer_details: {
            email: 'StripeCheckout@example.com',
            name: 'Stripe Checkout',
          },
          metadata: {
            client_reference_id: `claimbot_user_${hostedUser.id}`,
            plan_key: 'pro_monthly',
          },
        },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      userId: hostedUser.id,
      email: 'stripecheckout@example.com',
      plan: 'pro',
      status: 'active',
      duplicate: false,
      eventId: 'evt_checkout_session_completed',
    });

    const users = await db.select().from(schema.users);
    const updatedUser = users.find((user: { id: number }) => user.id === hostedUser.id);
    expect(updatedUser).toMatchObject({
      id: hostedUser.id,
      email: 'stripecheckout@example.com',
      displayName: 'Stripe Checkout',
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
    });

    const [billingEvent] = await db.select().from(schema.billingEvents);
    expect(billingEvent).toMatchObject({
      eventId: 'evt_checkout_session_completed',
      userId: hostedUser.id,
      email: 'stripecheckout@example.com',
      processor: 'stripe',
      externalCustomerIdPresent: true,
      externalSubscriptionIdPresent: true,
    });

    const [auditEvent] = await db.select().from(schema.auditLog);
    expect(auditEvent.payloadJson).toMatchObject({
      claimbotUserReferencePresent: true,
      claimbotUserReferenceMatched: true,
      linkedBy: 'claimbot_user_reference',
      externalCustomerIdPresent: true,
      externalSubscriptionIdPresent: true,
    });
  });

  it('treats duplicate processor event IDs as idempotent replays', async () => {
    const payload = {
      email: 'PaidUser@example.com',
      displayName: 'Paid User',
      plan: 'pro',
      status: 'active',
      processor: 'stripe',
      eventId: 'evt_replayed',
      externalCustomerId: 'cus_123',
      externalSubscriptionId: 'sub_123',
    };

    const first = await syncBillingEntitlement(payload);
    const second = await syncBillingEntitlement({
      ...payload,
      plan: 'free',
      status: 'inactive',
    });

    expect(first).toMatchObject({
      ok: true,
      email: 'paiduser@example.com',
      plan: 'pro',
      status: 'active',
      eventId: 'evt_replayed',
      duplicate: false,
    });
    expect(second).toMatchObject({
      ok: true,
      email: 'paiduser@example.com',
      plan: 'pro',
      status: 'active',
      eventId: 'evt_replayed',
      duplicate: true,
    });

    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(1);
    expect(users[0].subscriptionPlan).toBe('pro');
    expect(users[0].subscriptionStatus).toBe('active');
    expect(await db.select().from(schema.auditLog)).toHaveLength(1);
    expect(await db.select().from(schema.billingEvents)).toHaveLength(1);
  });

  it('links processor callbacks to an existing hosted user reference before email fallback', async () => {
    const hostedUser = (
      await db
        .insert(schema.users)
        .values({
          email: 'account@example.com',
          displayName: 'Account Owner',
          externalSubject: 'netlify-user-reference',
        })
        .returning()
    )[0];

    const result = await syncBillingEntitlement({
      claimbotUserId: hostedUser.id,
      email: 'checkout@example.com',
      displayName: 'Checkout Name',
      plan: 'pro',
      status: 'active',
      processor: 'stripe',
      eventId: 'evt_user_reference',
    });

    expect(result).toMatchObject({
      ok: true,
      userId: hostedUser.id,
      email: 'checkout@example.com',
      plan: 'pro',
      status: 'active',
    });

    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      id: hostedUser.id,
      email: 'checkout@example.com',
      displayName: 'Checkout Name',
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
    });

    const [billingEvent] = await db.select().from(schema.billingEvents);
    expect(billingEvent).toMatchObject({
      eventId: 'evt_user_reference',
      userId: hostedUser.id,
      email: 'checkout@example.com',
    });

    const [auditEvent] = await db.select().from(schema.auditLog);
    expect(auditEvent.payloadJson).toMatchObject({
      claimbotUserReferencePresent: true,
      claimbotUserReferenceMatched: true,
      linkedBy: 'claimbot_user_reference',
      emailUpdateApplied: true,
      emailConflictPresent: false,
    });
  });

  it('keeps the referenced user subscription when processor email belongs to another account', async () => {
    const referencedUser = (
      await db
        .insert(schema.users)
        .values({
          email: 'primary@example.com',
          displayName: 'Primary User',
          externalSubject: 'netlify-primary',
        })
        .returning()
    )[0];
    const emailOwner = (
      await db
        .insert(schema.users)
        .values({
          email: 'checkout@example.com',
          displayName: 'Checkout Email Owner',
          externalSubject: 'netlify-email-owner',
        })
        .returning()
    )[0];

    const result = await syncBillingEntitlement({
      clientReferenceId: `claimbot_user_${referencedUser.id}`,
      email: 'checkout@example.com',
      displayName: 'Processor Name',
      plan: 'pro',
      status: 'active',
      processor: 'stripe',
      eventId: 'evt_email_conflict',
    });

    expect(result).toMatchObject({
      ok: true,
      userId: referencedUser.id,
      email: 'checkout@example.com',
      plan: 'pro',
      status: 'active',
    });

    const users = await db.select().from(schema.users);
    const updatedReferencedUser = users.find((user: { id: number }) => user.id === referencedUser.id);
    const unchangedEmailOwner = users.find((user: { id: number }) => user.id === emailOwner.id);
    expect(updatedReferencedUser).toMatchObject({
      email: 'primary@example.com',
      displayName: 'Processor Name',
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
    });
    expect(unchangedEmailOwner).toMatchObject({
      email: 'checkout@example.com',
      subscriptionPlan: 'free',
      subscriptionStatus: 'inactive',
    });

    const [billingEvent] = await db.select().from(schema.billingEvents);
    expect(billingEvent).toMatchObject({
      eventId: 'evt_email_conflict',
      userId: referencedUser.id,
      email: 'checkout@example.com',
    });

    const [auditEvent] = await db.select().from(schema.auditLog);
    expect(auditEvent.payloadJson).toMatchObject({
      claimbotUserReferencePresent: true,
      claimbotUserReferenceMatched: true,
      linkedBy: 'claimbot_user_reference',
      emailUpdateApplied: false,
      emailConflictPresent: true,
    });
  });

  it('rejects sync payloads without a usable email address', async () => {
    const result = await syncBillingEntitlement({
      email: 'not-an-email',
      plan: 'pro',
      status: 'active',
    });

    expect(result).toEqual({ ok: false, error: 'valid email is required' });
    expect(await db.select().from(schema.users)).toHaveLength(0);
    expect(await db.select().from(schema.billingEvents)).toHaveLength(0);
  });

  it('requires a processor event ID before changing entitlements', async () => {
    const result = await syncBillingEntitlement({
      email: 'paiduser@example.com',
      plan: 'pro',
      status: 'active',
    });

    expect(result).toEqual({ ok: false, error: 'billing event id is required' });
    expect(await db.select().from(schema.users)).toHaveLength(0);
    expect(await db.select().from(schema.billingEvents)).toHaveLength(0);
  });
});
