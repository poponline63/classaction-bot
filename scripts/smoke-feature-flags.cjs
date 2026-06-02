const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

if (
  process.platform === 'win32'
  && (!process.env.PLAYWRIGHT_BROWSERS_PATH || process.env.PLAYWRIGHT_BROWSERS_PATH.includes(':USERPROFILE'))
) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
}

const { chromium, request } = require('playwright');

const port = Number(process.env.SMOKE_FEATURE_PORT || 3121);
const ownsServer = !process.env.SMOKE_BASE_URL;
const deployedTarget = Boolean(process.env.SMOKE_BASE_URL);
const baseUrl = process.env.SMOKE_BASE_URL || `http://localhost:${port}`;
const sessionSecret = process.env.CLAIMBOT_SESSION_SECRET || '';
const sessionCookieName = 'claimbot_session';
const smokeTmpDir = ownsServer ? fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-feature-smoke-')) : null;
const smokeDistDirs = ownsServer ? ['.next-smoke-features'] : [];
const smokeDatabaseUrl = ownsServer
  ? `file:${path.join(smokeTmpDir, 'feature-smoke.db')}`
  : process.env.DATABASE_URL;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url');
}

function signedSessionCookie(email = 'smoke-feature-flags@example.com') {
  const payload = base64url(JSON.stringify({
    sub: 'smoke-feature-flags-user',
    email,
    exp: Math.floor(Date.now() / 1000) + 300,
  }));
  return `${payload}.${sign(payload)}`;
}

function authHeaders() {
  return deployedTarget ? { Cookie: `${sessionCookieName}=${signedSessionCookie()}` } : {};
}

