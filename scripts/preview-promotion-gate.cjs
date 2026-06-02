const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const args = new Set(process.argv.slice(2));
const localMode = args.has('--local');
const checkEnvOnly = args.has('--check-env-only');
const receiptPath = path.join(process.cwd(), 'data', 'preview-promotion-receipt.json');
const hostedEnvPath = path.join(process.cwd(), '.env.hosted.local');
const launchEnvPath = path.join(process.cwd(), '.env.launch.local');

const requiredHostedEnv = [
  'DATABASE_URL',
  'SCRAPER_USER_AGENT',
  'CLAIMBOT_SUPPORT_EMAIL',
  'CLAIMBOT_SESSION_SECRET',
  'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
  'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
  'CLAIMBOT_LEGAL_REVIEW_ACK',
  'SMOKE_BASE_URL',
];

function valueOf(key) {
  return process.env[key]?.trim() || '';
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (key) values[key] = value;
  }
  return values;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return parseEnv(fs.readFileSync(filePath, 'utf8'));
}

function hasTemplatePlaceholder(value) {
  const normalized = value?.trim().toLowerCase() || '';
  if (!normalized) return false;
  return (
    normalized.includes('your_')
    || normalized.includes('your-')
    || normalized.includes('paste_')
    || normalized.includes('paste-')
    || normalized.includes('yourdomain.com')
    || normalized === 'example'
    || normalized === 'placeholder'
  );
}

function loadIgnoredOperatorEnv() {
  const launchEnv = loadEnvFile(launchEnvPath);
  const hostedEnv = loadEnvFile(hostedEnvPath);
  let loaded = 0;

  for (const [key, value] of Object.entries(launchEnv)) {
    if (value && !hasTemplatePlaceholder(value) && (!process.env[key] || hasTemplatePlaceholder(process.env[key]))) {
      process.env[key] = value;
      loaded += 1;
    }
  }

  for (const [key, value] of Object.entries(hostedEnv)) {
    if (value && !hasTemplatePlaceholder(value) && (!process.env[key] || hasTemplatePlaceholder(process.env[key]))) {
      process.env[key] = value;
      loaded += 1;
    }
  }

  if (loaded > 0) {
    console.log(`[preview-promotion-gate] loaded ${loaded} non-placeholder value${loaded === 1 ? '' : 's'} from ignored local env files; no values printed`);
  }
}

function hasValue(key) {
  const value = valueOf(key);
  return Boolean(value) && !hasTemplatePlaceholder(value);
}

