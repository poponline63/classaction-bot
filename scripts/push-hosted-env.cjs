const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const hostedEnvPath = path.join(root, '.env.hosted.local');
const launchEnvPath = path.join(root, '.env.launch.local');
const netlifyContextArgs = ['--context', 'production', 'deploy-preview'];
const checkOnly = process.argv.includes('--check') || process.argv.includes('--dry-run');
const bootstrapMode = process.argv.includes('--bootstrap');
const commandLabel = checkOnly
  ? (bootstrapMode ? '[hosted-env-bootstrap-doctor]' : '[hosted-env-doctor]')
  : (bootstrapMode ? '[push-hosted-env-bootstrap]' : '[push-hosted-env]');

const pushKeys = [
  'DATABASE_URL',
  'DATABASE_AUTH_TOKEN',
  'TURSO_AUTH_TOKEN',
  'CLAIM_FILER_MODE',
  'CLAIM_FILER_LIVE_ACK',
  'CLAIM_FILER_MAX_PER_DAY',
  'CLAIMBOT_WORKER_RUNTIME',
  'CLAIMBOT_WORKER_RUNTIME_RECEIPT',
  'SCRAPER_USER_AGENT',
  'CLAIMBOT_SUPPORT_EMAIL',
  'CLAIMBOT_SUPPORT_URL',
  'CLAIMBOT_DISABLE_AUTH',
  'CLAIMBOT_ENFORCE_CSP',
  'CLAIMBOT_SESSION_SECRET',
  'CLAIMBOT_LEGAL_REVIEW_ACK',
  'CLAIMBOT_FEATURE_SETTLEMENT_SEARCH',
  'CLAIMBOT_FEATURE_BREACH_IMPORT',
  'CLAIMBOT_FEATURE_LIVE_FILING',
  'CLAIMBOT_BETA_NO_BILLING',
  'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
  'CLAIMBOT_BILLING_PLUS_YEARLY_URL',
  'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
  'CLAIMBOT_BILLING_PRO_YEARLY_URL',
  'CLAIMBOT_BILLING_FOUNDING_URL',
  'CLAIMBOT_BILLING_SYNC_SECRET',
  'CLAIMBOT_STRIPE_WEBHOOK_SECRET',
];

const secretKeys = new Set([
  'DATABASE_AUTH_TOKEN',
  'TURSO_AUTH_TOKEN',
  'CLAIMBOT_SESSION_SECRET',
  'CLAIMBOT_BILLING_SYNC_SECRET',
  'CLAIMBOT_STRIPE_WEBHOOK_SECRET',
]);

const requiredKeys = [
  'DATABASE_URL',
  'CLAIM_FILER_MODE',
  'CLAIM_FILER_MAX_PER_DAY',
  'SCRAPER_USER_AGENT',
  'CLAIMBOT_DISABLE_AUTH',
  'CLAIMBOT_ENFORCE_CSP',
  'CLAIMBOT_SESSION_SECRET',
  'CLAIMBOT_FEATURE_SETTLEMENT_SEARCH',
  'CLAIMBOT_FEATURE_LIVE_FILING',
];

const finalLaunchRequiredKeys = [
  ...requiredKeys,
  'CLAIMBOT_WORKER_RUNTIME',
  'CLAIMBOT_WORKER_RUNTIME_RECEIPT',
  'CLAIMBOT_LEGAL_REVIEW_ACK',
  'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
  'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
];

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key) values[key] = value;
  }
  return values;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return parseEnv(fs.readFileSync(filePath, 'utf8'));
}

