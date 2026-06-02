const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'local-verification-packet.json');
const markdownPath = path.join(outputDir, 'local-verification-packet.md');

const commandPlan = [
  {
    key: 'typecheck',
    label: 'TypeScript typecheck',
    command: 'npm run typecheck',
    required: true,
    timeoutMs: 180000,
  },
  {
    key: 'secret-hygiene',
    label: 'Secret hygiene',
    command: 'npm run validate:secrets',
    required: true,
    timeoutMs: 120000,
  },
  {
    key: 'next-route-export-hygiene',
    label: 'Next route export hygiene',
    command: 'npm run validate:routes',
    required: true,
    timeoutMs: 120000,
  },
  {
    key: 'ui-guardrails',
    label: 'UI guardrails',
    command: 'npm run validate:ui',
    required: true,
    timeoutMs: 120000,
  },
  {
    key: 'legal-readiness',
    label: 'Legal readiness',
    command: 'npm run validate:legal',
    required: true,
    timeoutMs: 120000,
  },
  {
    key: 'pwa-readiness',
    label: 'PWA readiness',
    command: 'npm run validate:pwa',
    required: true,
    timeoutMs: 120000,
  },
  {
    key: 'responsive-readiness-packet',
    label: 'Responsive readiness packet',
    command: 'npm run responsive:packet',
    required: true,
    timeoutMs: 300000,
  },
  {
    key: 'kimi-visual-readiness-packet',
    label: 'Kimi visual screenshot packet',
    command: 'npm run kimi:visual:packet',
    required: true,
    timeoutMs: 300000,
  },
  {
    key: 'audit-support-packet',
    label: 'Audit support packet export',
    command: 'npm run audit:support:packet',
    required: true,
    timeoutMs: 120000,
  },
  {
    key: 'local-dev-stability-packet',
    label: 'Local dev stability packet',
    command: 'npm run local:dev:packet',
    required: true,
    timeoutMs: 120000,
  },
  {
    key: 'netlify-preflight',
    label: 'Netlify local preflight',
    command: 'npm run validate:netlify',
    required: true,
    timeoutMs: 120000,
  },
  {
    key: 'focused-automation-tests',
    label: 'Focused automation and launch tests',
    command: 'npm run test -- tests/integration/file-all-route.test.ts tests/integration/queue-claim-entitlement.test.ts tests/integration/setup-complete-route.test.ts tests/integration/billing-checkout-route.test.ts tests/unit/billing-checkout.test.ts tests/unit/worker-smoke-receipt.test.ts tests/unit/hosted-env-push.test.ts tests/unit/claim-audit-export.test.ts tests/unit/queue-readiness.test.ts tests/unit/claim-safety-console.test.ts tests/unit/launch-handoff.test.ts tests/unit/launch-packet-stack.test.ts tests/unit/client-preview-checklist.test.ts',
    required: true,
    timeoutMs: 180000,
  },
  {
    key: 'worker-file-claim-receipt',
    label: 'Local worker file_claim receipt',
    command: 'npm run worker:file-claim:receipt',
    required: true,
    timeoutMs: 300000,
  },
  {
    key: 'production-build',
    label: 'Production build',
    command: 'npm run build',
    required: true,
    timeoutMs: 240000,
  },
  {
    key: 'local-hosted-smoke',
    label: 'Local hosted strict smoke suite',
    command: 'npm run smoke:hosted:local',
    required: true,
    timeoutMs: 240000,
  },
];

