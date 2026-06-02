import { describe, expect, it } from 'vitest';
import {
  normalizeBillingSyncInput,
  signBillingSyncBody,
  signStripeWebhookBody,
  verifyBillingSyncSignature,
  verifyStripeWebhookSignature,
} from '../../src/lib/billing/entitlement-sync';

describe('billing entitlement sync helpers', () => {
  it('normalizes billing payloads before updating entitlements', () => {
    const normalized = normalizeBillingSyncInput({
      email: '  CUSTOMER@Example.COM ',
      displayName: ' Customer ',
      plan: 'pro',
      status: 'active',
      processor: 'stripe',
      eventId: 'evt_123',
    });

    expect(normalized.email).toBe('customer@example.com');
    expect(normalized.displayName).toBe('Customer');
    expect(normalized.plan).toBe('pro');
    expect(normalized.status).toBe('active');
    expect(normalized.processor).toBe('stripe');
    expect(normalized.eventId).toBe('evt_123');
  });

  it('falls back to free inactive for unknown plan data', () => {
    const normalized = normalizeBillingSyncInput({
      email: 'customer@example.com',
      plan: 'enterprise',
      status: 'paused',
    });

    expect(normalized.plan).toBe('free');
    expect(normalized.status).toBe('inactive');
  });

  it('normalizes processor user references for hosted account linking', () => {
    expect(normalizeBillingSyncInput({
      email: 'customer@example.com',
      claimbotUserId: ' 42 ',
    }).claimbotUserId).toBe(42);

    expect(normalizeBillingSyncInput({
      email: 'customer@example.com',
      clientReferenceId: 'claimbot_user_84',
    }).claimbotUserId).toBe(84);

    expect(normalizeBillingSyncInput({
      email: 'customer@example.com',
      clientReferenceId: 'customer_84',
    }).claimbotUserId).toBeNull();
  });

  it('normalizes Stripe checkout session events from nested processor payloads', () => {
    const normalized = normalizeBillingSyncInput({
      id: 'evt_checkout_completed',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_123',
          subscription: 'sub_123',
          client_reference_id: 'claimbot_user_42',
          payment_status: 'paid',
          customer_details: {
            email: 'PaidUser@Example.com',
            name: 'Paid User',
          },
          metadata: {
            plan_key: 'pro_monthly',
          },
        },
      },
    });

    expect(normalized).toMatchObject({
      claimbotUserId: 42,
      email: 'paiduser@example.com',
      displayName: 'Paid User',
      plan: 'pro',
      status: 'active',
      processor: 'stripe',
      externalCustomerId: 'cus_123',
      externalSubscriptionId: 'sub_123',
      eventId: 'evt_checkout_completed',
    });
  });

  it('normalizes processor status and plan aliases without unlocking unknown plans', () => {
    expect(normalizeBillingSyncInput({
      email: 'customer@example.com',
      plan: 'plus-yearly',
      status: 'complete',
    })).toMatchObject({
      plan: 'plus',
      status: 'active',
    });

    expect(normalizeBillingSyncInput({
      id: 'evt_deleted',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          customer_email: 'customer@example.com',
          status: 'canceled',
          metadata: {
            plan: 'enterprise',
          },
        },
      },
    })).toMatchObject({
      plan: 'free',
      status: 'cancelled',
      eventId: 'evt_deleted',
    });
  });

  it('verifies HMAC signatures using the raw request body', () => {
    const body = JSON.stringify({ email: 'customer@example.com', plan: 'pro', status: 'active' });
    const secret = 'a-long-random-billing-sync-secret-for-tests';
    const signature = signBillingSyncBody(body, secret);

    expect(verifyBillingSyncSignature(body, signature, secret)).toBe(true);
    expect(verifyBillingSyncSignature(`${body} `, signature, secret)).toBe(false);
    expect(verifyBillingSyncSignature(body, signature, 'short')).toBe(false);
  });

  it('verifies Stripe webhook signatures using the raw request body and timestamp tolerance', () => {
    const body = JSON.stringify({
      id: 'evt_checkout_completed',
      type: 'checkout.session.completed',
    });
    const secret = 'whsec_test_secret_at_least_32_characters';
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signStripeWebhookBody(body, secret, timestamp);

    expect(verifyStripeWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyStripeWebhookSignature(`${body} `, signature, secret)).toBe(false);
    expect(verifyStripeWebhookSignature(body, signature, 'short')).toBe(false);
    expect(verifyStripeWebhookSignature(body, signature, secret, 5)).toBe(true);

    const staleSignature = signStripeWebhookBody(body, secret, timestamp - 600);
    expect(verifyStripeWebhookSignature(body, staleSignature, secret)).toBe(false);
  });
});
