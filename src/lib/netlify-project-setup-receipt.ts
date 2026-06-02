import fs from 'node:fs';
import path from 'node:path';

export const NETLIFY_PROJECT_SETUP_RECEIPT_FORMAT = 'claimbot.netlify-project-setup-receipt.v1';

export const expectedSafeNetlifyEnvKeys = [
  'CLAIM_FILER_MODE',
  'CLAIM_FILER_MAX_PER_DAY',
  'SCRAPER_USER_AGENT',
  'CLAIMBOT_SUPPORT_EMAIL',
  'CLAIMBOT_DISABLE_AUTH',
  'CLAIMBOT_ENFORCE_CSP',
  'CLAIMBOT_FEATURE_SETTLEMENT_SEARCH',
  'CLAIMBOT_FEATURE_BREACH_IMPORT',
  'CLAIMBOT_FEATURE_LIVE_FILING',
  'NETLIFY_SITE_SLUG',
  'NETLIFY_SITE_DASHBOARD_URL',
] as const;

export type NetlifyProjectSetupReceipt = {
  format: typeof NETLIFY_PROJECT_SETUP_RECEIPT_FORMAT;
  generatedAt: string;
  siteId: string;
  siteName: string;
  dashboardUrl: string;
  configuredSafeEnvKeys: string[];
  identity?: {
    enabled: boolean;
    registration: 'invite-only' | 'open' | 'unknown';
    emailConfirmation: boolean;
    verifiedAt?: string;
    evidence?: string;
  };
  notes?: string[];
};

export type NetlifyProjectSetupReceiptReadiness = {
  ok: boolean;
  receiptPath: string;
  receipt: NetlifyProjectSetupReceipt | null;
  missingSafeEnvKeys: string[];
  identityReady: boolean;
  identityWarnings: string[];
  failures: string[];
  warnings: string[];
};

function readReceiptJson(receiptPath: string) {
  if (!fs.existsSync(receiptPath)) return null;
  return JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as unknown;
}

function isReceipt(value: unknown): value is NetlifyProjectSetupReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Partial<NetlifyProjectSetupReceipt>;
  const identity = receipt.identity as NetlifyProjectSetupReceipt['identity'] | undefined;
  const identityValid = !identity || (
    typeof identity.enabled === 'boolean'
    && ['invite-only', 'open', 'unknown'].includes(identity.registration)
    && typeof identity.emailConfirmation === 'boolean'
    && (identity.verifiedAt === undefined || typeof identity.verifiedAt === 'string')
    && (identity.evidence === undefined || typeof identity.evidence === 'string')
  );
  return (
    receipt.format === NETLIFY_PROJECT_SETUP_RECEIPT_FORMAT
    && typeof receipt.generatedAt === 'string'
    && typeof receipt.siteId === 'string'
    && typeof receipt.siteName === 'string'
    && typeof receipt.dashboardUrl === 'string'
    && Array.isArray(receipt.configuredSafeEnvKeys)
    && receipt.configuredSafeEnvKeys.every((key) => typeof key === 'string')
    && identityValid
  );
}

export function evaluateNetlifyProjectSetupReceipt(root = process.cwd()): NetlifyProjectSetupReceiptReadiness {
  const receiptPath = path.join(root, 'data', 'netlify-project-setup-receipt.json');
  const failures: string[] = [];
  const warnings: string[] = [];
  let receipt: NetlifyProjectSetupReceipt | null = null;

  try {
    const raw = readReceiptJson(receiptPath);
    if (!raw) {
      warnings.push('No non-secret Netlify project setup receipt has been recorded yet.');
    } else if (!isReceipt(raw)) {
      failures.push('Netlify project setup receipt exists but is not a valid v1 receipt.');
    } else {
      receipt = raw;
    }
  } catch (error) {
    failures.push(`Netlify project setup receipt could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }

  const configured = new Set(receipt?.configuredSafeEnvKeys ?? []);
  const missingSafeEnvKeys = expectedSafeNetlifyEnvKeys.filter((key) => !configured.has(key));
  if (receipt && missingSafeEnvKeys.length > 0) {
    warnings.push(`Netlify project setup receipt is missing safe env keys: ${missingSafeEnvKeys.join(', ')}.`);
  }
  const identityWarnings: string[] = [];
  if (receipt && receipt.identity?.enabled !== true) {
    identityWarnings.push('Netlify project setup receipt does not record Identity as enabled; confirm Project configuration > Identity before inviting clients.');
  }
  if (receipt?.identity?.enabled === true && receipt.identity.registration !== 'invite-only') {
    identityWarnings.push('Netlify project setup receipt does not record invite-only registration; confirm open signup is intentionally reviewed before client launch.');
  }
  if (receipt?.identity?.enabled === true && receipt.identity.emailConfirmation !== true) {
    identityWarnings.push('Netlify project setup receipt does not record email confirmation as enabled for production accounts.');
  }
  warnings.push(...identityWarnings);
  const identityReady = Boolean(
    receipt?.identity?.enabled === true
    && receipt.identity.registration === 'invite-only'
    && receipt.identity.emailConfirmation === true,
  );

  return {
    ok: Boolean(receipt) && failures.length === 0 && missingSafeEnvKeys.length === 0 && identityReady,
    receiptPath,
    receipt,
    missingSafeEnvKeys,
    identityReady,
    identityWarnings,
    failures,
    warnings,
  };
}
