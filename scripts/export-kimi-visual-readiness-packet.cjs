const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');

if (
  process.platform === 'win32'
  && (!process.env.PLAYWRIGHT_BROWSERS_PATH || process.env.PLAYWRIGHT_BROWSERS_PATH.includes(':USERPROFILE'))
) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
}

const { chromium } = require('playwright');

const outputDir = path.join(process.cwd(), 'data');
const screenshotDir = path.join(outputDir, 'kimi-visual-screenshots');
const jsonPath = path.join(outputDir, 'kimi-visual-readiness-packet.json');
const markdownPath = path.join(outputDir, 'kimi-visual-readiness-packet.md');
const port = Number(process.env.KIMI_VISUAL_PORT || 3112);
const requestedBaseUrl = process.env.KIMI_VISUAL_BASE_URL?.trim() || '';
const isolatedBaseUrl = `http://localhost:${port}`;
const reusableLocalBaseUrl = process.env.KIMI_VISUAL_REUSE_BASE_URL?.trim() || 'http://localhost:3100';
let baseUrl = requestedBaseUrl || isolatedBaseUrl;
let usingExternalVisualTarget = Boolean(requestedBaseUrl);
let visualTargetMode = requestedBaseUrl ? 'provided-base-url' : 'isolated-temporary-server';
const defaultLocalDbPath = path.join(outputDir, 'classaction.db');

const baseRoutes = [
  {
    path: '/',
    label: 'Dashboard',
    requiredText: ['Find matches. Review them. Track the claims you approve.', 'Account details'],
  },
  {
    path: '/goal',
    label: 'Goal',
    requiredText: ['Action Navigator', 'Three steps: set up profile, review matches, track claims.'],
    expectedTopbarLabel: 'Plan',
    expectedMobileActiveNav: 'Plan',
  },
  {
    path: '/onboarding',
    label: 'Start Here',
    requiredText: ['Start here', 'Get ClaimBot ready in three simple steps', 'More onboarding details'],
    requiredAny: [['Nothing is submitted from onboarding.', 'Most users only need this page first.']],
  },
  {
    path: '/setup',
    label: 'Setup',
    requiredText: ['ClaimBot'],
    requiredAny: [['Simple setup', 'Three parts: facts, permission, review.', 'Setup safeguards']],
  },
  {
    path: '/eligibility',
    label: 'Eligibility',
    requiredText: ['Claim fit', 'See which claims look like a fit', 'More eligibility details'],
    requiredAny: [['New user path', 'Do these three things in order.']],
  },
  { path: '/review', label: 'Review', requiredText: ['Review matches'] },
  { path: '/claims', label: 'Claims', requiredText: ['Claim tracking', 'Full automation'] },
  { path: '/pricing', label: 'Pricing', requiredText: ['Free matching. Paid full automation.', 'hands-off'] },
  {
    path: '/trust',
    label: 'Trust',
    requiredText: ['Real facts only'],
    requiredAny: [['The simple version', 'Support can see the important status', 'Support readiness evidence']],
  },
  {
    path: '/status',
    label: 'Status',
    requiredText: ['Claim status'],
    requiredAny: [['Claim status', 'Client preview status', 'Timeline browser']],
    expectedTopbarLabel: 'Status',
    expectedMobileActiveNav: 'Claims',
  },
  { path: '/audit', label: 'Audit', requiredText: ['Account history', 'Trace review'] },
  { path: '/permissions', label: 'Permissions', requiredText: ['Claim permissions', 'Permission coverage'] },
  { path: '/authorizations', label: 'Authorizations Redirect', requiredText: ['Claim permissions', 'Permission coverage'] },
  { path: '/launch', label: 'Launch', requiredText: ['Launch checklist', 'Client preview'] },
  { path: '/packets', label: 'Packets', requiredText: ['Packet Center', 'PACKET BROWSER'] },
  { path: '/profile', label: 'Profile', requiredText: ['Profile', 'Profile facts'] },
  { path: '/settings', label: 'Settings', requiredText: ['Settings', 'Launch Control Center'] },
  { path: '/settlements', label: 'Settlements', requiredText: ['Settlements'], requiredAny: [['Settlement discovery', 'Feature flag disabled']] },
  { path: '/purchases', label: 'Purchases', requiredText: ['Purchases', 'Evidence coverage'] },
  { path: '/breaches', label: 'Breaches', requiredText: ['Data breach exposure'], requiredAny: [['Evidence coverage', 'Feature flag disabled']] },
  { path: '/login', label: 'Login', requiredText: ['Account access'], requiredAny: [['Sign in to ClaimBot', 'Do not send login links until Identity proof exists']] },
  { path: '/contact', label: 'Contact', requiredText: ['Contact', 'Support'] },
  { path: '/help', label: 'Help', requiredText: ['Help and support', 'More help details'] },
  { path: '/terms', label: 'Terms', requiredText: ['Terms of Service', 'Automation boundary'] },
  { path: '/privacy-policy', label: 'Privacy', requiredText: ['Privacy Policy', 'Data used for matching'] },
];
let routes = [...baseRoutes];

