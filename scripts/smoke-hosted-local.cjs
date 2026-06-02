const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');

const webPort = Number(process.env.SMOKE_HOSTED_LOCAL_WEB_PORT || 3105);
const externalBaseUrl = process.env.SMOKE_BASE_URL?.trim();
const localBaseUrl = `http://localhost:${webPort}`;
const smokeDistDirs = externalBaseUrl ? [] : ['.next-smoke-hosted-web'];

function cleanEnv(overrides = {}, removals = []) {
  const env = {
    ...process.env,
    ...overrides,
  };
  for (const key of removals) delete env[key];
  return Object.fromEntries(
    Object.entries(env).filter(([key, value]) => key && typeof value === 'string' && !value.includes('\u0000')),
  );
}

function npmRun(script, envOverrides = {}, envRemovals = []) {
  const result = spawnSync('npm', ['run', script], {
    cwd: process.cwd(),
    env: cleanEnv(envOverrides, envRemovals),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`npm run ${script} exited ${result.status ?? 'without a status'}`);
  }
}

async function cleanupSmokeDistDirs() {
  const root = process.cwd();
  for (const relativePath of smokeDistDirs) {
    const target = path.resolve(root, relativePath);
    if (!target.startsWith(root)) {
      throw new Error(`Refusing to remove smoke dist directory outside workspace: ${target}`);
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        fs.rmSync(target, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
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

async function waitForHealth(baseUrl) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL('/api/health', baseUrl));
      if (response.ok) return;
    } catch {
      // The dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/health`);
}

async function startWebServer() {
  if (!(await isPortAvailable(webPort))) {
    throw new Error(`Port ${webPort} is already in use. Set SMOKE_HOSTED_LOCAL_WEB_PORT or stop the existing process.`);
  }

  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(webPort)], {
    cwd: process.cwd(),
    env: cleanEnv({
      NEXT_DIST_DIR: '.next-smoke-hosted-web',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.once('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(output);
    }
  });

  try {
    await waitForHealth(localBaseUrl);
  } catch (error) {
    child.kill();
    throw error;
  }

  return child;
}

async function main() {
  if (externalBaseUrl) {
    console.log(`[smoke-hosted-local] using existing SMOKE_BASE_URL=${externalBaseUrl}`);
    npmRun('smoke:web', { SMOKE_STRICT_TEXT: '1' });
    npmRun('smoke:auth');
    npmRun('smoke:features');
    return;
  }

  let webServer = null;
  try {
    console.log(`[smoke-hosted-local] starting fresh web smoke target at ${localBaseUrl}`);
    webServer = await startWebServer();
    npmRun('smoke:web', { SMOKE_BASE_URL: localBaseUrl, SMOKE_STRICT_TEXT: '1' });
  } finally {
    if (webServer) {
      webServer.kill();
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    await cleanupSmokeDistDirs();
  }

  npmRun('smoke:auth', {}, ['SMOKE_BASE_URL']);
  npmRun('smoke:features', {}, ['SMOKE_BASE_URL']);
  console.log('[smoke-hosted-local] ok');
}

main().catch((error) => {
  console.error('[smoke-hosted-local] failed');
  console.error(error);
  process.exit(1);
});
