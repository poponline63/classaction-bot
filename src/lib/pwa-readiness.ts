import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type PwaReadinessStatus = 'pass' | 'warn' | 'fail';

export type PwaReadinessItem = {
  key: string;
  label: string;
  status: PwaReadinessStatus;
  detail: string;
  action?: string;
  requiredForClientPreview: boolean;
};

function readIfExists(root: string, relativePath: string) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) return null;
  return readFileSync(absolutePath, 'utf8');
}

function item(input: Omit<PwaReadinessItem, 'requiredForClientPreview'> & { requiredForClientPreview?: boolean }) {
  return {
    requiredForClientPreview: input.requiredForClientPreview ?? true,
    ...input,
  };
}

export function evaluatePwaReadiness(root = process.cwd()) {
  const manifestText = readIfExists(root, 'public/manifest.webmanifest');
  const offlineHtml = readIfExists(root, 'public/offline.html');
  const serviceWorker = readIfExists(root, 'public/sw.js');
  const installButton = readIfExists(root, 'src/app/InstallAppButton.tsx');
  const connectionStatus = readIfExists(root, 'src/app/PwaConnectionStatus.tsx');
  const netlifyToml = readIfExists(root, 'netlify.toml');

  let manifest: Record<string, unknown> | null = null;
  if (manifestText) {
    try {
      manifest = JSON.parse(manifestText) as Record<string, unknown>;
    } catch {
      manifest = null;
    }
  }

  const shortcuts = Array.isArray(manifest?.shortcuts) ? manifest.shortcuts : [];
  const screenshots = Array.isArray(manifest?.screenshots) ? manifest.screenshots : [];
  const shortcutUrls = shortcuts
    .filter((shortcut): shortcut is { url?: unknown } => Boolean(shortcut && typeof shortcut === 'object'))
    .map((shortcut) => shortcut.url);
  const screenshotSources = screenshots
    .filter((screenshot): screenshot is { src?: unknown; form_factor?: unknown; label?: unknown } => Boolean(screenshot && typeof screenshot === 'object'))
    .map((screenshot) => ({
      src: screenshot.src,
      formFactor: screenshot.form_factor,
      label: screenshot.label,
    }));
  const hasWorkflowShortcuts = ['/goal', '/review', '/claims', '/packets', '/launch']
    .every((url) => shortcutUrls.includes(url));
  const hasInstallPreviews = [
    { src: '/pwa-preview-dashboard.svg', formFactor: 'wide' },
    { src: '/pwa-preview-launch.svg', formFactor: 'narrow' },
  ].every((expected) => screenshotSources.some((screenshot) => (
    screenshot.src === expected.src
    && screenshot.formFactor === expected.formFactor
    && typeof screenshot.label === 'string'
    && screenshot.label.includes('ClaimBot')
    && existsSync(path.join(root, 'public', String(expected.src).replace(/^\//, '')))
  )));

  const items = [
    item({
      key: 'pwa-manifest',
      label: 'Install manifest',
      status: manifest
        && manifest.id === '/goal'
        && manifest.start_url === '/goal'
        && manifest.display === 'standalone'
        && manifest.theme_color === '#161618'
        && String(manifest.description ?? '').includes('shadow-mode safety checks')
        ? 'pass'
        : 'fail',
      detail: manifest
        ? 'Manifest keeps the installed app anchored to /goal with Kimi dark chrome and shadow-mode safety copy.'
        : 'public/manifest.webmanifest is missing or invalid.',
      action: 'Run npm run validate:pwa, then restore public/manifest.webmanifest with /goal start URL, standalone display, Kimi colors, and shadow-mode safety copy.',
    }),
    item({
      key: 'pwa-shortcuts',
      label: 'Installed workflow shortcuts',
      status: hasWorkflowShortcuts ? 'pass' : 'fail',
      detail: hasWorkflowShortcuts
        ? 'Installed app shortcuts cover goal setup, review, claim queue, packet center, and launch readiness.'
        : 'Manifest shortcuts must expose the primary Kimi/ClaimBot workflow routes.',
      action: 'Run npm run validate:pwa and restore manifest shortcuts for /goal, /review, /claims, /packets, and /launch.',
    }),
    item({
      key: 'pwa-install-previews',
      label: 'Install preview screenshots',
      status: hasInstallPreviews ? 'pass' : 'fail',
      detail: hasInstallPreviews
        ? 'The install manifest includes wide and narrow Kimi-style ClaimBot preview assets for dashboard and launch readiness surfaces.'
        : 'Manifest screenshots must include wide and narrow ClaimBot preview assets for richer installed-app prompts.',
      action: 'Run npm run validate:pwa and restore /pwa-preview-dashboard.svg plus /pwa-preview-launch.svg in the manifest screenshots array.',
    }),
    item({
      key: 'offline-shell',
      label: 'Offline safety shell',
      status: offlineHtml
        && offlineHtml.includes('Secure Connection Required')
        && offlineHtml.includes('No claim records offline')
        && offlineHtml.includes('No offline filing')
        && offlineHtml.includes('Claim data is not cached for offline use')
        ? 'pass'
        : 'fail',
      detail: offlineHtml
        ? 'Offline mode is a hosted-session safety hold and does not expose claim data, filing controls, or legal decisions.'
        : 'public/offline.html is missing.',
      action: 'Run npm run validate:pwa and restore public/offline.html as a read-only security hold with no offline claim records or filing.',
    }),
    item({
      key: 'service-worker-boundary',
      label: 'Service worker cache boundary',
      status: serviceWorker
        && serviceWorker.includes("request.method !== 'GET'")
        && serviceWorker.includes("url.pathname.startsWith('/api/')")
        && serviceWorker.includes("url.pathname.startsWith('/claims/')")
        && serviceWorker.includes('caches.match(OFFLINE_URL)')
        ? 'pass'
        : 'fail',
      detail: serviceWorker
        ? 'The service worker caches only the static safety shell and avoids API or claim-detail data.'
        : 'public/sw.js is missing.',
      action: 'Run npm run validate:pwa and restore public/sw.js so it skips non-GET, API, and claim-detail requests while falling back to /offline.html.',
    }),
    item({
      key: 'install-status-copy',
      label: 'Install and connection chrome',
      status: installButton
        && installButton.includes('beforeinstallprompt')
        && installButton.includes('Offline shell stores no claim data')
        && connectionStatus?.includes('PWA hosted connection status')
        && connectionStatus.includes('No claim data cached')
        ? 'pass'
        : 'fail',
      detail: installButton && connectionStatus
        ? 'Kimi topbar exposes install state plus hosted online/offline safety boundaries.'
        : 'Install or connection status component is missing.',
      action: 'Run npm run validate:pwa and restore InstallAppButton plus PwaConnectionStatus in the Kimi topbar.',
    }),
    item({
      key: 'pwa-hosted-headers',
      label: 'Hosted PWA headers',
      status: netlifyToml
        && netlifyToml.includes('for = "/sw.js"')
        && netlifyToml.includes('Cache-Control = "no-cache"')
        && netlifyToml.includes('for = "/manifest.webmanifest"')
        && netlifyToml.includes('Content-Type = "application/manifest+json"')
        ? 'pass'
        : 'fail',
      detail: netlifyToml
        ? 'Netlify headers keep the service worker updateable and serve the manifest with the correct content type.'
        : 'netlify.toml is missing hosted PWA headers.',
      action: 'Run npm run validate:pwa and restore Netlify headers for /sw.js and /manifest.webmanifest.',
    }),
  ] satisfies PwaReadinessItem[];

  const failures = items.filter((entry) => entry.status === 'fail');
  const warnings = items.filter((entry) => entry.status === 'warn');

  return {
    ok: failures.length === 0,
    requiredForClientPreview: true,
    failureCount: failures.length,
    warningCount: warnings.length,
    items,
    note: 'PWA readiness covers install metadata, offline safety shell, service-worker cache boundaries, topbar install/status copy, and hosted headers. It does not cache claim data for offline use.',
  };
}