const viewports = [
  { label: 'desktop', width: 1440, height: 1100, isMobile: false },
  { label: 'mobile', width: 390, height: 844, isMobile: true },
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
  for (let attempt = 0; attempt < 70; attempt += 1) {
    if (await requestOk(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return false;
}

async function waitForReusableLocalServer(url) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await requestOk(url)) return true;
    await sleep(750);
  }
  return false;
}

async function ensureServer(databaseUrl) {
  if (usingExternalVisualTarget) {
    return { started: false, process: null };
  }

  const distDirName = `.next-kimi-visual-${process.pid}-${Date.now()}`;
  const distDirPath = path.join(process.cwd(), distDirName);
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(command, ['run', 'dev', '--', '--port', String(port)], {
    cwd: process.cwd(),
    stdio: 'ignore',
    shell: process.platform === 'win32',
    windowsHide: true,
    env: {
      ...process.env,
      CLAIMBOT_DEV_DIST_DIR: distDirName,
      ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
    },
  });

  return { started: true, process: child, distDir: distDirPath };
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
    // Ignore cleanup failures.
  }
}

async function cleanupTempDirWithRetries(dir) {
  if (!dir) return;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fs.promises.rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const retryable = error?.code === 'EBUSY' || error?.code === 'EPERM' || error?.code === 'ENOTEMPTY';
      if (!retryable || attempt === 5) {
        console.warn(`[kimi-visual-readiness-packet] temp cleanup skipped: ${error?.code ?? error}`);
        return;
      }
      await sleep(250 * (attempt + 1));
    }
  }
}

