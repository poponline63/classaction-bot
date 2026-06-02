import fs from 'node:fs';
import path from 'node:path';
import { hasTemplatePlaceholder } from '@lib/bootstrap-audit-stamp';

export type PreviewPromotionReceiptStatus = 'pass' | 'warn' | 'fail';

export type PreviewPromotionReceiptItem = {
  key: string;
  label: string;
  status: PreviewPromotionReceiptStatus;
  detail: string;
  action?: string;
  serverObservable: boolean;
};

export type PreviewPromotionReceiptReadiness = {
  ok: boolean;
  receiptPath: string;
  exists: boolean;
  formatOk: boolean;
  modeOk: boolean;
  fresh: boolean;
  ageHours: number | null;
  maxAgeHours: number;
  smokeBaseUrl: string | null;
  netlifySiteSlug: string | null;
  sourceCatalogDigest: string | null;
  createdAt: string | null;
  failureCount: number;
  warningCount: number;
  items: PreviewPromotionReceiptItem[];
};

type PreviewPromotionReceiptInput = {
  env?: Record<string, string | undefined>;
  maxAgeHours?: number;
  now?: Date;
  root?: string;
};

const EXPECTED_FORMAT = 'claimbot.preview-promotion-receipt.v1';
const REQUIRED_COMMANDS = [
  'netlify:doctor:strict',
  'validate:netlify:strict',
  'validate:routes',
  'validate:hosted',
  'build:hosted',
  'smoke:web',
  'smoke:auth',
  'smoke:features',
];

function hasValue(value: string | undefined | null) {
  return Boolean(value?.trim()) && !hasTemplatePlaceholder(value ?? '');
}

