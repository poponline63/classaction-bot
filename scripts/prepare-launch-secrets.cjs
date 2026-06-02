const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const envPath = path.join(root, '.env.launch.local');
const netlifyStatePath = path.join(root, '.netlify', 'state.json');

function randomSecret() {
  return crypto.randomBytes(48).toString('base64url');
}

function parseEnv(text) {
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

function loadExisting() {
  if (!fs.existsSync(envPath)) return new Map();
  return parseEnv(fs.readFileSync(envPath, 'utf8'));
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

const existing = loadExisting();
const netlifyState = loadNetlifyState();
const values = new Map(existing);
let created = 0;

for (const [key, value] of Object.entries(netlifyState)) {
  if (value && !values.has(key)) values.set(key, value);
}

for (const key of ['CLAIMBOT_SESSION_SECRET', 'CLAIMBOT_BILLING_SYNC_SECRET']) {
  const current = values.get(key);
  if (current && current.length >= 32) continue;
  values.set(key, randomSecret());
  created += 1;
}

const orderedKeys = [
  'NETLIFY_SITE_ID',
  'NETLIFY_SITE_SLUG',
  'NETLIFY_SITE_DASHBOARD_URL',
  'CLAIMBOT_SESSION_SECRET',
  'CLAIMBOT_BILLING_SYNC_SECRET',
];
const extraKeys = [...values.keys()].filter((key) => !orderedKeys.includes(key)).sort();
const lines = [
  '# ClaimBot local launch secrets.',
  '# This file is ignored by git. Do not paste its values into chat or committed files.',
  '# Use scripts/run-with-launch-secrets.cjs to run checks with these values loaded.',
  '',
  ...[...orderedKeys, ...extraKeys]
    .filter((key) => values.has(key))
    .map((key) => `${key}=${values.get(key)}`),
  '',
];

fs.writeFileSync(envPath, lines.join('\n'));

console.log('[prepare-launch-secrets] ok');
console.log(`Wrote ${path.relative(root, envPath)}`);
console.log(`Generated ${created} new secret${created === 1 ? '' : 's'}; existing secrets were preserved.`);
console.log('No secret values were printed.');
console.log('');
console.log('To run a command with these local smoke secrets:');
console.log('node scripts/run-with-launch-secrets.cjs npm run netlify:doctor');
console.log('');
console.log('After Netlify CLI login, set matching deployed-preview and production secrets without printing values:');
console.log('npm run launch:push-secrets');