function routeSlug(routePath) {
  if (routePath === '/') return 'dashboard';
  return routePath.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

function filePathFromDatabaseUrl(databaseUrl) {
  if (!databaseUrl.startsWith('file:')) return null;
  const databasePath = databaseUrl.replace(/^file:/, '');
  return path.isAbsolute(databasePath) ? databasePath : path.resolve(process.cwd(), databasePath);
}

function localDatabaseUrl() {
  const raw = process.env.DATABASE_URL || `file:${defaultLocalDbPath}`;
  if (!raw.startsWith('file:')) return raw;
  return `file:${filePathFromDatabaseUrl(raw)}`;
}

async function firstValue(client, sql, field) {
  const result = await client.execute(sql);
  return result.rows[0]?.[field] ?? null;
}

async function prepareLocalVisualDatabase() {
  if (usingExternalVisualTarget) {
    return {
      databaseUrl: null,
      cleanupDir: null,
      notes: [`visualDatabase=skipped:${visualTargetMode}`],
    };
  }

  const sourceUrl = localDatabaseUrl();
  const sourcePath = filePathFromDatabaseUrl(sourceUrl);
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return {
      databaseUrl: null,
      cleanupDir: null,
      notes: [`visualDatabase=skipped:${sourcePath ? 'source-db-missing' : 'non-file-database-url'}`],
    };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-kimi-visual-'));
  const tempDbPath = path.join(tempDir, 'visual.db');
  fs.copyFileSync(sourcePath, tempDbPath);
  for (const suffix of ['-wal', '-shm']) {
    const companion = `${sourcePath}${suffix}`;
    if (fs.existsSync(companion)) fs.copyFileSync(companion, `${tempDbPath}${suffix}`);
  }

  const databaseUrl = `file:${tempDbPath}`;
  const { createClient } = require('@libsql/client');
  const client = createClient({ url: databaseUrl });
  const notes = ['visualDatabase=temporary-copy'];

  try {
    let userId = await firstValue(client, 'select id from users order by id asc limit 1', 'id');
    if (userId === null || userId === undefined) {
      const result = await client.execute({
        sql: 'insert into users (email, display_name, subscription_plan, subscription_status, created_at) values (?, ?, ?, ?, ?) returning id',
        args: ['visual-qa@example.invalid', 'Visual QA User', 'pro', 'active', Date.now()],
      });
      userId = result.rows[0]?.id;
    }

    const settlementResult = await client.execute(`
      select id, category
      from settlements
      where claim_form_url is not null and proof_required = 0 and category != 'UNKNOWN'
      order by id asc
      limit 1
    `);
    const settlement = settlementResult.rows[0];
    if (!userId || !settlement?.id || !settlement?.category) {
      notes.push('visualClaimSeed=skipped:missing-user-or-settlement');
      return { databaseUrl, cleanupDir: tempDir, notes };
    }

    const now = Date.now();
    const attestationText = 'Visual QA temporary authorization for screenshot-only claim detail coverage.';
    let authId = await firstValue(client, {
      sql: 'select id from class_authorizations where user_id = ? and category = ? limit 1',
      args: [userId, settlement.category],
    }, 'id');
    if (authId === null || authId === undefined) {
      const result = await client.execute({
        sql: `
          insert into class_authorizations
            (user_id, category, enabled, authorized_at, attestation_text, attestation_version, scope_constraints_json)
          values (?, ?, 1, ?, ?, 1, ?)
          returning id
        `,
        args: [userId, settlement.category, now, attestationText, JSON.stringify({ source: 'kimi-visual-temporary-seed' })],
      });
      authId = result.rows[0]?.id;
    } else {
      await client.execute({
        sql: 'update class_authorizations set enabled = 1, revoked_at = null, authorized_at = coalesce(authorized_at, ?), attestation_text = ? where id = ?',
        args: [now, attestationText, authId],
      });
    }

    let matchId = await firstValue(client, {
      sql: 'select id from matches where user_id = ? and settlement_id = ? limit 1',
      args: [userId, settlement.id],
    }, 'id');
    if (matchId === null || matchId === undefined) {
      const result = await client.execute({
        sql: `
          insert into matches
            (user_id, settlement_id, verdict, confidence, reasoning_json, matched_fields_json, required_category, created_at, updated_at)
          values (?, ?, 'ELIGIBLE', 0.92, ?, ?, ?, ?, ?)
          returning id
        `,
        args: [
          userId,
          settlement.id,
          JSON.stringify(['Temporary visual QA match for screenshot coverage only.']),
          JSON.stringify(['visual_qa_seed']),
          settlement.category,
          now,
          now,
        ],
      });
      matchId = result.rows[0]?.id;
    } else {
      await client.execute({
        sql: 'update matches set verdict = ?, confidence = ?, reasoning_json = ?, matched_fields_json = ?, required_category = ?, updated_at = ? where id = ?',
        args: [
          'ELIGIBLE',
          0.92,
          JSON.stringify(['Temporary visual QA match for screenshot coverage only.']),
          JSON.stringify(['visual_qa_seed']),
          settlement.category,
          now,
          matchId,
        ],
      });
    }

    let claimId = await firstValue(client, {
      sql: 'select id from claims where match_id = ? limit 1',
      args: [matchId],
    }, 'id');
    if (claimId === null || claimId === undefined) {
      const result = await client.execute({
        sql: `
          insert into claims
            (user_id, settlement_id, match_id, class_authorization_id, status, queued_at, submitted_attestation_text)
          values (?, ?, ?, ?, 'QUEUED', ?, ?)
          returning id
        `,
        args: [userId, settlement.id, matchId, authId, now, attestationText],
      });
      claimId = result.rows[0]?.id;
    }

    notes.push(`visualClaimSeed=temporary:/claims/${claimId}`);
  } catch (error) {
    notes.push(`visualClaimSeed=skipped:${error instanceof Error ? error.message : String(error)}`);
  }

  return { databaseUrl, cleanupDir: tempDir, notes };
}

async function discoverDynamicRoutes(databaseUrl) {
  const notes = [];
  const discoveredRoutes = [];
  try {
    const { createClient } = require('@libsql/client');
    const client = createClient({
      url: databaseUrl || localDatabaseUrl(),
      authToken: process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN,
    });
    const settlementId = await firstValue(client, 'select id from settlements order by id asc limit 1', 'id');
    if (settlementId !== null && settlementId !== undefined) {
      discoveredRoutes.push({
        path: `/settlements/${settlementId}`,
        label: 'Settlement Detail',
        requiredText: ['Settlement detail'],
        requiredAny: [['Search settlement source context without granting claim permission', 'Source & Boundary', 'Tracking gate']],
      });
      notes.push(`settlementDetail=checked:/settlements/${settlementId}`);
    } else {
      notes.push('settlementDetail=skipped:no-settlement-records');
    }

    const claimId = await firstValue(client, 'select id from claims order by id asc limit 1', 'id');
    if (claimId !== null && claimId !== undefined) {
      discoveredRoutes.push({
        path: `/claims/${claimId}`,
        label: 'Claim Detail',
        requiredText: ['Claim detail'],
        requiredAny: [['Claim operations packet', 'Search claim packet evidence without starting final checks']],
      });
      notes.push(`claimDetail=checked:/claims/${claimId}`);
    } else {
      notes.push('claimDetail=skipped:no-claim-records');
    }
  } catch (error) {
    notes.push(`dynamicRouteDiscovery=skipped:${error instanceof Error ? error.message : String(error)}`);
  }
  return { routes: discoveredRoutes, notes };
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (process.platform !== 'win32') throw error;
    return chromium.launch({ channel: 'msedge', headless: true });
  }
}

