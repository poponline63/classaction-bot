const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const failures = [];

const ignoredDirs = new Set([
  '.git',
  '.next',
  '.next-smoke-features',
  '.next-smoke-hosted-web',
  '.next-smoke-missing-secret',
  'coverage',
  'data',
  'dist',
  'logs',
  'node_modules',
  'out',
  'tmp-ui-audit',
]);

const ignoredFiles = new Set([
  '.env',
  '.env.local',
  '.env.development.local',
  '.env.production.local',
  '.env.test.local',
  'package-lock.json',
]);

const textExtensions = new Set([
  '.cjs',
  '.css',
  '.env',
  '.example',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml',
]);

const envSecretKeys = [
  'CAPSOLVER_API_KEY',
  'CLAIMBOT_BILLING_FOUNDING_URL',
  'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
  'CLAIMBOT_BILLING_PLUS_YEARLY_URL',
  'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
  'CLAIMBOT_BILLING_PRO_YEARLY_URL',
  'CLAIMBOT_BILLING_SYNC_SECRET',
  'CLAIMBOT_SESSION_SECRET',
  'CLAIMBOT_STRIPE_WEBHOOK_SECRET',
  'DATABASE_AUTH_TOKEN',
  'DISCORD_WEBHOOK_URL',
  'ENCRYPTION_KEY',
  'HIBP_API_KEY',
  'KIMI_API_KEY',
  'MOONSHOT_API_KEY',
  'TURSO_AUTH_TOKEN',
];

const placeholderPattern = /^(?:|["']?(?:\.\.\.|(?:https?:\/\/)?YOUR[_A-Z0-9-]*|PASTE[_A-Z0-9-]*|whsec_YOUR[_A-Z0-9-]*|your[-_a-z0-9.]*|placeholder|example|support@example\.com|support@yourdomain\.com|YOUR_WEBHOOK_URL|YOUR_HIBP_KEY|YOUR_DATABASE_TOKEN)["']?)$/i;

function isTextFile(file) {
  const base = path.basename(file);
  if (base === '.env.example') return true;
  if (base === '.env.hosted.example') return true;
  if (base.startsWith('.env')) return false;
  return textExtensions.has(path.extname(file));
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name) || entry.name.startsWith('.next-smoke-') || entry.name.startsWith('.next-dev')) continue;
      walk(path.join(dir, entry.name));
      continue;
    }

    if (!entry.isFile()) continue;
    const fullPath = path.join(dir, entry.name);
    const relative = path.relative(root, fullPath).replace(/\\/g, '/');
    if (ignoredFiles.has(relative) || ignoredFiles.has(entry.name)) continue;
    if (!isTextFile(fullPath)) continue;
    scanFile(fullPath, relative);
  }
}

function addFailure(relative, lineNumber, label) {
  failures.push(`${relative}:${lineNumber} contains ${label}. Move real secrets to Netlify/env vars and keep only placeholders in source.`);
}

function assignedValue(rawValue) {
  const value = rawValue.trim();
  const quote = value[0];
  if (quote === '"' || quote === "'") {
    const end = value.indexOf(quote, 1);
    return end === -1 ? value.slice(1) : value.slice(1, end);
  }
  return value.split(/\s+/)[0] ?? '';
}

function scanFile(file, relative) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(line)) {
      addFailure(relative, lineNumber, 'an API key-like sk-* token');
    }

    if (/https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/.test(line)) {
      addFailure(relative, lineNumber, 'a Discord webhook URL');
    }

    for (const key of envSecretKeys) {
      const directAssignment = line.match(new RegExp(`^\\s*(?:export\\s+|\\$env:)?${key}\\s*=\\s*([^#\\r\\n]+)`));
      const netlifyAssignment = line.match(new RegExp(`\\bnetlify\\s+env:set\\s+${key}\\s+([^#\\r\\n]+)`));
      const assignment = directAssignment || netlifyAssignment;
      if (!assignment) continue;
      const value = assignedValue(assignment[1]).replace(/,$/, '');
      if (!placeholderPattern.test(value)) {
        addFailure(relative, lineNumber, `${key} assigned to a non-placeholder value`);
      }
    }
  });
}

walk(root);

if (failures.length > 0) {
  console.error('[validate-secret-hygiene] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[validate-secret-hygiene] ok');
