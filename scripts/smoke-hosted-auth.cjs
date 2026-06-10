const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const net = require('node:net');

if (
  process.platform === 'win32'
  && (!process.env.PLAYWRIGHT_BROWSERS_PATH || process.env.PLAYWRIGHT_BROWSERS_PATH.includes(':USERPROFILE'))
) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
}

const { chromium, request } = require('playwright');

const port = Number(process.env.SMOKE_AUTH_PORT || 3122);
const ownsServer = !process.env.SMOKE_BASE_URL;
const deployedTarget = Boolean(process.env.SMOKE_BASE_URL);
const baseUrl = process.env.SMOKE_BASE_URL || `http://localhost:${port}`;
const sessionSecret = process.env.CLAIMBOT_SESSION_SECRET || 'local-smoke-session-secret-at-least-32-characters';
const providedBillingSyncSecret = Boolean(process.env.CLAIMBOT_BILLING_SYNC_SECRET?.trim());
const providedStripeWebhookSecret = Boolean(process.env.CLAIMBOT_STRIPE_WEBHOOK_SECRET?.trim());
const providedBillingSignatureSecret = providedBillingSyncSecret || providedStripeWebhookSecret;
const legalReviewRecorded = process.env.CLAIMBOT_LEGAL_REVIEW_ACK?.trim() === 'reviewed';
const billingSyncSecret = process.env.CLAIMBOT_BILLING_SYNC_SECRET || 'local-smoke-billing-sync-secret-at-least-32-characters';
const stripeWebhookSecret = process.env.CLAIMBOT_STRIPE_WEBHOOK_SECRET || 'whsec_local_smoke_secret_at_least_32_characters';
const sessionCookieName = 'claimbot_session';
const smokeTmpDir = ownsServer ? fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-auth-smoke-')) : null;
const smokeDistDirs = ownsServer
  ? ['.next-smoke-auth-main', '.next-smoke-auth-gate']
  : [];
const smokeDatabaseUrl = ownsServer
  ? `file:${path.join(smokeTmpDir, 'auth-smoke.db')}`
  : process.env.DATABASE_URL;

const publicRoutes = [
  {
    path: '/login',
    status: 200,
    contains: ['Protected workspace', 'Signed app session', 'User control first', 'Shadow-mode default'],
  },
  {
    path: '/pricing',
    status: 200,
    h1: 'Free matching. Paid full automation.',
    contains: ['Payment availability', 'Protected payment sync', 'Pro is hands-off where the claim is safe to automate', 'Paid automation still keeps legal review', 'Full Automation Lane', 'No payout percentage', 'No eligibility fabrication'],
  },
  { path: '/help', status: 200, h1: 'Help and support' },
  { path: '/contact', status: 200 },
  { path: '/privacy-policy', status: 200 },
  { path: '/terms', status: 200 },
  {
    path: '/offline.html',
    status: 200,
    contains: ['Installed app safety mode', 'Hosted app required', 'Offline safety checklist', 'No offline filing'],
  },
  { path: '/manifest.webmanifest', status: 200, contentType: 'application/manifest+json' },
  { path: '/sw.js', status: 200, contentType: 'javascript' },
  { path: '/icon.svg', status: 200, contentType: 'image/svg+xml' },
  { path: '/api/health', status: 200, health: true },
];

function url(pathname) {
  return new URL(pathname, baseUrl).toString();
}

function targetUrl(targetBaseUrl, pathname) {
  return new URL(pathname, targetBaseUrl).toString();
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url');
}

function signBillingSyncBody(value) {
  return `sha256=${crypto.createHmac('sha256', billingSyncSecret).update(value).digest('hex')}`;
}