function clean(value) {
  return (value || '').trim().replace(/^["']|["']$/g, '');
}

function hasTemplatePlaceholder(value) {
  const normalized = clean(value).toLowerCase();
  return (
    !normalized
    || normalized.includes('your_')
    || normalized.includes('your-')
    || normalized.includes('paste_')
    || normalized.includes('paste-')
    || normalized.includes('yourdomain.com')
    || normalized === 'example'
    || normalized === 'placeholder'
  );
}

function hasValue(env, key) {
  return Boolean(clean(env[key])) && !hasTemplatePlaceholder(env[key]);
}

function isHttpsUrl(value) {
  if (hasTemplatePlaceholder(value)) return false;
  try {
    const url = new URL(clean(value));
    return url.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function assertReady(env) {
  const failures = [];
  const warnings = [];
  const activeRequiredKeys = bootstrapMode ? requiredKeys : finalLaunchRequiredKeys;

  for (const key of activeRequiredKeys) {
    if (!hasValue(env, key)) failures.push(`${key} is missing or still a placeholder.`);
  }
  if (!hasValue(env, 'CLAIMBOT_SUPPORT_EMAIL') && !hasValue(env, 'CLAIMBOT_SUPPORT_URL')) {
    failures.push('CLAIMBOT_SUPPORT_EMAIL or CLAIMBOT_SUPPORT_URL is required for hosted client support.');
  }

  if (bootstrapMode) {
    for (const key of finalLaunchRequiredKeys.filter((item) => !requiredKeys.includes(item))) {
      if (!hasValue(env, key)) warnings.push(`${key} is not ready yet; final launch approval will remain blocked.`);
    }
  }

  if (clean(env.DATABASE_URL).startsWith('file:')) {
    failures.push('DATABASE_URL points at local file storage; hosted deploys require persistent external storage.');
  }
  if (clean(env.DATABASE_URL).startsWith('libsql://') && !hasValue(env, 'DATABASE_AUTH_TOKEN') && !hasValue(env, 'TURSO_AUTH_TOKEN')) {
    failures.push('DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN is required for libSQL/Turso hosted databases.');
  }
  if (clean(env.CLAIMBOT_DISABLE_AUTH) === 'true') {
    failures.push('CLAIMBOT_DISABLE_AUTH must be false for hosted preview and production.');
  }
  if (clean(env.CLAIMBOT_FEATURE_LIVE_FILING) === 'true') {
    failures.push('CLAIMBOT_FEATURE_LIVE_FILING must stay false until live filing has been reviewed.');
  }
  if (hasValue(env, 'CLAIMBOT_WORKER_RUNTIME') && !['persistent-worker', 'dedicated-worker', 'external-worker', 'background-worker', 'scheduled-worker', 'github-actions-scheduler'].includes(clean(env.CLAIMBOT_WORKER_RUNTIME))) {
    failures.push('CLAIMBOT_WORKER_RUNTIME must identify the verified paid automation worker host or scheduler.');
  }
  if (hasValue(env, 'CLAIMBOT_WORKER_RUNTIME_RECEIPT') && clean(env.CLAIMBOT_WORKER_RUNTIME_RECEIPT) !== 'verified') {
    failures.push('CLAIMBOT_WORKER_RUNTIME_RECEIPT must be exactly "verified" after a hosted worker smoke completes.');
  }
  if (hasValue(env, 'CLAIMBOT_LEGAL_REVIEW_ACK') && clean(env.CLAIMBOT_LEGAL_REVIEW_ACK) !== 'reviewed') {
    failures.push('CLAIMBOT_LEGAL_REVIEW_ACK must be exactly "reviewed" after legal/compliance review.');
  }
  for (const key of ['CLAIMBOT_BILLING_PLUS_MONTHLY_URL', 'CLAIMBOT_BILLING_PRO_MONTHLY_URL']) {
    if (hasValue(env, key) && !isHttpsUrl(env[key])) failures.push(`${key} must be a real HTTPS checkout URL.`);
  }
  if (!bootstrapMode && !hasValue(env, 'CLAIMBOT_BILLING_SYNC_SECRET') && !hasValue(env, 'CLAIMBOT_STRIPE_WEBHOOK_SECRET')) {
    failures.push('CLAIMBOT_BILLING_SYNC_SECRET or CLAIMBOT_STRIPE_WEBHOOK_SECRET is required for paid entitlement sync.');
  } else if (bootstrapMode && !hasValue(env, 'CLAIMBOT_BILLING_SYNC_SECRET') && !hasValue(env, 'CLAIMBOT_STRIPE_WEBHOOK_SECRET')) {
    warnings.push('Billing sync secret is missing; paid checkout and production preview promotion will remain blocked.');
  }
  if (hasValue(env, 'CLAIMBOT_SESSION_SECRET') && clean(env.CLAIMBOT_SESSION_SECRET).length < 32) {
    failures.push('CLAIMBOT_SESSION_SECRET must be a long generated secret.');
  }
  if (hasValue(env, 'CLAIMBOT_BILLING_SYNC_SECRET') && clean(env.CLAIMBOT_BILLING_SYNC_SECRET).length < 32) {
    failures.push('CLAIMBOT_BILLING_SYNC_SECRET must be a long generated secret.');
  }
  if (hasValue(env, 'CLAIMBOT_STRIPE_WEBHOOK_SECRET') && !clean(env.CLAIMBOT_STRIPE_WEBHOOK_SECRET).startsWith('whsec_')) {
    failures.push('CLAIMBOT_STRIPE_WEBHOOK_SECRET must use Stripe webhook endpoint secret format.');
  }

  if (failures.length > 0) {
    console.error(`${commandLabel} blocked before Netlify env push`);
    for (const failure of failures) console.error(`- ${failure}`);
    console.error('Run npm run hosted:env:prepare, edit .env.hosted.local, keep generated secrets in .env.launch.local, then rerun npm run hosted:env:doctor.');
    console.error('No secret values were printed.');
    process.exit(1);
  }

  return warnings;
}

function runNetlifyEnvSet(key, value, secret) {
  const args = ['env:set', key, value, ...netlifyContextArgs];
  if (secret) args.push('--secret');

  const result = spawnSync('netlify', args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(output || `netlify env:set failed for ${key}`);
  }
}

if (!fs.existsSync(hostedEnvPath)) {
  console.error(`${commandLabel} missing .env.hosted.local`);
  console.error('Run: npm run hosted:env:prepare');
  process.exit(1);
}

try {
  const env = {
    ...process.env,
    ...loadEnvFile(launchEnvPath),
  };
  for (const [key, value] of Object.entries(loadEnvFile(hostedEnvPath))) {
    if (!hasTemplatePlaceholder(value)) env[key] = value;
  }
  const warnings = assertReady(env);

  const pushableKeys = pushKeys.filter((key) => hasValue(env, key));
  if (checkOnly) {
    console.log(`${commandLabel} ok`);
    console.log(`${pushableKeys.length} hosted env value${pushableKeys.length === 1 ? '' : 's'} are ready for Netlify production and deploy-preview contexts.`);
    if (bootstrapMode) {
      console.log('Bootstrap mode only proves prerequisite hosted runtime env can be pushed; it is not launch approval.');
    }
    for (const warning of warnings) console.log(`Warning: ${warning}`);
    console.log('Run npm run hosted:env:push after Netlify CLI login to apply them.');
    console.log('No secret values were printed.');
    process.exit(0);
  }

  let pushed = 0;
  for (const key of pushableKeys) {
    runNetlifyEnvSet(key, clean(env[key]), secretKeys.has(key));
    pushed += 1;
  }

  console.log(`${commandLabel} ok`);
  console.log(`Configured ${pushed} hosted env value${pushed === 1 ? '' : 's'} on Netlify for production and deploy-preview contexts.`);
  if (bootstrapMode) {
    console.log('Bootstrap mode completed. Final launch still requires legal, billing, worker-runtime receipt, deployed preview, and promotion proof.');
  }
  for (const warning of warnings) console.log(`Warning: ${warning}`);
  console.log('No secret values were printed.');
} catch (error) {
  console.error(`${commandLabel} failed`);
  console.error(error instanceof Error ? error.message : String(error));
  console.error('Confirm .env.hosted.local is edited and Netlify CLI login works with: netlify status');
  process.exit(1);
}