const sourceEvidenceFiles = [
  'package.json',
  'scripts/export-local-verification-packet.cjs',
  'scripts/validate-secret-hygiene.cjs',
  'scripts/validate-next-route-exports.cjs',
  'scripts/lib/next-route-export-hygiene.cjs',
  'scripts/validate-ui-guardrails.cjs',
  'scripts/validate-legal-readiness.cjs',
  'scripts/validate-pwa.cjs',
  'scripts/validate-netlify-preflight.cjs',
  'scripts/export-responsive-readiness-packet.cjs',
  'scripts/export-kimi-visual-readiness-packet.cjs',
  'scripts/export-audit-support-packet.ts',
  'scripts/export-local-dev-stability-packet.cjs',
  'scripts/refresh-launch-packets.cjs',
  'scripts/start-dev-server.cjs',
  'scripts/check-local-dev-server.cjs',
  'scripts/lib/next-static-health.cjs',
  'scripts/run-local-worker-file-claim-receipt.ts',
  'scripts/smoke-hosted-local.cjs',
  'scripts/smoke-webapp.cjs',
  'scripts/smoke-hosted-auth.cjs',
  'scripts/smoke-feature-flags.cjs',
  'src/app/KimiAppShell.tsx',
  'src/app/AppFooter.tsx',
  'src/app/AppNav.tsx',
  'src/app/MobileBottomNav.tsx',
  'src/app/page.tsx',
  'src/app/goal/page.tsx',
  'src/app/onboarding/page.tsx',
  'src/app/setup/page.tsx',
  'src/app/setup/SetupWizard.tsx',
  'src/app/review/page.tsx',
  'src/app/claims/page.tsx',
  'src/app/pricing/page.tsx',
  'src/app/trust/page.tsx',
  'src/app/status/page.tsx',
  'src/app/launch/page.tsx',
  'src/app/help/page.tsx',
  'src/app/contact/page.tsx',
  'src/app/globals.css',
  'worker/job-poller.ts',
  'worker/smoke-receipt.ts',
  'src/lib/hosted-remediation.ts',
  'src/lib/launch-packet-stack.ts',
  'src/lib/launch-packet-refresh-report.ts',
  'src/lib/local-verification-packet.ts',
  'src/lib/launch-handoff-report.ts',
  'src/lib/external-activation-workbook.ts',
  'src/lib/client-preview-checklist.ts',
];