async function inspectPage(page, viewport) {
  return page.evaluate((viewportLabel) => {
    const rectFor = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity),
      };
    };
    const visible = (rect) => Boolean(
      rect
      && rect.display !== 'none'
      && rect.visibility !== 'hidden'
      && rect.opacity > 0
      && rect.width > 1
      && rect.height > 1
    );
    const rgb = (value) => {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!match) return null;
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    };
    const luminance = (value) => {
      const parts = rgb(value);
      if (!parts) return null;
      return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
    };

    const doc = document.documentElement;
    const body = document.body;
    const shell = document.querySelector('.kimi-shell');
    const trustRail = document.querySelector('.kimi-topbar-trust-rail');
    const shellBackground = shell ? window.getComputedStyle(shell).backgroundColor : window.getComputedStyle(body).backgroundColor;
    const shellLuminance = luminance(shellBackground);
    const sidebar = rectFor('.kimi-sidebar');
    const topbar = rectFor('.kimi-topbar');
    const main = rectFor('.kimi-main');
    const mobileBottomNav = rectFor('.mobile-bottom-nav');
    const topbarPageLabel = document.querySelector('.kimi-topbar-page-label')?.textContent?.trim() ?? '';
    const mobileActiveNavText = document.querySelector('.mobile-bottom-nav a[aria-current="page"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const mobileMenuButton = Array.from(document.querySelectorAll('.kimi-topbar .mobile-only'))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          width: rect.width,
          height: rect.height,
          display: style.display,
          visibility: style.visibility,
          opacity: Number(style.opacity),
        };
      })
      .some(visible);

    return {
      viewport: viewportLabel,
      h1: document.querySelector('h1')?.textContent?.trim() ?? '',
      shellExists: Boolean(shell),
      topbarVisible: visible(topbar),
      mainVisible: visible(main),
      sidebarVisible: visible(sidebar),
      mobileBottomNavVisible: visible(mobileBottomNav),
      mobileMenuButtonVisible: mobileMenuButton,
      topbarPageLabel,
      mobileActiveNavText,
      trustRailText: trustRail?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      shellBackground,
      shellLuminance,
      darkShell: shellLuminance !== null && shellLuminance < 70,
      scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
      clientWidth: doc.clientWidth,
      horizontalOverflow: Math.max(doc.scrollWidth, body.scrollWidth) > doc.clientWidth + 1,
    };
  }, viewport.label);
}

