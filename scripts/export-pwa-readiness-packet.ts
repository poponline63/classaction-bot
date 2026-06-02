import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { evaluatePwaReadiness } from '../src/lib/pwa-readiness';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'pwa-readiness-packet.json');
const markdownPath = path.join(outputDir, 'pwa-readiness-packet.md');

const pwaSourceFiles = [
  'public/manifest.webmanifest',
  'public/pwa-preview-dashboard.svg',
  'public/pwa-preview-launch.svg',
  'public/offline.html',
  'public/sw.js',
  'src/app/ServiceWorkerRegister.tsx',
  'src/app/InstallAppButton.tsx',
  'src/app/PwaConnectionStatus.tsx',
  'src/app/KimiAppShell.tsx',
  'src/app/layout.tsx',
  'netlify.toml',
  'scripts/validate-pwa.cjs',
];

const installedAppBoundary = {
  startUrl: '/goal',
  shell: 'Kimi dark-first app chrome',
  offlineMode: 'Read-only security hold',
  dataBoundary: 'No claim data, API responses, claim records, filing actions, or legal decisions are cached for offline use.',
  clientPreviewRequirement: 'The installed app must prove manifest, workflow shortcuts, wide and narrow install previews, offline safety copy, service-worker cache boundaries, install chrome, connection status, and hosted headers.',
};

function fileEvidence(relativePath: string) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    return {
      path: relativePath,
      exists: false,
      bytes: 0,
      modifiedAt: null,
    };
  }

  const stat = fs.statSync(absolutePath);
  return {
    path: relativePath,
    exists: true,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

function main() {
  const generatedAt = new Date().toISOString();
  const readiness = evaluatePwaReadiness();
  const packet = {
    format: 'claimbot.pwa-readiness-packet.v1',
    generatedAt,
    note: 'Non-secret PWA readiness packet. This packet intentionally omits user data, claim data, session values, API responses, billing secrets, database URLs, and deployment tokens.',
    installedAppBoundary,
    readiness,
    sourceEvidence: pwaSourceFiles.map(fileEvidence),
    commands: [
      'npm run validate:pwa',
      'npm run pwa:packet',
      'npm run launch:handoff',
      'npm run validate:netlify',
      '# After deployed preview exists:',
      'npm run validate:netlify:strict',
      'npm run preview:gate',
    ],
  };

  const markdown = [
    '# ClaimBot PWA Readiness Packet',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This is a non-secret installed-app readiness packet. It proves the client preview shell without writing user data, claim data, API responses, secrets, or deployment tokens.',
    '',
    '## Installed App Boundary',
    '',
    `Start URL: ${installedAppBoundary.startUrl}`,
    `Shell: ${installedAppBoundary.shell}`,
    `Offline mode: ${installedAppBoundary.offlineMode}`,
    `Data boundary: ${installedAppBoundary.dataBoundary}`,
    `Client preview requirement: ${installedAppBoundary.clientPreviewRequirement}`,
    '',
    '## Current Gate',
    '',
    `PWA ready: ${readiness.ok ? 'yes' : 'no'}`,
    `Required for client preview: ${readiness.requiredForClientPreview ? 'yes' : 'no'}`,
    `Failures: ${readiness.failureCount}`,
    `Warnings: ${readiness.warningCount}`,
    `Boundary note: ${readiness.note}`,
    '',
    '## Readiness Items',
    '',
    ...readiness.items.map((item) => [
      `- ${item.label}: ${item.status}`,
      `  Detail: ${item.detail}`,
      ...(item.action ? [`  Action: ${item.action}`] : []),
    ].join('\n')),
    '',
    '## Source Evidence',
    '',
    ...packet.sourceEvidence.map((item) => `- ${item.path}: ${item.exists ? `present, ${item.bytes} bytes` : 'missing'}`),
    '',
    '## Commands',
    '',
    ...packet.commands.map((command) => `- \`${command}\``),
    '',
  ].join('\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[pwa-readiness-packet] wrote non-secret PWA packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`PWA ready: ${readiness.ok ? 'yes' : 'no'}`);
  console.log(`Failures: ${readiness.failureCount}`);
  console.log('No user data, claim data, API responses, or secret values were printed.');
}

main();
