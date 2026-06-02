import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getLaunchReadiness } from '../src/lib/launch-readiness';
import { loadIgnoredOperatorEnvForReadiness } from '../src/lib/ignored-operator-env';
import { evaluateNetlifyProjectSetupReceipt, expectedSafeNetlifyEnvKeys } from '../src/lib/netlify-project-setup-receipt';
import { identitySetupSteps, netlifyProjectSetupReceiptCommands, hostedOperatorNotes } from '../src/lib/hosted-remediation';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'operator-setup-packet.json');
const markdownPath = path.join(outputDir, 'operator-setup-packet.md');

const operatorGateKeys = [
  'scraper-contact',
  'support-contact',
  'hosted-auth',
  'session-secret',
  'security-headers',
  'filing-mode',
  'daily-cap',
  'automation-worker-runtime',
] as const;

type OperatorActionStatus = 'blocked' | 'ready';

type OperatorAction = {
  key: string;
  title: string;
  status: OperatorActionStatus;
  owner: string;
  why: string;
  doThis: string;
  proofArtifacts: string[];
  commands: string[];
};

function itemStatus(items: Array<{ key: string; label: string; status: string; detail: string; action?: string }>, key: string) {
  return items.find((item) => item.key === key) ?? {
    key,
    label: key,
    status: 'unknown',
    detail: 'This readiness item was not present in the current launch readiness report.',
    action: 'Run npm run launch:handoff and review current blockers.',
  };
}

function hasFailure(rows: Array<{ key: string; status: string }>, keys: string[]) {
  return rows.some((row) => keys.includes(row.key) && row.status === 'fail');
}

function buildOperatorActionPlan(
  rows: Array<{ key: string; status: string }>,
  netlifyProjectSetup: ReturnType<typeof evaluateNetlifyProjectSetupReceipt>,
): OperatorAction[] {
  const contactBlocked = hasFailure(rows, ['scraper-contact', 'support-contact']);
  const hostedAuthBlocked = hasFailure(rows, ['hosted-auth', 'session-secret', 'security-headers']);
  const workerBlocked = hasFailure(rows, ['automation-worker-runtime']);
  const identityBlocked = !netlifyProjectSetup.identityReady || !netlifyProjectSetup.ok;
  const anyBlocked = contactBlocked || hostedAuthBlocked || workerBlocked || identityBlocked;

  return [
    {
      key: 'confirm-netlify-account',
      title: 'Confirm the ClaimBot Netlify account and Identity settings',
      status: identityBlocked ? 'blocked' : 'ready',
      owner: 'Deployment operator',
      why: 'Client invites must point at the correct ClaimBot site with Identity enabled, invite-only registration, and email confirmation recorded as non-secret proof.',
      doThis: 'Log in to Netlify, confirm the linked ClaimBot site, enable Identity in the dashboard, then record the receipt without printing secrets.',
      proofArtifacts: [
        'data/netlify-project-setup-receipt.json',
        'data/netlify-launch-doctor.md',
        'data/operator-setup-packet.md',
      ],
      commands: [
        'netlify login',
        'netlify status',
        'npm run netlify:doctor',
        'npm run netlify:record-setup -- --identity-enabled --registration invite-only --email-confirmation --safe-env-confirmed --evidence "Identity enabled, invite-only registration, and email confirmation confirmed in Netlify dashboard."',
        'npm run operator:packet',
      ],
    },
    {
      key: 'fill-operator-contact-env',
      title: 'Fill the public operator contact values',
      status: contactBlocked ? 'blocked' : 'ready',
      owner: 'Support operator',
      why: 'Hosted scraping and client support need real operator-controlled routes before clients or settlement-source operators see the product.',
      doThis: 'Put the support mailbox and scraper contact URL in the ignored hosted env file, then rerun the packet and hosted env doctor.',
      proofArtifacts: [
        '.env.hosted.local',
        'data/operator-setup-packet.md',
        'data/launch-handoff-report.md',
      ],
      commands: [
        'npm run hosted:env:prepare',
        '# Edit .env.hosted.local with real CLAIMBOT_SUPPORT_EMAIL and SCRAPER_USER_AGENT values.',
        'npm run operator:packet',
        'npm run hosted:env:doctor:bootstrap',
      ],
    },
    {
      key: 'push-auth-security-env',
      title: 'Push hosted auth, session, and security settings',
      status: hostedAuthBlocked ? 'blocked' : 'ready',
      owner: 'Deployment operator',
      why: 'The client workspace must require authenticated sessions and security headers before /goal, review, queue, billing, and audit surfaces are shared.',
      doThis: 'Generate launch secrets, keep auth enabled, push only after Netlify is authenticated, and verify with the Netlify doctor.',
      proofArtifacts: [
        '.env.launch.local',
        'data/netlify-launch-doctor.md',
        'data/operator-setup-packet.md',
      ],
      commands: [
        'npm run launch:secrets',
        'npm run hosted:env:push:bootstrap',
        'npm run netlify:doctor',
        'npm run smoke:hosted:local',
      ],
    },
    {
      key: 'prove-paid-worker-runtime',
      title: 'Prove the paid full-automation worker runtime',
      status: workerBlocked ? 'blocked' : 'ready',
      owner: 'Worker operator',
      why: 'Paid users can only be promised complete automation after file_claim jobs are processed by a persistent hosted worker or scheduler using the same hosted database.',
      doThis: 'Run a hosted worker smoke or GitHub worker workflow, preserve the receipt, then mark the worker runtime as verified.',
      proofArtifacts: [
        'data/worker-file-claim-smoke-seed.json',
        'data/worker-smoke-receipt.json',
        'data/worker-runtime-packet.md',
        'data/operator-setup-packet.md',
      ],
      commands: [
        'CLAIMBOT_WORKER_SMOKE_SEED=allow npm run worker:file-claim:seed',
        'npm run worker:once',
        'npm run worker:packet',
        'npm run worker:github:doctor',
      ],
    },
    {
      key: 'regenerate-handoff',
      title: 'Regenerate the non-secret handoff after external setup changes',
      status: anyBlocked ? 'blocked' : 'ready',
      owner: 'Launch operator',
      why: 'The dashboard, support packet, client-preview checklist, and launch handoff should all agree on the latest proof state before a client sees the hosted app.',
      doThis: 'Refresh the operator packet, activation workbook, client checklist, and launch handoff after each account, env, Identity, or worker-runtime change.',
      proofArtifacts: [
        'data/operator-setup-packet.md',
        'data/external-activation-workbook.md',
        'data/client-preview-checklist.md',
        'data/launch-handoff-report.md',
      ],
      commands: [
        'npm run operator:packet',
        'npm run activation:workbook',
        'npm run client:checklist',
        'npm run launch:handoff',
      ],
    },
  ];
}

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

