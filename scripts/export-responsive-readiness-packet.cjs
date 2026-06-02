const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'responsive-readiness-packet.json');
const markdownPath = path.join(outputDir, 'responsive-readiness-packet.md');
const port = Number(process.env.CLAIMBOT_RESPONSIVE_PORT || 3110);
const baseUrl = process.env.RESPONSIVE_BASE_URL || `http://localhost:${port}`;
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const routes = [
  { path: '/goal', required: ['Plan', 'Shadow'] },
  { path: '/launch', required: ['CLIENT LAUNCH ACTION PLAN', 'Launch'] },
  { path: '/packets', required: ['PACKET BROWSER', 'Packet Center'] },
  { path: '/pricing', required: ['Contact billing', 'Free matching'] },
  { path: '/setup', required: ['Start with facts', 'Privacy and safety'] },
  { path: '/review', required: ['Review'] },
  { path: '/claims', required: ['Claims'] },
  { path: '/trust', required: ['Trust'] },
];

const viewports = [
  { label: 'mobile', width: 390, height: 844, isMobile: true },
  { label: 'desktop', width: 1440, height: 1100, isMobile: false },
];

function requestOk(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve((response.statusCode || 0) >= 200 && (response.statusCode || 0) < 500);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(2500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await requestOk(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return false;
}

async function ensureServer() {
  if (process.env.RESPONSIVE_BASE_URL) {
    return { started: false, process: null };
  }

  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(command, ['run', 'dev', '--', '--port', String(port)], {
    cwd: process.cwd(),
    stdio: 'ignore',
    shell: process.platform === 'win32',
    windowsHide: true,
  });

  return { started: true, process: child };
}

function stopServer(child) {
  if (!child) return;
  try {
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    }
    child.kill();
  } catch {
    // Ignore cleanup failures; the packet reports readiness separately.
  }
}

async function runChecks() {
  const launchOptions = fs.existsSync(chromePath) ? { executablePath: chromePath } : {};
  const browser = await chromium.launch(launchOptions);
  const results = [];

  try {
    for (const viewport of viewports) {
      for (const route of routes) {
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: viewport.isMobile,
        });
        const url = `${baseUrl}${route.path}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
        const text = await page.locator('body').innerText();
        const missing = route.required.filter((item) => !text.includes(item));
        const metrics = await page.evaluate(() => {
          const doc = document.documentElement;
          const body = document.body;
          return {
            clientWidth: doc.clientWidth,
            scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
          };
        });
        const overflow = metrics.scrollWidth > metrics.clientWidth + 1;
        results.push({
          route: route.path,
          viewport: viewport.label,
          width: viewport.width,
          height: viewport.height,
          ok: missing.length === 0 && !overflow,
          missing,
          overflow,
          clientWidth: metrics.clientWidth,
          scrollWidth: metrics.scrollWidth,
        });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const server = await ensureServer();
  const serverReady = await waitForServer(`${baseUrl}/goal`);
  let results = [];
  let checkError = null;

  try {
    if (!serverReady) {
      throw new Error(`Responsive check target did not become ready: ${baseUrl}`);
    }
    results = await runChecks();
  } catch (error) {
    checkError = error instanceof Error ? error.message : String(error);
  } finally {
    if (server.started) stopServer(server.process);
  }

  const failedRoutes = results.filter((result) => !result.ok);
  const ready = serverReady && !checkError && failedRoutes.length === 0;
  const packet = {
    format: 'claimbot.responsive-readiness-packet.v1',
    generatedAt,
    note: 'Non-secret responsive readiness packet. This records route names, viewport sizes, required text presence, and overflow status only; it does not include screenshots, user data, claim data, profile facts, secrets, tokens, or raw page HTML.',
    readiness: {
      ready,
      baseUrl,
      serverStartedByPacket: server.started,
      serverReady,
      routeCount: routes.length,
      viewportCount: viewports.length,
      checkCount: results.length,
      failureCount: failedRoutes.length,
      checkError,
      requiredForClientPreview: true,
      note: 'Responsive readiness checks core Kimi command surfaces at mobile and desktop widths for critical visible state and horizontal overflow.',
    },
    results,
    commands: [
      'npm run responsive:packet',
      '$env:RESPONSIVE_BASE_URL="https://your-preview.netlify.app"; npm run responsive:packet',
      'npm run launch:handoff',
    ],
  };

  const markdown = [
    '# ClaimBot Responsive Readiness Packet',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This is a non-secret responsive readiness packet. It records route names, viewport sizes, required text presence, and overflow status only.',
    '',
    '## Current Gate',
    '',
    `Responsive readiness: ${ready ? 'ready' : 'blocked'}`,
    `Base URL: ${baseUrl}`,
    `Server ready: ${serverReady ? 'yes' : 'no'}`,
    `Checks: ${results.length}`,
    `Failures: ${failedRoutes.length}`,
    `Error: ${checkError ?? 'none'}`,
    `Boundary: ${packet.readiness.note}`,
    '',
    '## Route Checks',
    '',
    ...(results.length > 0
      ? results.map((result) => `- ${result.viewport} ${result.route}: ${result.ok ? 'pass' : 'fail'}; overflow=${result.overflow ? 'yes' : 'no'}; missing=${result.missing.length > 0 ? result.missing.join(', ') : 'none'}`)
      : ['- No route checks completed.']),
    '',
    '## Commands',
    '',
    ...packet.commands.map((command) => `- \`${command}\``),
    '',
  ].join('\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[responsive-readiness-packet] wrote non-secret responsive packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Responsive readiness: ${ready ? 'ready' : 'blocked'}`);
  console.log(`Failures: ${failedRoutes.length}`);

  if (!ready) process.exit(1);
}

main().catch((error) => {
  console.error('[responsive-readiness-packet] failed');
  console.error(error);
  process.exit(1);
});
