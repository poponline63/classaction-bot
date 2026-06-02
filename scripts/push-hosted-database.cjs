const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const envPath = path.join(root, '.env.hosted.local');

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

function hasTemplatePlaceholder(value) {
  return /^(?:|["']?(?:YOUR[_A-Z0-9-]*|PASTE[_A-Z0-9-]*|your[-_a-z0-9.]*|placeholder|example)["']?)$/i.test(value);
}

function clean(value) {
  return (value || '').trim().replace(/^["']|["']$/g, '');
}

function assertHostedDatabaseEnv(env) {
  const databaseUrl = clean(env.DATABASE_URL);
  const databaseAuthToken = clean(env.DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN);

  if (!databaseUrl || hasTemplatePlaceholder(databaseUrl) || databaseUrl.includes('YOUR_DATABASE')) {
    throw new Error('DATABASE_URL is still missing or placeholder-only in .env.hosted.local');
  }

  if (databaseUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL points at local file storage; hosted deploys require persistent external storage.');
  }

  if (databaseUrl.startsWith('libsql://') && (!databaseAuthToken || hasTemplatePlaceholder(databaseAuthToken))) {
    throw new Error('DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN must be set for libSQL/Turso hosted databases.');
  }

  return {
    databaseUrl,
    databaseAuthToken,
  };
}

function runNetlifyEnvSet(key, value, secret = false) {
  const args = ['env:set', key, value, '--context', 'production', 'deploy-preview'];
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

if (!fs.existsSync(envPath)) {
  console.error('[push-hosted-database] missing .env.hosted.local');
  console.error('Run: npm run hosted:db:prepare');
  process.exit(1);
}

try {
  const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
  const { databaseUrl, databaseAuthToken } = assertHostedDatabaseEnv(env);

  runNetlifyEnvSet('DATABASE_URL', databaseUrl, false);
  if (databaseAuthToken) runNetlifyEnvSet('DATABASE_AUTH_TOKEN', databaseAuthToken, true);

  console.log('[push-hosted-database] ok');
  console.log('Configured hosted database env on Netlify for production and deploy-preview contexts.');
  console.log('No database secret values were printed.');
} catch (error) {
  console.error('[push-hosted-database] failed');
  console.error(error instanceof Error ? error.message : String(error));
  console.error('Confirm .env.hosted.local is edited and Netlify CLI login works with: netlify status');
  process.exit(1);
}
