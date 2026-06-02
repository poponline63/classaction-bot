import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  normalizeBillingSyncInput,
  signBillingSyncBody,
  signStripeWebhookBody,
  verifyBillingSyncSignature,
  verifyStripeWebhookSignature,
} from '../src/lib/billing/entitlement-sync';

const outputDir = path.join(process.cwd(), 'data');
const outputPath = path.join(outputDir, 'billing-sync-smoke-receipt.json');

function configuredSecret(key: string) {
  const value = process.env[key]?.trim() ?? '';
  return value.length >= 32 ? value : '';
}

function secretMode(secret: string) {
  return secret ? 'configured-secret-present' : 'synthetic-local-secret';
}

async function main() {
  const generatedAt = new Date().toISOString();
  const configuredClaimbotSecret = configuredSecret('CLAIMBOT_BILLING_SYNC_SECRET');
  const configuredStripeSecret = configuredSecret('CLAIMBOT_STRIPE_WEBHOOK_SECRET');
  const claimbotSecret = configuredClaimbotSecret || randomBytes(40).toString('base64url');
  const stripeSecret = configuredStripeSecret || `whsec_${randomBytes(40).toString('base64url')}`;
  const payload = {
    eventId: 'claimbot_billing_smoke_event',
    processor: 'processor-hosted-checkout',
    email: 'customer@example.com',
    plan: 'pro_monthly',
    status: 'active',
    clientReferenceId: 'claimbot_user_1',
    claimbotUserId: '1',
  };
  const body = JSON.stringify(payload);
  const claimbotSignature = signBillingSyncBody(body, claimbotSecret);
  const stripeSignature = signStripeWebhookBody(body, stripeSecret);
  const normalized = normalizeBillingSyncInput(payload);
  const claimbotSignatureAccepted = verifyBillingSyncSignature(body, claimbotSignature, claimbotSecret);
  const stripeSignatureAccepted = verifyStripeWebhookSignature(body, stripeSignature, stripeSecret);
  const tamperedBodyRejected = !verifyBillingSyncSignature(`${body} `, claimbotSignature, claimbotSecret)
    && !verifyStripeWebhookSignature(`${body} `, stripeSignature, stripeSecret);
  const stableUserReferencePresent = normalized.claimbotUserId === 1;
  const planStatusNormalized = normalized.plan === 'pro' && normalized.status === 'active';
  const eventIdPresent = normalized.eventId === payload.eventId;
  const ok = claimbotSignatureAccepted
    && stripeSignatureAccepted
    && tamperedBodyRejected
    && stableUserReferencePresent
    && planStatusNormalized
    && eventIdPresent;

  const receipt = {
    format: 'claimbot.billing-sync-smoke-receipt.v1',
    generatedAt,
    status: ok ? 'pass' : 'fail',
    secretModes: {
      claimbotHmac: secretMode(configuredClaimbotSecret),
      stripeWebhook: secretMode(configuredStripeSecret),
    },
    checks: {
      claimbotSignatureAccepted,
      stripeSignatureAccepted,
      tamperedBodyRejected,
      stableUserReferencePresent,
      planStatusNormalized,
      eventIdPresent,
    },
    normalizedPayload: {
      processor: normalized.processor,
      plan: normalized.plan,
      status: normalized.status,
      claimbotUserId: normalized.claimbotUserId,
      clientReferenceAccepted: stableUserReferencePresent,
      eventId: normalized.eventId,
      emailDomain: normalized.email ? normalized.email.split('@')[1] : null,
    },
    approvalBoundary: {
      nonSecretReceipt: true,
      doesNotPrintBillingSecrets: true,
      doesNotPrintCheckoutUrls: true,
      doesNotApplyEntitlement: true,
      doesNotApproveBillingLaunchByItself: true,
      nextProof: 'Configure real processor-hosted checkout URLs and a deployed signed callback, then regenerate billing and launch packets.',
    },
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log('[billing-sync-receipt] wrote non-secret billing sync smoke receipt');
  console.log(`JSON: ${path.relative(process.cwd(), outputPath)}`);
  console.log(`Status: ${receipt.status}`);
  console.log('No secret values were printed.');

  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[billing-sync-receipt] failed');
  console.error(error);
  process.exit(1);
});