function safeStatusRows(readiness: Awaited<ReturnType<typeof getLaunchReadiness>>) {
  const allItems = [
    ...readiness.readiness.items,
    ...readiness.warnings,
    ...readiness.blockers,
  ];
  const rows = operatorGateKeys.map((key) => itemStatus(allItems, key));
  const netlifyProjectSetup = evaluateNetlifyProjectSetupReceipt();
  rows.push({
    key: 'netlify-project-setup-receipt',
    label: 'Netlify project setup receipt',
    status: netlifyProjectSetup.ok ? 'pass' : netlifyProjectSetup.identityReady ? 'warn' : 'fail',
    detail: netlifyProjectSetup.identityReady
      ? 'Netlify Identity proof is recorded, but safe env or receipt checks still need review.'
      : 'Netlify Identity proof is not complete for client invites.',
    action: 'Confirm Project configuration > Identity, then run npm run netlify:record-setup with the Identity confirmation flags.',
  });
  return rows;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const ignoredOperatorEnv = loadIgnoredOperatorEnvForReadiness();
  const readiness = await getLaunchReadiness();
  const netlifyProjectSetup = evaluateNetlifyProjectSetupReceipt();
  const rows = safeStatusRows(readiness);
  const operatorActionPlan = buildOperatorActionPlan(rows, netlifyProjectSetup);
  const failures = rows.filter((row) => row.status === 'fail');
  const warnings = rows.filter((row) => row.status === 'warn' || row.status === 'unknown');
  const sourceFiles = [
    'src/lib/hosted-readiness.ts',
    'src/lib/netlify-project-setup-receipt.ts',
    'scripts/record-netlify-project-setup.ts',
    'src/app/contact/page.tsx',
    'src/app/help/page.tsx',
    'src/app/login/page.tsx',
    'src/app/launch/page.tsx',
    'src/middleware.ts',
    'worker/job-poller.ts',
    'worker/run-once.ts',
  ];
  const packet = {
    format: 'claimbot.operator-setup-packet.v1',
    generatedAt,
    note: 'Non-secret operator setup packet. This packet intentionally omits support mailbox values, scraper user-agent values, session secrets, database URLs, tokens, billing secrets, checkout URLs, and raw user data.',
    approvalBoundary: {
      packetIsOperatorSetupApproval: false,
      operatorSetupReady: failures.length === 0,
      readyRequires: [
        'Non-placeholder SCRAPER_USER_AGENT with public contact URL',
        'Non-placeholder CLAIMBOT_SUPPORT_EMAIL',
        'Hosted auth enabled',
        'CLAIMBOT_SESSION_SECRET configured',
        'Hosted CSP/security headers enforced',
        'Verified worker runtime for paid full automation file_claim jobs',
        'Netlify Identity enabled with invite-only registration and email confirmation',
      ],
    },
    ignoredOperatorEnv,
    operatorReadiness: {
      ready: failures.length === 0,
      failureCount: failures.length,
      warningCount: warnings.length,
      rows,
    },
    operatorActionPlan: {
      blockedCount: operatorActionPlan.filter((action) => action.status === 'blocked').length,
      rows: operatorActionPlan,
      boundary: 'These actions are non-secret operator instructions. They identify where proof must be created, but they do not include secret values, raw account tokens, support mailbox contents, or user data.',
    },
    netlifyProjectSetupReceipt: {
      ok: netlifyProjectSetup.ok,
      receiptPath: path.relative(process.cwd(), netlifyProjectSetup.receiptPath),
      siteName: netlifyProjectSetup.receipt?.siteName ?? null,
      dashboardUrl: netlifyProjectSetup.receipt?.dashboardUrl ?? null,
      safeEnvKeyCount: netlifyProjectSetup.receipt?.configuredSafeEnvKeys.length ?? 0,
      safeEnvKeyTotal: expectedSafeNetlifyEnvKeys.length,
      missingSafeEnvKeys: netlifyProjectSetup.missingSafeEnvKeys,
      identityReady: netlifyProjectSetup.identityReady,
      identity: netlifyProjectSetup.receipt?.identity
        ? {
          enabled: netlifyProjectSetup.receipt.identity.enabled,
          registration: netlifyProjectSetup.receipt.identity.registration,
          emailConfirmation: netlifyProjectSetup.receipt.identity.emailConfirmation,
          verifiedAt: netlifyProjectSetup.receipt.identity.verifiedAt ?? null,
          evidencePresent: Boolean(netlifyProjectSetup.receipt.identity.evidence),
        }
        : null,
      warnings: netlifyProjectSetup.warnings,
      failures: netlifyProjectSetup.failures,
    },
    identitySetupSteps,
    commands: {
      prepareAndCheck: [
        'npm run operator:packet',
        'npm run hosted:env:prepare',
        'npm run launch:secrets',
        'npm run hosted:env:doctor',
        'npm run netlify:doctor',
      ],
      recordIdentityProof: netlifyProjectSetupReceiptCommands,
      pushAndVerify: [
        'npm run hosted:env:push',
        'npm run smoke:hosted:local',
        'npm run launch:handoff',
      ],
    },
    sourceEvidence: sourceFiles.map(fileEvidence),
    operatorNotes: hostedOperatorNotes.filter((note) => (
      note.toLowerCase().includes('support')
      || note.toLowerCase().includes('scraper')
      || note.toLowerCase().includes('identity')
      || note.toLowerCase().includes('session')
      || note.toLowerCase().includes('auth')
      || note.toLowerCase().includes('security')
      || note.toLowerCase().includes('preview')
    )),
  };

  const markdown = [
    '# ClaimBot Operator Setup Packet',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This is a non-secret operator setup packet. This packet is not proof that operator setup is complete, and it does not print support emails, scraper user-agent values, session secrets, or dashboard evidence text.',
    '',
    '## Current Gate',
    '',
    `Operator setup ready: ${packet.operatorReadiness.ready ? 'yes' : 'no'}`,
    `Failures: ${packet.operatorReadiness.failureCount}`,
    `Warnings: ${packet.operatorReadiness.warningCount}`,
    `Netlify Identity proof ready: ${netlifyProjectSetup.identityReady ? 'yes' : 'no'}`,
    `Safe Netlify env defaults recorded: ${packet.netlifyProjectSetupReceipt.safeEnvKeyCount}/${packet.netlifyProjectSetupReceipt.safeEnvKeyTotal}`,
    `Ignored operator env loaded: ${ignoredOperatorEnv.loaded}/${ignoredOperatorEnv.available} available non-placeholder values`,
    '',
    '## Operator Gates',
    '',
    ...rows.map((row) => `- ${row.status.toUpperCase()} ${row.label}: ${row.detail}${row.action ? ` Next: ${row.action}` : ''}`),
    '',
    '## Next Operator Actions',
    '',
    `Blocked actions: ${packet.operatorActionPlan.blockedCount}/${packet.operatorActionPlan.rows.length}`,
    '',
    ...packet.operatorActionPlan.rows.flatMap((action, index) => [
      `${index + 1}. ${action.title}: ${action.status}`,
      `   Owner: ${action.owner}`,
      `   Why: ${action.why}`,
      `   Do this: ${action.doThis}`,
      `   Proof: ${action.proofArtifacts.join(', ')}`,
      `   Commands: ${action.commands.join(' | ')}`,
    ]),
    '',
    `Boundary: ${packet.operatorActionPlan.boundary}`,
    '',
    '## Netlify Identity Proof',
    '',
    `- Receipt: ${packet.netlifyProjectSetupReceipt.receiptPath}`,
    `- Project: ${packet.netlifyProjectSetupReceipt.siteName ?? 'not recorded'}`,
    `- Dashboard URL recorded: ${packet.netlifyProjectSetupReceipt.dashboardUrl ? 'yes' : 'no'}`,
    `- Identity enabled: ${packet.netlifyProjectSetupReceipt.identity?.enabled ? 'yes' : 'no'}`,
    `- Registration: ${packet.netlifyProjectSetupReceipt.identity?.registration ?? 'not recorded'}`,
    `- Email confirmation: ${packet.netlifyProjectSetupReceipt.identity?.emailConfirmation ? 'yes' : 'no'}`,
    `- Evidence present: ${packet.netlifyProjectSetupReceipt.identity?.evidencePresent ? 'yes' : 'no'}`,
    '',
    ...(netlifyProjectSetup.warnings.length > 0
      ? ['Warnings:', '', ...netlifyProjectSetup.warnings.map((warning) => `- ${warning}`), '']
      : []),
    ...(netlifyProjectSetup.failures.length > 0
      ? ['Failures:', '', ...netlifyProjectSetup.failures.map((failure) => `- ${failure}`), '']
      : []),
    '## Commands',
    '',
    'Prepare and check:',
    '',
    ...packet.commands.prepareAndCheck.map((command) => `- \`${command}\``),
    '',
    'Record Identity proof after dashboard confirmation:',
    '',
    ...packet.commands.recordIdentityProof.map((command) => `- \`${command}\``),
    '',
    'Push and verify:',
    '',
    ...packet.commands.pushAndVerify.map((command) => `- \`${command}\``),
    '',
    '## Source Evidence',
    '',
    ...packet.sourceEvidence.map((item) => `- ${item.path}: ${item.exists ? `present, ${item.bytes} bytes` : 'missing'}`),
    '',
    '## Notes',
    '',
    '- Do not send login links until Netlify Identity proof is recorded and deployed auth smoke passes.',
    '- Support and scraper contact values must be real operator-controlled routes, not placeholders.',
    '- Keep hosted authentication enabled for client preview and production.',
    '- Paid full automation is only launch-ready after a persistent worker or scheduler proves it can process file_claim jobs automatically.',
    '- No secret values were printed.',
    '',
  ].join('\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[operator-setup-packet] wrote non-secret operator setup packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Operator setup ready: ${packet.operatorReadiness.ready ? 'yes' : 'no'}`);
  console.log(`Netlify Identity proof ready: ${netlifyProjectSetup.identityReady ? 'yes' : 'no'}`);
  console.log('No secret values were printed.');
}

main().catch((error) => {
  console.error('[operator-setup-packet] failed');
  console.error(error);
  process.exit(1);
});
