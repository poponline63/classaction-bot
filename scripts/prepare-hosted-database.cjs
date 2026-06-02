const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const envPath = path.join(root, '.env.hosted.local');
const netlifyStatePath = path.join(root, '.netlify', 'state.json');

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

function setDefault(values, key, value) {
  if (!values.has(key) || values.get(key) === '') values.set(key, value);
}

const values = loadExisting();
const netlifyState = loadNetlifyState();

for (const [key, value] of Object.entries(netlifyState)) {
  if (value && (!values.has(key) || values.get(key) === '')) values.set(key, value);
}

setDefault(values, 'DATABASE_URL', 'libsql://YOUR_DATABASE.turso.io');
setDefault(values, 'DATABASE_AUTH_TOKEN', 'YOUR_DATABASE_TOKEN');
setDefault(values, 'TURSO_AUTH_TOKEN', '');

const orderedKeys = [
  'NETLIFY_SITE_ID',
  'NETLIFY_SITE_SLUG',
  'NETLIFY_SITE_DASHBOARD_URL',
  'DATABASE_URL',
  'DATABASE_AUTH_TOKEN',
  'TURSO_AUTH_TOKEN',
];
const extraKeys = [...values.keys()].filter((key) => !orderedKeys.includes(key)).sort();
const lines = [
  '# ClaimBot local hosted database values.',
  '# This file is ignored by git. Do not paste its values into chat or committed files.',
  '# Replace placeholders with the real hosted database URL/token, then use scripts/run-with-hosted-env.cjs.',
  '',
  ...[...orderedKeys, ...extraKeys]
    .filter((key) => values.has(key))
    .map((key) => `${key}=${values.get(key)}`),
  '',
];

fs.writeFileSync(envPath, lines.join('\n'));

console.log('[prepare-hosted-database] ok');
console.log(`Wrote ${path.relative(root, envPath)}`);
console.log('Existing values were preserved. No secret values were printed.');
console.log('');
console.log('Next steps:');
console.log('1. Edit .env.hosted.local and replace the database placeholders.');
console.log('2. Run hosted DB commands without printing secrets:');
console.log('   npm run hosted:db:doctor');
console.log('   npm run with:hosted-env -- npm run db:migrate');
console.log('   npm run with:hosted-env -- npm run source:import:dry');
console.log('   npm run with:hosted-env -- npm run source:import');
console.log('3. After Netlify CLI login, push the database env without printing values:');
console.log('   npm run hosted:db:push');