async function runChecks() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  const browser = await launchBrowser();
  const results = [];

  try {
    for (const viewport of viewports) {
      for (const route of routes) {
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: viewport.isMobile,
        });
        const url = `${baseUrl}${route.path}`;
        const screenshotRelativePath = path.join(
          'data',
          'kimi-visual-screenshots',
          `${routeSlug(route.path)}-${viewport.label}.png`,
        );
        const screenshotPath = path.join(process.cwd(), screenshotRelativePath);

        let error = null;
        let inspection = null;
        let missingText = [];

        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
          await page.waitForTimeout(1_000);
          const bodyText = await page.locator('body').innerText({ timeout: 10_000 });
          const normalizedBodyText = bodyText.toLowerCase();
          const missingRequiredText = route.requiredText.filter((text) => !normalizedBodyText.includes(text.toLowerCase()));
          const missingAlternativeText = (route.requiredAny ?? [])
            .filter((group) => !group.some((text) => normalizedBodyText.includes(text.toLowerCase())))
            .map((group) => `one of: ${group.join(' | ')}`);
          missingText = [...missingRequiredText, ...missingAlternativeText];
          inspection = await inspectPage(page, viewport);
          await page.screenshot({ path: screenshotPath, fullPage: false });
        } catch (caught) {
          error = caught instanceof Error ? caught.message : String(caught);
        } finally {
          await page.close();
        }

        const desktopReady = viewport.label !== 'desktop'
          || (inspection?.sidebarVisible === true && inspection?.mobileBottomNavVisible === false);
        const mobileReady = viewport.label !== 'mobile'
          || (inspection?.mobileBottomNavVisible === true && inspection?.mobileMenuButtonVisible === true);
        const trustRailReady = [
          'Permission required',
          'Proof manual',
          'Account history',
        ].every((text) => inspection?.trustRailText.includes(text));
        const topbarLabelReady = !route.expectedTopbarLabel
          || inspection?.topbarPageLabel === route.expectedTopbarLabel;
        const mobileActiveNavReady = viewport.label !== 'mobile'
          || !route.expectedMobileActiveNav
          || inspection?.mobileActiveNavText.includes(route.expectedMobileActiveNav);
        const ok = !error
          && missingText.length === 0
          && inspection?.shellExists === true
          && inspection?.topbarVisible === true
          && inspection?.mainVisible === true
          && inspection?.darkShell === true
          && inspection?.horizontalOverflow === false
          && trustRailReady
          && topbarLabelReady
          && mobileActiveNavReady
          && desktopReady
          && mobileReady;

        results.push({
          route: route.path,
          routeLabel: route.label,
          viewport: viewport.label,
          width: viewport.width,
          height: viewport.height,
          ok,
          error,
          missingText,
          screenshot: fs.existsSync(screenshotPath) ? screenshotRelativePath.replaceAll('\\', '/') : null,
          checks: {
            shellExists: inspection?.shellExists ?? false,
            topbarVisible: inspection?.topbarVisible ?? false,
            mainVisible: inspection?.mainVisible ?? false,
            darkShell: inspection?.darkShell ?? false,
            trustRailReady,
            topbarLabelReady,
            mobileActiveNavReady,
            desktopReady,
            mobileReady,
            horizontalOverflow: inspection?.horizontalOverflow ?? null,
          },
          metrics: inspection,
        });
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