function isHttpsUrl(value) {
  if (!value || hasTemplatePlaceholder(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function localNetlifyState() {
  const statePath = path.join(process.cwd(), '.netlify', 'state.json');
  if (!fs.existsSync(statePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
}

function slugFromDashboardUrl(value) {
  if (!value || hasTemplatePlaceholder(value)) return '';
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const sitesIndex = parts.indexOf('sites');
    return sitesIndex >= 0 ? (parts[sitesIndex + 1] || '').trim() : '';
  } catch {
    return '';
  }
}

function smokeUrlMatchesSiteSlug(smokeBaseUrl, siteSlug) {
  if (!siteSlug || !isHttpsUrl(smokeBaseUrl)) return false;
  try {
    const hostname = new URL(smokeBaseUrl).hostname.toLowerCase();
    const normalizedSlug = siteSlug.toLowerCase();
    return hostname === `${normalizedSlug}.netlify.app` || hostname.endsWith(`--${normalizedSlug}.netlify.app`);
  } catch {
    return false;
  }
}

function netlifyLaunchTarget() {
  const localState = localNetlifyState();
  const localStateSiteId = typeof localState?.siteId === 'string' ? localState.siteId.trim() : '';
  const localStateSiteName = typeof localState?.siteName === 'string' ? localState.siteName.trim() : '';
  const localStateAdminUrl = typeof localState?.adminUrl === 'string' ? localState.adminUrl.trim() : '';
  const dashboardSlug = slugFromDashboardUrl(valueOf('NETLIFY_SITE_DASHBOARD_URL'));
  const localAdminSlug = slugFromDashboardUrl(localStateAdminUrl);
  const siteTarget = valueOf('NETLIFY_SITE_ID') || valueOf('SITE_ID') || localStateSiteId;
  const siteTargetSource =
    valueOf('NETLIFY_SITE_ID') ? 'NETLIFY_SITE_ID'
      : valueOf('SITE_ID') ? 'SITE_ID'
        : localStateSiteId ? '.netlify/state.json'
          : 'missing';
  const siteSlug =
    valueOf('NETLIFY_SITE_SLUG')
    || dashboardSlug
    || localStateSiteName
    || localAdminSlug;
  const siteSlugSource =
    valueOf('NETLIFY_SITE_SLUG') ? 'NETLIFY_SITE_SLUG'
      : dashboardSlug ? 'NETLIFY_SITE_DASHBOARD_URL'
        : localStateSiteName ? '.netlify/state.json siteName'
          : localAdminSlug ? '.netlify/state.json adminUrl'
            : 'missing';

  return {
    siteTarget,
    siteTargetSource,
    siteSlug,
    siteSlugSource,
  };
}

function assertHostedEnv() {
  const missing = requiredHostedEnv.filter((key) => !hasValue(key));
  const wrong = [];
  const { siteTarget, siteSlug } = netlifyLaunchTarget();
  const placeholderKeys = [
    ...requiredHostedEnv,
    'CLAIMBOT_BILLING_SYNC_SECRET',
    'CLAIMBOT_STRIPE_WEBHOOK_SECRET',
    'DATABASE_AUTH_TOKEN',
    'TURSO_AUTH_TOKEN',
    'NETLIFY_SITE_ID',
    'SITE_ID',
  ].filter((key) => process.env[key]?.trim() && hasTemplatePlaceholder(process.env[key]));

  if (process.env.CLAIMBOT_DISABLE_AUTH === 'true') {
    wrong.push('CLAIMBOT_DISABLE_AUTH must not be true for preview promotion.');
  }
  if (!siteTarget || hasTemplatePlaceholder(siteTarget)) {
    wrong.push('A confirmed ClaimBot Netlify site target is required. Run netlify link, or set NETLIFY_SITE_ID/SITE_ID after confirming the site.');
  }
  if (!siteSlug || hasTemplatePlaceholder(siteSlug)) {
    wrong.push('A confirmed Netlify site slug is required to prove SMOKE_BASE_URL belongs to the ClaimBot site. Set NETLIFY_SITE_SLUG or NETLIFY_SITE_DASHBOARD_URL after confirming the site.');
  } else if (hasValue('SMOKE_BASE_URL') && !smokeUrlMatchesSiteSlug(valueOf('SMOKE_BASE_URL'), siteSlug)) {
    wrong.push(`SMOKE_BASE_URL must belong to the confirmed Netlify site slug "${siteSlug}".`);
  }
  if (process.env.CLAIMBOT_FEATURE_LIVE_FILING === 'true') {
    wrong.push('CLAIMBOT_FEATURE_LIVE_FILING must stay false until live filing has been reviewed.');
  }
  if (process.env.CLAIMBOT_FEATURE_SETTLEMENT_SEARCH === 'false') {
    wrong.push('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH must stay true for client preview promotion.');
  }
  if (process.env.CLAIMBOT_LEGAL_REVIEW_ACK && process.env.CLAIMBOT_LEGAL_REVIEW_ACK !== 'reviewed') {
    wrong.push('CLAIMBOT_LEGAL_REVIEW_ACK must be exactly "reviewed" after legal/compliance review.');
  }
  if (placeholderKeys.length > 0) {
    wrong.push(`Replace copied setup placeholders before preview promotion: ${placeholderKeys.join(', ')}.`);
  }
  if (valueOf('DATABASE_URL').startsWith('file:')) {
    wrong.push('DATABASE_URL must point at hosted persistent storage, not file: storage.');
  }
  if (!isHttpsUrl(valueOf('SMOKE_BASE_URL'))) {
    wrong.push('SMOKE_BASE_URL must be a deployed HTTPS preview URL, not localhost or a placeholder.');
  }
  for (const checkoutKey of ['CLAIMBOT_BILLING_PLUS_MONTHLY_URL', 'CLAIMBOT_BILLING_PRO_MONTHLY_URL']) {
    if (!isHttpsUrl(valueOf(checkoutKey))) {
      wrong.push(`${checkoutKey} must be a real HTTPS processor-hosted checkout URL.`);
    }
  }
  if (hasValue('CLAIMBOT_SESSION_SECRET') && valueOf('CLAIMBOT_SESSION_SECRET').length < 32) {
    wrong.push('CLAIMBOT_SESSION_SECRET must be a long generated secret, not a short copied value.');
  }
  if (hasValue('CLAIMBOT_BILLING_SYNC_SECRET') && valueOf('CLAIMBOT_BILLING_SYNC_SECRET').length < 32) {
    wrong.push('CLAIMBOT_BILLING_SYNC_SECRET must be a long generated secret, not a short copied value.');
  }
  if (hasValue('CLAIMBOT_STRIPE_WEBHOOK_SECRET') && !valueOf('CLAIMBOT_STRIPE_WEBHOOK_SECRET').startsWith('whsec_')) {
    wrong.push('CLAIMBOT_STRIPE_WEBHOOK_SECRET must use the Stripe webhook endpoint secret format.');
  }
  if (!hasValue('CLAIMBOT_BILLING_SYNC_SECRET') && !hasValue('CLAIMBOT_STRIPE_WEBHOOK_SECRET')) {
    wrong.push('Set CLAIMBOT_BILLING_SYNC_SECRET or CLAIMBOT_STRIPE_WEBHOOK_SECRET before preview promotion.');
  }

  if (missing.length > 0 || wrong.length > 0) {
    console.error('[preview-promotion-gate] blocked before running commands');
    if (missing.length > 0) {
      console.error(`Missing required hosted env: ${missing.join(', ')}`);
    }
    for (const item of wrong) console.error(item);
    console.error('Use npm run hosted:checklist for setup commands, then rerun npm run preview:gate.');
    process.exit(1);
  }
}

function sourceCatalogDigest() {
  const digestPath = path.join(process.cwd(), 'data', 'source-catalog-export.json.sha256');
  if (!fs.existsSync(digestPath)) return null;
  const raw = fs.readFileSync(digestPath, 'utf8').trim();
  const digest = raw.split(/\s+/)[0] || '';
  return /^[a-f0-9]{64}$/i.test(digest) ? digest.toLowerCase() : null;
}

function writePreviewPromotionReceipt(commands) {
  if (localMode || checkEnvOnly) return;
  const { siteTarget, siteTargetSource, siteSlug, siteSlugSource } = netlifyLaunchTarget();
  const receipt = {
    format: 'claimbot.preview-promotion-receipt.v1',
    createdAt: new Date().toISOString(),
    mode: 'deployed-preview',
    smokeBaseUrl: valueOf('SMOKE_BASE_URL'),
    netlifySiteSlug: siteSlug,
    siteSlugSource,
    siteTargetSource,
    netlifySiteIdPresent: Boolean(siteTarget),
    commands,
    sourceCatalogDigest: sourceCatalogDigest(),
    note: 'Non-secret receipt proving npm run preview:gate completed against a deployed preview. This file intentionally omits site IDs, tokens, session secrets, billing secrets, and database credentials.',
  };
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`[preview-promotion-gate] wrote non-secret promotion receipt: ${path.relative(process.cwd(), receiptPath)}`);
}

async function assertLocalApp() {
  if (!localMode) return;
  console.log('[preview-promotion-gate] local mode uses npm run smoke:hosted:local with an isolated smoke server.');
}

function run(command, args) {
  const printable = [command, ...args].join(' ');
  console.log(`\n[preview-promotion-gate] ${printable}`);
  const result = spawnSync(command, args, {
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`[preview-promotion-gate] failed: ${printable}`);
    process.exit(result.status || 1);
  }
}

function npm(script) {
  run('npm', ['run', script]);
}

async function main() {
  if (!localMode) loadIgnoredOperatorEnv();
  if (!localMode) assertHostedEnv();
  if (checkEnvOnly) {
    console.log('[preview-promotion-gate] deployed-preview environment inputs ok');
    return;
  }
  await assertLocalApp();

  const commands = localMode
    ? [
      'typecheck',
      'validate:secrets',
      'validate:routes',
      'validate:ui',
      'validate:legal',
      'validate:pwa',
      'db:migrate',
      'validate:schema',
      'validate:source',
      'enrich:source',
      'source:export',
      'validate:source:strict',
      'source:import:dry',
      'build',
      'smoke:hosted:local',
    ]
    : [
      'typecheck',
      'validate:secrets',
      'netlify:doctor:strict',
      'validate:netlify:strict',
      'validate:routes',
      'validate:ui',
      'validate:legal',
      'validate:pwa',
      'validate:hosted',
      'db:migrate',
      'validate:schema',
      'validate:source',
      'enrich:source',
      'source:export',
      'validate:source:strict',
      'source:import:dry',
      'build:hosted',
      'smoke:web',
      'smoke:auth',
      'smoke:features',
    ];

  console.log(`[preview-promotion-gate] mode=${localMode ? 'local' : 'deployed-preview'}`);
  for (const command of commands) npm(command);
  writePreviewPromotionReceipt(commands);
  console.log('\n[preview-promotion-gate] ok');
}

main().catch((error) => {
  console.error('[preview-promotion-gate] failed');
  console.error(error);
  process.exit(1);
});
