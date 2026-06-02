const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const strict = process.argv.includes('--strict');
const outputDir = path.join(root, 'data');
const jsonPath = path.join(outputDir, 'netlify-launch-doctor.json');
const markdownPath = path.join(outputDir, 'netlify-launch-doctor.md');
const checks = [];

function readIfExists(relativePath) {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function hasTemplatePlaceholder(value) {
  const normalized = value?.trim().toLowerCase() || '';
  if (!normalized) return false;
  return (
    normalized.includes('your_')
    || normalized.includes('your-')
    || normalized.includes('paste_')
    || normalized.includes('paste-')
    || normalized.includes('yourdomain.com')
    || normalized === 'example'
    || normalized === 'placeholder'
  );
}

function hasValue(value) {
  return Boolean(value?.trim()) && !hasTemplatePlaceholder(value);
}

function validHttpsUrl(value) {
  if (!hasValue(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function parseEnvFile(relativePath) {
  const text = readIfExists(relativePath);
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (key) values[key] = value;
  }
  return values;
}

function loadIgnoredOperatorEnv() {
  let loaded = 0;
  for (const relativePath of ['.env.launch.local', '.env.hosted.local']) {
    const values = parseEnvFile(relativePath);
    for (const [key, value] of Object.entries(values)) {
      if (!hasValue(value)) continue;
      if (hasValue(process.env[key])) continue;
      process.env[key] = value;
      loaded += 1;
    }
  }
  return loaded;
}

function visibleDatabaseUrlShape(databaseUrl) {
  if (!hasValue(databaseUrl)) return 'missing';
  if (databaseUrl.startsWith('libsql://')) return 'libsql://...';
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) return 'postgres://...';
  if (databaseUrl.startsWith('mysql://')) return 'mysql://...';
  if (databaseUrl.startsWith('sqlite://')) return 'sqlite://...';
  return `${databaseUrl.split(':')[0] || 'unknown'}:...`;
}

const ignoredOperatorEnvLoaded = loadIgnoredOperatorEnv();

function hostedDatabaseStatus() {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  const databaseAuthToken = (
    process.env.DATABASE_AUTH_TOKEN
    || process.env.TURSO_AUTH_TOKEN
    || ''
  ).trim();
  const issues = [];

  if (!hasValue(databaseUrl) || databaseUrl.includes('YOUR_DATABASE')) {
    issues.push('DATABASE_URL is missing or still placeholder-only.');
  } else if (databaseUrl.startsWith('file:')) {
    issues.push('DATABASE_URL points at local file storage; hosted deploys require external persistent storage.');
  }

  if (databaseUrl.startsWith('libsql://') && !hasValue(databaseAuthToken)) {
    issues.push('DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN is required for libSQL/Turso hosted databases.');
  }

  return {
    ok: issues.length === 0,
    exists: fs.existsSync(path.join(root, '.env.hosted.local')),
    issues,
    urlShape: visibleDatabaseUrlShape(databaseUrl),
    authTokenPresent: hasValue(databaseAuthToken),
  };
}

const hostedEnvRequiredKeys = [
  'DATABASE_URL',
  'CLAIM_FILER_MODE',
  'CLAIM_FILER_MAX_PER_DAY',
  'SCRAPER_USER_AGENT',
  'CLAIMBOT_DISABLE_AUTH',
  'CLAIMBOT_ENFORCE_CSP',
  'CLAIMBOT_SESSION_SECRET',
  'CLAIMBOT_LEGAL_REVIEW_ACK',
  'CLAIMBOT_FEATURE_SETTLEMENT_SEARCH',
  'CLAIMBOT_FEATURE_LIVE_FILING',
];

const hostedEnvOptionalPushKeys = [
  'DATABASE_AUTH_TOKEN',
  'TURSO_AUTH_TOKEN',
  'CLAIM_FILER_LIVE_ACK',
  'CLAIMBOT_FEATURE_BREACH_IMPORT',
  'CLAIMBOT_BILLING_PLUS_YEARLY_URL',
  'CLAIMBOT_BILLING_PRO_YEARLY_URL',
  'CLAIMBOT_BILLING_FOUNDING_URL',
  'CLAIMBOT_BILLING_SYNC_SECRET',
  'CLAIMBOT_STRIPE_WEBHOOK_SECRET',
];

function hostedEnvironmentStatus() {
  const env = process.env;
  const betaNoBilling = env.CLAIMBOT_BETA_NO_BILLING === 'true';
  const missingRequiredKeys = hostedEnvRequiredKeys.filter((key) => !hasValue(env[key]));
  const issues = missingRequiredKeys.map((key) => `${key} is missing or still placeholder-only.`);
  const databaseUrl = (env.DATABASE_URL || '').trim();

  if (databaseUrl.startsWith('file:')) {
    issues.push('DATABASE_URL points at local file storage; hosted deploys require persistent external storage.');
  }
  if (databaseUrl.startsWith('libsql://') && !hasValue(env.DATABASE_AUTH_TOKEN) && !hasValue(env.TURSO_AUTH_TOKEN)) {
    issues.push('DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN is required for libSQL/Turso hosted databases.');
  }
  if (env.CLAIMBOT_DISABLE_AUTH === 'true') {
    issues.push('CLAIMBOT_DISABLE_AUTH must be false for hosted preview and production.');
  }
  if (env.CLAIMBOT_FEATURE_LIVE_FILING === 'true') {
    issues.push('CLAIMBOT_FEATURE_LIVE_FILING must stay false until live filing has been reviewed.');
  }
  if (hasValue(env.CLAIMBOT_LEGAL_REVIEW_ACK) && env.CLAIMBOT_LEGAL_REVIEW_ACK !== 'reviewed') {
    issues.push('CLAIMBOT_LEGAL_REVIEW_ACK must be exactly "reviewed" after legal/compliance review.');
  }
  if (!hasValue(env.CLAIMBOT_SUPPORT_EMAIL) && !validHttpsUrl(env.CLAIMBOT_SUPPORT_URL)) {
    issues.push('CLAIMBOT_SUPPORT_EMAIL or CLAIMBOT_SUPPORT_URL is required for hosted client support.');
  }
  for (const key of betaNoBilling ? [] : ['CLAIMBOT_BILLING_PLUS_MONTHLY_URL', 'CLAIMBOT_BILLING_PRO_MONTHLY_URL']) {
    if (!hasValue(env[key])) issues.push(`${key} is missing or still placeholder-only.`);
    if (hasValue(env[key]) && !validHttpsUrl(env[key])) issues.push(`${key} must be a real HTTPS checkout URL.`);
  }
  if (!betaNoBilling && !hasValue(env.CLAIMBOT_BILLING_SYNC_SECRET) && !hasValue(env.CLAIMBOT_STRIPE_WEBHOOK_SECRET)) {
    issues.push('CLAIMBOT_BILLING_SYNC_SECRET or CLAIMBOT_STRIPE_WEBHOOK_SECRET is required for paid entitlement sync.');
  }

  const pushableKeyCount = [...hostedEnvRequiredKeys, ...hostedEnvOptionalPushKeys]
    .filter((key) => hasValue(env[key]))
    .length;

  return {
    ok: issues.length === 0,
    exists: fs.existsSync(path.join(root, '.env.hosted.local')),
    launchSecretsExist: fs.existsSync(path.join(root, '.env.launch.local')),
    requiredConfiguredCount: hostedEnvRequiredKeys.length - missingRequiredKeys.length,
    requiredTotal: hostedEnvRequiredKeys.length,
    pushableKeyCount,
    missingRequiredKeys,
    issues,
  };
}

function slugFromDashboardUrl(value) {
  if (!hasValue(value)) return '';
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const sitesIndex = parts.indexOf('sites');
    return sitesIndex >= 0 ? (parts[sitesIndex + 1] || '').trim() : '';
  } catch {
    return '';
  }
}

function previewUrlMatchesSiteSlug(smokeBaseUrl, siteSlug) {
  if (!validHttpsUrl(smokeBaseUrl) || !hasValue(siteSlug)) return false;
  try {
    const hostname = new URL(smokeBaseUrl).hostname.toLowerCase();
    const normalizedSlug = siteSlug.toLowerCase();
    return hostname === `${normalizedSlug}.netlify.app` || hostname.endsWith(`--${normalizedSlug}.netlify.app`);
  } catch {
    return false;
  }
}

function loadNetlifyState() {
  const statePath = path.join(root, '.netlify', 'state.json');
  if (!fs.existsSync(statePath)) {
    return {
      exists: false,
      siteId: '',
      siteName: '',
      adminUrl: '',
      error: null,
    };
  }

  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return {
      exists: true,
      siteId: typeof state?.siteId === 'string' ? state.siteId.trim() : '',
      siteName: typeof state?.siteName === 'string' ? state.siteName.trim() : '',
      adminUrl: typeof state?.adminUrl === 'string' ? state.adminUrl.trim() : '',
      error: null,
    };
  } catch (error) {
    return {
      exists: true,
      siteId: '',
      siteName: '',
      adminUrl: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function statusLine(ok, label, detail) {
  checks.push({
    label,
    status: ok ? 'pass' : 'blocked',
    detail,
  });
  const marker = ok ? 'PASS' : 'BLOCKED';
  console.log(`- ${marker}: ${label}${detail ? ` - ${detail}` : ''}`);
}

function maskedPresence(name) {
  return hasValue(process.env[name]) ? 'set' : 'missing';
}

function netlifyCliStatus() {
  const versionResult = spawnSync('netlify', ['--version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const available = versionResult.status === 0;
  const statusResult = available
    ? spawnSync('netlify', ['status'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    })
    : null;
  const statusOutput = `${statusResult?.stdout || ''}\n${statusResult?.stderr || ''}`;
  const authenticated = Boolean(statusResult && statusResult.status === 0 && !/not logged in/i.test(statusOutput));

  return {
    available,
    version: available ? versionResult.stdout.trim() : '',
    authenticated,
    authDetail: available
      ? authenticated
        ? 'authenticated for Netlify CLI operations'
        : 'run netlify login before env push, deploy, or production promotion'
      : 'install netlify-cli before login/link/deploy',
  };
}

const netlifyToml = readIfExists('netlify.toml');
const packageJson = readIfExists('package.json');
const state = loadNetlifyState();
const netlifyCli = netlifyCliStatus();
const hostedDatabase = hostedDatabaseStatus();
const hostedEnvironment = hostedEnvironmentStatus();
const envSiteId = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
const linkedByState = hasValue(state.siteId);
const linkedByEnv = hasValue(envSiteId);
const siteLinked = linkedByState || linkedByEnv;
const dashboardTarget =
  process.env.NETLIFY_SITE_DASHBOARD_URL
  || (process.env.NETLIFY_SITE_SLUG ? `https://app.netlify.com/sites/${process.env.NETLIFY_SITE_SLUG}` : '')
  || state.adminUrl;
const hasDashboardTarget = validHttpsUrl(dashboardTarget);
const confirmedSiteSlug =
  (hasValue(process.env.NETLIFY_SITE_SLUG) ? process.env.NETLIFY_SITE_SLUG.trim() : '')
  || slugFromDashboardUrl(process.env.NETLIFY_SITE_DASHBOARD_URL)
  || state.siteName
  || slugFromDashboardUrl(state.adminUrl);
const smokeBaseUrlReady = validHttpsUrl(process.env.SMOKE_BASE_URL);
const previewSiteAligned = hasValue(confirmedSiteSlug) && previewUrlMatchesSiteSlug(process.env.SMOKE_BASE_URL, confirmedSiteSlug);
const sessionSmokeReady = hasValue(process.env.CLAIMBOT_SESSION_SECRET);
const billingSmokeReady = hasValue(process.env.CLAIMBOT_BILLING_SYNC_SECRET) || hasValue(process.env.CLAIMBOT_STRIPE_WEBHOOK_SECRET);
const identityReceipt = readIfExists('data/netlify-project-setup-receipt.json');
const identityReceiptReady =
  identityReceipt.includes('"enabled": true')
  && identityReceipt.includes('"registration": "invite-only"')
  && identityReceipt.includes('"emailConfirmation": true');
const buildConfigReady =
  netlifyToml.includes('command = "npm run build:hosted"')
  && netlifyToml.includes('publish = ".next"')
  && netlifyToml.includes('Content-Security-Policy');
const scriptConfigReady =
  packageJson.includes('"validate:netlify:strict"')
  && packageJson.includes('"preview:gate"')
  && packageJson.includes('"build:hosted"');

const blockers = [];
const warnings = [];

if (!netlifyCli.available) blockers.push('Netlify CLI is not available on this machine.');
if (netlifyCli.available && !netlifyCli.authenticated) blockers.push('Netlify CLI is not authenticated. Run netlify login before env push, deploy, or production promotion.');
if (!hostedDatabase.ok) blockers.push(`Hosted database values are not ready: ${hostedDatabase.issues.join(' ')}`);
if (!hostedEnvironment.ok) blockers.push(`Hosted environment values are not ready: ${hostedEnvironment.issues.join(' ')}`);
if (!buildConfigReady) blockers.push('Netlify build config is incomplete.');
if (!scriptConfigReady) blockers.push('package.json is missing one or more Netlify promotion scripts.');
if (state.error) blockers.push(`.netlify/state.json is invalid JSON: ${state.error}`);
if (!siteLinked) blockers.push('No confirmed ClaimBot Netlify site link was found.');
if (siteLinked && !hasDashboardTarget) warnings.push('No dashboard URL or site slug is available for quick operator confirmation.');
if (!smokeBaseUrlReady) blockers.push('SMOKE_BASE_URL is not a deployed HTTPS preview URL.');
if (!hasValue(confirmedSiteSlug)) blockers.push('No confirmed Netlify site slug is available for preview URL alignment.');
if (smokeBaseUrlReady && hasValue(confirmedSiteSlug) && !previewSiteAligned) blockers.push(`SMOKE_BASE_URL does not belong to confirmed Netlify site slug "${confirmedSiteSlug}".`);
if (!sessionSmokeReady) blockers.push('CLAIMBOT_SESSION_SECRET is not available for deployed preview smokes.');
if (!billingSmokeReady) blockers.push('Billing smoke verifier is missing; set CLAIMBOT_BILLING_SYNC_SECRET or CLAIMBOT_STRIPE_WEBHOOK_SECRET.');

const nextCommands = [];
function printNext(command) {
  nextCommands.push(command);
  console.log(command);
}

function writeReceipt(packet) {
  const markdown = [
    '# ClaimBot Netlify Launch Doctor',
    '',
    `Generated: ${packet.generatedAt}`,
    '',
    'This is a non-secret Netlify launch readiness receipt. It records local CLI/auth status, hosted env readiness counts, site-link status, preview-target status, Identity receipt status, blockers, warnings, and next commands only.',
    '',
    '## Current Gate',
    '',
    `Ready: ${packet.ready ? 'yes' : 'no'}`,
    `Blocked checks: ${packet.blockedCheckCount}`,
    `Action blockers: ${packet.blockers.length}`,
    `Warnings: ${packet.warnings.length}`,
    `Ignored operator env loaded: ${packet.ignoredOperatorEnvLoaded}`,
    '',
    '## Checks',
    '',
    ...packet.checks.map((check) => `- ${check.status.toUpperCase()} ${check.label}: ${check.detail}`),
    '',
    '## Blocked Checks',
    '',
    ...(packet.blockedChecks.length === 0 ? ['- none'] : packet.blockedChecks.map((check) => `- ${check.label}: ${check.detail}`)),
    '',
    '## Blockers',
    '',
    ...(packet.blockers.length === 0 ? ['- none'] : packet.blockers.map((item) => `- ${item}`)),
    '',
    '## Warnings',
    '',
    ...(packet.warnings.length === 0 ? ['- none'] : packet.warnings.map((item) => `- ${item}`)),
    '',
    '## Next Commands',
    '',
    ...packet.nextCommands.map((command) => `- \`${command}\``),
    '',
    `Boundary: ${packet.boundary}`,
    '',
    'No secret values were printed.',
    '',
  ].join('\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);
}

console.log('ClaimBot Netlify launch doctor');
console.log('');
if (ignoredOperatorEnvLoaded > 0) {
  console.log(`Loaded ignored env: ${ignoredOperatorEnvLoaded} non-placeholder local values; no values printed`);
  console.log('');
}
statusLine(netlifyCli.available, 'Netlify CLI', netlifyCli.available ? netlifyCli.version : 'install netlify-cli before login/link/deploy');
statusLine(netlifyCli.available && netlifyCli.authenticated, 'Netlify authentication', netlifyCli.authDetail);
statusLine(
  hostedDatabase.ok,
  'Hosted database values',
  hostedDatabase.ok
    ? `${hostedDatabase.urlShape}; auth token ${hostedDatabase.authTokenPresent ? 'present' : 'not required'}; no secrets printed`
    : `${hostedDatabase.exists ? '.env.hosted.local needs real values' : 'run npm run hosted:db:prepare'}; no secrets printed`,
);
statusLine(
  hostedEnvironment.ok,
  'Hosted environment values',
  hostedEnvironment.ok
    ? `${hostedEnvironment.requiredConfiguredCount}/${hostedEnvironment.requiredTotal} required; ${hostedEnvironment.pushableKeyCount} pushable; no secrets printed`
    : `${hostedEnvironment.exists ? '.env.hosted.local needs full launch values' : 'run npm run hosted:env:prepare'}; ${hostedEnvironment.requiredConfiguredCount}/${hostedEnvironment.requiredTotal} required ready; no secrets printed`,
);
statusLine(buildConfigReady, 'Netlify build config', buildConfigReady ? 'build:hosted -> .next with hosted headers' : 'check netlify.toml');
statusLine(scriptConfigReady, 'Promotion scripts', scriptConfigReady ? 'strict preflight and preview gate are wired' : 'check package.json');
statusLine(siteLinked, 'Site link', siteLinked ? (linkedByState ? 'linked by .netlify/state.json' : 'targeted by NETLIFY_SITE_ID/SITE_ID') : 'run netlify login and netlify link');
if (state.exists && state.error) statusLine(false, 'Local link state JSON', state.error);
statusLine(hasDashboardTarget, 'Dashboard confirmation target', hasDashboardTarget ? 'dashboard URL or site slug is available' : 'set NETLIFY_SITE_DASHBOARD_URL or NETLIFY_SITE_SLUG after confirming the site');
statusLine(smokeBaseUrlReady, 'Deployed preview URL', smokeBaseUrlReady ? 'SMOKE_BASE_URL is HTTPS' : 'deploy a preview and set SMOKE_BASE_URL');
statusLine(previewSiteAligned, 'Preview site alignment', previewSiteAligned ? `SMOKE_BASE_URL matches ${confirmedSiteSlug}` : 'set NETLIFY_SITE_SLUG and use the preview URL for that site');
statusLine(identityReceiptReady, 'Identity setup receipt', identityReceiptReady ? 'Identity enabled, invite-only registration, and email confirmation are recorded' : 'confirm Identity dashboard settings, then run npm run netlify:record-setup');
statusLine(sessionSmokeReady, 'Session smoke secret', maskedPresence('CLAIMBOT_SESSION_SECRET'));
statusLine(billingSmokeReady, 'Billing smoke verifier', hasValue(process.env.CLAIMBOT_BILLING_SYNC_SECRET) ? 'CLAIMBOT_BILLING_SYNC_SECRET set' : maskedPresence('CLAIMBOT_STRIPE_WEBHOOK_SECRET'));

if (warnings.length > 0) {
  console.log('');
  console.log('Warnings');
  for (const warning of warnings) console.log(`- ${warning}`);
}

console.log('');
console.log('Next commands');
if (!netlifyCli.available) {
  printNext('npm install -g netlify-cli');
  printNext('netlify --version');
}
if (netlifyCli.available && !netlifyCli.authenticated) {
  printNext('netlify login');
  printNext('netlify status');
}
if (!siteLinked) {
  printNext('netlify login');
  printNext('netlify status');
  printNext('netlify link');
}
if (!hostedEnvironment.ok) {
  printNext('npm run hosted:env:prepare');
  printNext('# Edit .env.hosted.local with real database, support, billing, and legal-review values.');
  printNext('npm run launch:secrets');
  printNext('npm run hosted:env:doctor');
  printNext('npm run hosted:env:push');
}
if (!hostedDatabase.ok) {
  printNext('# Database-only fallback:');
  printNext('npm run hosted:db:prepare');
  printNext('# Edit .env.hosted.local with the real hosted DATABASE_URL and auth token.');
  printNext('npm run hosted:db:doctor');
  printNext('npm run with:hosted-env -- npm run db:migrate');
  printNext('npm run with:hosted-env -- npm run source:import:dry');
  printNext('npm run hosted:db:push');
}
if (!hasDashboardTarget || !hasValue(confirmedSiteSlug)) {
  printNext('$env:NETLIFY_SITE_SLUG="YOUR_CONFIRMED_CLAIMBOT_SITE_SLUG"');
}
if (!identityReceiptReady) {
  printNext('npm run netlify:record-setup -- --identity-enabled --registration invite-only --email-confirmation --safe-env-confirmed --evidence "Identity enabled, invite-only registration, and email confirmation confirmed in Netlify dashboard Project configuration > Identity."');
}
if (!smokeBaseUrlReady) {
  printNext('netlify deploy');
  printNext('$env:SMOKE_BASE_URL="https://your-preview.netlify.app"');
}
if (!sessionSmokeReady) {
  printNext('$env:CLAIMBOT_SESSION_SECRET="PASTE_THE_DEPLOYED_SESSION_SECRET"');
}
if (!billingSmokeReady) {
  printNext('$env:CLAIMBOT_BILLING_SYNC_SECRET="PASTE_THE_DEPLOYED_BILLING_SYNC_SECRET"');
  printNext('# Or: $env:CLAIMBOT_STRIPE_WEBHOOK_SECRET="whsec_YOUR_STRIPE_ENDPOINT_SECRET"');
}
printNext('npm run validate:netlify:strict');
printNext('npm run preview:gate');

const blockedChecks = checks.filter((check) => check.status === 'blocked');
const packet = {
  format: 'claimbot.netlify-launch-doctor.v1',
  generatedAt: new Date().toISOString(),
  ready: blockers.length === 0 && blockedChecks.length === 0,
  strict,
  ignoredOperatorEnvLoaded,
  checks,
  blockedChecks,
  blockedCheckCount: blockedChecks.length,
  actionBlockerCount: blockers.length,
  blockers,
  warnings,
  nextCommands,
  readiness: {
    netlifyCliAvailable: netlifyCli.available,
    netlifyAuthenticated: netlifyCli.authenticated,
    hostedDatabaseReady: hostedDatabase.ok,
    hostedEnvironmentReady: hostedEnvironment.ok,
    hostedEnvironmentRequiredConfigured: hostedEnvironment.requiredConfiguredCount,
    hostedEnvironmentRequiredTotal: hostedEnvironment.requiredTotal,
    buildConfigReady,
    scriptConfigReady,
    siteLinked,
    dashboardTargetPresent: hasDashboardTarget,
    deployedPreviewUrlReady: smokeBaseUrlReady,
    previewSiteAligned,
    identityReceiptReady,
    sessionSmokeReady,
    billingSmokeReady,
  },
  boundary: 'This receipt proves operator-machine Netlify readiness status only. It does not print or validate secret values and it does not replace deployed preview smokes or Netlify dashboard Identity proof.',
};
writeReceipt(packet);
console.log('');
console.log(`Wrote non-secret receipt: ${path.relative(root, markdownPath)}`);

if (blockers.length > 0) {
  console.log('');
  console.log(`Blocked checks: ${blockedChecks.length}. Action blockers: ${blockers.length}.`);
  for (const blocker of blockers) console.log(`- ${blocker}`);
  if (strict) process.exit(1);
} else if (blockedChecks.length > 0) {
  console.log('');
  console.log(`Blocked checks: ${blockedChecks.length}. No grouped action blockers were added.`);
  for (const check of blockedChecks) console.log(`- ${check.label}: ${check.detail}`);
  if (strict) process.exit(1);
} else {
  console.log('');
  console.log('Netlify preview promotion inputs are ready.');
}