async function main() {
  const generatedAt = new Date().toISOString();
  if (!requestedBaseUrl && process.env.KIMI_VISUAL_REUSE_LOCAL === '1' && await waitForReusableLocalServer(`${reusableLocalBaseUrl}/goal`)) {
    baseUrl = reusableLocalBaseUrl;
    usingExternalVisualTarget = true;
    visualTargetMode = 'existing-local-server';
  }

  const visualDatabase = await prepareLocalVisualDatabase();
  const dynamicRouteDiscovery = await discoverDynamicRoutes(visualDatabase.databaseUrl);
  dynamicRouteDiscovery.notes = [...visualDatabase.notes, ...dynamicRouteDiscovery.notes];
  routes = [...baseRoutes, ...dynamicRouteDiscovery.routes];
  const server = await ensureServer(visualDatabase.databaseUrl);
  const serverReady = await waitForServer(`${baseUrl}/goal`);
  let results = [];
  let checkError = null;

  try {
    if (!serverReady) {
      throw new Error(`Kimi visual target did not become ready: ${baseUrl}`);
    }
    results = await runChecks();
  } catch (error) {
    checkError = error instanceof Error ? error.message : String(error);
  } finally {
    if (server.started) stopServer(server.process);
    if (server.distDir) {
      await cleanupTempDirWithRetries(server.distDir);
    }
    if (visualDatabase.cleanupDir) {
      await cleanupTempDirWithRetries(visualDatabase.cleanupDir);
    }
  }

  const failed = results.filter((result) => !result.ok);
  const ready = serverReady && !checkError && failed.length === 0;
  const packet = {
    format: 'claimbot.kimi-visual-readiness-packet.v1',
    generatedAt,
    note: 'Non-secret local visual readiness packet. Screenshots are local artifacts for visual QA and should be reviewed before sharing because they show rendered app state.',
    readiness: {
      ready,
      baseUrl,
      serverStartedByPacket: server.started,
      serverReady,
      routeCount: routes.length,
      viewportCount: viewports.length,
      screenshotCount: results.filter((result) => result.screenshot).length,
      checkCount: results.length,
      failureCount: failed.length,
      checkError,
      requiredForClientPreview: true,
      visualTargetMode,
      visualDatabaseMode: usingExternalVisualTarget
        ? 'target-database-read-only'
        : 'temporary-local-copy',
      visualBoundary: 'This proves the Kimi shell renders locally on desktop and mobile routes; hosted preview still needs npm run preview:gate against the deployed HTTPS URL.',
      dynamicDataBoundary: usingExternalVisualTarget
        ? 'Existing or external target checks do not seed data. Claim-detail screenshots appear only when that target database already has claim records.'
        : 'Default local checks copy the file database to a temporary directory and seed screenshot-only claim detail data without changing the real database.',
    },
    requiredSignals: [
      'Kimi dark-first shell exists',
      'Topbar and main workspace are visible',
      'Desktop sidebar is visible on desktop',
      'Primary side nav keeps customer tasks first and extra setup pages behind a More disclosure',
      'Dashboard keeps dense readiness and launch proof inside Account details',
      'Privacy, Terms, Contact, and Help live in the global footer footnote links',
      'Mobile bottom navigation and menu button are visible on mobile',
      'Trust rail shows Permission required, Proof manual, and Account history',
      'No horizontal overflow at checked viewports',
      'Route-specific command-center text is present',
      'Core setup, review, claims, pricing, trust, status, audit, permissions, launch, and packet routes render in the Kimi shell',
      'Extended profile, settings, discovery, evidence, access, support, help, terms, and privacy routes render in the Kimi shell',
      'Eligibility and available settlement/claim detail routes render with real Kimi read-only browsers and guarded action surfaces',
    ],
    dynamicRouteDiscovery,
    results,
    commands: [
      'npm run kimi:visual:packet',
      '$env:KIMI_VISUAL_REUSE_LOCAL="1"; npm run kimi:visual:packet',
      '$env:KIMI_VISUAL_BASE_URL="https://your-preview.netlify.app"; npm run kimi:visual:packet',
      'npm run client:checklist',
      'npm run launch:handoff',
    ],
  };

  const markdown = [
    '# ClaimBot Kimi Visual Readiness Packet',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This is a non-secret local visual readiness packet. It records screenshot paths, viewport checks, Kimi shell signals, trust rail text presence, and overflow status.',
    '',
    '## Current Gate',
    '',
    `Kimi visual readiness: ${ready ? 'ready' : 'blocked'}`,
    `Base URL: ${baseUrl}`,
    `Server ready: ${serverReady ? 'yes' : 'no'}`,
    `Visual database mode: ${packet.readiness.visualDatabaseMode}`,
    `Screenshots: ${packet.readiness.screenshotCount}`,
    `Checks: ${results.length}`,
    `Failures: ${failed.length}`,
    `Error: ${checkError ?? 'none'}`,
    `Boundary: ${packet.readiness.visualBoundary}`,
    `Dynamic data boundary: ${packet.readiness.dynamicDataBoundary}`,
    '',
    '## Required Signals',
    '',
    ...packet.requiredSignals.map((signal) => `- ${signal}`),
    '',
    '## Dynamic Route Discovery',
    '',
    ...(dynamicRouteDiscovery.notes.length > 0
      ? dynamicRouteDiscovery.notes.map((note) => `- ${note}`)
      : ['- No dynamic route discovery notes recorded.']),
    '',
    '## Route Screenshots',
    '',
    ...(results.length > 0
      ? results.map((result) => [
        `- ${result.viewport} ${result.route}: ${result.ok ? 'pass' : 'fail'}`,
        `  Screenshot: ${result.screenshot ?? 'not captured'}`,
        `  Missing text: ${result.missingText.length > 0 ? result.missingText.join(', ') : 'none'}`,
        `  Overflow: ${result.metrics?.horizontalOverflow === true ? 'yes' : result.metrics?.horizontalOverflow === false ? 'no' : 'unknown'}`,
      ].join('\n'))
      : ['- No route checks completed.']),
    '',
    '## Commands',
    '',
    ...packet.commands.map((command) => `- \`${command}\``),
    '',
    'No secret values were printed.',
    '',
  ].join('\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[kimi-visual-readiness-packet] wrote non-secret visual packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Kimi visual readiness: ${ready ? 'ready' : 'blocked'}`);
  console.log(`Screenshots: ${packet.readiness.screenshotCount}`);
  console.log(`Failures: ${failed.length}`);

  if (!ready) process.exit(1);
}

main().catch((error) => {
  console.error('[kimi-visual-readiness-packet] failed');
  console.error(error);
  process.exit(1);
});
