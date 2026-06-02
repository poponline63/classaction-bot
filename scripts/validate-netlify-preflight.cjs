const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const strict = process.argv.includes('--strict') || process.env.CI === 'true';
const failures = [];
const warnings = [];

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

function hasRawValue(value) {
  return Boolean(value?.trim()) && !hasTemplatePlaceholder(value);
}

function hasValue(name) {
  return hasRawValue(process.env[name]);
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
      if (!hasRawValue(value)) continue;
      if (hasValue(key)) continue;
      process.env[key] = value;
      loaded += 1;
    }
  }
  return loaded;
}

function validHttpsUrl(value) {
  if (!hasRawValue(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function slugFromDashboardUrl(value) {
  if (!hasRawValue(value)) return '';
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
  if (!validHttpsUrl(smokeBaseUrl) || !hasRawValue(siteSlug)) return false;
  try {
    const hostname = new URL(smokeBaseUrl).hostname.toLowerCase();
    const normalizedSlug = siteSlug.toLowerCase();
    return hostname === `${normalizedSlug}.netlify.app` || hostname.endsWith(`--${normalizedSlug}.netlify.app`);
  } catch {
    return false;
  }
}

function addIssue(condition, message, strictOnly = false) {
  if (!condition) return;
  if (strictOnly && !strict) {
    warnings.push(message);
    return;
  }
  failures.push(message);
}

const ignoredOperatorEnvLoaded = loadIgnoredOperatorEnv();

const netlifyToml = readIfExists('netlify.toml');
const packageJson = readIfExists('package.json');
const gitignore = readIfExists('.gitignore');
const stateJsonPath = path.join(root, '.netlify', 'state.json');
const hasLinkedState = fs.existsSync(stateJsonPath);
const hasSiteId = hasValue('NETLIFY_SITE_ID') || hasValue('SITE_ID');
let linkedState = null;
let linkedStateParseError = null;

if (hasLinkedState) {
  try {
    linkedState = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  } catch (error) {
    linkedStateParseError = error;
  }
}

const linkedStateSiteId = typeof linkedState?.siteId === 'string' ? linkedState.siteId.trim() : '';
const linkedStateSiteName = typeof linkedState?.siteName === 'string' ? linkedState.siteName.trim() : '';
const linkedStateAdminUrl = typeof linkedState?.adminUrl === 'string' ? linkedState.adminUrl.trim() : '';
const confirmedSiteSlug =
  (hasValue('NETLIFY_SITE_SLUG') ? process.env.NETLIFY_SITE_SLUG.trim() : '')
  || slugFromDashboardUrl(process.env.NETLIFY_SITE_DASHBOARD_URL)
  || linkedStateSiteName
  || slugFromDashboardUrl(linkedStateAdminUrl);

addIssue(!netlifyToml, 'netlify.toml is missing.');
if (netlifyToml) {
  addIssue(!netlifyToml.includes('command = "npm run build:hosted"'), 'netlify.toml must build with npm run build:hosted.');
  addIssue(!netlifyToml.includes('publish = ".next"'), 'netlify.toml must publish .next for the Next.js runtime.');
  addIssue(!netlifyToml.includes('Content-Security-Policy'), 'netlify.toml must define hosted Content-Security-Policy headers.');
  addIssue(!netlifyToml.includes('for = "/sw.js"'), 'netlify.toml must keep /sw.js cache-controlled for PWA updates.');
  addIssue(!netlifyToml.includes('Content-Type = "application/manifest+json"'), 'netlify.toml must serve manifest.webmanifest with the manifest content type.');
}

addIssue(!packageJson.includes('"build:hosted"'), 'package.json must define build:hosted for Netlify builds.');
addIssue(!packageJson.includes('"preview:gate"'), 'package.json must define preview:gate for deployed preview promotion.');
addIssue(!packageJson.includes('"validate:hosted"'), 'package.json must define validate:hosted for hosted env checks.');

addIssue(!gitignore.includes('.netlify'), '.gitignore must ignore .netlify local site-link state.');
addIssue(!hasLinkedState && !hasSiteId, 'Netlify site is not linked. Run netlify login and netlify link, or set NETLIFY_SITE_ID/SITE_ID for CI.', true);
addIssue(Boolean(linkedStateParseError), `Netlify link state is not valid JSON: ${linkedStateParseError?.message || linkedStateParseError}`, true);
addIssue(hasLinkedState && !linkedStateParseError && (!linkedStateSiteId || hasTemplatePlaceholder(linkedStateSiteId)) && !hasSiteId, 'Netlify link state exists but does not include a real siteId. Rerun netlify link or set NETLIFY_SITE_ID/SITE_ID for CI.', true);
if (hasLinkedState && linkedStateSiteId && !linkedStateSiteName && !linkedStateAdminUrl) {
  warnings.push('Netlify link state has a siteId but no siteName/adminUrl. Confirm the linked site in Netlify before setting production env values.');
}

if (strict) {
  addIssue(!validHttpsUrl(process.env.SMOKE_BASE_URL), 'SMOKE_BASE_URL must be a deployed https preview URL for strict Netlify preflight.');
  addIssue(process.env.SMOKE_BASE_URL?.includes('localhost') || process.env.SMOKE_BASE_URL?.includes('127.0.0.1'), 'SMOKE_BASE_URL must not point at localhost for strict Netlify preflight.');
  addIssue(!confirmedSiteSlug || hasTemplatePlaceholder(confirmedSiteSlug), 'NETLIFY_SITE_SLUG, NETLIFY_SITE_DASHBOARD_URL, or linked Netlify siteName/adminUrl is required to prove the preview URL belongs to ClaimBot.');
  addIssue(Boolean(confirmedSiteSlug) && validHttpsUrl(process.env.SMOKE_BASE_URL) && !previewUrlMatchesSiteSlug(process.env.SMOKE_BASE_URL, confirmedSiteSlug), `SMOKE_BASE_URL does not match confirmed Netlify site slug "${confirmedSiteSlug}".`);
  addIssue(!hasValue('CLAIMBOT_SESSION_SECRET'), 'CLAIMBOT_SESSION_SECRET is required to sign deployed preview smoke-test sessions.');
  addIssue(
    !hasValue('CLAIMBOT_BILLING_SYNC_SECRET') && !hasValue('CLAIMBOT_STRIPE_WEBHOOK_SECRET'),
    'CLAIMBOT_BILLING_SYNC_SECRET or CLAIMBOT_STRIPE_WEBHOOK_SECRET is required for deployed billing callback smokes.',
  );
}

if (warnings.length > 0) {
  for (const warning of warnings) console.warn(`[validate-netlify-preflight] warning: ${warning}`);
}

if (ignoredOperatorEnvLoaded > 0) {
  console.warn(`[validate-netlify-preflight] loaded ${ignoredOperatorEnvLoaded} non-placeholder values from ignored local env files; no values printed`);
}

if (failures.length > 0) {
  console.error('[validate-netlify-preflight] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('Next steps: confirm or create a dedicated ClaimBot Netlify site, run netlify login and netlify link, set hosted env values, deploy a preview, then rerun npm run preview:gate.');
  console.error('Do not link this repo to an unrelated Netlify project. For CI, set NETLIFY_SITE_ID or SITE_ID only after confirming the site belongs to ClaimBot.');
  process.exit(1);
}

console.log('[validate-netlify-preflight] ok');