function isHttpsPreviewUrl(value: string | undefined | null) {
  if (!hasValue(value)) return false;
  try {
    const url = new URL(value!);
    return url.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function previewHostMatchesSlug(smokeBaseUrl: string | undefined | null, siteSlug: string | undefined | null) {
  if (!isHttpsPreviewUrl(smokeBaseUrl) || !hasValue(siteSlug)) return false;
  try {
    const hostname = new URL(smokeBaseUrl!).hostname.toLowerCase();
    const normalizedSlug = siteSlug!.toLowerCase();
    return hostname === `${normalizedSlug}.netlify.app` || hostname.endsWith(`--${normalizedSlug}.netlify.app`);
  } catch {
    return false;
  }
}

function buildItem(
  key: string,
  label: string,
  status: PreviewPromotionReceiptStatus,
  detail: string,
  action?: string,
): PreviewPromotionReceiptItem {
  return {
    key,
    label,
    status,
    detail,
    action,
    serverObservable: false,
  };
}

function missingReadiness(receiptPath: string, maxAgeHours: number): PreviewPromotionReceiptReadiness {
  const items = [
    buildItem(
      'preview-promotion-receipt',
      'Preview promotion receipt',
      'fail',
      'No deployed-preview promotion receipt exists on this operator workspace.',
      'Run npm run preview:gate against the deployed Netlify preview, then run npm run production:check-receipt before production deploy.',
    ),
    buildItem(
      'receipt-freshness',
      'Receipt freshness',
      'fail',
      'Receipt freshness cannot be verified until the deployed-preview gate writes a receipt.',
      'Rerun npm run preview:gate shortly before production deploy.',
    ),
    buildItem(
      'receipt-preview-target',
      'Receipt preview target',
      'fail',
      'Receipt preview URL and confirmed Netlify site slug cannot be verified until the receipt exists.',
      'Confirm the ClaimBot Netlify site, set NETLIFY_SITE_SLUG, and rerun npm run preview:gate.',
    ),
    buildItem(
      'receipt-command-coverage',
      'Receipt command coverage',
      'fail',
      'Receipt command coverage cannot be verified until npm run preview:gate completes.',
      'Use npm run preview:gate, not individual ad hoc commands, before production deploy.',
    ),
    buildItem(
      'receipt-current-target-match',
      'Current target match',
      'fail',
      'Current terminal target values cannot be compared until the receipt exists.',
      'Use the same deployed preview target recorded in the receipt, or rerun npm run preview:gate for the new target.',
    ),
  ];

  return {
    ok: false,
    receiptPath,
    exists: false,
    formatOk: false,
    modeOk: false,
    fresh: false,
    ageHours: null,
    maxAgeHours,
    smokeBaseUrl: null,
    netlifySiteSlug: null,
    sourceCatalogDigest: null,
    createdAt: null,
    failureCount: items.length,
    warningCount: 0,
    items,
  };
}

export function evaluatePreviewPromotionReceipt(input: PreviewPromotionReceiptInput = {}): PreviewPromotionReceiptReadiness {
  const root = input.root ?? process.cwd();
  const env = input.env ?? process.env;
  const maxAgeHours = input.maxAgeHours ?? Number(env.CLAIMBOT_PREVIEW_RECEIPT_MAX_AGE_HOURS || 24);
  const now = input.now ?? new Date();
  const receiptPath = path.join(root, 'data', 'preview-promotion-receipt.json');

  if (!fs.existsSync(receiptPath)) {
    return missingReadiness(receiptPath, maxAgeHours);
  }

  let receipt: Record<string, unknown>;
  try {
    receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  } catch (error) {
    const items = [
      buildItem(
        'preview-promotion-receipt',
        'Preview promotion receipt',
        'fail',
        `The promotion receipt is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        'Rerun npm run preview:gate against the deployed preview.',
      ),
    ];
    return {
      ...missingReadiness(receiptPath, maxAgeHours),
      exists: true,
      items,
      failureCount: 1,
    };
  }

  const createdAt = typeof receipt.createdAt === 'string' ? receipt.createdAt : null;
  const createdAtDate = createdAt ? new Date(createdAt) : null;
  const ageHours = createdAtDate && !Number.isNaN(createdAtDate.getTime())
    ? (now.getTime() - createdAtDate.getTime()) / (1000 * 60 * 60)
    : null;
  const smokeBaseUrl = typeof receipt.smokeBaseUrl === 'string' ? receipt.smokeBaseUrl : null;
  const netlifySiteSlug = typeof receipt.netlifySiteSlug === 'string' ? receipt.netlifySiteSlug : null;
  const sourceCatalogDigest = typeof receipt.sourceCatalogDigest === 'string' ? receipt.sourceCatalogDigest : null;
  const commands = Array.isArray(receipt.commands) ? receipt.commands.filter((command): command is string => typeof command === 'string') : [];
  const formatOk = receipt.format === EXPECTED_FORMAT;
  const modeOk = receipt.mode === 'deployed-preview';
  const fresh = ageHours !== null
    && ageHours >= -0.25
    && (Number.isFinite(maxAgeHours) && maxAgeHours > 0 ? ageHours <= maxAgeHours : true);
  const urlOk = isHttpsPreviewUrl(smokeBaseUrl);
  const slugOk = hasValue(netlifySiteSlug);
  const urlMatchesSlug = previewHostMatchesSlug(smokeBaseUrl, netlifySiteSlug);
  const siteTargetOk = receipt.netlifySiteIdPresent === true;
  const commandCoverageOk = REQUIRED_COMMANDS.every((command) => commands.includes(command));
  const envSmokeUrl = env.SMOKE_BASE_URL?.trim();
  const envSiteSlug = env.NETLIFY_SITE_SLUG?.trim();
  const envMatchesReceipt =
    (!hasValue(envSmokeUrl) || envSmokeUrl === smokeBaseUrl)
    && (!hasValue(envSiteSlug) || envSiteSlug === netlifySiteSlug);

  const items = [
    buildItem(
      'preview-promotion-receipt',
      'Preview promotion receipt',
      formatOk && modeOk ? 'pass' : 'fail',
      formatOk && modeOk
        ? 'Receipt format proves it was written by the deployed-preview gate.'
        : 'Receipt format or mode does not prove a deployed-preview gate pass.',
      'Rerun npm run preview:gate against the deployed preview.',
    ),
    buildItem(
      'receipt-freshness',
      'Receipt freshness',
      fresh ? 'pass' : 'fail',
      fresh
        ? `Receipt was created ${Math.max(0, ageHours ?? 0).toFixed(1)} hours ago.`
        : `Receipt must be recreated within ${maxAgeHours} hours of production deploy.`,
      'Rerun npm run preview:gate shortly before production deploy.',
    ),
    buildItem(
      'receipt-preview-target',
      'Receipt preview target',
      urlOk && slugOk && urlMatchesSlug && siteTargetOk ? 'pass' : 'fail',
      urlOk && slugOk && urlMatchesSlug && siteTargetOk
        ? `Receipt preview URL belongs to the confirmed Netlify site slug ${netlifySiteSlug}.`
        : 'Receipt must include a deployed HTTPS preview URL, confirmed Netlify site slug, and confirmed site target.',
      'Confirm the ClaimBot Netlify site, set NETLIFY_SITE_SLUG, and rerun npm run preview:gate.',
    ),
    buildItem(
      'receipt-command-coverage',
      'Receipt command coverage',
      commandCoverageOk ? 'pass' : 'fail',
      commandCoverageOk
        ? 'Receipt command list includes strict Netlify, hosted, build, auth, feature, and route smoke gates.'
        : 'Receipt does not prove all required deployed-preview gate commands ran.',
      'Use npm run preview:gate, not individual ad hoc commands, before production deploy.',
    ),
    buildItem(
      'receipt-current-target-match',
      'Current target match',
      envMatchesReceipt ? 'pass' : 'fail',
      envMatchesReceipt
        ? 'Current terminal target values are empty or match the receipt.'
        : 'Current SMOKE_BASE_URL or NETLIFY_SITE_SLUG does not match the receipt.',
      'Use the same deployed preview target recorded in the receipt, or rerun npm run preview:gate for the new target.',
    ),
  ];
  const failureCount = items.filter((item) => item.status === 'fail').length;
  const warningCount = items.filter((item) => item.status === 'warn').length;

  return {
    ok: failureCount === 0 && warningCount === 0,
    receiptPath,
    exists: true,
    formatOk,
    modeOk,
    fresh,
    ageHours,
    maxAgeHours,
    smokeBaseUrl: urlOk ? smokeBaseUrl : null,
    netlifySiteSlug: slugOk ? netlifySiteSlug : null,
    sourceCatalogDigest,
    createdAt,
    failureCount,
    warningCount,
    items,
  };
}
