import { hasTemplatePlaceholder } from '@lib/bootstrap-audit-stamp';

export const BILLING_PLAN_KEYS = [
  'plus_monthly',
  'plus_yearly',
  'pro_monthly',
  'pro_yearly',
  'founding',
] as const;

export type BillingPlanKey = (typeof BILLING_PLAN_KEYS)[number];

export type BillingCheckoutOption = {
  key: BillingPlanKey;
  tier: 'Plus' | 'Pro' | 'Founding';
  label: string;
  envKey: string;
  requiredForPaidLaunch: boolean;
  checkoutUrl: string | null;
  configured: boolean;
};

export type BillingCheckoutBlockReason =
  | 'beta-no-billing'
  | 'checkout-not-configured'
  | 'signed-sync-not-configured'
  | 'legal-review-not-recorded'
  | 'worker-runtime-not-verified';

const fullAutomationPlanKeys = new Set<BillingPlanKey>(['pro_monthly', 'pro_yearly', 'founding']);
const verifiedWorkerRuntimes = new Set([
  'persistent-worker',
  'dedicated-worker',
  'external-worker',
  'background-worker',
  'scheduled-worker',
  'github-actions-scheduler',
]);

const checkoutEnv: Record<BillingPlanKey, Omit<BillingCheckoutOption, 'checkoutUrl' | 'configured'>> = {
  plus_monthly: {
    key: 'plus_monthly',
    tier: 'Plus',
    label: 'Plus monthly checkout',
    envKey: 'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
    requiredForPaidLaunch: true,
  },
  plus_yearly: {
    key: 'plus_yearly',
    tier: 'Plus',
    label: 'Plus yearly checkout',
    envKey: 'CLAIMBOT_BILLING_PLUS_YEARLY_URL',
    requiredForPaidLaunch: false,
  },
  pro_monthly: {
    key: 'pro_monthly',
    tier: 'Pro',
    label: 'Pro monthly checkout',
    envKey: 'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
    requiredForPaidLaunch: true,
  },
  pro_yearly: {
    key: 'pro_yearly',
    tier: 'Pro',
    label: 'Pro yearly checkout',
    envKey: 'CLAIMBOT_BILLING_PRO_YEARLY_URL',
    requiredForPaidLaunch: false,
  },
  founding: {
    key: 'founding',
    tier: 'Founding',
    label: 'Founding checkout',
    envKey: 'CLAIMBOT_BILLING_FOUNDING_URL',
    requiredForPaidLaunch: false,
  },
};

export function isBillingPlanKey(value: string | null | undefined): value is BillingPlanKey {
  return BILLING_PLAN_KEYS.includes(value as BillingPlanKey);
}

function normalizeCheckoutUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (hasTemplatePlaceholder(trimmed)) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getBillingCheckoutOptions(env: Record<string, string | undefined> = process.env): BillingCheckoutOption[] {
  return BILLING_PLAN_KEYS.map((key) => {
    const base = checkoutEnv[key];
    const checkoutUrl = normalizeCheckoutUrl(env[base.envKey]);
    return {
      ...base,
      checkoutUrl,
      configured: Boolean(checkoutUrl),
    };
  });
}

export function getBillingCheckoutOption(
  key: BillingPlanKey,
  env: Record<string, string | undefined> = process.env,
): BillingCheckoutOption {
  return getBillingCheckoutOptions(env).find((option) => option.key === key)!;
}

export function getBillingCheckoutHref(key: BillingPlanKey) {
  return `/api/billing/checkout?plan=${encodeURIComponent(key)}`;
}

export function isFullAutomationBillingPlan(key: BillingPlanKey) {
  return fullAutomationPlanKeys.has(key);
}