async function newSmokePage(browser, viewport) {
  if (!deployedTarget) {
    return {
      page: await browser.newPage({ viewport }),
      close: async () => {},
    };
  }

  const context = await browser.newContext({ viewport });
  await context.addCookies([{
    name: sessionCookieName,
    value: signedSessionCookie(),
    domain: new URL(baseUrl).hostname,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  return {
    page: await context.newPage(),
    close: async () => context.close(),
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function childEnv(overrides = {}) {
  const env = {
    ...process.env,
    ...(smokeDatabaseUrl ? { DATABASE_URL: smokeDatabaseUrl } : {}),
    ...overrides,
  };
  return Object.fromEntries(
    Object.entries(env).filter(([key, value]) => {
      return key && !key.startsWith('=') && typeof value === 'string' && !value.includes('\u0000');
    }),
  );
}

function runCommand(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
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
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited ${code}\n${output}`));
    });
  });
}

async function migrateSmokeDatabase() {
  if (!ownsServer) return;
  await runCommand(process.execPath, [path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.cjs'), 'scripts/migrate.ts'], childEnv());
}

async function cleanupSmokeTmpDir() {
  if (!smokeTmpDir) return;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(smokeTmpDir, { recursive: true, force: true });
      return;
    } catch {
      await wait(500);
    }
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
        await wait(500);
      }
    }
  }
}

function isPortAvailable(targetPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(targetPort, '127.0.0.1');
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 90_000;
  let lastHealth = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL('/api/health', baseUrl));
      lastHealth = await response.text();
      if (response.ok) {
        const json = JSON.parse(lastHealth);
        if (
          json.ok === true
          && json.checks?.database === 'ok'
          && json.checks?.schema === 'ok'
          && json.checks?.identitySubject === true
          && json.checks?.billingLedger === true
        ) {
          return;
        }
        throw new Error(`health schema readiness failed: ${lastHealth}`);
      }
    } catch (error) {
      lastHealth = error instanceof Error ? error.message : String(error);
    }
    await wait(1_000);
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/health with schema readiness. Last health: ${lastHealth}`);
}

async function startServer() {
  if (!ownsServer) return null;
  if (!(await isPortAvailable(port))) {
    throw new Error(`Port ${port} is already in use. Set SMOKE_BASE_URL or SMOKE_FEATURE_PORT.`);
  }
  await migrateSmokeDatabase();

  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: childEnv({
      NEXT_DIST_DIR: '.next-smoke-features',
      CLAIMBOT_DISABLE_AUTH: 'true',
      CLAIMBOT_FEATURE_BREACH_IMPORT: 'false',
      CLAIMBOT_FEATURE_SETTLEMENT_SEARCH: 'false',
      CLAIMBOT_FEATURE_LIVE_FILING: 'false',
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

  await waitForHealth();
  return child;
}

async function expectApiStatus(api, method, pathname, expectedStatus, options = {}) {
  const response = await api[method](pathname, options);
  const body = await response.text();
  return {
    path: pathname,
    method: method.toUpperCase(),
    status: response.status(),
    expectedStatus,
    ok: response.status() === expectedStatus,
    body: body.slice(0, 180),
  };
}

async function readProfileBootstrapFeatureState(api) {
  const response = await api.get('/api/profile/bootstrap');
  const body = await response.text();
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    // Keep null and let assertions below fail with the raw body.
  }
  const features = {
    breachImportEnabled: json?.features?.breachImportEnabled === true,
    liveFilingEnabled: json?.features?.liveFilingEnabled === true,
    settlementSearchEnabled: json?.features?.settlementSearchEnabled === true,
  };
  const checks = {
    liveFilingDisabled: features.liveFilingEnabled === false,
    ...(features.breachImportEnabled ? {} : {
      breachImportDisabled: json?.features?.breachImportEnabled === false,
      noBreachRows: Array.isArray(json?.breaches) && json.breaches.length === 0,
      noHibpStatus: json?.settings?.hibpApiKeyConfigured === false,
      noDataBreachAuthorization: !Object.prototype.hasOwnProperty.call(json?.authorizations ?? {}, 'DATA_BREACH'),
      noDataBreachPurchases: Array.isArray(json?.purchases) && !json.purchases.some((purchase) => purchase.category === 'DATA_BREACH'),
    }),
    ...(features.settlementSearchEnabled ? {} : {
      settlementSearchDisabled: json?.features?.settlementSearchEnabled === false,
    }),
  };
  return {
    path: '/api/profile/bootstrap',
    method: 'GET',
    status: response.status(),
    expectedStatus: 200,
    ok: response.status() === 200 && Object.values(checks).every(Boolean),
    features,
    checks,
    body: body.slice(0, 240),
  };
}

async function checkPage(browser, pathname, expected) {
  const { page, close } = await newSmokePage(browser, { width: 1360, height: 920 });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console error: ${msg.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));

  const response = await page.goto(new URL(pathname, baseUrl).toString(), {
    waitUntil: 'networkidle',
    timeout: 30_000,
  });
  if (expected.openDetails) {
    await page.locator(expected.openDetails).click({ timeout: 10_000 });
  }
  const h1 = (await page.locator('main h1').first().textContent({ timeout: 10_000 })).trim();
  const bodyText = await page.locator('main').innerText({ timeout: 10_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await page.close();
  await close();

  return {
    path: pathname,
    status: response ? response.status() : 0,
    h1,
    expectedH1: expected.h1,
    overflow,
    includes: expected.includes.map((text) => ({ text, found: bodyText.includes(text) })),
    excludes: expected.excludes.map((text) => ({ text, absent: !bodyText.includes(text) })),
    errors,
  };
}

async function checkMobileNavigation(browser, expected) {
  const { page, close } = await newSmokePage(browser, { width: 390, height: 844 });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console error: ${msg.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));

  try {
    const response = await page.goto(new URL('/claims', baseUrl).toString(), {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Open navigation' }).click({ timeout: 10_000 });
    const mobileNav = page.locator('.kimi-sidebar.mobile-open nav[aria-label="Primary navigation"]');
    const mobileNavText = await mobileNav.innerText({ timeout: 10_000 });
    const mobileNavVisible = await mobileNav.evaluate((node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 0 && rect.width > 0;
    });
    const mobileNavItemHeights = await mobileNav.locator('a').evaluateAll((nodes) => (
      nodes
        .map((node) => node.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => Math.round(rect.height))
    ));
    const checks = {
      mobileNavVisible,
      hasDashboard: mobileNavText.includes('Home'),
      hasStatus: mobileNavText.includes('Status'),
      hasReview: mobileNavText.includes('Review'),
      hasQueue: mobileNavText.includes('Claims'),
      hasProfile: mobileNavText.includes('Profile'),
      discoveryPosture: expected.settlementSearchEnabled
        ? mobileNavText.includes('Find Claims')
        : !mobileNavText.includes('Find Claims'),
      touchTargets: mobileNavItemHeights.every((height) => height >= 44),
    };

    return {
      path: '/claims',
      viewport: 'mobile',
      kind: 'mobile navigation',
      status: response ? response.status() : 0,
      ok: response ? response.status() < 400 && Object.values(checks).every(Boolean) : false,
      checks,
      text: mobileNavText,
      heights: mobileNavItemHeights,
      errors,
    };
  } finally {
    await page.close();
    await close();
  }
}

async function checkSetupDoneState(browser) {
  const { page, close } = await newSmokePage(browser, { width: 390, height: 844 });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console error: ${msg.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));

  try {
    const response = await page.goto(new URL('/setup', baseUrl).toString(), {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.locator('.setup-mobile-progress summary').click({ timeout: 10_000 });
    await page.locator('.setup-mobile-progress .setup-step-button').last().click({ timeout: 10_000 });
    const h1 = (await page.locator('h1').first().textContent({ timeout: 10_000 })).trim();
    const bodyText = await page.locator('main').innerText({ timeout: 10_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const includes = [
      'READY FOR SCOPED REVIEW',
      'Facts saved. Scoped review is ready.',
      'Scoped match intake',
      'assigned matches',
      'I allow shadow-mode review',
      'no claim is submitted automatically',
      'Start safe review',
      'Review scoped goal',
    ].map((text) => ({ text, found: bodyText.includes(text) }));
    const excludes = [
      'Ready for first scan',
      'Run first scan',
      'Check discovery health',
    ].map((text) => ({ text, absent: !bodyText.includes(text) }));

    return {
      path: '/setup',
      viewport: 'mobile',
      kind: 'setup done state',
      status: response ? response.status() : 0,
      h1,
      overflow,
      includes,
      excludes,
      errors,
    };
  } finally {
    await page.close();
    await close();
  }
}

function enabledFeatureResult(name, detail) {
  return {
    kind: 'feature enabled',
    feature: name,
    ok: true,
    detail,
  };
}

async function main() {
  let server = null;
  const failures = [];
  const results = [];

  try {
    if (deployedTarget && sessionSecret.length < 32) {
      throw new Error('Deployed feature-flag smoke requires CLAIMBOT_SESSION_SECRET so protected routes can be tested with a signed app session.');
    }

    server = await startServer();

    const api = await request.newContext({ baseURL: baseUrl, extraHTTPHeaders: authHeaders() });
    const formHeaders = { ...authHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' };
    const profileBootstrap = await readProfileBootstrapFeatureState(api);
    const featureState = profileBootstrap.features;
    results.push(profileBootstrap);

    if (featureState.settlementSearchEnabled) {
      results.push(enabledFeatureResult('settlement search', 'Settlement search is enabled on this target; disabled-search API assertions are not applicable.'));
    } else {
      results.push(await expectApiStatus(api, 'get', '/api/settlements/search?q=test', 403));
    }

    if (featureState.breachImportEnabled) {
      results.push(enabledFeatureResult('breach import', 'Breach import is enabled on this target; disabled-breach mutation assertions are not applicable.'));
    } else {
      results.push(await expectApiStatus(api, 'post', '/api/setup/breach', 403, {
        headers: formHeaders,
        data: 'breachName=Example&email=user%40example.com',
      }));
      results.push(await expectApiStatus(api, 'post', '/api/hibp/refresh', 403));
      results.push(await expectApiStatus(api, 'post', '/api/setup/authorization', 403, {
        headers: formHeaders,
        data: 'category=DATA_BREACH&enabled=on&attestationText=I%20authorize%20data%20breach%20claims',
      }));
      results.push(await expectApiStatus(api, 'post', '/api/setup/purchase', 403, {
        headers: formHeaders,
        data: 'merchant=Example&category=DATA_BREACH&purchaseDate=2024-01-01',
      }));
      results.push(await expectApiStatus(api, 'post', '/api/settings/save', 403, {
        headers: formHeaders,
        data: 'hibp_api_key=hidden-key&claim_filer_mode=shadow&claim_filer_max_per_day=20',
      }));
    }
    await api.dispose();

    const browser = await chromium.launch({ headless: true });
    results.push(await checkPage(browser, '/breaches', featureState.breachImportEnabled
      ? {
          includes: ['Data breach exposure'],
          excludes: ['Feature flag disabled', 'Data-breach evidence intake is disabled'],
        }
      : {
          includes: ['Data-breach evidence intake is disabled'],
          excludes: ['Add breach exposure', 'Refresh from HIBP'],
        }));
    results.push(await checkPage(browser, '/settlements', featureState.settlementSearchEnabled
      ? {
          includes: ['Settlements'],
          excludes: ['Feature flag disabled', 'Settlement browsing is disabled'],
        }
      : {
          includes: ['Settlement browsing is disabled'],
          excludes: ['Possible match', 'May qualify', 'Any proof status'],
        }));
    results.push(await checkPage(browser, '/', featureState.settlementSearchEnabled
      ? {
          includes: ['Find matches. Review them. Track the claims you approve.'],
          excludes: ['Public settlement search is hidden for this deployment'],
        }
      : {
          includes: [
            'Find matches. Review them. Track the claims you approve.',
            'Review matches',
            'Account details',
          ],
          excludes: [
            'Settlements scanned',
            'Source readiness needed',
            'Review discovery health',
            'Browse tracked settlements',
            'Settlement sources are normalized',
          ],
        }));
    results.push(await checkPage(browser, '/goal', featureState.settlementSearchEnabled
      ? {
          h1: 'Find matches and track claims.',
          includes: ['Three steps: set up profile, review matches, track claims.'],
          excludes: ['Public settlement search is hidden'],
        }
      : {
          h1: 'Review assigned claims.',
          includes: [
            'Three steps: set up profile, review matches, track claims.',
            'Nothing is submitted unless live filing is explicitly enabled',
            'Review matches',
          ],
          excludes: [
            'Discover open settlements',
            'Last discovery scan',
            'Browse settlements',
            'Continuous discovery',
          ],
        }));
    results.push(await checkPage(browser, '/pricing', {
      includes: featureState.settlementSearchEnabled
        ? [
            'Free matching. Paid full automation.',
            'Browse active settlements',
            'Open official claim links',
            'Personalized match dashboard',
            'Free to see possible matches',
            'certain eligibility',
          ]
        : [
            'Private account review',
            'Public settlement browsing is off for this account',
            'Review scoped claim opportunities',
            'Run basic eligibility checks against saved facts',
            'Open assigned claim links',
            'Scoped match dashboard',
            'Free to review scoped matches',
            'certain eligibility',
          ],
      excludes: featureState.settlementSearchEnabled
        ? [
            'Private account review',
            'Public settlement browsing is off for this account',
            'Review scoped claim opportunities',
            'Scoped match dashboard',
          ]
        : [
            'Browse active settlements',
            'Open official claim links',
            'Personalized match dashboard',
            'Free to see possible matches',
            'public settlement exists',
          ],
    }));
    if (!featureState.settlementSearchEnabled) {
      results.push(await checkPage(browser, '/profile', {
      includes: [
        'Profile',
        'scoped claim review',
        'PROFILE SNAPSHOT',
        'More profile details',
        'Some scoped opportunities use age or residency dates',
        'scoped claim opportunity requires a payment address',
      ],
      excludes: [
        'settlement matching',
        'Some settlements use age or residency dates',
        'when a settlement requires a payment address',
        'Add matching evidence',
      ],
      }));
      results.push(await checkPage(browser, '/purchases', {
      includes: [
        'Purchases',
        'scoped claim review',
        'scoped opportunity records',
        'Scoped-review timing',
        'assigned opportunity windows',
        'improve scoped claim review',
      ],
      excludes: [
        'settlement matching',
        'Class-period matching',
        'when a settlement requires proof',
        'data breach',
      ],
      }));
    }
    results.push(await checkPage(browser, '/settings', featureState.breachImportEnabled
      ? {
          includes: ['Settings', 'POSTURE', 'COMPLIANCE', 'FILING', 'HIBP API key'],
          excludes: ['Breach import disabled', 'HIBP settings are hidden'],
        }
      : {
          includes: ['Settings', 'POSTURE', 'COMPLIANCE', 'FILING', 'Breach import disabled', 'HIBP settings are hidden'],
          excludes: ['HIBP API key', 'Paste a new HIBP key'],
        }));
    results.push(await checkPage(browser, '/claims', featureState.settlementSearchEnabled
      ? {
          includes: ['Claims'],
          excludes: ['Feature flag disabled'],
        }
      : {
      includes: [
        'Claims',
        'Review matches',
        'Update profile',
        'scoped opportunities instead of public settlement browsing',
        'Automation stays guarded',
        'Proof stays manual',
      ],
      excludes: [
        'Find settlements',
        'Go to Settlements',
        'Proof-required settlements',
        'settlement and match reference',
        'settlement source provides an estimate',
      ],
      }));
    results.push(await checkPage(browser, '/review', featureState.settlementSearchEnabled
      ? {
          includes: ['Review matches', 'Match refresh history', 'Shadow review'],
          excludes: ['Feature flag disabled'],
        }
      : {
      includes: [
        'Review matches',
        'Evidence rule',
        'scoped match intake',
        'an opportunity was assigned',
        'Three steps: confirm facts, review matches, track claims.',
        'Proof stays manual',
      ],
      excludes: [
        'Find settlements',
        'source discovery',
        'settlement exists',
        'current settlement catalog',
      ],
      }));
    results.push(await checkPage(browser, '/setup', featureState.breachImportEnabled
      ? {
          includes: ['Start with facts', 'Three parts: facts, permission, review.', 'Data-breach facts'],
          excludes: [],
        }
      : {
          includes: ['Start with facts', 'Three parts: facts, permission, review.'],
          excludes: ['Data-breach facts', 'Data breaches'],
        }));
    results.push(await checkPage(browser, '/permissions', featureState.breachImportEnabled
      ? {
          includes: ['Permissions', 'Category-level permission', 'Data Breach'],
          excludes: [],
        }
      : {
          includes: ['Permissions', 'Category-level permission'],
          excludes: ['Data Breach'],
        }));
    results.push(await checkMobileNavigation(browser, featureState));
    if (!featureState.settlementSearchEnabled) {
      results.push(await checkSetupDoneState(browser));
    }
    await browser.close();

    for (const result of results) {
      if ('ok' in result && !result.ok) {
        failures.push(`${result.method} ${result.path}: expected ${result.expectedStatus}, got ${result.status}`);
        if (result.checks) {
          for (const [check, passed] of Object.entries(result.checks)) {
            if (!passed) failures.push(`${result.path}: failed ${check}`);
          }
        }
      }
      if ('status' in result && !('expectedStatus' in result) && result.status >= 400) {
        failures.push(`${result.path}: HTTP ${result.status}`);
      }
      if (result.expectedH1 && result.h1 !== result.expectedH1) {
        failures.push(`${result.path}: expected h1 "${result.expectedH1}", got "${result.h1}"`);
      }
      if (result.overflow) failures.push(`${result.path}: horizontal overflow`);
      for (const include of result.includes || []) {
        if (!include.found) failures.push(`${result.path}: expected text "${include.text}"`);
      }
      for (const exclude of result.excludes || []) {
        if (!exclude.absent) failures.push(`${result.path}: disabled-flow text still visible "${exclude.text}"`);
      }
      for (const error of result.errors || []) failures.push(`${result.path}: ${error}`);
    }

    console.log(JSON.stringify(results, null, 2));
    if (failures.length > 0) {
      console.error('[smoke-feature-flags] failed');
      for (const failure of failures) console.error(`- ${failure}`);
      process.exit(1);
    }

    console.log(`[smoke-feature-flags] ok: feature flag posture checks passed against ${baseUrl}`);
  } finally {
    if (server) {
      server.kill();
    }
    await cleanupSmokeTmpDir();
    await cleanupSmokeDistDirs();
  }
}

main().catch((error) => {
  console.error('[smoke-feature-flags] failed');
  console.error(error);
  process.exit(1);
});
