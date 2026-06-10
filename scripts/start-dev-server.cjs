const path = require('node:path');
const { spawn } = require('node:child_process');

function cliValue(names) {
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    const [name, inlineValue] = arg.split('=', 2);
    if (names.includes(name)) {
      return inlineValue || process.argv[index + 1] || '';
    }
  }
  return '';
}

const port = cliValue(['--port', '-p']) || process.env.PORT || process.env.CLAIMBOT_DEV_PORT || '3100';
const distDir = process.env.CLAIMBOT_DEV_DIST_DIR || (port === '3100' ? '.next-dev' : `.next-dev-${port}`);
const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');

const env = {
  ...process.env,
  NEXT_DIST_DIR: distDir,
};

// Some tooling auto-loads every .env*.local file (including the hosted
// launch env) into the parent environment. Local dev should never inherit
// hosted-only auth enforcement from there; opt back in with
// CLAIMBOT_DEV_KEEP_HOSTED_ENV=true when intentionally testing hosted auth.
if (env.CLAIMBOT_DEV_KEEP_HOSTED_ENV !== 'true') {
  // Windows environments are case-insensitive, so strip every case variant.
  for (const key of Object.keys(env)) {
    if (/^(?:claimbot_require_auth|netlify)$/i.test(key)) delete env[key];
  }
}

const child = spawn(process.execPath, [nextBin, 'dev', '-p', port], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  windowsHide: true,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
