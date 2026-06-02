const fs = require('node:fs');
const path = require('node:path');

const receiptPath = path.join(process.cwd(), 'data', 'preview-promotion-receipt.json');
const expectedFormat = 'claimbot.preview-promotion-receipt.v1';
const maxAgeHours = Number(process.env.CLAIMBOT_PREVIEW_RECEIPT_MAX_AGE_HOURS || 24);

function valueOf(key) {
  return process.env[key]?.trim() || '';
}

function hasTemplatePlaceholder(value) {
  const normalized = value?.trim().toLowerCase() || '';
  return Boolean(normalized) && (
    normalized.includes('your_')
    || normalized.includes('your-')
    || normalized.includes('paste_')
    || normalized.includes('paste-')
    || normalized.includes('yourdomain.com')
    || normalized === 'example'
    || normalized === 'placeholder'
  );
}

function isHttpsPreviewUrl(value) {
  if (!value || hasTemplatePlaceholder(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function smokeUrlMatchesSiteSlug(smokeBaseUrl, siteSlug) {
  if (!siteSlug || !isHttpsPreviewUrl(smokeBaseUrl)) return false;
  try {
    const hostname = new URL(smokeBaseUrl).hostname.toLowerCase();
    const normalizedSlug = siteSlug.toLowerCase();
    return hostname === `${normalizedSlug}.netlify.app` || hostname.endsWith(`--${normalizedSlug}.netlify.app`);
  } catch {
    return false;
  }
}

function fail(message) {
  console.error('[preview-promotion-receipt] failed');
  console.error(message);
  process.exit(1);
}

function loadReceipt() {
  if (!fs.existsSync(receiptPath)) {
    fail(`Missing ${path.relative(process.cwd(), receiptPath)}. Run npm run preview:gate against the deployed Netlify preview before production deploy.`);
  }
  try {
    return JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  } catch (error) {
    fail(`Receipt is not valid JSON: ${(error && error.message) || error}`);
  }
}

function assertCommand(receipt, command) {
  if (!Array.isArray(receipt.commands) || !receipt.commands.includes(command)) {
    fail(`Receipt does not prove ${command} ran inside npm run preview:gate.`);
  }
}

const receipt = loadReceipt();

if (receipt.format !== expectedFormat) {
  fail(`Receipt format must be ${expectedFormat}.`);
}
if (receipt.mode !== 'deployed-preview') {
  fail('Receipt must be from deployed-preview mode, not a local gate run.');
}
if (!isHttpsPreviewUrl(receipt.smokeBaseUrl)) {
  fail('Receipt must include a deployed HTTPS smokeBaseUrl.');
}
if (!receipt.netlifySiteSlug || hasTemplatePlaceholder(receipt.netlifySiteSlug)) {
  fail('Receipt must include the confirmed Netlify site slug.');
}
if (!smokeUrlMatchesSiteSlug(receipt.smokeBaseUrl, receipt.netlifySiteSlug)) {
  fail(`Receipt smokeBaseUrl must belong to Netlify site slug "${receipt.netlifySiteSlug}".`);
}
if (receipt.netlifySiteIdPresent !== true) {
  fail('Receipt must prove a confirmed Netlify site target was present when preview:gate ran.');
}

const createdAt = new Date(receipt.createdAt);
if (Number.isNaN(createdAt.getTime())) {
  fail('Receipt createdAt must be a valid ISO timestamp.');
}
const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
if (ageHours < -0.25) {
  fail('Receipt createdAt is in the future.');
}
if (Number.isFinite(maxAgeHours) && maxAgeHours > 0 && ageHours > maxAgeHours) {
  fail(`Receipt is ${ageHours.toFixed(1)} hours old; rerun npm run preview:gate within ${maxAgeHours} hours of production deploy.`);
}

for (const command of [
  'netlify:doctor:strict',
  'validate:netlify:strict',
  'validate:routes',
  'validate:hosted',
  'build:hosted',
  'smoke:web',
  'smoke:auth',
  'smoke:features',
]) {
  assertCommand(receipt, command);
}

if (valueOf('SMOKE_BASE_URL') && valueOf('SMOKE_BASE_URL') !== receipt.smokeBaseUrl) {
  fail('Current SMOKE_BASE_URL does not match the preview URL recorded in the promotion receipt.');
}
if (valueOf('NETLIFY_SITE_SLUG') && valueOf('NETLIFY_SITE_SLUG') !== receipt.netlifySiteSlug) {
  fail('Current NETLIFY_SITE_SLUG does not match the site slug recorded in the promotion receipt.');
}

console.log('[preview-promotion-receipt] ok');
console.log(`Preview URL: ${receipt.smokeBaseUrl}`);
console.log(`Netlify site slug: ${receipt.netlifySiteSlug}`);
console.log(`Created: ${receipt.createdAt}`);
console.log(`Source catalog digest: ${receipt.sourceCatalogDigest || 'not recorded'}`);
