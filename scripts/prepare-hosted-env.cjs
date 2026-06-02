const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const envPath = path.join(root, '.env.hosted.local');
const examplePath = path.join(root, '.env.hosted.example');
const netlifyStatePath = path.join(root, '.netlify', 'state.json');

function parseEnvToMap(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key) values.set(key, value);
  }
  return values;
}

function loadEnvMap(filePath) {
  if (!fs.existsSync(filePath)) return new Map();
  return parseEnvToMap(fs.readFileSync(filePath, 'utf8'));
}

function loadNetlifyState() {
  if (!fs.existsSync(netlifyStatePath)) return {};
  try {
    const state = JSON.parse(fs.readFileSync(netlifyStatePath, 'utf8'));
    return {
      NETLIFY_SITE_ID: typeof state.siteId === 'string' ? state.siteId : '',
      NETLIFY_SITE_SLUG: typeof state.siteName === 'string' ? state.siteName : '',
      NETLIFY_SITE_DASHBOARD_URL: typeof state.adminUrl === 'string' ? state.adminUrl : '',
    };
  } catch {
    return {};
  }
}

function hasTemplatePlaceholder(value) {
  const normalized = value?.trim().toLowerCase() || '';
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

function setIfMissingOrPlaceholder(values, key, value) {
  if (!value) return;
  const current = values.get(key);
  if (!current || hasTemplatePlaceholder(current)) values.set(key, value);
}

const exampleValues = loadEnvMap(examplePath);
const values = new Map(exampleValues);
const existingValues = loadEnvMap(envPath);

for (const [key, value] of existingValues.entries()) {
  values.set(key, value);
}

for (const [key, value] of Object.entries(loadNetlifyState())) {
  setIfMissingOrPlaceholder(values, key, value);
}

const orderedKeys = [
  'NETLIFY_SITE_ID',
  'SITE_ID',
  'NETLIFY_SITE_SLUG',
  'NETLIFY_SITE_DASHBOARD_URL',
  'DATABASE_URL',
  'DATABASE_AUTH_TOKEN',
  'TURSO_AUTH_TOKEN',
  'CLAIM_FILER_MODE',
  'CLAIM_FILER_LIVE_ACK',
  'CLAIM_FILER_MAX_PER_DAY',
  'CLAIMBOT_WORKER_RUNTIME',
  'CLAIMBOT_WORKER_RUNTIME_RECEIPT',
  'SMOKE_BASE_URL',
  'CLAIMBOT_WORKER_SMOKE_FORM_URL',
  'CLAIMBOT_WORKER_SMOKE_SEED',
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
const extraKeys = [...values.keys()].filter((key) => !orderedKeys.includes(key)).sort();
const lines = [
  '# ClaimBot local hosted launch environment.',
  '# This file is ignored by git. Do not paste its values into chat or committed files.',
  '# Replace placeholders, then use npm run hosted:env:push to set Netlify production and deploy-preview env.',
  '# Generated smoke secrets may stay in .env.launch.local; hosted:env:push loads both ignored env files.',
  '',
  ...[...orderedKeys, ...extraKeys]
    .filter((key) => values.has(key))
    .map((key) => `${key}=${values.get(key)}`),
  '',
];

fs.writeFileSync(envPath, lines.join('\n'));

console.log('[prepare-hosted-env] ok');
console.log(`Wrote ${path.relative(root, envPath)}`);
console.log('Existing operator values were preserved. No secret values were printed.');
console.log('');
console.log('Next steps:');
console.log('1. Edit .env.hosted.local and replace placeholders for database, support, billing, legal review, and deployed preview SMOKE_BASE_URL.');
console.log('2. Run npm run launch:secrets if .env.launch.local does not exist yet.');
console.log('3. Run npm run hosted:env:doctor:bootstrap to check prerequisite hosted runtime env before legal, billing, and worker proof are complete.');
console.log('4. Run npm run hosted:env:push:bootstrap after Netlify CLI login if you need hosted runtime env in place for preview/worker proof.');
console.log('5. Run npm run hosted:env:doctor and npm run hosted:env:push only after final legal, billing, and worker proof values are ready.');
console.log('6. Set CLAIMBOT_WORKER_SMOKE_SEED=allow only for the one worker:file-claim:seed command; do not keep it enabled permanently.');
