const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const envPath = path.join(root, '.env.launch.local');
const secretKeys = ['CLAIMBOT_SESSION_SECRET', 'CLAIMBOT_BILLING_SYNC_SECRET'];

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

function runNetlifyEnvSet(key, value) {
  const result = spawnSync('netlify', ['env:set', key, value, '--secret', '--context', 'production', 'deploy-preview'], {
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
  console.error('[push-launch-secrets] missing .env.launch.local');
  console.error('Run: npm run launch:secrets');
  process.exit(1);
}

const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
for (const key of secretKeys) {
  if ((env[key]?.length ?? 0) < 32) {
    console.error(`[push-launch-secrets] ${key} is missing or too short in .env.launch.local`);
    console.error('Run: npm run launch:secrets');
    process.exit(1);
  }
}

try {
  for (const key of secretKeys) runNetlifyEnvSet(key, env[key]);
  console.log('[push-launch-secrets] ok');
  console.log('Configured generated launch secrets on Netlify for production and deploy-preview contexts.');
  console.log('No secret values were printed.');
} catch (error) {
  console.error('[push-launch-secrets] failed');
  console.error(error instanceof Error ? error.message : String(error));
  console.error('Confirm Netlify CLI login with: netlify status');
  process.exit(1);
}
