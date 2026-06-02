const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'launch-packet-refresh-report.json');
const markdownPath = path.join(outputDir, 'launch-packet-refresh-report.md');

const commandPlan = [
  { key: 'hosted-db', label: 'Hosted database packet', command: 'npm run hosted:db:packet' },
  { key: 'operator', label: 'Operator setup packet', command: 'npm run operator:packet' },
  { key: 'worker', label: 'Worker runtime packet', command: 'npm run worker:packet' },
  { key: 'source', label: 'Source readiness packet', command: 'npm run source:packet' },
  { key: 'automation-safety', label: 'Automation safety packet', command: 'npm run automation:safety:packet' },
  { key: 'audit-privacy', label: 'Audit and privacy packet', command: 'npm run audit:privacy:packet' },
  { key: 'billing', label: 'Billing activation packet', command: 'npm run billing:packet' },
  { key: 'legal', label: 'Legal review packet', command: 'npm run legal:packet' },
  { key: 'pwa', label: 'PWA readiness packet', command: 'npm run pwa:packet' },
  { key: 'deployability', label: 'Deployability packet', command: 'npm run deploy:packet' },
  { key: 'local-dev-stability', label: 'Local dev stability packet', command: 'npm run local:dev:packet' },
  { key: 'responsive', label: 'Responsive readiness packet', command: 'npm run responsive:packet' },
  { key: 'kimi-visual', label: 'Kimi visual readiness packet', command: 'npm run kimi:visual:packet', timeoutMs: 360000 },
  { key: 'netlify-doctor', label: 'Netlify launch doctor', command: 'npm run netlify:doctor' },
  { key: 'preview', label: 'Preview promotion packet', command: 'npm run preview:packet' },
  { key: 'activation-workbook', label: 'External activation workbook', command: 'npm run activation:workbook' },
  { key: 'client-checklist', label: 'Client preview checklist', command: 'npm run client:checklist' },
  { key: 'launch-handoff', label: 'Launch handoff report', command: 'npm run launch:handoff' },
  { key: 'audit-support', label: 'Audit support packet', command: 'npm run audit:support:packet' },
];

function redact(value) {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED_API_KEY]')
    .replace(/whsec_[A-Za-z0-9_-]{16,}/g, '[REDACTED_WEBHOOK_SECRET]')
    .replace(/(DATABASE_URL=)([^ \r\n]+)/gi, '$1[REDACTED]')
    .replace(/(DATABASE_AUTH_TOKEN=)([^ \r\n]+)/gi, '$1[REDACTED]')
    .replace(/(TURSO_AUTH_TOKEN=)([^ \r\n]+)/gi, '$1[REDACTED]')
    .replace(/(CLAIMBOT_SESSION_SECRET=)([^ \r\n]+)/gi, '$1[REDACTED]')
    .replace(/(CLAIMBOT_BILLING_SYNC_SECRET=)([^ \r\n]+)/gi, '$1[REDACTED]')
    .replace(/(CLAIMBOT_STRIPE_WEBHOOK_SECRET=)([^ \r\n]+)/gi, '$1[REDACTED]')
    .replace(/https:\/\/[^\s"']*(checkout|stripe|paypal|processor|billing)[^\s"']*/gi, '[REDACTED_CHECKOUT_URL]');
}

function tailLines(value, maxLines = 8) {
  return redact(value)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-maxLines);
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function runCommand(item) {
  const startedAt = new Date();
  const result = spawnSync(item.command, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: true,
    timeout: item.timeoutMs ?? 180000,
    windowsHide: true,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  const completedAt = new Date();
  const timedOut = result.error?.code === 'ETIMEDOUT';

  return {
    key: item.key,
    label: item.label,
    command: item.command,
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

function buildMarkdown(report) {
  return [
    '# ClaimBot Launch Packet Refresh Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'This is a non-secret packet refresh report. It records command status and redacted output tails only. It does not print API keys, database URLs, auth tokens, checkout URLs, webhook secrets, session secrets, support mailbox values, private profile facts, or raw user data.',
    '',
    '## Current Gate',
    '',
    `Commands passed: ${report.summary.passed}/${report.summary.total}`,
    `Commands blocked or failed: ${report.summary.failed}`,
    `Total duration: ${formatDuration(report.summary.totalDurationMs)}`,
    `Boundary: ${report.boundary}`,
    '',
    '## Command Results',
    '',
    ...report.results.flatMap((result) => [
      `- ${result.label}: ${result.ok ? 'pass' : 'blocked/fail'} (${formatDuration(result.durationMs)})`,
      `  Command: \`${result.command}\``,
      ...(result.stderrTail.length > 0 ? [`  Last stderr: ${result.stderrTail.slice(-2).join(' | ')}`] : []),
      ...(result.stdoutTail.length > 0 ? [`  Last stdout: ${result.stdoutTail.slice(-2).join(' | ')}`] : []),
    ]),
    '',
    '## Next Commands',
    '',
    '- `npm run local:verify`',
    '- `npm run client:checklist`',
    '- `npm run launch:handoff`',
    '- `npm run activation:workbook`',
    '',
    'No secret values were printed.',
    '',
  ].join('\n');
}

function main() {
  const generatedAt = new Date().toISOString();
  const results = [];

  for (const item of commandPlan) {
    console.log(`[launch-packet-refresh] running ${item.command}`);
    const result = runCommand(item);
    results.push(result);
    console.log(`[launch-packet-refresh] ${result.ok ? 'pass' : 'blocked/fail'} ${item.key} (${formatDuration(result.durationMs)})`);
  }

  const report = {
    format: 'claimbot.launch-packet-refresh-report.v1',
    generatedAt,
    boundary: 'This refresh report proves packet generators were attempted locally. It does not clear external setup gates such as Netlify login, hosted database credentials, billing provider setup, legal review, worker deployment, or deployed preview promotion.',
    summary: {
      total: results.length,
      passed: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      totalDurationMs: results.reduce((sum, result) => sum + result.durationMs, 0),
    },
    results,
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, buildMarkdown(report));

  console.log('[launch-packet-refresh] wrote non-secret launch packet refresh report');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Commands passed: ${report.summary.passed}/${report.summary.total}`);
  console.log('No secret values were printed.');
}

main();