export function isBetaNoBillingMode(env: Record<string, string | undefined> = process.env) {
  const value = env.CLAIMBOT_BETA_NO_BILLING?.trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

export function isPaidAutomationWorkerVerified(env: Record<string, string | undefined> = process.env) {
  const runtime = env.CLAIMBOT_WORKER_RUNTIME?.trim();
  const receipt = env.CLAIMBOT_WORKER_RUNTIME_RECEIPT?.trim();
  return Boolean(runtime && verifiedWorkerRuntimes.has(runtime) && receipt === 'verified');
}

export function billingClientReferenceForUser(userId: number) {
  return `claimbot_user_${userId}`;
}

export function getBillingCheckoutRedirectUrl(option: BillingCheckoutOption, userId: number) {
  if (!option.checkoutUrl) return null;

  const checkoutUrl = new URL(option.checkoutUrl);
  const clientReference = billingClientReferenceForUser(userId);
  if (!checkoutUrl.searchParams.has('clientReferenceId')) {
    checkoutUrl.searchParams.set('clientReferenceId', clientReference);
  }
  if (!checkoutUrl.searchParams.has('client_reference_id')) {
    checkoutUrl.searchParams.set('client_reference_id', clientReference);
  }
  if (!checkoutUrl.searchParams.has('claimbotUserId')) {
    checkoutUrl.searchParams.set('claimbotUserId', String(userId));
  }
  return checkoutUrl.toString();
}

export function getBillingCheckoutBlockReason(
  key: BillingPlanKey,
  env: Record<string, string | undefined> = process.env,
): BillingCheckoutBlockReason | null {
  if (isBetaNoBillingMode(env)) return 'beta-no-billing';
  const option = getBillingCheckoutOption(key, env);
  if (!option.configured) return 'checkout-not-configured';
  const readiness = getBillingReadiness(env);
  if (!readiness.syncSecretConfigured) return 'signed-sync-not-configured';
  if (env.CLAIMBOT_LEGAL_REVIEW_ACK?.trim() !== 'reviewed') return 'legal-review-not-recorded';
  if (isFullAutomationBillingPlan(key) && !isPaidAutomationWorkerVerified(env)) return 'worker-runtime-not-verified';
  return null;
}

export function getBillingReadiness(env: Record<string, string | undefined> = process.env) {
  const options = getBillingCheckoutOptions(env);
  const betaNoBilling = isBetaNoBillingMode(env);
  const requiredOptions = options.filter((option) => option.requiredForPaidLaunch);
  const claimbotSyncSecretConfigured = (env.CLAIMBOT_BILLING_SYNC_SECRET?.trim().length ?? 0) >= 32
    && !hasTemplatePlaceholder(env.CLAIMBOT_BILLING_SYNC_SECRET);
  const stripeWebhookSecretConfigured = (env.CLAIMBOT_STRIPE_WEBHOOK_SECRET?.trim().length ?? 0) >= 32
    && !hasTemplatePlaceholder(env.CLAIMBOT_STRIPE_WEBHOOK_SECRET);
  const syncSecretConfigured = claimbotSyncSecretConfigured || stripeWebhookSecretConfigured;
  const missingRequiredEnvKeys = requiredOptions
    .filter((option) => !option.configured)
    .map((option) => option.envKey);
  if (!syncSecretConfigured) {
    missingRequiredEnvKeys.push('CLAIMBOT_BILLING_SYNC_SECRET_OR_STRIPE_WEBHOOK_SECRET');
  }
  const configuredOptions = options
    .filter((option) => option.configured)
    .map((option) => ({
      key: option.key,
      tier: option.tier,
      label: option.label,
      envKey: option.envKey,
    }));

  if (betaNoBilling) {
    return {
      providerModel: 'beta access, checkout disabled',
      ready: true,
      betaNoBilling: true,
      requiredConfigured: 0,
      requiredTotal: 0,
      syncSecretConfigured,
      claimbotSyncSecretConfigured,
      stripeWebhookSecretConfigured,
      paidAutomationWorkerVerified: isPaidAutomationWorkerVerified(env),
      acceptedSignatureHeaders: [
        ...(claimbotSyncSecretConfigured ? ['X-ClaimBot-Billing-Signature'] : []),
        ...(stripeWebhookSecretConfigured ? ['Stripe-Signature'] : []),
      ],
      syncEndpoint: '/api/billing/entitlement-sync',
      missingRequiredEnvKeys: [],
      configuredOptions,
      options: options.map((option) => ({
        key: option.key,
        tier: option.tier,
        label: option.label,
        envKey: option.envKey,
        configured: option.configured,
        requiredForPaidLaunch: false,
      })),
      note: 'Beta no-billing mode is enabled. Checkout handoff is deliberately locked; paid automation still requires an active entitlement record and worker proof before filing jobs can run.',
    };
  }

  return {
    providerModel: 'processor-hosted payment links',
    ready: missingRequiredEnvKeys.length === 0,
    betaNoBilling: false,
    requiredConfigured: requiredOptions.length + 1 - missingRequiredEnvKeys.length,
    requiredTotal: requiredOptions.length + 1,
    syncSecretConfigured,
    claimbotSyncSecretConfigured,
    stripeWebhookSecretConfigured,
    paidAutomationWorkerVerified: isPaidAutomationWorkerVerified(env),
    acceptedSignatureHeaders: [
      ...(claimbotSyncSecretConfigured ? ['X-ClaimBot-Billing-Signature'] : []),
      ...(stripeWebhookSecretConfigured ? ['Stripe-Signature'] : []),
    ],
    syncEndpoint: '/api/billing/entitlement-sync',
    missingRequiredEnvKeys,
    configuredOptions,
    options: options.map((option) => ({
      key: option.key,
      tier: option.tier,
      label: option.label,
      envKey: option.envKey,
      configured: option.configured,
      requiredForPaidLaunch: option.requiredForPaidLaunch,
    })),
    note: 'Checkout redirects to processor-hosted payment links; a signed billing sync must update subscription entitlement rows before paid automation can queue.',
  };
}
