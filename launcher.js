#!/usr/bin/env node
// =============================================================================
// Class Action Bot — Desktop Launcher
// =============================================================================
// Double-click this (or run `node launcher.js`) to start the bot.
// It boots the web server + worker, opens your browser, and keeps running.
//
// On first run it creates the database and opens the setup wizard.
// On subsequent runs it opens the dashboard.
// =============================================================================

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── Data directory ──────────────────────────────────────────────────────────
const APP_DATA = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'classaction-bot',
);
const DATA_DIR = path.join(APP_DATA, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'classaction.db');
const firstRun = !fs.existsSync(DB_FILE);

// ─── Environment ─────────────────────────────────────────────────────────────
const PROJECT_DIR = __dirname;
const PORT = process.env.PORT || '3100';

const childEnv = {
  ...process.env,
  NODE_ENV: 'production',
  PORT,
  DATA_DIR,
  DATABASE_URL: `file:${DB_FILE}`,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function log(tag, msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] [${tag}] ${msg}`);
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'start'
    : process.platform === 'darwin' ? 'open' : 'xdg-open';
  try {
    execSync(`${cmd} ${url}`, { stdio: 'ignore' });
  } catch {
    log('launcher', `Open ${url} in your browser`);
  }
}

async function waitForServer(url, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// ─── Run migrations on first launch ──────────────────────────────────────────
if (firstRun) {
  log('launcher', 'First run detected — running database migrations...');
}
try {
  // Always run migrations (idempotent) to pick up any schema changes
  const migrateResult = require('child_process').spawnSync(
    process.execPath,
    [path.join(PROJECT_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'scripts/migrate.ts'],
    { cwd: PROJECT_DIR, env: childEnv, stdio: 'pipe' },
  );
  if (migrateResult.status === 0) {
    log('launcher', 'Database ready');
  } else {
    log('launcher', 'Migration output: ' + (migrateResult.stderr || migrateResult.stdout || '').toString().slice(0, 200));
  }
} catch (err) {
  log('launcher', 'Migration warning: ' + err.message);
}

// ─── Start web server ────────────────────────────────────────────────────────
log('launcher', `Starting web server on port ${PORT}...`);

const webProcess = spawn(
  process.execPath,
  [path.join(PROJECT_DIR, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', PORT],
  { cwd: PROJECT_DIR, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] },
);
webProcess.stdout.on('data', d => process.stdout.write(`[web] ${d}`));
webProcess.stderr.on('data', d => process.stderr.write(`[web] ${d}`));
webProcess.on('exit', code => log('web', `exited with code ${code}`));

// ─── Start worker ────────────────────────────────────────────────────────────
log('launcher', 'Starting worker...');

const workerProcess = spawn(
  process.execPath,
  [path.join(PROJECT_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'worker/index.ts'],
  { cwd: PROJECT_DIR, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] },
);
workerProcess.stdout.on('data', d => process.stdout.write(`[worker] ${d}`));
workerProcess.stderr.on('data', d => process.stderr.write(`[worker] ${d}`));
workerProcess.on('exit', code => log('worker', `exited with code ${code}`));

// ─── Open browser when server is ready ───────────────────────────────────────
const startUrl = firstRun
  ? `http://localhost:${PORT}/setup`
  : `http://localhost:${PORT}/`;

waitForServer(`http://localhost:${PORT}/`).then(ready => {
  if (ready) {
    log('launcher', `Server ready — opening ${startUrl}`);
    openBrowser(startUrl);
  } else {
    log('launcher', `Server did not start in time. Try opening http://localhost:${PORT} manually.`);
  }
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log('launcher', 'Shutting down...');
  webProcess.kill('SIGTERM');
  workerProcess.kill('SIGTERM');
  setTimeout(() => {
    webProcess.kill('SIGKILL');
    workerProcess.kill('SIGKILL');
    process.exit(0);
  }, 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);

log('launcher', 'Class Action Bot is running. Press Ctrl+C to stop.');
log('launcher', `Dashboard: http://localhost:${PORT}/`);
log('launcher', `Data directory: ${DATA_DIR}`);
