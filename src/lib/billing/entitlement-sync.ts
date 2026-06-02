import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '@db/client';
import type { SubscriptionPlan, SubscriptionStatus } from '@db/client';
import { normalizeSubscriptionPlan, normalizeSubscriptionStatus } from './entitlements';

export type BillingSyncInput = {
  claimbotUserId?: unknown;
  clientReferenceId?: unknown;
  client_reference_id?: unknown;
  email?: unknown;
  customerEmail?: unknown;
  customer_email?: unknown;
  displayName?: unknown;
  name?: unknown;
  plan?: unknown;
  status?: unknown;
  processor?: unknown;
  provider?: unknown;
  paymentProcessor?: unknown;
  externalCustomerId?: unknown;
  customer?: unknown;
  customerId?: unknown;
  customer_id?: unknown;
  externalSubscriptionId?: unknown;
  subscription?: unknown;
  subscriptionId?: unknown;
  subscription_id?: unknown;
  eventId?: unknown;
  event_id?: unknown;
  id?: unknown;
  type?: unknown;
  metadata?: unknown;
  data?: unknown;
};

export type BillingSyncResult =
  | {
      ok: true;
      userId: number;
      email: string;
      plan: SubscriptionPlan;
      status: SubscriptionStatus;
      eventId: string;
      duplicate: boolean;
    }
  | {
      ok: false;
      error: string;
    };

