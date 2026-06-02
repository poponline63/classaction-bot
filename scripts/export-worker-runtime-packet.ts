import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateHostedReadiness } from '../src/lib/hosted-readiness';
import { loadIgnoredOperatorEnvForReadiness } from '../src/lib/ignored-operator-env';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'worker-runtime-packet.json');
const markdownPath = path.join(outputDir, 'worker-runtime-packet.md');
const smokeReceiptPath = path.join(outputDir, 'worker-smoke-receipt.json');
const localFileClaimReceiptPath = path.join(outputDir, 'local-worker-file-claim-smoke-receipt.json');
const workerFileClaimSeedPath = path.join(outputDir, 'worker-file-claim-smoke-seed.json');
const githubWorkerDoctorPath = path.join(outputDir, 'github-worker-doctor.json');

function readJsonFile(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function workerSmokeReceiptSummary() {
  const raw = readJsonFile(smokeReceiptPath);
  if (!raw) {
    return {
      exists: false,
      status: 'missing',
      generatedAt: null,
      runtime: null,
      statusDetail: null,
      fileClaimProofUsable: null,
      launchProofUsable: null,
      processed: null,
      succeeded: null,
      failed: null,
      retried: null,
      fileClaimSucceeded: null,
      issues: [],
      warnings: [],
    };
  }
  const receipt = raw.receipt && typeof raw.receipt === 'object'
    ? raw.receipt as Record<string, unknown>
    : {};
  const jobTypes = receipt.jobTypes && typeof receipt.jobTypes === 'object'
    ? receipt.jobTypes as Record<string, unknown>
    : {};
  const fileClaim = jobTypes.file_claim && typeof jobTypes.file_claim === 'object'
    ? jobTypes.file_claim as Record<string, unknown>
    : {};

  return {
    exists: true,
    status: typeof raw.status === 'string' ? raw.status : 'unknown',
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : null,
    runtime: typeof raw.runtime === 'string' ? raw.runtime : null,
    statusDetail: typeof raw.statusDetail === 'string' ? raw.statusDetail : null,
    fileClaimProofUsable: typeof raw.fileClaimProofUsable === 'boolean' ? raw.fileClaimProofUsable : null,
    launchProofUsable: typeof raw.launchProofUsable === 'boolean' ? raw.launchProofUsable : null,
    processed: typeof receipt.processed === 'number' ? receipt.processed : null,
    succeeded: typeof receipt.succeeded === 'number' ? receipt.succeeded : null,
    failed: typeof receipt.failed === 'number' ? receipt.failed : null,
    retried: typeof receipt.retried === 'number' ? receipt.retried : null,
    fileClaimSucceeded: typeof fileClaim.succeeded === 'number' ? fileClaim.succeeded : null,
    issues: Array.isArray(raw.issues) ? raw.issues.filter((item): item is string => typeof item === 'string') : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((item): item is string => typeof item === 'string') : [],
  };
}

function localFileClaimReceiptSummary() {
  const raw = readJsonFile(localFileClaimReceiptPath);
  if (!raw) {
    return {
      exists: false,
      status: 'missing',
      generatedAt: null,
      claimStatus: null,
      jobStatus: null,
      fileClaimSucceeded: null,
      claimFiledInShadowMode: null,
      attestationCaptured: null,
      launchProofUsable: null,
    };
  }
  const result = raw.result && typeof raw.result === 'object'
    ? raw.result as Record<string, unknown>
    : {};
  const acceptance = raw.acceptance && typeof raw.acceptance === 'object'
    ? raw.acceptance as Record<string, unknown>
    : {};
  const workerSmoke = raw.workerSmoke && typeof raw.workerSmoke === 'object'
    ? raw.workerSmoke as Record<string, unknown>
    : {};

  return {
    exists: true,
    status: typeof raw.status === 'string' ? raw.status : 'unknown',
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : null,
    claimStatus: typeof result.claimStatus === 'string' ? result.claimStatus : null,
    jobStatus: typeof result.jobStatus === 'string' ? result.jobStatus : null,
    fileClaimSucceeded: typeof result.fileClaimSucceeded === 'number' ? result.fileClaimSucceeded : null,
    claimFiledInShadowMode: typeof acceptance.claimFiledInShadowMode === 'boolean' ? acceptance.claimFiledInShadowMode : null,
    attestationCaptured: typeof acceptance.attestationCaptured === 'boolean' ? acceptance.attestationCaptured : null,
    launchProofUsable: typeof workerSmoke.launchProofUsable === 'boolean' ? workerSmoke.launchProofUsable : null,
  };
}

function workerFileClaimSeedSummary() {
  const raw = readJsonFile(workerFileClaimSeedPath);
  if (!raw) {
    return {
      exists: false,
      status: 'missing',
      generatedAt: null,
      mode: null,
      jobType: null,
      jobStatus: null,
      jobId: null,
      claimId: null,
    };
  }
  const seeded = raw.seeded && typeof raw.seeded === 'object'
    ? raw.seeded as Record<string, unknown>
    : {};

  return {
    exists: true,
    status: typeof raw.status === 'string' ? raw.status : 'unknown',
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : null,
    mode: typeof raw.mode === 'string' ? raw.mode : null,
    jobType: typeof seeded.jobType === 'string' ? seeded.jobType : null,
    jobStatus: typeof seeded.jobStatus === 'string' ? seeded.jobStatus : null,
    jobId: typeof seeded.jobId === 'number' ? seeded.jobId : null,
    claimId: typeof seeded.claimId === 'number' ? seeded.claimId : null,
  };
}

function githubWorkerDoctorSummary() {
  const raw = readJsonFile(githubWorkerDoctorPath);
  if (!raw) {
    return {
      exists: false,
      ready: false,
      generatedAt: null,
      failureCount: null,
      warningCount: null,
      receiptPath: 'data/github-worker-doctor.md',
    };
  }

  const failures = Array.isArray(raw.failures) ? raw.failures : [];
  const warnings = Array.isArray(raw.warnings) ? raw.warnings : [];
  return {
    exists: true,
    ready: raw.ready === true,
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : null,
    failureCount: failures.length,
    warningCount: warnings.length,
    receiptPath: 'data/github-worker-doctor.md',
  };
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

function workerRuntimeItem() {
  const readiness = evaluateHostedReadiness({
    databaseUrl: process.env.DATABASE_URL,
    databaseAuthToken: process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN,
    hasDatabaseAuthToken: Boolean(process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN),
    claimFilerMode: process.env.CLAIM_FILER_MODE,
    claimFilerLiveAck: process.env.CLAIM_FILER_LIVE_ACK,
    claimFilerMaxPerDay: process.env.CLAIM_FILER_MAX_PER_DAY,
    scraperUserAgent: process.env.SCRAPER_USER_AGENT,
    supportEmail: process.env.CLAIMBOT_SUPPORT_EMAIL,
    isHosted: true,
    authDisabled: process.env.CLAIMBOT_DISABLE_AUTH === 'true',
    sessionSecret: process.env.CLAIMBOT_SESSION_SECRET,
    cspEnforced: process.env.NETLIFY === 'true' || process.env.CLAIMBOT_ENFORCE_CSP === 'true',
    billingPlusMonthlyUrl: process.env.CLAIMBOT_BILLING_PLUS_MONTHLY_URL,
    billingProMonthlyUrl: process.env.CLAIMBOT_BILLING_PRO_MONTHLY_URL,
    billingSyncSecret: process.env.CLAIMBOT_BILLING_SYNC_SECRET,
    billingStripeWebhookSecret: process.env.CLAIMBOT_STRIPE_WEBHOOK_SECRET,
    legalReviewAck: process.env.CLAIMBOT_LEGAL_REVIEW_ACK,
    workerRuntime: process.env.CLAIMBOT_WORKER_RUNTIME,
    workerRuntimeReceipt: process.env.CLAIMBOT_WORKER_RUNTIME_RECEIPT,
  });

  return readiness.items.find((item) => item.key === 'automation-worker-runtime') ?? {
    key: 'automation-worker-runtime',
    label: 'Automation worker runtime',
    status: 'fail' as const,
    detail: 'Automation worker runtime readiness was not present in hosted readiness output.',
    action: 'Regenerate worker runtime packet after updating hosted-readiness checks.',
  };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const ignoredOperatorEnv = loadIgnoredOperatorEnvForReadiness();
  const runtimeItem = workerRuntimeItem();
  const workerRuntimeReady = runtimeItem.status === 'pass';
  const smokeReceipt = workerSmokeReceiptSummary();
  const localFileClaimReceipt = localFileClaimReceiptSummary();
  const workerFileClaimSeed = workerFileClaimSeedSummary();
  const githubWorkerDoctor = githubWorkerDoctorSummary();
  const sourceFiles = [
    '.github/workflows/claimbot-worker.yml',
    'data/github-worker-doctor.md',
    'data/worker-smoke-receipt.json',
    'data/local-worker-file-claim-smoke-receipt.json',
    'data/worker-file-claim-smoke-seed.json',
    'worker/job-poller.ts',
    'worker/run-once.ts',
    'worker/smoke-receipt.ts',
    'worker/index.ts',
    'scripts/seed-worker-file-claim-smoke.ts',
    'scripts/run-local-worker-file-claim-receipt.ts',
    'src/app/smoke/claim-form/page.tsx',
    'src/lib/claim-filer/filer.ts',
    'src/lib/hosted-readiness.ts',
    'src/lib/launch-handoff.ts',
    'src/app/api/claims/[id]/file/route.ts',
    'src/app/api/claims/file-all/route.ts',
  ];

  const packet = {
    format: 'claimbot.worker-runtime-packet.v1',
    generatedAt,
    note: 'Non-secret worker runtime packet. It proves whether paid full automation has a worker runtime receipt, but it does not print database URLs, tokens, session secrets, billing secrets, checkout URLs, profile facts, claim payloads, or raw user data.',
    approvalBoundary: {
      packetIsWorkerRuntimeApproval: false,
      workerRuntimeReady,
      readyRequires: [
        'A persistent worker host or scheduler running the ClaimBot worker with the hosted DATABASE_URL',
        'Successful worker smoke using npm run worker:once or the persistent npm run worker process',
        'Worker smoke status=pass, launchProofUsable=true, file_claim succeeded > 0, failed=0, retried=0',
        'Saved data/worker-smoke-receipt.json or hosted scheduler artifact from the same smoke run',
        'CLAIMBOT_WORKER_RUNTIME set to persistent-worker, dedicated-worker, external-worker, background-worker, scheduled-worker, or github-actions-scheduler',
        'CLAIMBOT_WORKER_RUNTIME_RECEIPT=verified recorded only after the smoke succeeds',
      ],
    },
    runtimeReadiness: {
      key: runtimeItem.key,
      label: runtimeItem.label,
      status: runtimeItem.status,
      detail: runtimeItem.detail,
      action: runtimeItem.action ?? null,
    },
    workerSmokeReceipt: smokeReceipt,
    localFileClaimReceipt,
    workerFileClaimSeed,
    githubWorkerDoctor,
    commands: {
      localEvidence: [
        'npm run worker:file-claim:receipt',
        'npm run worker:github:doctor',
        'npm run worker:packet',
      ],
      githubActionsSetup: [
        '# Configure the scheduled worker repository settings without printing secret values.',
        'npm run worker:github:doctor',
        'gh secret set DATABASE_URL',
        '# If DATABASE_URL is libsql://, set one database auth token secret:',
        'gh secret set DATABASE_AUTH_TOKEN',
        '# Or: gh secret set TURSO_AUTH_TOKEN',
        'gh variable set CLAIM_FILER_MODE --body "shadow"',
        'gh variable set CLAIM_FILER_MAX_PER_DAY --body "20"',
        'gh variable set SCRAPER_USER_AGENT --body "ClaimBot/0.1 (+https://yourdomain.com/contact)"',
        'gh variable set CLAIMBOT_SUPPORT_EMAIL --body "support@yourdomain.com"',
        'gh variable set SMOKE_BASE_URL --body "https://your-preview.netlify.app"',
      ],
      seedHostedFileClaim: [
        '# Run after SMOKE_BASE_URL points at the deployed preview and hosted DATABASE_URL/auth values are loaded.',
        'CLAIMBOT_WORKER_SMOKE_SEED=allow npm run worker:file-claim:seed',
        '# The command writes data/worker-file-claim-smoke-seed.json and creates one due synthetic file_claim job in shadow mode.',
      ],
      hostedWorkerSmoke: [
        '# Run after npm run worker:file-claim:seed creates a due synthetic file_claim job in hosted storage.',
        'npm run worker:once',
        'npm run worker:once -- --limit=1',
      ],
      persistentRuntime: [
        '# Deploy npm run worker on a persistent worker host that shares hosted DATABASE_URL and DATABASE_AUTH_TOKEN.',
        'npm run worker',
      ],
      scheduledRuntime: [
        '# Configure .github/workflows/claimbot-worker.yml with DATABASE_URL and optional DATABASE_AUTH_TOKEN/TURSO_AUTH_TOKEN secrets.',
        '# Set SMOKE_BASE_URL as a GitHub Actions variable pointing at the deployed ClaimBot preview before seed_smoke_job=true.',
        'gh variable set SMOKE_BASE_URL --body "https://your-preview.netlify.app"',
        '# Run the ClaimBot paid automation worker workflow manually once with a synthetic hosted file_claim seed, then preserve both smoke artifacts.',
        'gh workflow run claimbot-worker.yml -f limit=3 -f seed_smoke_job=true',
      ],
      recordNonSecretReceipt: [
        'netlify env:set CLAIMBOT_WORKER_RUNTIME "scheduled-worker" --context production deploy-preview',
        'netlify env:set CLAIMBOT_WORKER_RUNTIME_RECEIPT "verified" --context production deploy-preview',
        'npm run worker:packet',
        'npm run launch:handoff',
      ],
    },
    githubActionsRequirements: {
      workflowPath: '.github/workflows/claimbot-worker.yml',
      requiredSecrets: [
        'DATABASE_URL',
      ],
      conditionalSecrets: [
        'DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN when DATABASE_URL is libsql://',
        'CLAIMBOT_SESSION_SECRET when hosted auth smokes share the worker environment',
        'CLAIMBOT_BILLING_SYNC_SECRET or CLAIMBOT_STRIPE_WEBHOOK_SECRET when deployed billing smokes share the worker environment',
      ],
      requiredVariables: [
        'SMOKE_BASE_URL when seed_smoke_job=true',
        'CLAIM_FILER_MODE=shadow for first client preview',
        'CLAIM_FILER_MAX_PER_DAY',
        'SCRAPER_USER_AGENT',
        'CLAIMBOT_SUPPORT_EMAIL',
      ],
      manualProofRun: 'gh workflow run claimbot-worker.yml -f limit=3 -f seed_smoke_job=true',
      requiredArtifacts: [
        'claimbot-worker-file-claim-smoke-seed',
        'claimbot-worker-smoke-receipt',
        'claimbot-worker-runtime-packet',
      ],
      approvalBoundary: 'Do not set CLAIMBOT_WORKER_RUNTIME_RECEIPT=verified until the uploaded worker smoke receipt shows launchProofUsable=true, file_claim succeeded > 0, failed=0, and retried=0 against hosted storage. Preserve the worker runtime packet artifact from the same run, including failed runs, so the paid-automation proof chain can be audited.',
    },
    ignoredOperatorEnv,
    sourceEvidence: sourceFiles.map(fileEvidence),
    operationalBoundary: {
      webRequestRole: 'The hosted web app creates audited file_claim jobs and returns job receipts to paid users.',
      workerRole: 'A separate worker runtime must poll due jobs and run preflight, form fill, evidence capture, and filing-mode gates.',
      launchRule: 'Paid full automation is not client-ready while worker runtime proof is missing, even if checkout and queue buttons are present.',
    },
  };

  const markdown = [
    '# ClaimBot Worker Runtime Packet',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This is a non-secret worker runtime packet. It does not print database URLs, auth tokens, session secrets, billing secrets, checkout links, profile facts, claim payloads, or raw user data.',
    '',
    '## Current Gate',
    '',
    `Worker runtime ready: ${workerRuntimeReady ? 'yes' : 'no'}`,
    `Runtime status: ${runtimeItem.status}`,
    `Detail: ${runtimeItem.detail}`,
    runtimeItem.action ? `Next: ${runtimeItem.action}` : '',
    `Ignored operator env loaded: ${ignoredOperatorEnv.loaded}/${ignoredOperatorEnv.available} available non-placeholder values`,
    `Worker smoke receipt: ${smokeReceipt.exists ? `${smokeReceipt.status} (${smokeReceipt.runtime ?? 'unknown runtime'}, processed ${smokeReceipt.processed ?? 'unknown'} due job${smokeReceipt.processed === 1 ? '' : 's'})` : 'missing'}`,
    `GitHub worker doctor: ${githubWorkerDoctor.exists ? `${githubWorkerDoctor.ready ? 'ready' : 'blocked'} (${githubWorkerDoctor.failureCount ?? 'unknown'} failures, ${githubWorkerDoctor.warningCount ?? 'unknown'} warnings)` : 'missing'}`,
    `Hosted file_claim smoke seed: ${workerFileClaimSeed.exists ? `${workerFileClaimSeed.status} (${workerFileClaimSeed.jobType ?? 'unknown job'}, ${workerFileClaimSeed.jobStatus ?? 'unknown status'})` : 'missing'}`,
    smokeReceipt.fileClaimProofUsable !== null ? `File-claim code-path proof usable: ${smokeReceipt.fileClaimProofUsable ? 'yes' : 'no'}` : '',
    smokeReceipt.launchProofUsable !== null ? `Launch proof usable: ${smokeReceipt.launchProofUsable ? 'yes' : 'no'}` : '',
    smokeReceipt.statusDetail ? `Receipt detail: ${smokeReceipt.statusDetail}` : '',
    `Local worker file_claim receipt: ${localFileClaimReceipt.exists ? localFileClaimReceipt.status : 'missing'}`,
    '',
    '## Required Proof',
    '',
    ...packet.approvalBoundary.readyRequires.map((item) => `- ${item}`),
    '',
    '## Commands',
    '',
    'Local code-path evidence:',
    '',
    ...packet.commands.localEvidence.map((command) => `- \`${command}\``),
    '',
    'GitHub Actions scheduled worker setup:',
    '',
    ...packet.commands.githubActionsSetup.map((command) => `- \`${command}\``),
    '',
    'Seed hosted file_claim smoke job:',
    '',
    ...packet.commands.seedHostedFileClaim.map((command) => `- \`${command}\``),
    '',
    'Hosted worker smoke:',
    '',
    ...packet.commands.hostedWorkerSmoke.map((command) => `- \`${command}\``),
    '',
    'Persistent runtime:',
    '',
    ...packet.commands.persistentRuntime.map((command) => `- \`${command}\``),
    '',
    'Scheduled runtime:',
    '',
    ...packet.commands.scheduledRuntime.map((command) => `- \`${command}\``),
    '',
    '## GitHub Actions Proof Requirements',
    '',
    `Workflow: ${packet.githubActionsRequirements.workflowPath}`,
    '',
    'Required secrets:',
    '',
    ...packet.githubActionsRequirements.requiredSecrets.map((item) => `- ${item}`),
    '',
    'Conditional secrets:',
    '',
    ...packet.githubActionsRequirements.conditionalSecrets.map((item) => `- ${item}`),
    '',
    'Required variables:',
    '',
    ...packet.githubActionsRequirements.requiredVariables.map((item) => `- ${item}`),
    '',
    `Manual proof run: \`${packet.githubActionsRequirements.manualProofRun}\``,
    '',
    'Required artifacts:',
    '',
    ...packet.githubActionsRequirements.requiredArtifacts.map((item) => `- ${item}`),
    '',
    `Approval boundary: ${packet.githubActionsRequirements.approvalBoundary}`,
    '',
    '## Latest Worker Smoke Receipt',
    '',
    smokeReceipt.exists
      ? `- Status: ${smokeReceipt.status}`
      : '- Status: missing',
    smokeReceipt.generatedAt ? `- Generated: ${smokeReceipt.generatedAt}` : '',
    smokeReceipt.runtime ? `- Runtime: ${smokeReceipt.runtime}` : '',
    smokeReceipt.fileClaimProofUsable !== null ? `- File-claim code-path proof usable: ${smokeReceipt.fileClaimProofUsable ? 'yes' : 'no'}` : '',
    smokeReceipt.launchProofUsable !== null ? `- Launch proof usable: ${smokeReceipt.launchProofUsable ? 'yes' : 'no'}` : '',
    smokeReceipt.statusDetail ? `- Detail: ${smokeReceipt.statusDetail}` : '',
    smokeReceipt.processed !== null ? `- Processed: ${smokeReceipt.processed}` : '',
    smokeReceipt.succeeded !== null ? `- Succeeded: ${smokeReceipt.succeeded}` : '',
    smokeReceipt.fileClaimSucceeded !== null ? `- File claim succeeded: ${smokeReceipt.fileClaimSucceeded}` : '',
    smokeReceipt.failed !== null ? `- Failed: ${smokeReceipt.failed}` : '',
    smokeReceipt.retried !== null ? `- Retried: ${smokeReceipt.retried}` : '',
    ...smokeReceipt.issues.map((issue) => `- Issue: ${issue}`),
    ...smokeReceipt.warnings.map((warning) => `- Warning: ${warning}`),
    '',
    '## Local Worker File Claim Receipt',
    '',
    localFileClaimReceipt.exists
      ? `- Status: ${localFileClaimReceipt.status}`
      : '- Status: missing',
    localFileClaimReceipt.generatedAt ? `- Generated: ${localFileClaimReceipt.generatedAt}` : '',
    localFileClaimReceipt.claimStatus ? `- Claim status: ${localFileClaimReceipt.claimStatus}` : '',
    localFileClaimReceipt.jobStatus ? `- Job status: ${localFileClaimReceipt.jobStatus}` : '',
    localFileClaimReceipt.fileClaimSucceeded !== null ? `- File claim succeeded: ${localFileClaimReceipt.fileClaimSucceeded}` : '',
    localFileClaimReceipt.claimFiledInShadowMode !== null ? `- Shadow claim filed: ${localFileClaimReceipt.claimFiledInShadowMode ? 'yes' : 'no'}` : '',
    localFileClaimReceipt.attestationCaptured !== null ? `- Attestation captured: ${localFileClaimReceipt.attestationCaptured ? 'yes' : 'no'}` : '',
    localFileClaimReceipt.launchProofUsable !== null ? `- Hosted launch proof usable: ${localFileClaimReceipt.launchProofUsable ? 'yes' : 'no'}` : '',
    '- Boundary: this local receipt proves the file_claim worker code path in shadow mode, but hosted launch still requires the same proof against hosted storage.',
    '',
    '## Hosted Worker File Claim Seed',
    '',
    workerFileClaimSeed.exists
      ? `- Status: ${workerFileClaimSeed.status}`
      : '- Status: missing',
    workerFileClaimSeed.generatedAt ? `- Generated: ${workerFileClaimSeed.generatedAt}` : '',
    workerFileClaimSeed.mode ? `- Mode: ${workerFileClaimSeed.mode}` : '',
    workerFileClaimSeed.jobType ? `- Job type: ${workerFileClaimSeed.jobType}` : '',
    workerFileClaimSeed.jobStatus ? `- Job status: ${workerFileClaimSeed.jobStatus}` : '',
    workerFileClaimSeed.claimId !== null ? `- Claim id: ${workerFileClaimSeed.claimId}` : '',
    workerFileClaimSeed.jobId !== null ? `- Job id: ${workerFileClaimSeed.jobId}` : '',
    '- Boundary: this seed is only the due hosted job setup; launch proof still requires worker-smoke-receipt.json to show file_claim succeeded > 0 against the same hosted database.',
    '',
    'Record non-secret receipt after worker smoke:',
    '',
    ...packet.commands.recordNonSecretReceipt.map((command) => `- \`${command}\``),
    '',
    '## Operational Boundary',
    '',
    `- Web request role: ${packet.operationalBoundary.webRequestRole}`,
    `- Worker role: ${packet.operationalBoundary.workerRole}`,
    `- Launch rule: ${packet.operationalBoundary.launchRule}`,
    '',
    '## Source Evidence',
    '',
    ...packet.sourceEvidence.map((item) => `- ${item.path}: ${item.exists ? `present, ${item.bytes} bytes` : 'missing'}`),
    '',
    'No secret values were printed.',
    '',
  ].filter(Boolean).join('\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[worker-runtime-packet] wrote non-secret worker runtime packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Worker runtime ready: ${workerRuntimeReady ? 'yes' : 'no'}`);
  console.log('No secret values were printed.');
}

main().catch((error) => {
  console.error('[worker-runtime-packet] failed');
  console.error(error);
  process.exit(1);
});
