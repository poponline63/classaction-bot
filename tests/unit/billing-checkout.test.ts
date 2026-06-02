import { describe, expect, it } from 'vitest';
import {
  billingClientReferenceForUser,
  getBillingCheckoutBlockReason,
  getBillingCheckoutHref,
  getBillingCheckoutOption,
  getBillingCheckoutRedirectUrl,
  getBillingReadiness,
  isBillingPlanKey,
} from '../../src/lib/billing/checkout';

describe('billing checkout configuration', () => {
  it('marks paid launch billing ready when required payment links are configured', () => {
    const readiness = getBillingReadiness({
      CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://checkout.example.com/plus',
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
      CLAIMBOT_BILLING_SYNC_SECRET: 'a-long-random-billing-sync-secret-for-tests',
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.requiredConfigured).toBe(3);
    expect(readiness.missingRequiredEnvKeys).toEqual([]);
    expect(readiness.providerModel).toBe('processor-hosted payment links');
    expect(readiness.syncEndpoint).toBe('/api/billing/entitlement-sync');
    expect(readiness.acceptedSignatureHeaders).toEqual(['X-ClaimBot-Billing-Signature']);
  });

  it('accepts a Stripe webhook secret as the signed entitlement sync gate', () => {
    const readiness = getBillingReadiness({
      CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://checkout.example.com/plus',
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
      CLAIMBOT_STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_at_least_32_characters',
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.syncSecretConfigured).toBe(true);
    expect(readiness.claimbotSyncSecretConfigured).toBe(false);
    expect(readiness.stripeWebhookSecretConfigured).toBe(true);
    expect(readiness.acceptedSignatureHeaders).toEqual(['Stripe-Signature']);
  });

  it('keeps paid launch billing blocked without required links', () => {
    const readiness = getBillingReadiness({
      CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://checkout.example.com/plus',
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'http://not-safe.example.com/pro',
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.missingRequiredEnvKeys).toEqual([
      'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
      'CLAIMBOT_BILLING_SYNC_SECRET_OR_STRIPE_WEBHOOK_SECRET',
    ]);
  });

  it('treats beta no-billing mode as ready while keeping checkout handoff locked', () => {
    const readiness = getBillingReadiness({
      CLAIMBOT_BETA_NO_BILLING: 'true',
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.betaNoBilling).toBe(true);
    expect(readiness.providerModel).toBe('beta access, checkout disabled');
    expect(readiness.requiredConfigured).toBe(0);
    expect(readiness.requiredTotal).toBe(0);
    expect(readiness.missingRequiredEnvKeys).toEqual([]);
    expect(getBillingCheckoutBlockReason('pro_monthly', {
      CLAIMBOT_BETA_NO_BILLING: 'true',
    })).toBe('beta-no-billing');
  });

  it('keeps paid launch billing blocked when hosted template placeholders are still present', () => {
    const readiness = getBillingReadiness({
      CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://YOUR_PROCESSOR_CHECKOUT_LINK',
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
      CLAIMBOT_BILLING_SYNC_SECRET: 'PASTE_GENERATED_BILLING_SYNC_SECRET',
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.missingRequiredEnvKeys).toEqual([
      'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
      'CLAIMBOT_BILLING_SYNC_SECRET_OR_STRIPE_WEBHOOK_SECRET',
    ]);
  });

  it('returns configured checkout options without exposing secrets', () => {
    const option = getBillingCheckoutOption('pro_monthly', {
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
    });

    expect(option.configured).toBe(true);
    expect(option.checkoutUrl).toBe('https://checkout.example.com/pro');
    expect(option.envKey).toBe('CLAIMBOT_BILLING_PRO_MONTHLY_URL');
  });

  it('blocks checkout handoff until both the payment link and signed entitlement sync are ready', () => {
    expect(getBillingCheckoutBlockReason('pro_monthly', {
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
    })).toBe('signed-sync-not-configured');

    expect(getBillingCheckoutBlockReason('pro_monthly', {
      CLAIMBOT_BILLING_SYNC_SECRET: 'a-long-random-billing-sync-secret-for-tests',
    })).toBe('checkout-not-configured');

    expect(getBillingCheckoutBlockReason('pro_monthly', {
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
      CLAIMBOT_BILLING_SYNC_SECRET: 'a-long-random-billing-sync-secret-for-tests',
    })).toBe('legal-review-not-recorded');

    expect(getBillingCheckoutBlockReason('pro_monthly', {
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
      CLAIMBOT_BILLING_SYNC_SECRET: 'a-long-random-billing-sync-secret-for-tests',
      CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
    })).toBe('worker-runtime-not-verified');

    expect(getBillingCheckoutBlockReason('plus_monthly', {
      CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://checkout.example.com/plus',
      CLAIMBOT_BILLING_SYNC_SECRET: 'a-long-random-billing-sync-secret-for-tests',
      CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
    })).toBeNull();

    expect(getBillingCheckoutBlockReason('pro_monthly', {
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
      CLAIMBOT_BILLING_SYNC_SECRET: 'a-long-random-billing-sync-secret-for-tests',
      CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
      CLAIMBOT_WORKER_RUNTIME: 'scheduled-worker',
      CLAIMBOT_WORKER_RUNTIME_RECEIPT: 'verified',
    })).toBeNull();
  });

  it('validates plan keys and builds internal checkout hrefs', () => {
    expect(isBillingPlanKey('pro_monthly')).toBe(true);
    expect(isBillingPlanKey('enterprise')).toBe(false);
    expect(getBillingCheckoutHref('plus_monthly')).toBe('/api/billing/checkout?plan=plus_monthly');
  });

  it('adds stable ClaimBot account references to processor-hosted checkout redirects', () => {
    const option = getBillingCheckoutOption('pro_monthly', {
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro?campaign=founder#pay',
    });

    const redirectUrl = getBillingCheckoutRedirectUrl(option, 84);
    expect(redirectUrl).not.toBeNull();
    const parsed = new URL(redirectUrl!);

    expect(billingClientReferenceForUser(84)).toBe('claimbot_user_84');
    expect(parsed.origin + parsed.pathname).toBe('https://checkout.example.com/pro');
    expect(parsed.searchParams.get('campaign')).toBe('founder');
    expect(parsed.searchParams.get('clientReferenceId')).toBe('claimbot_user_84');
    expect(parsed.searchParams.get('client_reference_id')).toBe('claimbot_user_84');
    expect(parsed.searchParams.get('claimbotUserId')).toBe('84');
    expect(parsed.hash).toBe('#pay');
  });

  it('does not overwrite processor-provided reference parameters', () => {
    const option = getBillingCheckoutOption('plus_monthly', {
      CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://checkout.example.com/plus?clientReferenceId=processor-ref&claimbotUserId=11',
    });

    const parsed = new URL(getBillingCheckoutRedirectUrl(option, 84)!);
    expect(parsed.searchParams.get('clientReferenceId')).toBe('processor-ref');
    expect(parsed.searchParams.get('client_reference_id')).toBe('claimbot_user_84');
    expect(parsed.searchParams.get('claimbotUserId')).toBe('11');
  });
});
