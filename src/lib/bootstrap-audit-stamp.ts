import { createHash } from 'node:crypto';

export const bootstrapCriticalEnvKeys = [
  'DATABASE_URL',
  'SCRAPER_USER_AGENT',
  'CLAIMBOT_SUPPORT_EMAIL',
  'CLAIMBOT_SESSION_SECRET',
  'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
  'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
  'CLAIMBOT_BILLING_SYNC_SECRET',
  'CLAIMBOT_STRIPE_WEBHOOK_SECRET',
  'CLAIMBOT_LEGAL_REVIEW_ACK',
] as const;

export type BootstrapCriticalEnvKey = (typeof bootstrapCriticalEnvKeys)[number];

export type BootstrapAuditStamp = {
  authGateState: 'active' | 'disabled';
  digest: string;
  missingEnvKeys: BootstrapCriticalEnvKey[];
  shadowModeState: 'enforced' | 'reviewed_live';
  summary: string;
};

export type BootstrapCriticalEnvAudit = {
  key: BootstrapCriticalEnvKey;
  status: 'configured' | 'missing';
};

type BootstrapAuditStampInput = {
  env?: Record<string, string | undefined>;
  filingMode?: 'shadow' | 'live';
};

export function hasTemplatePlaceholder(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!normalized) return false;
  return (
    normalized.includes('your_')
    || normalized.includes('your-')
    || normalized.includes('paste_')
    || normalized.includes('paste-')
    || normalized.includes('yourdomain.com')
    || normalized === 'placeholder'
    || normalized === 'example'
  );
}

function validHttpsUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (hasTemplatePlaceholder(trimmed)) return false;
  try {
    return new URL(trimmed).protocol === 'https:';
  } catch {
    return false;
  }
}

function criticalEnvConfigured(key: BootstrapCriticalEnvKey, env: Record<string, string | undefined>) {
  const value = env[key]?.trim();
  if (key === 'CLAIMBOT_BILLING_SYNC_SECRET' || key === 'CLAIMBOT_STRIPE_WEBHOOK_SECRET') {
    return (
      ((env.CLAIMBOT_BILLING_SYNC_SECRET?.trim().length ?? 0) >= 32
        && !hasTemplatePlaceholder(env.CLAIMBOT_BILLING_SYNC_SECRET))
      || ((env.CLAIMBOT_STRIPE_WEBHOOK_SECRET?.trim().length ?? 0) >= 32
        && !hasTemplatePlaceholder(env.CLAIMBOT_STRIPE_WEBHOOK_SECRET))
    );
  }
  if (!value) return false;
  if (hasTemplatePlaceholder(value)) return false;
  if (key === 'CLAIMBOT_BILLING_PLUS_MONTHLY_URL' || key === 'CLAIMBOT_BILLING_PRO_MONTHLY_URL') {
    return validHttpsUrl(value);
  }
  if (key === 'CLAIMBOT_LEGAL_REVIEW_ACK') {
    return value === 'reviewed';
  }
  return true;
}

export function getBootstrapCriticalEnvAudit(env: Record<string, string | undefined> = process.env): BootstrapCriticalEnvAudit[] {
  return bootstrapCriticalEnvKeys.map((key) => ({
    key,
    status: criticalEnvConfigured(key, env) ? 'configured' : 'missing',
  }));
}

export function getBootstrapAuditStamp(input: BootstrapAuditStampInput = {}): BootstrapAuditStamp {
  const env = input.env ?? process.env;
  const filingMode = input.filingMode ?? 'shadow';
  const liveFilingEnabled = env.CLAIMBOT_FEATURE_LIVE_FILING === 'true';
  const missingEnvKeys = getBootstrapCriticalEnvAudit(env)
    .filter((item) => item.status === 'missing')
    .map((item) => item.key);
  const authGateState = env.CLAIMBOT_DISABLE_AUTH === 'true' ? 'disabled' : 'active';
  const shadowModeState = filingMode === 'live' && liveFilingEnabled && missingEnvKeys.length === 0
    ? 'reviewed_live'
    : 'enforced';
  const summary = [
    `shadow_mode=${shadowModeState}`,
    `auth_gates=${authGateState}`,
    `missing_env_keys=${missingEnvKeys.length === 0 ? 'none' : missingEnvKeys.join(',')}`,
  ].join(';');
  const digest = createHash('sha256').update(summary).digest('hex').slice(0, 16);

  return {
    authGateState,
    digest,
    missingEnvKeys,
    shadowModeState,
    summary,
  };
}

export function effectiveFilingModeForBootstrap(input: BootstrapAuditStampInput = {}) {
  const requestedMode = input.filingMode ?? 'shadow';
  const stamp = getBootstrapAuditStamp(input);
  return stamp.shadowModeState === 'enforced' ? 'shadow' : requestedMode;
}
