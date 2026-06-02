const fs = require('node:fs');
const path = require('node:path');
const {
  collectNextStaticHealth,
  formatNextStaticHealthFailure,
} = require('./lib/next-static-health.cjs');

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'local-dev-stability-packet.json');
const markdownPath = path.join(outputDir, 'local-dev-stability-packet.md');

function readIfExists(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) return '';
  return fs.readFileSync(absolutePath, 'utf8');
}

function packageScript(name) {
  try {
    const parsed = JSON.parse(readIfExists('package.json'));
    return parsed.scripts?.[name] || '';
  } catch {
    return '';
  }
}

function fileEvidence(relativePath, requiredSnippets = []) {
  const text = readIfExists(relativePath);
  const exists = text.length > 0;
  const missingSnippets = requiredSnippets.filter((snippet) => !text.includes(snippet));
  return {
    path: relativePath,
    exists,
    ok: exists && missingSnippets.length === 0,
    missingSnippets,
  };
}

async function optionalCurrentServerHealth() {
  const baseUrl = process.env.LOCAL_DEV_BASE_URL || 'http://localhost:3100';
  try {
    const health = await collectNextStaticHealth(baseUrl, { timeoutMs: 3_000, maxScripts: 6 });
    return {
      checked: true,
      ok: health.ok,
      baseUrl,
      htmlStatus: health.htmlStatus ?? null,
      checkedScripts: health.checkedScripts?.length ?? 0,
      issue: health.ok ? null : formatNextStaticHealthFailure(health),
    };
  } catch (error) {
    return {
      checked: true,
      ok: false,
      baseUrl,
      htmlStatus: null,
      checkedScripts: 0,
      issue: error.message,
    };
  }
}

function buildMarkdown(packet) {
  return [
    '# ClaimBot Local Dev Stability Packet',
    '',
    `Generated: ${packet.generatedAt}`,
    '',
    'This is a non-secret local tooling receipt. It proves the development server, smoke server, and static chunk doctor are configured to avoid stale Next.js browser sessions while keeping production builds separate.',
    '',
    '## Current Gate',
    '',
    `Local dev stability ready: ${packet.readiness.ready ? 'yes' : 'no'}`,
    `Config checks: ${packet.summary.readyChecks}/${packet.summary.totalChecks}`,
    `Optional current server health: ${packet.currentServer.ok ? 'healthy' : 'not healthy or not running'}`,
    `Boundary: ${packet.readiness.boundary}`,
    '',
    '## Configuration Evidence',
    '',
    ...packet.evidence.map((item) => [
      `- ${item.path}: ${item.ok ? 'ready' : 'blocked'}`,
      ...(item.missingSnippets.length > 0 ? [`  Missing: ${item.missingSnippets.join('; ')}`] : []),
    ].join('\n')),
    '',
    '## Current Localhost Check',
    '',
    `Base URL: ${packet.currentServer.baseUrl}`,
    `Health: ${packet.currentServer.ok ? 'healthy' : 'not healthy or not running'}`,
    `App shell status: ${packet.currentServer.htmlStatus ?? 'not reached'}`,
    `Next static chunks checked: ${packet.currentServer.checkedScripts}`,
    ...(packet.currentServer.issue ? [`Issue: ${packet.currentServer.issue}`] : []),
    '',
    '## Commands',
    '',
    '- `npm run dev`',
    '- `npm run local:dev:doctor`',
    '- `npm run smoke:hosted:local`',
    '- `npm run local:dev:packet`',
    '',
    'No secret values were printed.',
    '',
  ].join('\n');
}

async function main() {
  const generatedAt = new Date().toISOString();
  const npmDevScript = packageScript('dev');
  const doctorScript = packageScript('local:dev:doctor');
  const hostedSmokeScript = packageScript('smoke:hosted:local');
  const packetScript = packageScript('local:dev:packet');

  const evidence = [
    {
      path: 'package.json:scripts.dev',
      exists: Boolean(npmDevScript),
      ok: npmDevScript === 'node scripts/start-dev-server.cjs',
      missingSnippets: npmDevScript === 'node scripts/start-dev-server.cjs' ? [] : ['node scripts/start-dev-server.cjs'],
    },
    {
      path: 'package.json:scripts.local:dev:doctor',
      exists: Boolean(doctorScript),
      ok: doctorScript === 'node scripts/check-local-dev-server.cjs',
      missingSnippets: doctorScript === 'node scripts/check-local-dev-server.cjs' ? [] : ['node scripts/check-local-dev-server.cjs'],
    },
    {
      path: 'package.json:scripts.smoke:hosted:local',
      exists: Boolean(hostedSmokeScript),
      ok: hostedSmokeScript === 'node scripts/smoke-hosted-local.cjs',
      missingSnippets: hostedSmokeScript === 'node scripts/smoke-hosted-local.cjs' ? [] : ['node scripts/smoke-hosted-local.cjs'],
    },
    {
      path: 'package.json:scripts.local:dev:packet',
      exists: Boolean(packetScript),
      ok: packetScript === 'node scripts/export-local-dev-stability-packet.cjs',
      missingSnippets: packetScript === 'node scripts/export-local-dev-stability-packet.cjs' ? [] : ['node scripts/export-local-dev-stability-packet.cjs'],
    },
    fileEvidence('scripts/start-dev-server.cjs', ['NEXT_DIST_DIR', '.next-dev', '--port']),
    fileEvidence('scripts/check-local-dev-server.cjs', ['collectNextStaticHealth', '[local-dev-server] ok']),
    fileEvidence('scripts/lib/next-static-health.cjs', ['extractNextStaticScripts', '_next\\/static', 'missing Next.js static chunk']),
    fileEvidence('scripts/smoke-webapp.cjs', ['checkNextStaticChunkHealth', 'collectNextStaticHealth']),
    fileEvidence('scripts/smoke-hosted-local.cjs', ['NEXT_DIST_DIR', '.next-smoke-hosted-web']),
    fileEvidence('.gitignore', ['/.next-dev*/', '/.next-smoke*/']),
  ];

  const blocked = evidence.filter((item) => !item.ok);
  const currentServer = await optionalCurrentServerHealth();
  const packet = {
    format: 'claimbot.local-dev-stability-packet.v1',
    generatedAt,
    readiness: {
      ready: blocked.length === 0,
      readyCheck: 'Configuration readiness is based on source and package scripts. The current localhost check is informational because CI and launch packets may run without a dev server open.',
      boundary: 'This proves local development and smoke tooling are configured to avoid stale Next.js chunks. It does not prove Netlify deployment, hosted auth, billing, legal review, or production preview readiness.',
    },
    summary: {
      readyChecks: evidence.length - blocked.length,
      totalChecks: evidence.length,
      blockedChecks: blocked.length,
    },
    evidence,
    currentServer,
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, buildMarkdown(packet));

  console.log('[local-dev-stability-packet] wrote non-secret local dev stability packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Local dev stability ready: ${packet.readiness.ready ? 'yes' : 'no'}`);
  console.log(`Config checks: ${packet.summary.readyChecks}/${packet.summary.totalChecks}`);
  console.log(`Current localhost health: ${currentServer.ok ? 'healthy' : 'not healthy or not running'}`);
  console.log('No secret values were printed.');

  if (!packet.readiness.ready) process.exit(1);
}

main().catch((error) => {
  console.error('[local-dev-stability-packet] failed');
  console.error(error);
  process.exit(1);
});