type BillingEvent = typeof schema.billingEvents.$inferSelect;

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function cleanOptionalString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getPath(source: unknown, path: string[]) {
  let current: unknown = source;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function firstPresent(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function normalizeClaimbotUserId(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const numeric = trimmed.match(/^(\d+)$/)?.[1] ?? trimmed.match(/^claimbot_user_(\d+)$/)?.[1] ?? null;
  if (!numeric) return null;
  const parsed = Number(numeric);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeProcessorPlan(value: unknown) {
  const direct = normalizeSubscriptionPlan(value);
  if (direct !== 'free') return direct;

  if (typeof value !== 'string') return direct;
  const key = value.trim().toLowerCase().replace(/[\s.-]+/g, '_');
  const aliases: Record<string, SubscriptionPlan> = {
    plus_monthly: 'plus',
    plus_yearly: 'plus',
    claimbot_plus_monthly: 'plus',
    claimbot_plus_yearly: 'plus',
    claimbot_billing_plus_monthly_url: 'plus',
    claimbot_billing_plus_yearly_url: 'plus',
    pro_monthly: 'pro',
    pro_yearly: 'pro',
    claimbot_pro_monthly: 'pro',
    claimbot_pro_yearly: 'pro',
    claimbot_billing_pro_monthly_url: 'pro',
    claimbot_billing_pro_yearly_url: 'pro',
    founder: 'founding',
    founders: 'founding',
    founding_member: 'founding',
    founding_plan: 'founding',
    founding_checkout: 'founding',
    claimbot_founding: 'founding',
    claimbot_billing_founding_url: 'founding',
  };

  return aliases[key] ?? direct;
}

function normalizeProcessorStatus(value: unknown, eventType: unknown) {
  const direct = normalizeSubscriptionStatus(value);
  if (direct !== 'inactive') return direct;

  const candidates = [value, eventType]
    .filter((candidate): candidate is string => typeof candidate === 'string')
    .map((candidate) => candidate.trim().toLowerCase().replace(/[\s.-]+/g, '_'));

  for (const candidate of candidates) {
    if (['paid', 'complete', 'completed', 'succeeded', 'checkout_session_completed', 'invoice_payment_succeeded'].includes(candidate)) {
      return 'active';
    }
    if (candidate === 'canceled') return 'cancelled';
    if (candidate === 'customer_subscription_deleted') return 'cancelled';
    if (['past_due', 'invoice_payment_failed'].includes(candidate)) return 'past_due';
    if (['trial', 'trialing'].includes(candidate)) return 'trialing';
    if (['expired', 'failed', 'unpaid', 'incomplete', 'incomplete_expired'].includes(candidate)) return 'inactive';
  }

  return direct;
}

function processorMetadata(input: BillingSyncInput) {
  return {
    ...(asRecord(input.metadata) ?? {}),
    ...(asRecord(getPath(input, ['data', 'object', 'metadata'])) ?? {}),
    ...(asRecord(getPath(input, ['data', 'object', 'subscription_details', 'metadata'])) ?? {}),
    ...(asRecord(getPath(input, ['object', 'metadata'])) ?? {}),
  };
}

export function billingSyncSecret(env: Record<string, string | undefined> = process.env) {
  return env.CLAIMBOT_BILLING_SYNC_SECRET?.trim() ?? '';
}

export function stripeWebhookSecret(env: Record<string, string | undefined> = process.env) {
  return env.CLAIMBOT_STRIPE_WEBHOOK_SECRET?.trim() ?? '';
}

export function signBillingSyncBody(body: string, secret: string) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export function signStripeWebhookBody(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signedPayload = `${timestamp}.${body}`;
  const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export function verifyBillingSyncSignature(body: string, signature: string | null, secret: string) {
  if (secret.length < 32 || !signature) return false;
  const expected = signBillingSyncBody(body, secret);
  const received = signature.trim();
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function verifyStripeWebhookSignature(
  body: string,
  signature: string | null,
  secret: string,
  toleranceSeconds = 300,
) {
  if (secret.length < 32 || !signature) return false;
  const parts = signature.split(',').map((part) => part.trim()).filter(Boolean);
  const timestamp = parts
    .map((part) => part.match(/^t=(\d+)$/)?.[1])
    .find(Boolean);
  const signatures = parts
    .map((part) => part.match(/^v1=([a-fA-F0-9]+)$/)?.[1])
    .filter((value): value is string => Boolean(value));
  if (!timestamp || signatures.length === 0) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > toleranceSeconds) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  return signatures.some((received) => {
    const receivedBuffer = Buffer.from(received);
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  });
}

export function normalizeBillingSyncInput(input: BillingSyncInput) {
  const metadata = processorMetadata(input);
  const eventType = firstPresent(input.type, getPath(input, ['event', 'type']));
  const email = normalizeEmail(firstPresent(
    input.email,
    input.customerEmail,
    input.customer_email,
    metadata.email,
    metadata.customerEmail,
    metadata.customer_email,
    getPath(input, ['data', 'object', 'customer_email']),
    getPath(input, ['data', 'object', 'customer_details', 'email']),
    getPath(input, ['data', 'object', 'receipt_email']),
    getPath(input, ['object', 'customer_email']),
    getPath(input, ['object', 'customer_details', 'email']),
  ));
  const plan = normalizeProcessorPlan(firstPresent(
    input.plan,
    metadata.plan,
    metadata.claimbotPlan,
    metadata.claimbot_plan,
    metadata.planKey,
    metadata.plan_key,
    metadata.priceLookupKey,
    metadata.price_lookup_key,
    getPath(input, ['data', 'object', 'plan']),
    getPath(input, ['data', 'object', 'subscription_details', 'metadata', 'plan']),
  ));
  const status = normalizeProcessorStatus(firstPresent(
    input.status,
    metadata.status,
    getPath(input, ['data', 'object', 'subscription_status']),
    getPath(input, ['data', 'object', 'payment_status']),
    getPath(input, ['data', 'object', 'status']),
    getPath(input, ['object', 'payment_status']),
    getPath(input, ['object', 'status']),
  ), eventType);
  const displayName = cleanOptionalString(firstPresent(
    input.displayName,
    input.name,
    metadata.displayName,
    metadata.display_name,
    metadata.name,
    getPath(input, ['data', 'object', 'customer_details', 'name']),
    getPath(input, ['object', 'customer_details', 'name']),
  )) ?? email;
  const processor = cleanOptionalString(firstPresent(input.processor, input.provider, input.paymentProcessor))
    ?? (getPath(input, ['data', 'object']) ? 'stripe' : 'processor-hosted-checkout');
  const externalCustomerId = cleanOptionalString(firstPresent(
    input.externalCustomerId,
    input.customer,
    input.customerId,
    input.customer_id,
    metadata.externalCustomerId,
    metadata.customerId,
    metadata.customer_id,
    getPath(input, ['data', 'object', 'customer']),
    getPath(input, ['object', 'customer']),
  ));
  const externalSubscriptionId = cleanOptionalString(firstPresent(
    input.externalSubscriptionId,
    input.subscription,
    input.subscriptionId,
    input.subscription_id,
    metadata.externalSubscriptionId,
    metadata.subscriptionId,
    metadata.subscription_id,
    getPath(input, ['data', 'object', 'subscription']),
    getPath(input, ['object', 'subscription']),
  ));
  const eventId = cleanOptionalString(firstPresent(
    input.eventId,
    input.event_id,
    metadata.eventId,
    metadata.event_id,
    eventType ? input.id : undefined,
    getPath(input, ['event', 'id']),
    getPath(input, ['data', 'id']),
    getPath(input, ['data', 'object', 'eventId']),
    getPath(input, ['data', 'object', 'event_id']),
  ));
  const claimbotUserId = normalizeClaimbotUserId(input.claimbotUserId)
    ?? normalizeClaimbotUserId(input.clientReferenceId)
    ?? normalizeClaimbotUserId(input.client_reference_id)
    ?? normalizeClaimbotUserId(metadata.claimbotUserId)
    ?? normalizeClaimbotUserId(metadata.claimbot_user_id)
    ?? normalizeClaimbotUserId(metadata.clientReferenceId)
    ?? normalizeClaimbotUserId(metadata.client_reference_id)
    ?? normalizeClaimbotUserId(getPath(input, ['data', 'object', 'claimbotUserId']))
    ?? normalizeClaimbotUserId(getPath(input, ['data', 'object', 'clientReferenceId']))
    ?? normalizeClaimbotUserId(getPath(input, ['data', 'object', 'client_reference_id']))
    ?? normalizeClaimbotUserId(getPath(input, ['object', 'client_reference_id']));

  return {
    claimbotUserId,
    email,
    displayName,
    plan,
    status,
    processor,
    externalCustomerId,
    externalSubscriptionId,
    eventId,
  };
}

function resultFromBillingEvent(event: BillingEvent, duplicate: boolean): BillingSyncResult {
  return {
    ok: true,
    userId: event.userId,
    email: event.email,
    plan: event.plan,
    status: event.status,
    eventId: event.eventId,
    duplicate,
  };
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && /unique|constraint/i.test(error.message);
}

export async function syncBillingEntitlement(input: BillingSyncInput): Promise<BillingSyncResult> {
  const normalized = normalizeBillingSyncInput(input);

  if (!normalized.email || !normalized.email.includes('@')) {
    return { ok: false, error: 'valid email is required' };
  }

  if (!normalized.eventId) {
    return { ok: false, error: 'billing event id is required' };
  }
  const eventId = normalized.eventId;

  const existingEvent = await db
    .select()
    .from(schema.billingEvents)
    .where(eq(schema.billingEvents.eventId, eventId))
    .limit(1);

  if (existingEvent.length > 0) {
    return resultFromBillingEvent(existingEvent[0]!, true);
  }

  try {
    return await db.transaction(async (tx) => {
      const userByReference = normalized.claimbotUserId
        ? await tx
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, normalized.claimbotUserId))
          .limit(1)
        : [];

      const existingUser = userByReference.length > 0
        ? userByReference
        : await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, normalized.email))
        .limit(1);
      const linkedBy = userByReference.length > 0
        ? 'claimbot_user_reference'
        : existingUser[0]
          ? 'email'
          : 'created_from_billing_email';

      const userId =
        existingUser[0]?.id ??
        (
          await tx
            .insert(schema.users)
            .values({ email: normalized.email, displayName: normalized.displayName })
            .returning({ id: schema.users.id })
        )[0]!.id;
      const emailOwner = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, normalized.email))
        .limit(1);
      const emailConflictPresent = Boolean(emailOwner[0] && emailOwner[0].id !== userId);
      const userUpdate = {
        displayName: normalized.displayName,
        subscriptionPlan: normalized.plan,
        subscriptionStatus: normalized.status,
        subscriptionUpdatedAt: new Date(),
        ...(emailConflictPresent ? {} : { email: normalized.email }),
      };

      const insertedEvent = (
        await tx
          .insert(schema.billingEvents)
          .values({
            eventId,
            userId,
            email: normalized.email,
            processor: normalized.processor,
            plan: normalized.plan,
            status: normalized.status,
            externalCustomerIdPresent: Boolean(normalized.externalCustomerId),
            externalSubscriptionIdPresent: Boolean(normalized.externalSubscriptionId),
          })
          .returning()
      )[0]!;

      const syncedAt = userUpdate.subscriptionUpdatedAt;

      await tx
        .update(schema.users)
        .set(userUpdate)
        .where(eq(schema.users.id, userId));

      await tx.insert(schema.auditLog).values({
        userId,
        eventType: 'BILLING_ENTITLEMENT_SYNCED',
        entityType: 'user',
        entityId: userId,
        actor: 'system',
        payloadJson: {
          plan: normalized.plan,
          status: normalized.status,
          processor: normalized.processor,
          eventId,
          duplicate: false,
          claimbotUserReferencePresent: Boolean(normalized.claimbotUserId),
          claimbotUserReferenceMatched: userByReference.length > 0,
          linkedBy,
          emailUpdateApplied: !emailConflictPresent,
          emailConflictPresent,
          externalCustomerIdPresent: Boolean(normalized.externalCustomerId),
          externalSubscriptionIdPresent: Boolean(normalized.externalSubscriptionId),
          syncedAt: syncedAt.toISOString(),
          note: 'Subscription entitlement synced from signed billing event; automation still requires proof, authorization, and preflight gates.',
        },
      });

      return resultFromBillingEvent(insertedEvent, false);
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const replayedEvent = await db
      .select()
      .from(schema.billingEvents)
      .where(eq(schema.billingEvents.eventId, eventId))
      .limit(1);

    if (replayedEvent.length > 0) {
      return resultFromBillingEvent(replayedEvent[0]!, true);
    }

    throw error;
  }
}
