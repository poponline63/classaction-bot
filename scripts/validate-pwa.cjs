const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const failures = [];
const warnings = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function requireText(file, text, label = text) {
  const content = read(file);
  if (!content.includes(text)) fail(`${file} must include ${label}.`);
}

function validateManifest() {
  const manifestFile = 'public/manifest.webmanifest';
  if (!exists(manifestFile)) {
    fail('public/manifest.webmanifest is missing.');
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(read(manifestFile));
  } catch (error) {
    fail(`public/manifest.webmanifest is not valid JSON: ${error.message}`);
    return;
  }

  for (const key of ['name', 'short_name', 'description', 'start_url', 'scope', 'display', 'background_color', 'theme_color']) {
    if (!manifest[key]) fail(`manifest.${key} is required.`);
  }

  if (manifest.id !== '/goal') {
    fail('manifest.id must remain /goal so installed app identity is stable for the ClaimBot command center.');
  }

  if (manifest.start_url !== '/goal') {
    warn('manifest.start_url should remain /goal so installed clients open on the product objective.');
  }

  if (!Array.isArray(manifest.display_override) || !manifest.display_override.includes('standalone')) {
    fail('manifest.display_override must preserve standalone as a fallback display mode.');
  }

  if (!String(manifest.description || '').includes('shadow-mode safety checks')) {
    fail('manifest.description must communicate the shadow-mode safety boundary.');
  }

  if (!['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display)) {
    fail('manifest.display must be standalone, fullscreen, or minimal-ui for installability.');
  }

  if (!/^#[0-9a-f]{6}$/i.test(manifest.background_color || '')) {
    fail('manifest.background_color must be a 6-digit hex color.');
  }

  if (!/^#[0-9a-f]{6}$/i.test(manifest.theme_color || '')) {
    fail('manifest.theme_color must be a 6-digit hex color.');
  }

  if (manifest.background_color !== '#0e0e10') {
    fail('manifest.background_color must match the dark app background (#0e0e10).');
  }

  if (manifest.theme_color !== '#161618') {
    fail('manifest.theme_color must match the Kimi hosted app chrome (#ffffff).');
  }

  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    fail('manifest.icons must include at least one icon.');
    return;
  }

  for (const icon of manifest.icons) {
    if (!icon.src || !icon.src.startsWith('/')) fail('manifest icon src values must be absolute app paths.');
    if (!icon.sizes) fail(`manifest icon ${icon.src || '(missing src)'} must declare sizes.`);
    if (!icon.type) fail(`manifest icon ${icon.src || '(missing src)'} must declare type.`);
    if (!String(icon.purpose || '').includes('maskable')) {
      warn(`manifest icon ${icon.src || '(missing src)'} should include maskable purpose.`);
    }

    if (icon.src && !exists(path.join('public', icon.src.replace(/^\//, '')))) {
      fail(`manifest icon file is missing: public${icon.src}`);
    }
  }

  const requiredShortcuts = new Map([
    ['/goal', 'Plan'],
    ['/review', 'Review'],
    ['/claims', 'Claims'],
    ['/packets', 'Packets'],
    ['/launch', 'Launch'],
  ]);
  if (!Array.isArray(manifest.shortcuts) || manifest.shortcuts.length < requiredShortcuts.size) {
    fail('manifest.shortcuts must expose Kimi workflow shortcuts for the installed app.');
    return;
  }

  const shortcutsByUrl = new Map(manifest.shortcuts.map((shortcut) => [shortcut.url, shortcut]));
  for (const [url, label] of requiredShortcuts.entries()) {
    const shortcut = shortcutsByUrl.get(url);
    if (!shortcut) {
      fail(`manifest.shortcuts must include ${label} at ${url}.`);
      continue;
    }
    if (shortcut.name !== label) fail(`manifest shortcut ${url} must be named ${label}.`);
    if (!shortcut.short_name) fail(`manifest shortcut ${url} must include short_name.`);
    if (!String(shortcut.description || '').trim()) fail(`manifest shortcut ${url} must include a description.`);
    if (!Array.isArray(shortcut.icons) || shortcut.icons.length === 0) fail(`manifest shortcut ${url} must include an icon.`);
  }

  const requiredScreenshots = new Map([
    ['/pwa-preview-dashboard.svg', 'wide'],
    ['/pwa-preview-launch.svg', 'narrow'],
  ]);
  if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length < requiredScreenshots.size) {
    fail('manifest.screenshots must expose wide and narrow Kimi install preview assets.');
    return;
  }

  const screenshotsBySrc = new Map(manifest.screenshots.map((screenshot) => [screenshot.src, screenshot]));
  for (const [src, formFactor] of requiredScreenshots.entries()) {
    const screenshot = screenshotsBySrc.get(src);
    if (!screenshot) {
      fail(`manifest.screenshots must include ${src}.`);
      continue;
    }
    if (screenshot.form_factor !== formFactor) fail(`manifest screenshot ${src} must use form_factor ${formFactor}.`);
    if (screenshot.type !== 'image/svg+xml') fail(`manifest screenshot ${src} must declare image/svg+xml.`);
    if (!String(screenshot.sizes || '').includes('x')) fail(`manifest screenshot ${src} must declare pixel sizes.`);
    if (!String(screenshot.label || '').includes('ClaimBot')) fail(`manifest screenshot ${src} must include a ClaimBot label.`);
    if (!exists(path.join('public', src.replace(/^\//, '')))) fail(`manifest screenshot file is missing: public${src}`);
  }
}

function validateOfflinePage() {
  const offlineFile = 'public/offline.html';
  if (!exists(offlineFile)) {
    fail('public/offline.html is missing.');
    return;
  }

  requireText(offlineFile, '<title>Security Hold - ClaimBot</title>', 'security-hold browser title');
  requireText(offlineFile, '<h1>Secure Connection Required</h1>', 'secure connection heading');
  requireText(offlineFile, 'Installed app safety mode', 'installed-app safety label');
  requireText(offlineFile, 'Installed safety shell', 'Kimi-style offline shell label');
  requireText(offlineFile, 'Installed App Command Center', 'offline command-center label');
  requireText(offlineFile, 'Read-only offline shell', 'read-only offline shell status');
  requireText(offlineFile, 'Reconnect before reviewing any claim workspace data', 'offline command-center heading');
  requireText(offlineFile, 'Zero Local Data Mode', 'zero-local-data status badge');
  requireText(offlineFile, 'Privacy protection is active', 'offline privacy protection status');
  requireText(offlineFile, 'This device stores zero claim data', 'zero claim data guarantee');
  requireText(offlineFile, 'This is a security feature, not a limitation', 'security feature framing');
  requireText(offlineFile, 'Client-confidentiality guard enabled', 'client confidentiality guard');
  requireText(offlineFile, 'Hosted app required', 'hosted-app requirement');
  requireText(offlineFile, 'Offline safety checklist', 'offline safety checklist');
  requireText(offlineFile, 'Claim data is not cached for offline use', 'non-caching safety copy');
  requireText(offlineFile, 'No claim records offline', 'offline claim-record boundary');
  requireText(offlineFile, 'No offline filing', 'offline filing boundary');
  requireText(offlineFile, 'No legal decisions offline', 'offline legal-decision boundary');
  requireText(offlineFile, 'Preflight, form preparation, and live filing controls require the hosted app session', 'offline command filing boundary');
  requireText(offlineFile, 'Resume audit-backed work', 'offline rail audit handoff');
  requireText(offlineFile, 'Retry Secure Connection', 'offline reconnect action');
  requireText(offlineFile, 'Open launch checklist', 'offline launch checklist action');
  requireText(offlineFile, '<meta name="theme-color"', 'theme-color meta tag');
}

function validateServiceWorker() {
  const swFile = 'public/sw.js';
  if (!exists(swFile)) {
    fail('public/sw.js is missing.');
    return;
  }

  const sw = read(swFile);
  if (!/claimbot-shell-v\d+/.test(sw)) {
    fail('service worker CACHE_NAME must include a versioned claimbot-shell-vN cache name.');
  }

  for (const asset of ['/offline.html', '/manifest.webmanifest', '/icon.svg']) {
    if (!sw.includes(`'${asset}'`) && !sw.includes(`"${asset}"`)) {
      fail(`service worker STATIC_ASSETS must include ${asset}.`);
    }
  }

  if (!sw.includes("request.method !== 'GET'")) {
    fail('service worker must ignore non-GET requests.');
  }

  if (!sw.includes("url.pathname.startsWith('/api/')")) {
    fail('service worker must not cache /api/* responses.');
  }

  if (!sw.includes("url.pathname.startsWith('/claims/')")) {
    fail('service worker must not cache /claims/* responses.');
  }

  if (!sw.includes('request.mode === \'navigate\'') && !sw.includes('request.mode === "navigate"')) {
    fail('service worker must handle navigation fallback to the offline page.');
  }

  if (!sw.includes('caches.match(OFFLINE_URL)')) {
    fail('service worker navigation fallback must use OFFLINE_URL.');
  }
}

function validateRegistration() {
  const file = 'src/app/ServiceWorkerRegister.tsx';
  if (!exists(file)) {
    fail('src/app/ServiceWorkerRegister.tsx is missing.');
    return;
  }

  requireText(file, "navigator.serviceWorker.register('/sw.js'", 'service worker registration');
  requireText(file, "window.location.protocol !== 'https:'", 'https registration guard');
  requireText('src/app/layout.tsx', '<ServiceWorkerRegister />', 'service worker registration in root layout');
  requireText('src/app/layout.tsx', '<BootstrapAuditStamp filingMode={requestedFilingMode} />', 'bootstrap audit stamp in root layout');

  const installFile = 'src/app/InstallAppButton.tsx';
  if (!exists(installFile)) {
    fail('src/app/InstallAppButton.tsx is missing.');
    return;
  }

  requireText(installFile, "beforeinstallprompt", 'install prompt capture');
  requireText(installFile, "appinstalled", 'installed-state listener');
  requireText(installFile, "display-mode: standalone", 'standalone display-mode guard');
  requireText(installFile, 'App ready', 'visible app-ready PWA status when install prompt is unavailable');
  requireText(installFile, 'Offline shell stores no claim data', 'offline shell data-boundary copy');
  requireText(installFile, 'aria-label="Install ClaimBot as an app"', 'accessible install button label');
  requireText('src/app/PwaConnectionStatus.tsx', 'PWA hosted connection status', 'hosted connection status affordance');
  requireText('src/app/PwaConnectionStatus.tsx', 'Offline safety hold', 'offline safety-hold status');
  requireText('src/app/PwaConnectionStatus.tsx', 'No claim data cached', 'no local claim-data cache copy');
  requireText('src/app/layout.tsx', '<KimiAppShell featureFlags={featureFlags} filingMode={filingMode}>', 'Kimi app shell in root layout');
  requireText('src/app/KimiAppShell.tsx', '<PwaConnectionStatus />', 'PWA hosted connection status in Kimi app chrome');
  requireText('src/app/KimiAppShell.tsx', '<InstallAppButton />', 'install control in Kimi app chrome');
}

function validateNetlifyHeaders() {
  const file = 'netlify.toml';
  if (!exists(file)) {
    fail('netlify.toml is missing.');
    return;
  }

  const toml = read(file);
  if (!toml.includes('for = "/sw.js"') || !toml.includes('Cache-Control = "no-cache"')) {
    fail('netlify.toml must serve /sw.js with Cache-Control = "no-cache".');
  }

  if (!toml.includes('for = "/manifest.webmanifest"') || !toml.includes('Content-Type = "application/manifest+json"')) {
    fail('netlify.toml must serve /manifest.webmanifest as application/manifest+json.');
  }

  if (!toml.includes('command = "npm run build:hosted"') || !toml.includes('publish = ".next"')) {
    fail('netlify.toml must run npm run build:hosted and publish .next for hosted Next.js deploys.');
  }

  for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy', 'Content-Security-Policy']) {
    if (!toml.includes(header)) {
      fail(`netlify.toml must include ${header} in hosted security headers.`);
    }
  }
}

validateManifest();
validateOfflinePage();
validateServiceWorker();
validateRegistration();
validateNetlifyHeaders();

if (failures.length > 0) {
  console.error('[validate-pwa] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  if (warnings.length > 0) {
    console.error('warnings:');
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exit(1);
}

console.log('[validate-pwa] ok');
for (const warning of warnings) console.warn(`[validate-pwa] warning: ${warning}`);
