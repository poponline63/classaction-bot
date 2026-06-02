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

function visibleUrlShape(databaseUrl) {
  if (databaseUrl.startsWith('libsql://')) return 'libsql://...';
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) return 'postgres://...';
  if (databaseUrl.startsWith('mysql://')) return 'mysql://...';
  if (databaseUrl.startsWith('sqlite://')) return 'sqlite://...';
  return `${databaseUrl.split(':')[0] || 'unknown'}:...`;
}

function validateHostedDatabaseEnv(env) {
  const failures = [];
  const warnings = [];
  const databaseUrl = clean(env.DATABASE_URL);
  const databaseAuthToken = clean(env.DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN);

  if (!databaseUrl || hasTemplatePlaceholder(databaseUrl) || databaseUrl.includes('YOUR_DATABASE')) {
    failures.push('DATABASE_URL is missing or still placeholder-only in .env.hosted.local.');
  } else if (databaseUrl.startsWith('file:')) {
    failures.push('DATABASE_URL points at local file storage; hosted deploys require persistent external storage.');
  } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(databaseUrl)) {
    warnings.push('DATABASE_URL does not look like a standard hosted URL; confirm your database driver supports it.');
  }

  if (databaseUrl.startsWith('libsql://') && (!databaseAuthToken || hasTemplatePlaceholder(databaseAuthToken))) {
    failures.push('DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN must be set for libSQL/Turso hosted databases.');
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    databaseUrlShape: databaseUrl && !hasTemplatePlaceholder(databaseUrl) ? visibleUrlShape(databaseUrl) : 'missing',
    databaseAuthTokenPresent: Boolean(databaseAuthToken && !hasTemplatePlaceholder(databaseAuthToken)),
  };
}

if (!fs.existsSync(envPath)) {
  console.error('[validate-hosted-database-env] failed');
  console.error('Missing .env.hosted.local.');
  console.error('Run: npm run hosted:db:prepare');
  process.exit(1);
}

const result = validateHostedDatabaseEnv(parseEnv(fs.readFileSync(envPath, 'utf8')));

if (!result.ok) {
  console.error('[validate-hosted-database-env] failed');
  for (const failure of result.failures) console.error(`- ${failure}`);
  for (const warning of result.warnings) console.error(`- warning: ${warning}`);
  console.error('No database secret values were printed.');
  console.error('Edit .env.hosted.local, then rerun: npm run hosted:db:doctor');
  process.exit(1);
}

console.log('[validate-hosted-database-env] ok');
console.log(`DATABASE_URL shape: ${result.databaseUrlShape}`);
console.log(`Database auth token present: ${result.databaseAuthTokenPresent ? 'yes' : 'not required or not set'}`);
for (const warning of result.warnings) console.warn(`[validate-hosted-database-env] warning: ${warning}`);
console.log('No database secret values were printed.');
