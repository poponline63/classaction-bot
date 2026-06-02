const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const envPath = path.join(root, '.env.launch.local');
const args = process.argv.slice(2);

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

function expandPowerShellEnvRefs(value, env) {
  return value.replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/g, (_match, key) => env[key] || '');
}

if (args.length === 0) {
  console.error('Usage: node scripts/run-with-launch-secrets.cjs <command> [...args]');
  console.error('Example: node scripts/run-with-launch-secrets.cjs npm run netlify:doctor');
  process.exit(1);
}

if (!fs.existsSync(envPath)) {
  console.error('[run-with-launch-secrets] missing .env.launch.local');
  console.error('Run: npm run launch:secrets');
  process.exit(1);
}

const launchEnv = parseEnv(fs.readFileSync(envPath, 'utf8'));
const env = {
  ...process.env,
  ...launchEnv,
};
const [command, ...rawCommandArgs] = args;
const commandArgs = rawCommandArgs.map((arg) => expandPowerShellEnvRefs(arg, env));

const result = spawnSync(command, commandArgs, {
  cwd: root,
  env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
