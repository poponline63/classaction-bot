const { app, BrowserWindow, dialog } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const PRODUCT_NAME = 'Class Action Bot';
const DEFAULT_PORT = 3100;

let mainWindow = null;
let webProcess = null;
let workerProcess = null;
let shuttingDown = false;

function log(message) {
  console.log(`[desktop] ${message}`);
}

function projectRoot() {
  return app.getAppPath();
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function nodeEnv(extra = {}) {
  const root = projectRoot();
  const dataDir = path.join(app.getPath('userData'), 'data');
  ensureDir(dataDir);

  const hermeticPlaywright = path.join(root, 'node_modules', 'playwright-core', '.local-browsers');
  const localPlaywright = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'ms-playwright',
  );

  const configuredPlaywright = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const playwrightPath =
    configuredPlaywright && configuredPlaywright !== ':USERPROFILE\\AppData\\Local\\ms-playwright'
      ? configuredPlaywright
      : fs.existsSync(hermeticPlaywright)
        ? hermeticPlaywright
      : localPlaywright;

  return {
    ...process.env,
    ...extra,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    DATA_DIR: dataDir,
    DATABASE_URL: `file:${path.join(dataDir, 'classaction.db')}`,
    CLAIM_FILER_MODE: process.env.CLAIM_FILER_MODE || 'shadow',
    PLAYWRIGHT_BROWSERS_PATH: playwrightPath,
    ELECTRON_RUN_AS_NODE: '1',
  };
}

function spawnNode(label, script, args, options = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: options.cwd || projectRoot(),
    env: nodeEnv(options.env),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => process.stdout.write(`[${label}] ${data}`));
  child.stderr.on('data', (data) => process.stderr.write(`[${label}] ${data}`));
  child.on('exit', (code, signal) => {
    if (!shuttingDown) log(`${label} exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`);
  });
  return child;
}

function runMigrations() {
  const root = projectRoot();
  const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const migrateScript = path.join(root, 'scripts', 'migrate.ts');
  if (!fs.existsSync(tsxCli) || !fs.existsSync(migrateScript)) {
    throw new Error('Migration runtime is missing from the packaged app.');
  }

  log('Running database migrations...');
  const result = spawnSync(process.execPath, [tsxCli, migrateScript], {
    cwd: root,
    env: nodeEnv(),
    windowsHide: true,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Migration failed').trim());
  }
  log('Database ready.');
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findPort() {
  const requested = Number(process.env.PORT || DEFAULT_PORT);
  for (let port = requested; port < requested + 50; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available localhost port found near ${requested}.`);
}

function waitForServer(port, timeoutMs = 45000) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) resolve(false);
        else setTimeout(tick, 500);
      });
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() - startedAt > timeoutMs) resolve(false);
        else setTimeout(tick, 500);
      });
    };
    tick();
  });
}

function startWeb(port) {
  const root = projectRoot();
  const standaloneRoot = path.join(root, '.next', 'standalone');
  const standaloneServer = path.join(standaloneRoot, 'server.js');

  if (fs.existsSync(standaloneServer)) {
    log(`Starting standalone Next server on port ${port}...`);
    return spawnNode('web', standaloneServer, [], {
      cwd: standaloneRoot,
      env: {
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
      },
    });
  }

  const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!fs.existsSync(nextBin)) {
    throw new Error('Could not find the Next.js server entrypoint. Run npm run desktop:prepare before packaging.');
  }

  log(`Starting Next server on port ${port}...`);
  return spawnNode('web', nextBin, ['start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: root,
    env: { PORT: String(port) },
  });
}

function startWorker() {
  const root = projectRoot();
  const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const workerEntry = path.join(root, 'worker', 'index.ts');
  if (!fs.existsSync(tsxCli) || !fs.existsSync(workerEntry)) {
    throw new Error('Worker runtime is missing from the packaged app.');
  }

  log('Starting background worker...');
  return spawnNode('worker', tsxCli, [workerEntry], { cwd: root });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: PRODUCT_NAME,
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [workerProcess, webProcess]) {
    if (child && !child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => {
    for (const child of [workerProcess, webProcess]) {
      if (child && !child.killed) child.kill('SIGKILL');
    }
  }, 3000).unref();
}

async function boot() {
  const lock = app.requestSingleInstanceLock();
  if (!lock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  await app.whenReady();
  app.setAppUserModelId('com.poponline63.classactionbot');
  createWindow();

  try {
    const dataDir = path.join(app.getPath('userData'), 'data');
    const dbFile = path.join(dataDir, 'classaction.db');
    const firstRun = !fs.existsSync(dbFile);
    const port = await findPort();

    runMigrations();
    webProcess = startWeb(port);
    workerProcess = startWorker();

    const ready = await waitForServer(port);
    if (!ready) throw new Error(`The local server did not become ready on port ${port}.`);

    const route = firstRun ? '/setup' : '/';
    const url = `http://127.0.0.1:${port}${route}`;
    log(`Opening ${url}`);
    await mainWindow.loadURL(url);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    dialog.showErrorBox(PRODUCT_NAME, message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      const html = `<h1>${PRODUCT_NAME}</h1><pre>${message}</pre>`;
      await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      mainWindow.show();
    }
  }
}

app.on('before-quit', shutdown);
app.on('window-all-closed', () => {
  shutdown();
  app.quit();
});

boot();