function redact(value) {
  return String(value)
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED_API_KEY]')
    .replace(/whsec_[A-Za-z0-9_-]{16,}/g, '[REDACTED_WEBHOOK_SECRET]')
    .replace(/(DATABASE_URL=)([^ \r\n]+)/gi, '$1[REDACTED]')
    .replace(/(DATABASE_AUTH_TOKEN=)([^ \r\n]+)/gi, '$1[REDACTED]')
    .replace(/(CLAIMBOT_SESSION_SECRET=)([^ \r\n]+)/gi, '$1[REDACTED]')
    .replace(/(CLAIMBOT_BILLING_SYNC_SECRET=)([^ \r\n]+)/gi, '$1[REDACTED]')
    .replace(/(CLAIMBOT_STRIPE_WEBHOOK_SECRET=)([^ \r\n]+)/gi, '$1[REDACTED]')
    .replace(/https:\/\/[^\s"']*(checkout|stripe|paypal|processor|billing)[^\s"']*/gi, '[REDACTED_CHECKOUT_URL]');
}

function tailLines(value, maxLines = 10) {
  return redact(value || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-maxLines);
}

function runCommand(item) {
  const startedAt = new Date();
  const result = spawnSync(item.command, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: true,
    timeout: item.timeoutMs,
    windowsHide: true,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  const completedAt = new Date();
  const timedOut = result.error && result.error.code === 'ETIMEDOUT';

  return {
    key: item.key,
    label: item.label,
    command: item.command,
    required: item.required,
    ok: result.status === 0 && !timedOut,
    status: typeof result.status === 'number' ? result.status : null,
    signal: result.signal ?? null,
    timedOut: Boolean(timedOut),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    stdoutTail: tailLines(result.stdout),
    stderrTail: tailLines(result.stderr),
    error: result.error ? redact(result.error.message) : null,
  };
}

function fileEvidence(relativePath) {
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

function hasCustomerRenderedCopyGuard() {
  const smokePath = path.join(process.cwd(), 'scripts/smoke-webapp.cjs');
  if (!fs.existsSync(smokePath)) return false;
  const smokeSource = fs.readFileSync(smokePath, 'utf8');
  return [
    'customerCopyGuardedPaths',
    'forbiddenCustomerCopyText',
    'forbiddenCustomerHtmlText',
    'page.content()',
    'customer page serializes internal copy',
    "'CLAIMBOT_'",
    "'DATABASE_URL'",
    "'/api/audit'",
    "'source setup issue'",
    "'complete launch source setup'",
    "'readiness files'",
    "'raw files'",
    "'raw records'",
    "'export files'",
    "'internal records'",
    "'internal readiness details'",
    "'internal detail'",
    "'internally clear'",
    "'readiness records'",
    "'readiness record'",
    "'readiness evidence'",
    "'full launch records'",
    "'technical readiness details'",
    "'detailed readiness records'",
    "'advanced workspace details'",
    "'advanced pricing readiness'",
    "'advanced readiness view'",
    "'owner readiness summary'",
    "'owner view'",
    "'launch reviewer'",
    "'backend details'",
    "'technical readiness status'",
    "'backend'",
    "'server-side'",
    "'CLAIM_QUEUE_BLOCKED'",
    "'claim_queue_blocked'",
    "'server checks'",
    "'server check'",
    "'Backend release evidence'",
    "'backend release evidence'",
    "'Backend tracking check'",
    "'backend tracking check'",
    "'Blocked-at-server receipt'",
    "'blocked-at-server receipt'",
    "'An owner can'",
    "'an owner can'",
    "'Deployment switches'",
    "'deployment switches'",
    "'handled by an administrator'",
    "'setup files'",
    "'setup artifact'",
    "'setup evidence'",
    "'Codex can'",
    "'execution boundary'",
    "'operator-owned'",
    "'operator proof'",
    "'operator-only commands'",
    "'launch-console'",
    "'proof artifact paths'",
  ].every((needle) => smokeSource.includes(needle));
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return 'unknown';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function buildMarkdown(packet) {
  return [
    '# ClaimBot Local Verification Packet',
    '',
    `Generated: ${packet.generatedAt}`,
    '',
    'This is a non-secret local verification receipt. It records command names, exit status, duration, and redacted output tails only. It does not print API keys, database URLs, auth tokens, checkout URLs, webhook secrets, session secrets, raw environment values, or user data.',
    '',
    '## Current Gate',
    '',
    `Local verification ready: ${packet.readiness.ready ? 'yes' : 'no'}`,
    `Commands passed: ${packet.summary.passed}/${packet.summary.total}`,
    `Required failures: ${packet.summary.requiredFailures}`,
    `Total duration: ${formatDuration(packet.summary.totalDurationMs)}`,
    `Boundary: ${packet.readiness.note}`,
    '',
    '## Command Results',
    '',
    ...packet.commandResults.flatMap((result) => [
      `- ${result.label}: ${result.ok ? 'pass' : 'fail'} (${formatDuration(result.durationMs)})`,
      `  Command: \`${result.command}\``,
      ...(result.timedOut ? ['  Timed out: yes'] : []),
      ...(result.stderrTail.length > 0 ? [`  Last stderr: ${result.stderrTail.slice(-2).join(' | ')}`] : []),
      ...(result.stdoutTail.length > 0 ? [`  Last stdout: ${result.stdoutTail.slice(-2).join(' | ')}`] : []),
    ]),
    '',
    '## Source Evidence',
    '',
    ...packet.sourceEvidence.map((item) => `- ${item.path}: ${item.exists ? `present, ${item.bytes} bytes` : 'missing'}`),
    '',
    '## Customer Page Guard',
    '',
    `Rendered customer-copy guard: ${packet.guardEvidence.customerRenderedCopyGuard.ready ? 'ready' : 'blocked'}`,
    `Source: ${packet.guardEvidence.customerRenderedCopyGuard.source}`,
    `Enforced by: ${packet.guardEvidence.customerRenderedCopyGuard.enforcedBy}`,
    `Command coverage: ${packet.guardEvidence.customerRenderedCopyGuard.command}`,
    `Forbidden serialized text: ${packet.guardEvidence.customerRenderedCopyGuard.forbiddenSerializedText.join(', ')}`,
    `Boundary: ${packet.guardEvidence.customerRenderedCopyGuard.note}`,
    '',
    '## Follow-Up Commands',
    '',
    ...packet.followUpCommands.map((command) => `- \`${command}\``),
    '',
  ].join('\n');
}

function main() {
  const generatedAt = new Date().toISOString();
  const commandResults = [];

  for (const item of commandPlan) {
    console.log(`[local-verification] running ${item.command}`);
    const result = runCommand(item);
    commandResults.push(result);
    console.log(`[local-verification] ${result.ok ? 'pass' : 'fail'} ${item.key} (${formatDuration(result.durationMs)})`);
  }

  const requiredFailures = commandResults.filter((result) => result.required && !result.ok);
  const customerRenderedCopyGuardReady = hasCustomerRenderedCopyGuard();
  const guardFailureCount = customerRenderedCopyGuardReady ? 0 : 1;
  const ready = requiredFailures.length === 0 && guardFailureCount === 0;
  const packet = {
    format: 'claimbot.local-verification-packet.v1',
    generatedAt,
    note: 'Non-secret local verification packet. It records local command outcomes without API keys, database URLs, auth tokens, checkout URLs, webhook secrets, session secrets, raw environment values, private profile facts, or user data.',
    readiness: {
      ready,
      requiredForClientPreview: true,
      failureCount: requiredFailures.length + guardFailureCount,
      note: 'This packet proves local workspace checks ran on this machine and that the rendered customer-copy guard is wired into the web smoke suite. It does not prove Netlify account setup, hosted database setup, billing provider setup, legal/compliance approval, deployed preview promotion, or production readiness.',
    },
    summary: {
      total: commandResults.length,
      passed: commandResults.filter((result) => result.ok).length,
      failed: commandResults.filter((result) => !result.ok).length,
      requiredFailures: requiredFailures.length + guardFailureCount,
      guardFailures: guardFailureCount,
      totalDurationMs: commandResults.reduce((sum, result) => sum + result.durationMs, 0),
    },
    commandResults,
    guardEvidence: {
      customerRenderedCopyGuard: {
        ready: customerRenderedCopyGuardReady,
        source: 'scripts/smoke-webapp.cjs',
        command: 'npm run smoke:hosted:local',
        enforcedBy: 'forbiddenCustomerHtmlText + page.content()',
        forbiddenSerializedText: [
          'CLAIMBOT_',
          'DATABASE_URL',
          'SCRAPER_USER_AGENT',
          'npm run',
          '/api/audit',
          'proof artifact',
          'proofArtifacts',
          'readiness files',
          'raw files',
          'raw records',
          'export files',
          'internal records',
          'internal readiness details',
          'internal detail',
          'internally clear',
          'readiness records',
          'readiness record',
          'readiness evidence',
          'full launch records',
          'technical readiness details',
          'detailed readiness records',
          'advanced workspace details',
          'advanced pricing readiness',
          'advanced readiness view',
          'owner readiness summary',
          'owner view',
          'launch reviewer',
          'backend details',
          'technical readiness status',
          'backend',
          'server-side',
          'CLAIM_QUEUE_BLOCKED',
          'claim_queue_blocked',
          'server checks',
          'server check',
          'Backend release evidence',
          'backend release evidence',
          'Backend tracking check',
          'backend tracking check',
          'Blocked-at-server receipt',
          'blocked-at-server receipt',
          'An owner can',
          'an owner can',
          'Deployment switches',
          'deployment switches',
          'handled by an administrator',
          'setup files',
          'raw setup files',
          'setup artifact',
          'setup artifacts',
          'setup evidence',
          'Codex can',
          'execution boundary',
          'operator-owned',
          'operator proof',
          'operator-proof-note',
          'contact-operator-drawer',
          'profile-advanced-drawer',
          'operator-only commands',
          'launch-console',
          'proof artifact paths',
          'deployment-operator action',
          'External infrastructure setup',
          'Netlify dashboard action',
        ],
        note: 'Normal customer pages fail smoke:web if internal setup keys, setup artifacts, operator proof language, raw commands, audit URLs, or proof-artifact field names appear in visible text or serialized HTML.',
      },
    },
    sourceEvidence: sourceEvidenceFiles.map(fileEvidence),
    followUpCommands: [
      'npm run local:verify',
      'data/local-verification-packet.md',
      'npm run launch:handoff',
      'npm run launch:refresh:packets',
      'npm run client:checklist',
      'npm run activation:workbook',
      'npm run local:dev:doctor',
      'npm run local:dev:packet',
      '# After external hosted values and deployed preview are configured:',
      'npm run validate:netlify:strict',
      'npm run preview:gate',
      'npm run production:check-receipt',
    ],
  };

  const markdown = buildMarkdown(packet);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[local-verification] wrote non-secret local verification packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Local verification ready: ${ready ? 'yes' : 'no'}`);
  console.log(`Commands passed: ${packet.summary.passed}/${packet.summary.total}`);
  console.log('No secret values were printed.');

  if (!ready) process.exit(1);
}

main();