function signStripeWebhookBody(value, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto
    .createHmac('sha256', stripeWebhookSecret)
    .update(`${timestamp}.${value}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function signedSessionCookie(email = 'smoke-auth@example.com') {
  const payload = base64url(JSON.stringify({
    sub: 'smoke-auth-user',
    email,
    exp: Math.floor(Date.now() / 1000) + 300,
  }));
  return `${payload}.${sign(payload)}`;
}

function hasParsedLocalVerificationReceipt(localTooling) {
  const receipt = localTooling?.localVerificationPacket;
  return Boolean(
    receipt
      && receipt.path === 'data/local-verification-packet.md'
      && typeof receipt.ready === 'boolean'
      && typeof receipt.passed === 'number'
      && typeof receipt.total === 'number'
      && receipt.boundary?.includes('does not prove Netlify account setup'),
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function importSmokeSourceCatalog() {
  if (!ownsServer) return;
  const bundlePath = path.join(process.cwd(), 'data', 'source-catalog-export.json');
  if (!fs.existsSync(bundlePath)) {
    throw new Error('data/source-catalog-export.json is missing. Run npm run source:export before npm run smoke:auth.');
  }
  await runCommand(
    process.execPath,
    [path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.cjs'), 'scripts/import-source-catalog.ts'],
    childEnv(),
  );
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

async function waitForHealth(targetBaseUrl = baseUrl) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(targetUrl(targetBaseUrl, '/api/health'));
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await wait(1_000);
  }
  throw new Error(`Timed out waiting for ${targetBaseUrl}/api/health`);
}

async function startServer() {
  if (!ownsServer) return null;
  if (!(await isPortAvailable(port))) {
    throw new Error(`Port ${port} is already in use. Set SMOKE_BASE_URL or SMOKE_AUTH_PORT.`);
  }
  await migrateSmokeDatabase();
  await importSmokeSourceCatalog();

  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: childEnv({
      NEXT_DIST_DIR: '.next-smoke-auth-main',
      CLAIMBOT_REQUIRE_AUTH: 'true',
      CLAIMBOT_DISABLE_AUTH: 'false',
      CLAIMBOT_SESSION_SECRET: sessionSecret,
      CLAIMBOT_BILLING_SYNC_SECRET: billingSyncSecret,
      CLAIMBOT_STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
      CLAIMBOT_BILLING_PLUS_MONTHLY_URL: process.env.CLAIMBOT_BILLING_PLUS_MONTHLY_URL || 'https://checkout.example.com/plus',
      CLAIMBOT_BILLING_PRO_MONTHLY_URL: process.env.CLAIMBOT_BILLING_PRO_MONTHLY_URL || 'https://checkout.example.com/pro',
      CLAIM_FILER_MODE: process.env.CLAIM_FILER_MODE || 'shadow',
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

  await waitForHealth(baseUrl);
  return child;
}

async function startMissingSecretServer() {
  if (!ownsServer) return null;
  const gatePort = Number(process.env.SMOKE_SETUP_GATE_PORT || port + 1);
  const gateBaseUrl = `http://localhost:${gatePort}`;
  if (!(await isPortAvailable(gatePort))) {
    throw new Error(`Port ${gatePort} is already in use. Set SMOKE_SETUP_GATE_PORT.`);
  }

  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(gatePort)], {
    cwd: process.cwd(),
    env: childEnv({
      NEXT_DIST_DIR: '.next-smoke-auth-gate',
      CLAIMBOT_REQUIRE_AUTH: 'true',
      CLAIMBOT_DISABLE_AUTH: 'false',
      CLAIMBOT_SESSION_SECRET: '',
      CLAIM_FILER_MODE: 'shadow',
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

  await waitForHealth(gateBaseUrl);
  return { baseUrl: gateBaseUrl, child };
}

async function smokeMissingSetupSecret(results, failures) {
  if (!ownsServer) return;

  let setupGateServer = null;
  try {
    setupGateServer = await startMissingSecretServer();
    if (!setupGateServer) return;

    const setupResponse = await fetch(targetUrl(setupGateServer.baseUrl, '/setup'));
    const setupBody = await setupResponse.text();
    const setupEntry = {
      path: '/setup',
      scenario: 'missing session secret',
      status: setupResponse.status,
      baseUrl: setupGateServer.baseUrl,
    };
    results.push(setupEntry);
    if (setupResponse.status !== 200) {
      failures.push(`/setup missing session secret: expected 200 auth gate page, got ${setupResponse.status}`);
    }
    for (const expectedText of [
      'AuthGateBlock',
      'Fact intake is not available yet.',
      'Sign-in protection must be ready before customers can continue.',
      'Protected account access required',
      'Open account status',
      'Review account settings',
    ]) {
      if (!setupBody.includes(expectedText)) {
        failures.push(`/setup missing session secret: expected "${expectedText}"`);
      }
    }
    for (const forbiddenText of ['Copy command', 'npm run']) {
      if (setupBody.includes(forbiddenText)) {
        failures.push(`/setup missing session secret: must not expose client-facing "${forbiddenText}"`);
      }
    }

    const apiResponse = await fetch(targetUrl(setupGateServer.baseUrl, '/api/setup/profile'), { method: 'POST' });
    const apiBody = await apiResponse.text();
    results.push({
      path: '/api/setup/profile',
      scenario: 'missing session secret',
      status: apiResponse.status,
    });
    if (apiResponse.status !== 503) {
      failures.push(`/api/setup/profile missing session secret: expected 503, got ${apiResponse.status}`);
    }
    if (!apiBody.includes('Session signing must be configured before hosted account intake can create records.')) {
      failures.push('/api/setup/profile missing session secret: expected customer-safe session-signing error body');
    }
  } finally {
    if (setupGateServer) {
      setupGateServer.child.kill();
      await wait(1_000);
    }
  }
}

async function main() {
  let server = null;
  let api = null;
  const failures = [];
  const results = [];

  try {
    server = await startServer();
    api = await request.newContext({ baseURL: baseUrl });

    for (const route of publicRoutes) {
    const response = await api.get(route.path);
    const status = response.status();
    const contentType = response.headers()['content-type'] || '';
    const entry = { path: route.path, status, contentType };
    if (route.h1 || route.contains) {
      const body = await response.text();
      if (route.h1) entry.h1 = route.h1;
      if (route.h1 && !body.includes(`<h1>${route.h1}</h1>`)) {
        failures.push(`${route.path}: expected public page h1 "${route.h1}"`);
      }
      for (const expectedText of route.contains || []) {
        if (!body.includes(expectedText)) {
          failures.push(`${route.path}: expected public page text "${expectedText}"`);
        }
      }
    }
    if (route.health) {
      const json = await response.json();
      entry.ok = json.ok;
      entry.checks = json.checks;
      if (json.ok !== true) {
        failures.push(`${route.path}: expected health ok=true`);
      }
      if (json.checks?.database !== 'ok' || json.checks?.schema !== 'ok') {
        failures.push(`${route.path}: expected database and schema checks to be ok`);
      }
      if (json.checks?.identitySubject !== true) {
        failures.push(`${route.path}: expected hosted identity subject schema readiness`);
      }
      if (json.checks?.billingLedger !== true) {
        failures.push(`${route.path}: expected billing ledger schema readiness`);
      }
      if (json.checks?.shadowDefault !== true) {
        failures.push(`${route.path}: expected shadowDefault=true`);
      }
      if (Object.prototype.hasOwnProperty.call(json, 'counts')) {
        failures.push(`${route.path}: public health response must not expose usage counts`);
      }
      if (JSON.stringify(json).includes('user') || JSON.stringify(json).includes('auditEvents')) {
        failures.push(`${route.path}: public health response must not expose user or audit details`);
      }
    }
    results.push(entry);
    if (status !== route.status) failures.push(`${route.path}: expected ${route.status}, got ${status}`);
    if (route.contentType && !contentType.includes(route.contentType)) {
      failures.push(`${route.path}: expected content-type containing "${route.contentType}", got "${contentType}"`);
    }
    }

  const protectedApi = await api.get('/api/profile/bootstrap');
  results.push({ path: '/api/profile/bootstrap', status: protectedApi.status() });
  if (protectedApi.status() !== 401) {
    failures.push(`/api/profile/bootstrap: expected 401 without Identity cookie, got ${protectedApi.status()}`);
  }

  const anonymousPrivacyExport = await api.get('/api/privacy/export');
  results.push({ path: '/api/privacy/export', status: anonymousPrivacyExport.status(), auth: 'anonymous privacy export' });
  if (anonymousPrivacyExport.status() !== 401) {
    failures.push(`/api/privacy/export: expected 401 without Identity cookie, got ${anonymousPrivacyExport.status()}`);
  }
  const anonymousActivationWorkbook = await api.get('/api/audit/external-activation-workbook');
  results.push({
    path: '/api/audit/external-activation-workbook',
    status: anonymousActivationWorkbook.status(),
    auth: 'anonymous activation workbook export',
  });
  if (anonymousActivationWorkbook.status() !== 401) {
    failures.push(`/api/audit/external-activation-workbook: expected 401 without Identity cookie, got ${anonymousActivationWorkbook.status()}`);
  }
  const anonymousClientPreviewChecklist = await api.get('/api/audit/client-preview-checklist');
  results.push({
    path: '/api/audit/client-preview-checklist',
    status: anonymousClientPreviewChecklist.status(),
    auth: 'anonymous client preview checklist export',
  });
  if (anonymousClientPreviewChecklist.status() !== 401) {
    failures.push(`/api/audit/client-preview-checklist: expected 401 without Identity cookie, got ${anonymousClientPreviewChecklist.status()}`);
  }
  const anonymousLaunchHandoff = await api.get('/api/audit/launch-handoff');
  results.push({
    path: '/api/audit/launch-handoff',
    status: anonymousLaunchHandoff.status(),
    auth: 'anonymous launch handoff export',
  });
  if (anonymousLaunchHandoff.status() !== 401) {
    failures.push(`/api/audit/launch-handoff: expected 401 without Identity cookie, got ${anonymousLaunchHandoff.status()}`);
  }
  const anonymousNetlifyLaunchDoctor = await api.get('/api/audit/netlify-launch-doctor');
  results.push({
    path: '/api/audit/netlify-launch-doctor',
    status: anonymousNetlifyLaunchDoctor.status(),
    auth: 'anonymous Netlify launch doctor export',
  });
  if (anonymousNetlifyLaunchDoctor.status() !== 401) {
    failures.push(`/api/audit/netlify-launch-doctor: expected 401 without Identity cookie, got ${anonymousNetlifyLaunchDoctor.status()}`);
  }
  const anonymousPrivacyRequest = await api.post('/api/privacy/request', {
    data: {
      requestType: 'deletion',
      message: 'Please route this smoke request.',
    },
  });
  results.push({ path: '/api/privacy/request', status: anonymousPrivacyRequest.status(), auth: 'anonymous privacy request' });
  if (anonymousPrivacyRequest.status() !== 401) {
    failures.push(`/api/privacy/request: expected 401 without Identity cookie, got ${anonymousPrivacyRequest.status()}`);
  }

  if (deployedTarget) {
    const identityEndpointProbe = await api.get('/.netlify/identity/user');
    const identityEndpointStatus = identityEndpointProbe.status();
    const identityEndpointContentType = identityEndpointProbe.headers()['content-type'] || '';
    results.push({
      path: '/.netlify/identity/user',
      status: identityEndpointStatus,
      contentType: identityEndpointContentType,
      scenario: 'deployed Netlify Identity endpoint probe',
    });
    if (![401, 403].includes(identityEndpointStatus)) {
      failures.push(`/.netlify/identity/user: deployed Netlify Identity endpoint must require auth, got ${identityEndpointStatus}`);
    }
    if (identityEndpointStatus === 404 || identityEndpointContentType.includes('text/html')) {
      failures.push('/.netlify/identity/user: expected Netlify Identity endpoint, not a missing or app-rendered HTML route');
    }
  }

  const fakeIdentitySession = await api.post('/api/auth/session', {
    headers: { Authorization: 'Bearer fake-client-token' },
  });
  const fakeIdentitySessionBody = await fakeIdentitySession.text();
  results.push({
    path: '/api/auth/session',
    status: fakeIdentitySession.status(),
    auth: 'fake Identity bearer',
  });
  if (fakeIdentitySession.status() !== 401) {
    failures.push(`/api/auth/session: fake Identity bearer must not mint an app session, got ${fakeIdentitySession.status()}`);
  }
  if (!fakeIdentitySessionBody.includes('identity token rejected')) {
    failures.push('/api/auth/session: fake Identity bearer should return identity token rejected');
  }

  const billingSyncProbe = await api.post('/api/billing/entitlement-sync', {
    data: {
      email: 'billing-smoke@example.com',
      plan: 'pro',
      status: 'active',
    },
  });
  const billingSyncBody = await billingSyncProbe.text();
  results.push({
    path: '/api/billing/entitlement-sync',
    status: billingSyncProbe.status(),
    scenario: 'unsigned processor callback',
  });
  if (![401, 503].includes(billingSyncProbe.status())) {
    failures.push(`/api/billing/entitlement-sync: expected signature/secret rejection without app session, got ${billingSyncProbe.status()}`);
  }
  if (billingSyncBody.includes('authentication required')) {
    failures.push('/api/billing/entitlement-sync: middleware auth gate must not block processor callbacks before signature verification');
  }
  if (deployedTarget && !providedBillingSignatureSecret) {
    failures.push('/api/billing/entitlement-sync: deployed smoke requires CLAIMBOT_BILLING_SYNC_SECRET or CLAIMBOT_STRIPE_WEBHOOK_SECRET so signed processor callbacks are verified');
  }

  if (ownsServer || providedBillingSignatureSecret) {
    const billingEventId = `smoke-${Date.now()}`;
    const signedBillingBody = JSON.stringify({
      id: billingEventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: `cus_${Date.now()}`,
          subscription: `sub_${Date.now()}`,
          client_reference_id: 'claimbot_user_999999',
          payment_status: 'paid',
          customer_details: {
            email: `billing-smoke-${Date.now()}@example.com`,
            name: 'Billing Smoke',
          },
          metadata: {
            plan_key: 'pro_monthly',
          },
        },
      },
    });
    const signedBillingSync = await api.post('/api/billing/entitlement-sync', {
      data: signedBillingBody,
      headers: {
        'content-type': 'application/json',
        ...(providedStripeWebhookSecret && !providedBillingSyncSecret && !ownsServer
          ? { 'stripe-signature': signStripeWebhookBody(signedBillingBody) }
          : { 'x-claimbot-billing-signature': signBillingSyncBody(signedBillingBody) }),
      },
    });
    const signedBillingJson = await signedBillingSync.json().catch(async () => ({
      parseError: await signedBillingSync.text(),
    }));
    results.push({
      path: '/api/billing/entitlement-sync',
      status: signedBillingSync.status(),
      scenario: 'signed processor callback',
      plan: signedBillingJson.plan,
      subscriptionStatus: signedBillingJson.status,
      eventId: signedBillingJson.eventId,
      duplicate: signedBillingJson.duplicate,
    });
    if (signedBillingSync.status() !== 200) {
      failures.push(`/api/billing/entitlement-sync: expected signed processor callback to pass, got ${signedBillingSync.status()}`);
    }
    if (signedBillingJson.plan !== 'pro' || signedBillingJson.status !== 'active') {
      failures.push('/api/billing/entitlement-sync: signed processor callback did not sync Pro active entitlement');
    }
    if (signedBillingJson.eventId !== billingEventId || signedBillingJson.duplicate !== false) {
      failures.push('/api/billing/entitlement-sync: first signed processor callback did not return the stored non-duplicate event ID');
    }

    const replayedBillingSync = await api.post('/api/billing/entitlement-sync', {
      data: signedBillingBody,
      headers: {
        'content-type': 'application/json',
        ...(providedStripeWebhookSecret && !providedBillingSyncSecret && !ownsServer
          ? { 'stripe-signature': signStripeWebhookBody(signedBillingBody) }
          : { 'x-claimbot-billing-signature': signBillingSyncBody(signedBillingBody) }),
      },
    });
    const replayedBillingJson = await replayedBillingSync.json().catch(async () => ({
      parseError: await replayedBillingSync.text(),
    }));
    results.push({
      path: '/api/billing/entitlement-sync',
      status: replayedBillingSync.status(),
      scenario: 'replayed signed processor callback',
      plan: replayedBillingJson.plan,
      subscriptionStatus: replayedBillingJson.status,
      eventId: replayedBillingJson.eventId,
      duplicate: replayedBillingJson.duplicate,
    });
    if (replayedBillingSync.status() !== 200) {
      failures.push(`/api/billing/entitlement-sync: expected replayed signed processor callback to pass, got ${replayedBillingSync.status()}`);
    }
    if (replayedBillingJson.eventId !== billingEventId || replayedBillingJson.duplicate !== true) {
      failures.push('/api/billing/entitlement-sync: replayed signed processor callback did not return duplicate=true for the same event ID');
    }

    if (ownsServer || providedStripeWebhookSecret) {
      const stripeBillingEventId = `smoke-stripe-${Date.now()}`;
      const stripeBillingBody = JSON.stringify({
        id: stripeBillingEventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: `cus_stripe_${Date.now()}`,
            subscription: `sub_stripe_${Date.now()}`,
            client_reference_id: 'claimbot_user_999998',
            payment_status: 'paid',
            customer_details: {
              email: `billing-stripe-smoke-${Date.now()}@example.com`,
              name: 'Stripe Billing Smoke',
            },
            metadata: {
              plan_key: 'pro_monthly',
            },
          },
        },
      });
      const stripeBillingSync = await api.post('/api/billing/entitlement-sync', {
        data: stripeBillingBody,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signStripeWebhookBody(stripeBillingBody),
        },
      });
      const stripeBillingJson = await stripeBillingSync.json().catch(async () => ({
        parseError: await stripeBillingSync.text(),
      }));
      results.push({
        path: '/api/billing/entitlement-sync',
        status: stripeBillingSync.status(),
        scenario: 'Stripe-Signature processor callback',
        plan: stripeBillingJson.plan,
        subscriptionStatus: stripeBillingJson.status,
        eventId: stripeBillingJson.eventId,
        duplicate: stripeBillingJson.duplicate,
      });
      if (stripeBillingSync.status() !== 200) {
        failures.push(`/api/billing/entitlement-sync: expected Stripe-Signature processor callback to pass, got ${stripeBillingSync.status()}`);
      }
      if (stripeBillingJson.plan !== 'pro' || stripeBillingJson.status !== 'active') {
        failures.push('/api/billing/entitlement-sync: Stripe-Signature processor callback did not sync Pro active entitlement');
      }
      if (stripeBillingJson.eventId !== stripeBillingEventId || stripeBillingJson.duplicate !== false) {
        failures.push('/api/billing/entitlement-sync: Stripe-Signature processor callback did not return the stored non-duplicate event ID');
      }
    }
  }

  const fakeBearerApi = await api.get('/api/profile/bootstrap', {
    headers: { Authorization: 'Bearer fake-client-token' },
  });
  results.push({
    path: '/api/profile/bootstrap',
    status: fakeBearerApi.status(),
    auth: 'fake bearer',
  });
  if (fakeBearerApi.status() !== 401) {
    failures.push(`/api/profile/bootstrap: fake Authorization bearer must not bypass auth, got ${fakeBearerApi.status()}`);
  }

  const protectedLaunch = await api.get('/launch', { maxRedirects: 0 });
  const protectedLaunchLocation = protectedLaunch.headers().location || '';
  results.push({
    path: '/launch',
    status: protectedLaunch.status(),
    location: protectedLaunchLocation,
  });
  if (protectedLaunch.status() !== 307 && protectedLaunch.status() !== 308) {
    failures.push(`/launch: expected redirect without Identity cookie, got ${protectedLaunch.status()}`);
  }
  if (!protectedLaunchLocation.includes('/login') || !protectedLaunchLocation.includes('next=%2Flaunch')) {
    failures.push(`/launch: expected redirect to /login?next=%2Flaunch, got ${protectedLaunchLocation}`);
  }

  const anonymousPrivacyExportHandoff = await api.get('/privacy-export', { maxRedirects: 0 });
  const anonymousPrivacyExportHandoffLocation = anonymousPrivacyExportHandoff.headers().location || '';
  results.push({
    path: '/privacy-export',
    status: anonymousPrivacyExportHandoff.status(),
    auth: 'anonymous privacy export handoff',
    location: anonymousPrivacyExportHandoffLocation,
  });
  if (anonymousPrivacyExportHandoff.status() !== 307 && anonymousPrivacyExportHandoff.status() !== 308) {
    failures.push(`/privacy-export: anonymous privacy export handoff should redirect to login, got ${anonymousPrivacyExportHandoff.status()}`);
  }
  if (!anonymousPrivacyExportHandoffLocation.includes('/login') || !anonymousPrivacyExportHandoffLocation.includes('next=%2Fprivacy-export')) {
    failures.push(`/privacy-export: expected login redirect preserving privacy export handoff, got ${anonymousPrivacyExportHandoffLocation}`);
  }

  const anonymousCheckout = await api.get('/api/billing/checkout?plan=pro_monthly', { maxRedirects: 0 });
  const anonymousCheckoutLocation = anonymousCheckout.headers().location || '';
  results.push({
    path: '/api/billing/checkout?plan=pro_monthly',
    status: anonymousCheckout.status(),
    auth: 'anonymous checkout handoff',
    location: anonymousCheckoutLocation,
  });
  if (anonymousCheckout.status() !== 307 && anonymousCheckout.status() !== 308) {
    failures.push(`/api/billing/checkout: anonymous checkout should redirect to login, got ${anonymousCheckout.status()}`);
  }
  if (!anonymousCheckoutLocation.includes('/login') || !anonymousCheckoutLocation.includes('next=%2Fapi%2Fbilling%2Fcheckout%3Fplan%3Dpro_monthly')) {
    failures.push(`/api/billing/checkout: expected login redirect preserving checkout next URL, got ${anonymousCheckoutLocation}`);
  }

  const fakeNetlifyCookieApi = await api.get('/api/profile/bootstrap', {
    headers: { Cookie: 'nf_jwt=fake-client-token' },
  });
  results.push({
    path: '/api/profile/bootstrap',
    status: fakeNetlifyCookieApi.status(),
    auth: 'fake nf_jwt cookie',
  });
  if (fakeNetlifyCookieApi.status() !== 401) {
    failures.push(`/api/profile/bootstrap: fake nf_jwt cookie must not bypass auth, got ${fakeNetlifyCookieApi.status()}`);
  }

  const signedSessionApi = await api.get('/api/profile/bootstrap', {
    headers: { Cookie: `${sessionCookieName}=${signedSessionCookie()}` },
  });
  results.push({
    path: '/api/profile/bootstrap',
    status: signedSessionApi.status(),
    auth: 'signed app session',
  });
  if (signedSessionApi.status() !== 200) {
    failures.push(`/api/profile/bootstrap: signed app session should pass auth, got ${signedSessionApi.status()}`);
  }

  const signedSignOut = await api.delete('/api/auth/session', {
    headers: { Cookie: `${sessionCookieName}=${signedSessionCookie('smoke-auth-logout@example.com')}` },
  });
  const signedSignOutJson = await signedSignOut.json().catch(async () => ({
    parseError: await signedSignOut.text(),
  }));
  const signedSignOutCookie = signedSignOut.headers()['set-cookie'] || '';
  results.push({
    path: '/api/auth/session',
    status: signedSignOut.status(),
    auth: 'signed app session sign-out',
    audited: signedSignOutJson.audited,
    clearsCookie: signedSignOutCookie.includes(`${sessionCookieName}=;`),
  });
  if (signedSignOut.status() !== 200 || signedSignOutJson.ok !== true) {
    failures.push(`/api/auth/session DELETE: signed app session should clear session, got ${signedSignOut.status()}`);
  }
  if (signedSignOutJson.audited !== true) {
    failures.push('/api/auth/session DELETE: signed app session sign-out should be audited');
  }
  if (!signedSignOutCookie.includes(`${sessionCookieName}=;`)) {
    failures.push('/api/auth/session DELETE: sign-out must clear claimbot_session cookie');
  }

  const signedCheckout = await api.get('/api/billing/checkout?plan=pro_monthly', {
    headers: { Cookie: `${sessionCookieName}=${signedSessionCookie()}` },
    maxRedirects: 0,
  });
  const signedCheckoutLocation = signedCheckout.headers().location || '';
  const signedCheckoutUrl = signedCheckoutLocation ? new URL(signedCheckoutLocation) : null;
  results.push({
    path: '/api/billing/checkout?plan=pro_monthly',
    status: signedCheckout.status(),
    auth: 'signed app session',
    locationHost: signedCheckoutUrl?.host,
    checkoutBlockReason: signedCheckoutUrl?.searchParams.get('reason'),
    clientReferenceId: signedCheckoutUrl?.searchParams.get('clientReferenceId'),
    clientReferenceSnake: signedCheckoutUrl?.searchParams.get('client_reference_id'),
    claimbotUserId: signedCheckoutUrl?.searchParams.get('claimbotUserId'),
  });
  if (signedCheckout.status() !== 307 && signedCheckout.status() !== 308) {
    failures.push(`/api/billing/checkout: signed session should redirect to checkout or billing support, got ${signedCheckout.status()}`);
  }
  if (!signedCheckoutUrl) {
    failures.push(`/api/billing/checkout: signed session expected checkout or billing support URL, got ${signedCheckoutLocation}`);
  } else if (!legalReviewRecorded && signedCheckoutUrl.pathname === '/contact') {
    if (signedCheckoutUrl.searchParams.get('topic') !== 'billing') {
      failures.push(`/api/billing/checkout: legal-review lock should route to billing support, got ${signedCheckoutLocation}`);
    }
    if (signedCheckoutUrl.searchParams.get('reason') !== 'legal-review-not-recorded') {
      failures.push(`/api/billing/checkout: expected legal-review-not-recorded lock before payment, got ${signedCheckoutLocation}`);
    }
  } else {
    if (!legalReviewRecorded) {
      failures.push(`/api/billing/checkout: paid checkout should stay locked until CLAIMBOT_LEGAL_REVIEW_ACK=reviewed, got ${signedCheckoutLocation}`);
    } else if (ownsServer && signedCheckoutUrl.origin + signedCheckoutUrl.pathname !== 'https://checkout.example.com/pro') {
      failures.push(`/api/billing/checkout: local signed session expected fixture processor checkout URL, got ${signedCheckoutLocation}`);
    } else if (deployedTarget) {
      const appOrigin = new URL(baseUrl).origin;
      if (signedCheckoutUrl.protocol !== 'https:') {
        failures.push(`/api/billing/checkout: deployed processor redirect must be https, got ${signedCheckoutLocation}`);
      }
      if (signedCheckoutUrl.origin === appOrigin) {
        failures.push(`/api/billing/checkout: deployed processor redirect should leave ClaimBot host, got ${signedCheckoutLocation}`);
      }
    }
    if (!signedCheckoutUrl.searchParams.get('clientReferenceId')?.startsWith('claimbot_user_')) {
      failures.push('/api/billing/checkout: processor redirect missing clientReferenceId=claimbot_user_<id>');
    }
    if (!signedCheckoutUrl.searchParams.get('client_reference_id')?.startsWith('claimbot_user_')) {
      failures.push('/api/billing/checkout: processor redirect missing client_reference_id=claimbot_user_<id>');
    }
    if (!signedCheckoutUrl.searchParams.get('claimbotUserId')) {
      failures.push('/api/billing/checkout: processor redirect missing claimbotUserId');
    }
  }

  const supportPacketApi = await api.get('/api/audit/support-packet', {
    headers: { Cookie: `${sessionCookieName}=${signedSessionCookie()}` },
  });
  const supportPacketJson = await supportPacketApi.json().catch(async () => ({
    parseError: await supportPacketApi.text(),
  }));
  const supportDatabaseSchema = supportPacketJson.launchEvidence?.databaseSchema;
  const supportAutomationControls = supportPacketJson.launchEvidence?.automationControls;
  const supportCheckoutHandoff = supportAutomationControls?.billingCheckoutHandoff;
  const supportSingleQueue = supportAutomationControls?.singleQueue;
  const supportBulkQueue = supportAutomationControls?.bulkQueue;
  const supportReadinessItems = supportPacketJson.launchEvidence?.readiness?.items ?? [];
  const supportBilling = supportPacketJson.launchEvidence?.billing;
  const supportSourceCatalog = supportPacketJson.launchEvidence?.sourceCatalog;
  const supportNetlifyProjectSetupReceipt = supportPacketJson.launchEvidence?.netlifyProjectSetupReceipt;
  const supportLocalTooling = supportPacketJson.launchEvidence?.localTooling;
  const supportNetlifyPreview = supportPacketJson.launchEvidence?.netlifyPreview;
  const supportPreviewPromotionReceipt = supportPacketJson.launchEvidence?.previewPromotionReceipt;
  const supportPwaReadiness = supportPacketJson.launchEvidence?.pwaReadiness;
  const supportLaunchCriticalPath = supportPacketJson.launchEvidence?.launchCriticalPath;
  const supportOwnerHandoffBriefs = supportPacketJson.launchEvidence?.ownerHandoffBriefs;
  const supportMatcherRunReceipt = supportPacketJson.launchEvidence?.matcherRunReceipt;
  const supportLaunchPacketStack = supportPacketJson.launchEvidence?.launchPacketStack;
  const supportExternalActivationWorkbook = supportLaunchPacketStack?.externalActivationWorkbook;
  const supportClientPreviewChecklist = supportLaunchPacketStack?.clientPreviewChecklist;
  const supportLaunchHandoffReport = supportLaunchPacketStack?.launchHandoffReport;
  const supportLocalVerificationPacket = supportLaunchPacketStack?.localVerificationPacket;
  const supportLaunchPacketRefreshReport = supportLaunchPacketStack?.launchPacketRefreshReport;
  const supportNetlifyLaunchDoctor = supportLaunchPacketStack?.netlifyLaunchDoctor;
  const supportNetlifyLaunchDoctorExport = supportLaunchPacketStack?.netlifyLaunchDoctorExport;
  const supportLegalReview = Array.isArray(supportReadinessItems)
    ? supportReadinessItems.find((item) => item.key === 'legal-review')
    : null;
  const supportPaidBilling = Array.isArray(supportReadinessItems)
    ? supportReadinessItems.find((item) => item.key === 'paid-billing')
    : null;
  results.push({
    path: '/api/audit/support-packet',
    status: supportPacketApi.status(),
    auth: 'signed app session',
    format: supportPacketJson.format,
    digestAlgorithm: supportPacketJson.digest?.algorithm,
    databaseSchemaOk: supportDatabaseSchema?.ok,
    databaseSchemaFailureCount: supportDatabaseSchema?.failureCount,
    checkoutAppendsStableUserReference: supportCheckoutHandoff?.appendsStableUserReference,
    checkoutRequiredLegalAck: supportCheckoutHandoff?.requiredLegalReviewAck,
    checkoutRequiredPaidCheckoutReady: supportCheckoutHandoff?.requiredPaidCheckoutReady,
    checkoutProBlockReason: supportCheckoutHandoff?.checkoutBlockReasons?.proMonthly,
    singleQueueJobEventType: supportSingleQueue?.jobEnqueueEventType,
    bulkQueueJobEventType: supportBulkQueue?.jobEnqueueEventType,
    bulkQueueResultFields: supportBulkQueue?.resultFields,
    paidBillingReady: supportBilling?.ready,
    sourceCatalogTotal: supportSourceCatalog?.totalSettlements,
    sourceCatalogFormCoverage: supportSourceCatalog?.formCoveragePercent,
    sourceCatalogDeadlineCoverage: supportSourceCatalog?.deadlineCoveragePercent,
    sourceCatalogAdministratorCoverage: supportSourceCatalog?.knownAdministratorPercent,
    sourceCatalogCategoryCoverage: supportSourceCatalog?.categorizedPercent,
    sourceCatalogCleanTextCount: supportSourceCatalog?.cleanTextCount,
    sourceCatalogMojibakeCount: supportSourceCatalog?.mojibakeCount,
    sourceCatalogTextEncodingReady: supportSourceCatalog?.textEncodingReady,
    netlifyProjectSetupReceiptOk: supportNetlifyProjectSetupReceipt?.ok,
    netlifyProjectIdentityReady: supportNetlifyProjectSetupReceipt?.identityReady,
    netlifyCliAvailable: supportLocalTooling?.netlifyCli?.available,
    netlifyCliAuthenticated: supportLocalTooling?.netlifyCli?.authenticated,
    localVerificationReceiptReady: supportLocalTooling?.localVerificationPacket?.ready,
    localVerificationReceiptPassed: supportLocalTooling?.localVerificationPacket?.passed,
    localVerificationReceiptTotal: supportLocalTooling?.localVerificationPacket?.total,
    launchPacketRefreshReady: supportLocalTooling?.launchPacketRefreshReport?.ready,
    launchPacketRefreshPassed: supportLocalTooling?.launchPacketRefreshReport?.passed,
    launchPacketRefreshTotal: supportLocalTooling?.launchPacketRefreshReport?.total,
    netlifyPreviewSiteLinked: supportNetlifyPreview?.siteLinked,
    netlifyPreviewSmokeBaseUrlHttps: supportNetlifyPreview?.smokeBaseUrlHttps,
    previewPromotionReceiptExists: supportPreviewPromotionReceipt?.exists,
    previewPromotionReceiptOk: supportPreviewPromotionReceipt?.ok,
    pwaReadinessOk: supportPwaReadiness?.ok,
    pwaReadinessFailureCount: supportPwaReadiness?.failureCount,
    launchCriticalPathCount: supportLaunchCriticalPath?.length,
    launchCriticalPathLabels: supportLaunchCriticalPath?.map((item) => item.label),
    ownerHandoffBriefCount: supportOwnerHandoffBriefs?.length,
    matcherRunReceiptExists: supportMatcherRunReceipt?.exists,
    matcherRunReceiptAt: supportMatcherRunReceipt?.occurredAt,
    matcherRunReceiptSettlementsProcessed: supportMatcherRunReceipt?.settlementsProcessed,
    matcherRunReceiptVerdictsChanged: supportMatcherRunReceipt?.verdictsChanged,
    launchPacketStackReady: supportLaunchPacketStack?.summary?.ready,
    launchPacketStackReadyCount: supportLaunchPacketStack?.summary?.readyCount,
    launchPacketStackTotalCount: supportLaunchPacketStack?.summary?.totalCount,
    localVerificationPacketReady: supportLocalVerificationPacket?.ready,
    localVerificationPacketPath: supportLocalVerificationPacket?.path,
    launchPacketRefreshReportReady: supportLaunchPacketRefreshReport?.ready,
    launchPacketRefreshReportPath: supportLaunchPacketRefreshReport?.path,
    externalActivationWorkbookReady: supportExternalActivationWorkbook?.ready,
    externalActivationWorkbookPath: supportExternalActivationWorkbook?.path,
    clientPreviewChecklistReady: supportClientPreviewChecklist?.ready,
    clientPreviewChecklistPath: supportClientPreviewChecklist?.path,
    launchHandoffReportReady: supportLaunchHandoffReport?.ready,
    launchHandoffReportPath: supportLaunchHandoffReport?.path,
    netlifyLaunchDoctorReady: supportNetlifyLaunchDoctor?.ready,
    netlifyLaunchDoctorPath: supportNetlifyLaunchDoctor?.path,
    legalReviewStatus: supportLegalReview?.status,
  });
  if (supportPacketApi.status() !== 200) {
    failures.push(`/api/audit/support-packet: signed app session should export support packet, got ${supportPacketApi.status()}`);
  }
  if (supportPacketJson.format !== 'claimbot.audit-support-packet.v1') {
    failures.push('/api/audit/support-packet: expected audit support packet format marker');
  }
  if (supportPacketJson.digest?.algorithm !== 'sha256') {
    failures.push('/api/audit/support-packet: expected sha256 digest metadata');
  }
  if (supportDatabaseSchema?.ok !== true || supportDatabaseSchema?.failureCount !== 0) {
    failures.push('/api/audit/support-packet: expected launch evidence databaseSchema ok with zero failures');
  }
  if (!Array.isArray(supportDatabaseSchema?.items) || !supportDatabaseSchema.items.some((item) => item.key === 'identity-subject-column' && item.status === 'pass')) {
    failures.push('/api/audit/support-packet: expected hosted identity subject schema evidence');
  }
  if (!Array.isArray(supportDatabaseSchema?.items) || !supportDatabaseSchema.items.some((item) => item.key === 'billing-event-ledger' && item.status === 'pass')) {
    failures.push('/api/audit/support-packet: expected billing event ledger schema evidence');
  }
  if (supportCheckoutHandoff?.requiredLegalReviewAck !== 'CLAIMBOT_LEGAL_REVIEW_ACK') {
    failures.push('/api/audit/support-packet: expected billing checkout handoff to name the legal review acknowledgement gate');
  }
  if (!legalReviewRecorded && supportCheckoutHandoff?.checkoutBlockReasons?.proMonthly !== 'legal-review-not-recorded') {
    failures.push('/api/audit/support-packet: expected Pro checkout block reason to preserve the legal-review lock');
  }
  if (!legalReviewRecorded && supportCheckoutHandoff?.requiredPaidCheckoutReady !== false) {
    failures.push('/api/audit/support-packet: expected paid checkout readiness to remain false before legal review');
  }
  if (
    supportSingleQueue?.workerJobType !== 'file_claim'
    || supportSingleQueue?.jobEnqueueEventType !== 'JOB_ENQUEUED'
    || supportSingleQueue?.jobPayloadAutomationMode !== 'full_guarded'
    || supportSingleQueue?.existingQueuedClaimsRearmed !== true
  ) {
    failures.push('/api/audit/support-packet: expected single-queue automation controls to prove audited full-guarded file_claim worker jobs');
  }
  if (
    supportBulkQueue?.workerJobType !== 'file_claim'
    || supportBulkQueue?.jobEnqueueEventType !== 'JOB_ENQUEUED'
    || supportBulkQueue?.jobPayloadAutomationMode !== 'full_guarded'
    || supportBulkQueue?.existingQueuedClaimsRearmed !== true
    || !supportBulkQueue?.resultFields?.includes('jobsEnqueued')
    || !supportBulkQueue?.resultFields?.includes('jobsReused')
  ) {
    failures.push('/api/audit/support-packet: expected bulk-queue automation controls to expose audited file_claim worker job receipts');
  }
  if (
    !supportSourceCatalog
    || typeof supportSourceCatalog.totalSettlements !== 'number'
    || typeof supportSourceCatalog.formCoveragePercent !== 'number'
    || typeof supportSourceCatalog.deadlineCoveragePercent !== 'number'
    || typeof supportSourceCatalog.knownAdministratorPercent !== 'number'
    || typeof supportSourceCatalog.categorizedPercent !== 'number'
    || typeof supportSourceCatalog.cleanTextCount !== 'number'
    || typeof supportSourceCatalog.mojibakeCount !== 'number'
    || typeof supportSourceCatalog.textEncodingReady !== 'boolean'
  ) {
    failures.push('/api/audit/support-packet: expected source catalog launch evidence with totals, form coverage, source quality coverage, and text encoding readiness');
  }
  if (!deployedTarget && supportSourceCatalog?.totalSettlements <= 0) {
    failures.push('/api/audit/support-packet: local hosted auth smoke should import data/source-catalog-export.json before support-packet checks');
  }
  if (!Array.isArray(supportSourceCatalog?.items) || !supportSourceCatalog.items.some((item) => item.key === 'source-catalog')) {
    failures.push('/api/audit/support-packet: expected source catalog readiness item in launch evidence');
  }
  if (!Array.isArray(supportSourceCatalog?.items) || !supportSourceCatalog.items.some((item) => item.key === 'claim-form-coverage')) {
    failures.push('/api/audit/support-packet: expected claim-form coverage readiness item in launch evidence');
  }
  if (!supportNetlifyProjectSetupReceipt || typeof supportNetlifyProjectSetupReceipt.identityReady !== 'boolean' || !Array.isArray(supportNetlifyProjectSetupReceipt.warnings)) {
    failures.push('/api/audit/support-packet: expected Netlify project setup receipt and Identity readiness evidence');
  }
  if (supportNetlifyProjectSetupReceipt && JSON.stringify(supportNetlifyProjectSetupReceipt).includes('PASTE_')) {
    failures.push('/api/audit/support-packet: Netlify project setup receipt evidence must not include placeholder secrets');
  }
  if (!supportLocalTooling?.netlifyCli || typeof supportLocalTooling.netlifyCli.authenticated !== 'boolean' || !Array.isArray(supportLocalTooling.netlifyCli.items)) {
    failures.push('/api/audit/support-packet: expected Netlify CLI/auth readiness launch evidence');
  } else if (!supportLocalTooling.netlifyCli.items.some((item) => item.key === 'netlify-auth')) {
    failures.push('/api/audit/support-packet: expected netlify-auth readiness item in local tooling evidence');
  }
  if (
    !hasParsedLocalVerificationReceipt(supportLocalTooling)
  ) {
    failures.push('/api/audit/support-packet: expected parsed local verification receipt under local tooling launch evidence');
  }
  if (
    !supportLocalTooling?.launchPacketRefreshReport
    || supportLocalTooling.launchPacketRefreshReport.path !== 'data/launch-packet-refresh-report.md'
    || typeof supportLocalTooling.launchPacketRefreshReport.ready !== 'boolean'
  ) {
    failures.push('/api/audit/support-packet: expected parsed launch packet refresh report under local tooling launch evidence');
  }
  if (!supportNetlifyPreview || !Array.isArray(supportNetlifyPreview.items)) {
    failures.push('/api/audit/support-packet: expected Netlify preview promotion readiness launch evidence');
  } else {
    for (const key of ['netlify-site-link', 'smoke-base-url', 'session-smoke-secret', 'billing-smoke-secret']) {
      if (!supportNetlifyPreview.items.some((item) => item.key === key)) {
        failures.push(`/api/audit/support-packet: expected ${key} Netlify preview readiness item in launch evidence`);
      }
    }
    for (const key of ['smoke-base-url', 'session-smoke-secret', 'billing-smoke-secret']) {
      const item = supportNetlifyPreview.items.find((entry) => entry.key === key);
      if (item?.serverObservable !== false) {
        failures.push(`/api/audit/support-packet: expected ${key} to be marked as operator-local, not server-observable`);
      }
    }
  }
  if (!supportPreviewPromotionReceipt || !Array.isArray(supportPreviewPromotionReceipt.items)) {
    failures.push('/api/audit/support-packet: expected preview promotion receipt readiness launch evidence');
  } else {
    for (const key of ['preview-promotion-receipt', 'receipt-freshness', 'receipt-preview-target', 'receipt-command-coverage', 'receipt-current-target-match']) {
      if (!supportPreviewPromotionReceipt.items.some((item) => item.key === key)) {
        failures.push(`/api/audit/support-packet: expected ${key} preview promotion receipt readiness item in launch evidence`);
      }
    }
    for (const item of supportPreviewPromotionReceipt.items) {
      if (item.serverObservable !== false) {
        failures.push(`/api/audit/support-packet: expected ${item.key} receipt evidence to be marked as operator-local, not server-observable`);
      }
    }
  }
  if (!supportPwaReadiness || supportPwaReadiness.ok !== true || !Array.isArray(supportPwaReadiness.items)) {
    failures.push('/api/audit/support-packet: expected PWA install/offline readiness launch evidence');
  } else {
    for (const key of ['pwa-manifest', 'pwa-shortcuts', 'offline-shell', 'service-worker-boundary', 'install-status-copy', 'pwa-hosted-headers']) {
      if (!supportPwaReadiness.items.some((item) => item.key === key && item.status === 'pass')) {
        failures.push(`/api/audit/support-packet: expected ${key} PWA readiness item to pass`);
      }
    }
    if (!supportPwaReadiness.note?.includes('does not cache claim data')) {
      failures.push('/api/audit/support-packet: expected PWA readiness note to include no offline claim-data cache boundary');
    }
  }
  if (
    !supportMatcherRunReceipt
    || supportMatcherRunReceipt.eventType !== 'MATCHER_RUN_COMPLETED'
    || supportMatcherRunReceipt.actor !== 'matcher'
    || supportMatcherRunReceipt.entityType !== 'user'
    || typeof supportMatcherRunReceipt.requiredForClientReadiness !== 'boolean'
    || typeof supportMatcherRunReceipt.exists !== 'boolean'
    || !supportMatcherRunReceipt.verdictCounts
    || typeof supportMatcherRunReceipt.verdictCounts !== 'object'
  ) {
    failures.push('/api/audit/support-packet: expected redacted latest matcher-run receipt evidence in launch evidence');
  }
  if (supportMatcherRunReceipt?.exists === true) {
    for (const key of ['auditEventId', 'occurredAt', 'settlementsProcessed', 'matchesInserted', 'matchesUpdated', 'verdictsChanged', 'errorCount']) {
      if (supportMatcherRunReceipt[key] === null || supportMatcherRunReceipt[key] === undefined) {
        failures.push(`/api/audit/support-packet: matcher-run receipt is missing ${key}`);
      }
    }
  }
  if (!Array.isArray(supportLaunchCriticalPath) || supportLaunchCriticalPath.length === 0) {
    failures.push('/api/audit/support-packet: expected ordered launch critical path evidence');
  } else {
    for (const label of ['Matcher refresh receipt', 'Netlify Identity proof', 'Deployed preview target', 'Preview promotion receipt']) {
      if (!supportLaunchCriticalPath.some((item) => item.label === label)) {
        failures.push(`/api/audit/support-packet: expected ${label} in launch critical path evidence`);
      }
    }
    if (!supportLaunchCriticalPath.every((item) => item.status === 'blocked' || item.status === 'confirmed')) {
      failures.push('/api/audit/support-packet: expected launch critical path items to use blocked/confirmed statuses');
    }
    if (supportLaunchCriticalPath.some((item) => item.label === 'Uncategorized blockers')) {
      failures.push('/api/audit/support-packet: launch critical path must classify every known launch blocker by owner');
    }
    if (JSON.stringify(supportLaunchCriticalPath).includes('PASTE_')) {
      failures.push('/api/audit/support-packet: launch critical path evidence must not include placeholder secrets');
    }
  }
  if (!Array.isArray(supportOwnerHandoffBriefs) || supportOwnerHandoffBriefs.length === 0) {
    failures.push('/api/audit/support-packet: expected owner handoff briefs in launch evidence');
  } else if (!supportOwnerHandoffBriefs.every((brief) => (
    typeof brief.owner === 'string'
    && typeof brief.firstAction === 'string'
    && Array.isArray(brief.safeLocalCommands)
    && Array.isArray(brief.externalInputCommands)
  ))) {
    failures.push('/api/audit/support-packet: owner handoff briefs must include owner, first action, safe local commands, and external-input commands');
  }
  if (!supportLaunchPacketStack || typeof supportLaunchPacketStack.summary !== 'object') {
    failures.push('/api/audit/support-packet: expected launch packet stack evidence summary');
  }
  if (!Array.isArray(supportLaunchPacketStack?.rows) || !supportLaunchPacketStack.rows.some((row) => row.path === 'data/external-activation-workbook.md')) {
    failures.push('/api/audit/support-packet: expected external activation workbook launch packet row');
  }
  if (!Array.isArray(supportLaunchPacketStack?.rows) || !supportLaunchPacketStack.rows.some((row) => row.path === 'data/client-preview-checklist.md')) {
    failures.push('/api/audit/support-packet: expected client preview checklist launch packet row');
  }
  if (!Array.isArray(supportLaunchPacketStack?.rows) || !supportLaunchPacketStack.rows.some((row) => row.path === 'data/launch-handoff-report.md')) {
    failures.push('/api/audit/support-packet: expected launch handoff report launch packet row');
  }
  if (!Array.isArray(supportLaunchPacketStack?.rows) || !supportLaunchPacketStack.rows.some((row) => row.path === 'data/local-verification-packet.md')) {
    failures.push('/api/audit/support-packet: expected local verification launch packet row');
  }
  if (!Array.isArray(supportLaunchPacketStack?.rows) || !supportLaunchPacketStack.rows.some((row) => row.path === 'data/netlify-launch-doctor.md')) {
    failures.push('/api/audit/support-packet: expected Netlify launch doctor launch packet row');
  }
  if (supportLaunchPacketRefreshReport?.path !== 'data/launch-packet-refresh-report.md') {
    failures.push('/api/audit/support-packet: expected launch packet refresh report evidence path');
  }
  if (supportLocalVerificationPacket?.path !== 'data/local-verification-packet.md') {
    failures.push('/api/audit/support-packet: expected local verification evidence path');
  }
  if (supportExternalActivationWorkbook?.path !== 'data/external-activation-workbook.md') {
    failures.push('/api/audit/support-packet: expected external activation workbook evidence path');
  }
  if (supportClientPreviewChecklist?.path !== 'data/client-preview-checklist.md') {
    failures.push('/api/audit/support-packet: expected client preview checklist evidence path');
  }
  if (supportLaunchHandoffReport?.path !== 'data/launch-handoff-report.md') {
    failures.push('/api/audit/support-packet: expected launch handoff report evidence path');
  }
  if (supportNetlifyLaunchDoctor?.path !== 'data/netlify-launch-doctor.md') {
    failures.push('/api/audit/support-packet: expected Netlify launch doctor evidence path');
  }
  if (supportNetlifyLaunchDoctorExport?.format !== 'claimbot.netlify-launch-doctor-export.v1') {
    failures.push('/api/audit/support-packet: expected embedded Netlify launch doctor export evidence');
  }
  if (supportLaunchPacketStack?.hostedExportPath !== '/api/audit/external-activation-workbook') {
    failures.push('/api/audit/support-packet: expected hosted external activation workbook export path');
  }
  if (supportLaunchPacketStack?.hostedExportPaths?.clientPreviewChecklist !== '/api/audit/client-preview-checklist') {
    failures.push('/api/audit/support-packet: expected hosted client preview checklist export path');
  }
  if (supportLaunchPacketStack?.hostedExportPaths?.launchHandoff !== '/api/audit/launch-handoff') {
    failures.push('/api/audit/support-packet: expected hosted launch handoff export path');
  }
  if (supportLaunchPacketStack?.hostedExportPaths?.netlifyLaunchDoctor !== '/api/audit/netlify-launch-doctor') {
    failures.push('/api/audit/support-packet: expected hosted Netlify launch doctor export path');
  }
  for (const key of ['deadline-coverage', 'administrator-coverage', 'category-coverage']) {
    if (!Array.isArray(supportSourceCatalog?.items) || !supportSourceCatalog.items.some((item) => item.key === key)) {
      failures.push(`/api/audit/support-packet: expected ${key} source quality readiness item in launch evidence`);
    }
  }
  if (!Array.isArray(supportSourceCatalog?.items) || !supportSourceCatalog.items.some((item) => item.key === 'text-encoding')) {
    failures.push('/api/audit/support-packet: expected text-encoding source quality readiness item in launch evidence');
  }
  if (supportCheckoutHandoff?.appendsStableUserReference !== true) {
    failures.push('/api/audit/support-packet: expected checkout handoff evidence to append stable user reference');
  }
  for (const param of ['claimbotUserId', 'clientReferenceId', 'client_reference_id']) {
    if (!supportCheckoutHandoff?.redirectReferenceParams?.includes(param)) {
      failures.push(`/api/audit/support-packet: expected checkout handoff evidence for ${param}`);
    }
  }
  if (deployedTarget) {
    if (
      supportSourceCatalog?.sourceCatalogReady !== true
      || supportSourceCatalog?.claimFormCoverageReady !== true
      || supportSourceCatalog?.sourceQualityReady !== true
      || supportSourceCatalog?.textEncodingReady !== true
      || supportSourceCatalog?.mojibakeCount !== 0
      || supportSourceCatalog?.totalSettlements <= 0
    ) {
      failures.push('/api/audit/support-packet: deployed preview must prove the hosted source catalog is imported with claim-form, source-quality, and clean text-encoding readiness');
    }
    if (supportBilling?.ready !== true || supportPaidBilling?.status !== 'pass') {
      failures.push('/api/audit/support-packet: deployed preview must prove paid billing gates are ready');
    }
    if (supportLegalReview?.status !== 'pass') {
      failures.push('/api/audit/support-packet: deployed preview must prove legal/compliance review acknowledgment is recorded');
    }
  }

  const activationWorkbookApi = await api.get('/api/audit/external-activation-workbook', {
    headers: { Cookie: `${sessionCookieName}=${signedSessionCookie()}` },
  });
  const activationWorkbookJson = await activationWorkbookApi.json().catch(async () => ({
    parseError: await activationWorkbookApi.text(),
  }));
  const activationWorkbookLocalTooling = activationWorkbookJson.localTooling;
  results.push({
    path: '/api/audit/external-activation-workbook',
    status: activationWorkbookApi.status(),
    auth: 'signed app session',
    format: activationWorkbookJson.format,
    artifact: activationWorkbookJson.artifact,
    accountScope: activationWorkbookJson.accountScope?.scope,
    accountId: activationWorkbookJson.accountScope?.accountId,
    packetReady: `${activationWorkbookJson.readiness?.launchPacketReadyCount}/${activationWorkbookJson.readiness?.launchPacketTotalCount}`,
    nextStep: activationWorkbookJson.readiness?.nextStep?.label,
    localCommands: activationWorkbookJson.operatorCommandQueue?.localNow?.length,
    externalCommands: activationWorkbookJson.operatorCommandQueue?.externalRequired?.length,
    netlifyCliAvailable: activationWorkbookLocalTooling?.netlifyCli?.available,
    netlifyCliAuthenticated: activationWorkbookLocalTooling?.netlifyCli?.authenticated,
    localVerificationReceiptReady: activationWorkbookLocalTooling?.localVerificationPacket?.ready,
    localVerificationReceiptPassed: activationWorkbookLocalTooling?.localVerificationPacket?.passed,
    localVerificationReceiptTotal: activationWorkbookLocalTooling?.localVerificationPacket?.total,
  });
  if (activationWorkbookApi.status() !== 200) {
    failures.push(`/api/audit/external-activation-workbook: signed app session should export activation workbook, got ${activationWorkbookApi.status()}`);
  }
  if (activationWorkbookJson.format !== 'claimbot.external-activation-workbook.v1') {
    failures.push('/api/audit/external-activation-workbook: expected external activation workbook format marker');
  }
  if (activationWorkbookJson.readiness?.workbookOnly !== true) {
    failures.push('/api/audit/external-activation-workbook: expected workbookOnly readiness boundary');
  }
  if (activationWorkbookJson.accountScope?.scope !== 'account-scoped' || activationWorkbookJson.accountScope?.matcherReceiptRequired !== true) {
    failures.push('/api/audit/external-activation-workbook: expected account-scoped matcher receipt boundary');
  }
  if (activationWorkbookJson.readiness?.clientPreviewReady === true && activationWorkbookJson.readiness?.launchPacketReadyCount !== activationWorkbookJson.readiness?.launchPacketTotalCount) {
    failures.push('/api/audit/external-activation-workbook: clientPreviewReady must not clear until every launch packet is ready');
  }
  if (activationWorkbookJson.artifact !== 'data/external-activation-workbook.md') {
    failures.push('/api/audit/external-activation-workbook: expected repo-relative workbook artifact path');
  }
  if (!Array.isArray(activationWorkbookJson.workbookRows) || activationWorkbookJson.workbookRows.length === 0) {
    failures.push('/api/audit/external-activation-workbook: expected activation workbook rows');
  }
  if (!Array.isArray(activationWorkbookJson.operatorCommandQueue?.localNow) || !activationWorkbookJson.operatorCommandQueue.localNow.some((item) => item.command === 'npm run netlify:doctor')) {
    failures.push('/api/audit/external-activation-workbook: expected operator command queue with safe local evidence commands');
  }
  if (!Array.isArray(activationWorkbookJson.operatorCommandQueue?.externalRequired) || !activationWorkbookJson.operatorCommandQueue.externalRequired.some((item) => item.command.includes('netlify:record-setup'))) {
    failures.push('/api/audit/external-activation-workbook: expected operator command queue with external-account commands');
  }
  if (!activationWorkbookLocalTooling?.netlifyCli || typeof activationWorkbookLocalTooling.netlifyCli.authenticated !== 'boolean' || !Array.isArray(activationWorkbookLocalTooling.netlifyCli.items)) {
    failures.push('/api/audit/external-activation-workbook: expected local Netlify CLI/auth readiness evidence');
  } else if (!activationWorkbookLocalTooling.netlifyCli.items.some((item) => item.key === 'netlify-auth')) {
    failures.push('/api/audit/external-activation-workbook: expected netlify-auth readiness item in local tooling evidence');
  }
  if (!hasParsedLocalVerificationReceipt(activationWorkbookLocalTooling)) {
    failures.push('/api/audit/external-activation-workbook: expected parsed local verification receipt under local tooling evidence');
  }
  if (JSON.stringify(activationWorkbookJson).includes('YOUR_DATABASE_TOKEN') || JSON.stringify(activationWorkbookJson).includes('super-secret')) {
    failures.push('/api/audit/external-activation-workbook: workbook export must not include secret-like example values');
  }

  const clientPreviewChecklistApi = await api.get('/api/audit/client-preview-checklist', {
    headers: { Cookie: `${sessionCookieName}=${signedSessionCookie()}` },
  });
  const clientPreviewChecklistJson = await clientPreviewChecklistApi.json().catch(async () => ({
    parseError: await clientPreviewChecklistApi.text(),
  }));
  const clientPreviewMatcherItem = clientPreviewChecklistJson.items?.find((item) => item.key === 'eligibility-matcher-proof');
  const clientPreviewLocalTooling = clientPreviewChecklistJson.localTooling;
  results.push({
    path: '/api/audit/client-preview-checklist',
    status: clientPreviewChecklistApi.status(),
    auth: 'signed app session',
    format: clientPreviewChecklistJson.format,
    ready: clientPreviewChecklistJson.summary?.clientPreviewReady,
    accountScope: clientPreviewChecklistJson.accountScope?.scope,
    accountId: clientPreviewChecklistJson.accountScope?.accountId,
    productRequirements: `${clientPreviewChecklistJson.summary?.readyCount}/${clientPreviewChecklistJson.summary?.totalCount}`,
    matcherRequirement: clientPreviewMatcherItem?.status,
    matcherReceiptEvidence: clientPreviewMatcherItem?.evidence?.find((item) => item.startsWith('matcherReceipt=')),
    nextStep: clientPreviewChecklistJson.summary?.nextStep?.label,
    launchActionPlanSteps: clientPreviewChecklistJson.launchActionPlan?.summary?.totalSteps,
    launchActionPlanNextStep: clientPreviewChecklistJson.launchActionPlan?.summary?.nextStep?.label,
    localCommands: clientPreviewChecklistJson.launchActionPlan?.commandQueue?.localNow?.length,
    externalCommands: clientPreviewChecklistJson.launchActionPlan?.commandQueue?.externalRequired?.length,
    netlifyCliAvailable: clientPreviewLocalTooling?.netlifyCli?.available,
    netlifyCliAuthenticated: clientPreviewLocalTooling?.netlifyCli?.authenticated,
    localVerificationReceiptReady: clientPreviewLocalTooling?.localVerificationPacket?.ready,
    localVerificationReceiptPassed: clientPreviewLocalTooling?.localVerificationPacket?.passed,
    localVerificationReceiptTotal: clientPreviewLocalTooling?.localVerificationPacket?.total,
  });
  if (clientPreviewChecklistApi.status() !== 200) {
    failures.push(`/api/audit/client-preview-checklist: signed app session should export client preview checklist, got ${clientPreviewChecklistApi.status()}`);
  }
  if (clientPreviewChecklistJson.format !== 'claimbot.client-preview-checklist.v1') {
    failures.push('/api/audit/client-preview-checklist: expected client preview checklist format marker');
  }
  if (clientPreviewChecklistJson.accountScope?.scope !== 'account-scoped' || clientPreviewChecklistJson.accountScope?.matcherReceiptRequired !== true) {
    failures.push('/api/audit/client-preview-checklist: expected account-scoped matcher receipt boundary');
  }
  if (!Array.isArray(clientPreviewChecklistJson.items) || clientPreviewChecklistJson.items.length < 10) {
    failures.push('/api/audit/client-preview-checklist: expected product requirement checklist items');
  }
  for (const key of ['kimi-visual-system', 'core-routes', 'backend-data-readiness', 'auth-identity-gates', 'eligibility-matcher-proof', 'pricing-billing', 'hosted-deployment-preview']) {
    if (!clientPreviewChecklistJson.items?.some((item) => item.key === key)) {
      failures.push(`/api/audit/client-preview-checklist: expected ${key} requirement row`);
    }
  }
  if (supportMatcherRunReceipt?.exists === false) {
    if (clientPreviewMatcherItem?.status !== 'blocked') {
      failures.push('/api/audit/client-preview-checklist: expected matcher requirement to be blocked when signed account has no MATCHER_RUN_COMPLETED receipt');
    }
    if (!clientPreviewMatcherItem?.evidence?.includes('matcherReceipt=missing')) {
      failures.push('/api/audit/client-preview-checklist: expected matcher requirement evidence to record matcherReceipt=missing for this account');
    }
  }
  if (clientPreviewChecklistJson.exports?.externalActivationWorkbook !== '/api/audit/external-activation-workbook') {
    failures.push('/api/audit/client-preview-checklist: expected activation workbook export link');
  }
  if (clientPreviewChecklistJson.exports?.launchHandoff !== '/api/audit/launch-handoff') {
    failures.push('/api/audit/client-preview-checklist: expected launch handoff export link');
  }
  if (!Array.isArray(clientPreviewChecklistJson.launchActionPlan?.rows) || clientPreviewChecklistJson.launchActionPlan.rows.length === 0) {
    failures.push('/api/audit/client-preview-checklist: expected launch action plan rows with command-level operator proof guidance');
  } else if (!clientPreviewChecklistJson.launchActionPlan.rows.some((item) => Array.isArray(item.commands) && item.commands.includes('npm run netlify:doctor'))) {
    failures.push('/api/audit/client-preview-checklist: expected launch action plan rows to include non-secret starter commands');
  }
  if (!Array.isArray(clientPreviewChecklistJson.launchActionPlan?.commandQueue?.localNow) || !clientPreviewChecklistJson.launchActionPlan.commandQueue.localNow.some((item) => item.command === 'npm run netlify:doctor')) {
    failures.push('/api/audit/client-preview-checklist: expected launch action plan command queue with local evidence commands');
  }
  if (!Array.isArray(clientPreviewChecklistJson.launchActionPlan?.commandQueue?.externalRequired) || !clientPreviewChecklistJson.launchActionPlan.commandQueue.externalRequired.some((item) => item.command.includes('netlify:record-setup'))) {
    failures.push('/api/audit/client-preview-checklist: expected launch action plan command queue with external-account commands');
  }
  if (!clientPreviewLocalTooling?.netlifyCli || typeof clientPreviewLocalTooling.netlifyCli.authenticated !== 'boolean' || !Array.isArray(clientPreviewLocalTooling.netlifyCli.items)) {
    failures.push('/api/audit/client-preview-checklist: expected local Netlify CLI/auth readiness evidence');
  } else if (!clientPreviewLocalTooling.netlifyCli.items.some((item) => item.key === 'netlify-auth')) {
    failures.push('/api/audit/client-preview-checklist: expected netlify-auth readiness item in local tooling evidence');
  }
  if (!hasParsedLocalVerificationReceipt(clientPreviewLocalTooling)) {
    failures.push('/api/audit/client-preview-checklist: expected parsed local verification receipt under local tooling evidence');
  }
  if (JSON.stringify(clientPreviewChecklistJson).includes('YOUR_DATABASE_TOKEN') || JSON.stringify(clientPreviewChecklistJson).includes('super-secret')) {
    failures.push('/api/audit/client-preview-checklist: checklist export must not include secret-like example values');
  }

  const launchHandoffApi = await api.get('/api/audit/launch-handoff', {
    headers: { Cookie: `${sessionCookieName}=${signedSessionCookie()}` },
  });
  const launchHandoffJson = await launchHandoffApi.json().catch(async () => ({
    parseError: await launchHandoffApi.text(),
  }));
  const launchHandoffLocalTooling = launchHandoffJson.localTooling;
  results.push({
    path: '/api/audit/launch-handoff',
    status: launchHandoffApi.status(),
    auth: 'signed app session',
    format: launchHandoffJson.format,
    ready: launchHandoffJson.summary?.clientPreviewReady,
    accountScope: launchHandoffJson.accountScope?.scope,
    accountId: launchHandoffJson.accountScope?.accountId,
    blockers: launchHandoffJson.summary?.blockerCount,
    packetReady: `${launchHandoffJson.summary?.launchPacketReadyCount}/${launchHandoffJson.summary?.launchPacketTotalCount}`,
    nextStep: launchHandoffJson.launchActionPlan?.summary?.nextStep?.label,
    localCommands: launchHandoffJson.operatorCommandQueue?.localNow?.length,
    externalCommands: launchHandoffJson.operatorCommandQueue?.externalRequired?.length,
    localVerificationReceiptReady: launchHandoffLocalTooling?.localVerificationPacket?.ready,
    localVerificationReceiptPassed: launchHandoffLocalTooling?.localVerificationPacket?.passed,
    localVerificationReceiptTotal: launchHandoffLocalTooling?.localVerificationPacket?.total,
  });
  if (launchHandoffApi.status() !== 200) {
    failures.push(`/api/audit/launch-handoff: signed app session should export launch handoff, got ${launchHandoffApi.status()}`);
  }
  if (launchHandoffJson.format !== 'claimbot.launch-handoff-report.v1') {
    failures.push('/api/audit/launch-handoff: expected launch handoff report format marker');
  }
  if (launchHandoffJson.readiness?.handoffOnly !== true) {
    failures.push('/api/audit/launch-handoff: expected handoffOnly readiness boundary');
  }
  if (launchHandoffJson.accountScope?.scope !== 'account-scoped' || launchHandoffJson.accountScope?.matcherReceiptRequired !== true) {
    failures.push('/api/audit/launch-handoff: expected account-scoped matcher receipt boundary');
  }
  if (launchHandoffJson.summary?.clientPreviewReady === true && launchHandoffJson.summary?.launchPacketReadyCount !== launchHandoffJson.summary?.launchPacketTotalCount) {
    failures.push('/api/audit/launch-handoff: clientPreviewReady must not clear until every launch packet is ready');
  }
  if (!Array.isArray(launchHandoffJson.launchCriticalPath) || launchHandoffJson.launchCriticalPath.length === 0) {
    failures.push('/api/audit/launch-handoff: expected ordered launch critical path rows');
  }
  if (!Array.isArray(launchHandoffJson.launchActionPlan?.rows) || launchHandoffJson.launchActionPlan.rows.length === 0) {
    failures.push('/api/audit/launch-handoff: expected launch action plan rows');
  }
  if (!Array.isArray(launchHandoffJson.operatorCommandQueue?.localNow) || !launchHandoffJson.operatorCommandQueue.localNow.some((item) => item.command === 'npm run netlify:doctor')) {
    failures.push('/api/audit/launch-handoff: expected operator command queue with local evidence commands');
  }
  if (!Array.isArray(launchHandoffJson.operatorCommandQueue?.externalRequired) || !launchHandoffJson.operatorCommandQueue.externalRequired.some((item) => item.command.includes('netlify:record-setup'))) {
    failures.push('/api/audit/launch-handoff: expected operator command queue with external-account commands');
  }
  if (launchHandoffJson.launchPacketStack?.hostedExportPaths?.launchHandoff !== '/api/audit/launch-handoff') {
    failures.push('/api/audit/launch-handoff: expected launch handoff hosted export path in packet stack');
  }
  if (launchHandoffJson.launchPacketStack?.hostedExportPaths?.netlifyLaunchDoctor !== '/api/audit/netlify-launch-doctor') {
    failures.push('/api/audit/launch-handoff: expected Netlify launch doctor hosted export path in packet stack');
  }
  if (launchHandoffJson.exports?.netlifyLaunchDoctor !== '/api/audit/netlify-launch-doctor') {
    failures.push('/api/audit/launch-handoff: expected Netlify launch doctor export link');
  }
  if (!hasParsedLocalVerificationReceipt(launchHandoffLocalTooling)) {
    failures.push('/api/audit/launch-handoff: expected parsed local verification receipt under local tooling evidence');
  }
  if (JSON.stringify(launchHandoffJson).includes('YOUR_DATABASE_TOKEN') || JSON.stringify(launchHandoffJson).includes('super-secret')) {
    failures.push('/api/audit/launch-handoff: handoff export must not include secret-like example values');
  }

  const netlifyLaunchDoctorApi = await api.get('/api/audit/netlify-launch-doctor', {
    headers: { Cookie: `${sessionCookieName}=${signedSessionCookie()}` },
  });
  const netlifyLaunchDoctorJson = await netlifyLaunchDoctorApi.json().catch(async () => ({
    parseError: await netlifyLaunchDoctorApi.text(),
  }));
  results.push({
    path: '/api/audit/netlify-launch-doctor',
    status: netlifyLaunchDoctorApi.status(),
    auth: 'signed app session',
    format: netlifyLaunchDoctorJson.format,
    artifact: netlifyLaunchDoctorJson.artifact,
    exists: netlifyLaunchDoctorJson.exists,
    ready: netlifyLaunchDoctorJson.ready,
    missingInputs: netlifyLaunchDoctorJson.missingInputs?.length,
  });
  if (netlifyLaunchDoctorApi.status() !== 200) {
    failures.push(`/api/audit/netlify-launch-doctor: signed app session should export Netlify launch doctor, got ${netlifyLaunchDoctorApi.status()}`);
  }
  if (netlifyLaunchDoctorJson.format !== 'claimbot.netlify-launch-doctor-export.v1') {
    failures.push('/api/audit/netlify-launch-doctor: expected Netlify launch doctor export format marker');
  }
  if (netlifyLaunchDoctorJson.artifact !== 'data/netlify-launch-doctor.md') {
    failures.push('/api/audit/netlify-launch-doctor: expected repo-relative Netlify launch doctor artifact path');
  }
  if (netlifyLaunchDoctorJson.exists !== true || !netlifyLaunchDoctorJson.receipt || netlifyLaunchDoctorJson.receipt.format !== 'claimbot.netlify-launch-doctor.v1') {
    failures.push('/api/audit/netlify-launch-doctor: expected saved Netlify launch doctor receipt evidence');
  }
  if (!Array.isArray(netlifyLaunchDoctorJson.missingInputs)) {
    failures.push('/api/audit/netlify-launch-doctor: expected missing inputs array from saved doctor blockers');
  }
  if (JSON.stringify(netlifyLaunchDoctorJson).includes('YOUR_DATABASE_TOKEN') || JSON.stringify(netlifyLaunchDoctorJson).includes('super-secret')) {
    failures.push('/api/audit/netlify-launch-doctor: export must not include secret-like example values');
  }

  const privacyExportApi = await api.get('/api/privacy/export', {
    headers: { Cookie: `${sessionCookieName}=${signedSessionCookie()}` },
  });
  const privacyExportJson = await privacyExportApi.json().catch(async () => ({
    parseError: await privacyExportApi.text(),
  }));
  results.push({
    path: '/api/privacy/export',
    status: privacyExportApi.status(),
    auth: 'signed app session',
    format: privacyExportJson.format,
    digestAlgorithm: privacyExportJson.digest?.algorithm,
    accountId: privacyExportJson.accountId,
    auditEvents: privacyExportJson.counts?.auditEvents,
  });
  if (privacyExportApi.status() !== 200) {
    failures.push(`/api/privacy/export: signed app session should export privacy JSON, got ${privacyExportApi.status()}`);
  }
  if (privacyExportJson.format !== 'claimbot.privacy-export.v1') {
    failures.push('/api/privacy/export: expected privacy export format marker');
  }
  if (privacyExportJson.digest?.algorithm !== 'sha256') {
    failures.push('/api/privacy/export: expected sha256 digest metadata');
  }
  if (!privacyExportJson.privacyRequestBoundary?.deletionRequests) {
    failures.push('/api/privacy/export: expected deletion/correction request boundary');
  }
  if (privacyExportJson.profile?.paymentMethodsJson) {
    failures.push('/api/privacy/export: should not expose raw paymentMethodsJson');
  }

  const signedPrivacyExportHandoff = await api.get('/privacy-export', {
    maxRedirects: 0,
    headers: { Cookie: `${sessionCookieName}=${signedSessionCookie()}` },
  });
  const signedPrivacyExportHandoffLocation = signedPrivacyExportHandoff.headers().location || '';
  results.push({
    path: '/privacy-export',
    status: signedPrivacyExportHandoff.status(),
    auth: 'signed privacy export handoff',
    location: signedPrivacyExportHandoffLocation,
  });
  if (signedPrivacyExportHandoff.status() !== 303) {
    failures.push(`/privacy-export: signed privacy export handoff should redirect to export API with 303, got ${signedPrivacyExportHandoff.status()}`);
  }
  if (!signedPrivacyExportHandoffLocation.includes('/api/privacy/export')) {
    failures.push(`/privacy-export: expected signed handoff to point at /api/privacy/export, got ${signedPrivacyExportHandoffLocation}`);
  }

  const signedPrivacyRequest = await api.post('/api/privacy/request', {
    headers: { Cookie: `${sessionCookieName}=${signedSessionCookie()}` },
    data: {
      requestType: 'deletion',
      contactEmail: 'privacy-smoke@example.com',
      message: 'Please route this deletion request through operator review without automatic deletion.',
    },
  });
  const signedPrivacyRequestJson = await signedPrivacyRequest.json().catch(async () => ({
    parseError: await signedPrivacyRequest.text(),
  }));
  results.push({
    path: '/api/privacy/request',
    status: signedPrivacyRequest.status(),
    auth: 'signed app session',
    requestType: signedPrivacyRequestJson.requestType,
  });
  if (signedPrivacyRequest.status() !== 200) {
    failures.push(`/api/privacy/request: signed app session should record privacy request, got ${signedPrivacyRequest.status()}`);
  }
  if (signedPrivacyRequestJson.requestType !== 'deletion' || signedPrivacyRequestJson.ok !== true) {
    failures.push('/api/privacy/request: expected audited deletion request acknowledgement');
  }
  if (!signedPrivacyRequestJson.boundary?.includes('no destructive deletion')) {
    failures.push('/api/privacy/request: expected no automatic deletion boundary');
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 920 } });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console error: ${msg.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));

  const response = await page.goto(url('/'), { waitUntil: 'networkidle', timeout: 30_000 });
  const finalUrl = page.url();
  const h1 = (await page.locator('main h1').first().textContent({ timeout: 10_000 })).trim();
  const status = response ? response.status() : 0;
  results.push({ path: '/', finalUrl, status, h1, errors });

  if (!finalUrl.includes('/welcome')) {
    failures.push(`/: expected anonymous redirect to /welcome, got ${finalUrl}`);
  }
  if (!h1.includes('class actions')) {
    failures.push(`/: expected public homepage h1, got "${h1}"`);
  }
  for (const error of errors) failures.push(`/: ${error}`);

  const fakeCookiePage = await browser.newPage({ viewport: { width: 1360, height: 920 } });
  await fakeCookiePage.context().addCookies([{
    name: 'nf_jwt',
    value: 'fake-client-token',
    domain: new URL(baseUrl).hostname,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  const fakeCookieResponse = await fakeCookiePage.goto(url('/'), { waitUntil: 'networkidle', timeout: 30_000 });
  const fakeCookieFinalUrl = fakeCookiePage.url();
  const fakeCookieH1 = (await fakeCookiePage.locator('main h1').first().textContent({ timeout: 10_000 })).trim();
  results.push({
    path: '/',
    auth: 'fake nf_jwt cookie',
    finalUrl: fakeCookieFinalUrl,
    status: fakeCookieResponse ? fakeCookieResponse.status() : 0,
    h1: fakeCookieH1,
  });
  if (!fakeCookieFinalUrl.includes('/welcome')) {
    failures.push(`/: fake nf_jwt cookie must still redirect to /welcome, got ${fakeCookieFinalUrl}`);
  }
  if (!fakeCookieH1.includes('class actions')) {
    failures.push(`/: fake nf_jwt cookie expected public homepage h1, got "${fakeCookieH1}"`);
  }
  await fakeCookiePage.close();

  const signedSessionPage = await browser.newPage({ viewport: { width: 1360, height: 920 } });
  await signedSessionPage.context().addCookies([{
    name: sessionCookieName,
    value: signedSessionCookie(),
    domain: new URL(baseUrl).hostname,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  const signedSessionResponse = await signedSessionPage.goto(url('/'), { waitUntil: 'networkidle', timeout: 30_000 });
  const signedSessionFinalUrl = signedSessionPage.url();
  const signedSessionH1 = (await signedSessionPage.locator('main h1').first().textContent({ timeout: 10_000 })).trim();
  results.push({
    path: '/',
    auth: 'signed app session',
    finalUrl: signedSessionFinalUrl,
    status: signedSessionResponse ? signedSessionResponse.status() : 0,
    h1: signedSessionH1,
  });
  if (signedSessionFinalUrl.includes('/login')) {
    failures.push(`/: signed app session should not redirect to login, got ${signedSessionFinalUrl}`);
  }
  if (signedSessionH1 !== 'Find matches. Review them. Track the claims you approve.') {
    failures.push(`/: signed app session expected dashboard h1, got "${signedSessionH1}"`);
  }

  const signedLaunchPage = await browser.newPage({ viewport: { width: 1360, height: 920 } });
  await signedLaunchPage.context().addCookies([{
    name: sessionCookieName,
    value: signedSessionCookie(),
    domain: new URL(baseUrl).hostname,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  const signedLaunchResponse = await signedLaunchPage.goto(url('/launch'), { waitUntil: 'networkidle', timeout: 30_000 });
  const signedLaunchFinalUrl = signedLaunchPage.url();
  const signedLaunchH1 = (await signedLaunchPage.locator('main h1').first().textContent({ timeout: 10_000 })).trim();
  results.push({
    path: '/launch',
    auth: 'signed app session',
    finalUrl: signedLaunchFinalUrl,
    status: signedLaunchResponse ? signedLaunchResponse.status() : 0,
    h1: signedLaunchH1,
  });
  if (signedLaunchFinalUrl.includes('/login')) {
    failures.push(`/launch: signed app session should not redirect to login, got ${signedLaunchFinalUrl}`);
  }
  if (signedLaunchH1 !== 'Launch checklist') {
    failures.push(`/launch: signed app session expected launch checklist h1, got "${signedLaunchH1}"`);
  }
  await signedLaunchPage.close();
  await signedSessionPage.close();

  await browser.close();

  if (server && ownsServer) {
    server.kill();
    server = null;
    await wait(1_000);
  }
  await smokeMissingSetupSecret(results, failures);

  console.log(JSON.stringify(results, null, 2));
  if (failures.length > 0) {
    console.error('[smoke-hosted-auth] failed');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

    console.log(`[smoke-hosted-auth] ok: hosted auth gate checks passed against ${baseUrl}`);
  } finally {
    if (api) await api.dispose();
    if (server) {
      server.kill();
      await wait(1_000);
    }
    await cleanupSmokeTmpDir();
    await cleanupSmokeDistDirs();
  }
}

main().catch((error) => {
  console.error('[smoke-hosted-auth] failed');
  console.error(error);
  process.exit(1);
});
