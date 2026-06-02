import {
  billingSyncSetupCommands,
  hostedDatabaseSetupCommands,
  hostedEnvironmentSetupCommands,
  netlifyProjectSetupReceiptCommands,
  previewSmokeCommands,
} from './hosted-remediation';
import type { LaunchCriticalPathItem } from './launch-handoff';

type LaunchActionPlanMeta = {
  objective: string;
  clientImpact: string;
  executionBoundary: string;
  requiredInputs: string[];
  proofArtifacts: string[];
  commands: string[];
};

export type LaunchActionPlanStep = {
  key: LaunchCriticalPathItem['key'];
  order: number;
  label: string;
  owner: LaunchCriticalPathItem['owner'];
  status: LaunchCriticalPathItem['status'];
  blockerCount: number;
  objective: string;
  clientImpact: string;
  executionBoundary: string;
  requiredInputs: string[];
  proofNeeded: string;
  nextAction: string;
  proofArtifacts: string[];
  commands: string[];
  blockers: LaunchCriticalPathItem['blockers'];
};

export type LaunchActionPlanSummary = {
  totalSteps: number;
  blockedSteps: number;
  confirmedSteps: number;
  nextStep: LaunchActionPlanStep | null;
};

export type LaunchCommandQueueItem = {
  command: string;
  sourceStepKey: LaunchActionPlanStep['key'];
  sourceStepLabel: string;
  owner: LaunchActionPlanStep['owner'];
  reason: string;
};

export type LaunchCommandQueue = {
  localNow: LaunchCommandQueueItem[];
  externalRequired: LaunchCommandQueueItem[];
  note: string;
};

const actionPlanMeta: Record<LaunchCriticalPathItem['key'], LaunchActionPlanMeta> = {
  'local-tooling': {
    objective: 'Confirm the operator machine has the local CLI/runtime tools needed for launch verification.',
    clientImpact: 'Without local deployment tooling, ClaimBot cannot generate repeatable local and hosted-readiness evidence.',
    executionBoundary: 'Codex can run local checks and packet exports; account login, hosted env values, and deployed-preview proof are tracked as separate operator/deployment gates.',
    requiredInputs: ['Netlify CLI installed', 'Local verification packet passing', 'Confirmed ClaimBot project/site target'],
    proofArtifacts: ['data/local-verification-packet.md', 'data/netlify-launch-doctor.md', 'data/launch-handoff-report.md'],
    commands: ['npm run local:verify', 'npm run netlify:doctor', 'npm run launch:handoff'],
  },
  'operator-account': {
    objective: 'Stage the support mailbox, scraper contact identity, security posture, and linked Netlify project.',
    clientImpact: 'Clients need a monitored support path and hosted requests need a clear contact identity before preview invites.',
    executionBoundary: 'Operator-owned external setup. Codex can generate packets and validators, but the real support mailbox, contact URL, and Netlify site choice must come from the business owner.',
    requiredInputs: ['Monitored support email address', 'Public contact URL for scraper identity', 'Confirmed dedicated ClaimBot Netlify site', 'Invite-only Identity settings decision'],
    proofArtifacts: ['data/operator-setup-packet.md', 'data/automation-safety-packet.md', 'data/audit-privacy-packet.md', 'data/netlify-launch-doctor.md', 'data/launch-handoff-report.md'],
    commands: [
      'npm run automation:safety:packet',
      'npm run audit:privacy:packet',
      ...hostedEnvironmentSetupCommands,
      'npm run netlify:doctor',
      'npm run launch:handoff',
    ],
  },
  'automation-worker': {
    objective: 'Prove paid automation has a runtime that processes file_claim jobs after the web app queues them.',
    clientImpact: 'Paid users should not see a full-automation promise if claim jobs only sit pending after checkout or queue release.',
    executionBoundary: 'Hosted runtime setup. Codex can provide the worker entrypoints and receipts, but the operator must deploy the persistent worker or scheduler with the same hosted database credentials.',
    requiredInputs: ['Hosted DATABASE_URL and database auth token', 'Deployed preview SMOKE_BASE_URL or explicit smoke form URL', 'Persistent worker host or trusted scheduler', 'Worker smoke showing due jobs are processed automatically', 'Saved worker smoke receipt from the same hosted worker run'],
    proofArtifacts: ['.github/workflows/claimbot-worker.yml', 'worker/job-poller.ts', 'worker/run-once.ts', 'src/app/smoke/claim-form/page.tsx', 'data/worker-file-claim-smoke-seed.json', 'data/worker-smoke-receipt.json', 'data/worker-runtime-packet.md', 'data/operator-setup-packet.md', 'data/launch-handoff-report.md'],
    commands: [
      '# After SMOKE_BASE_URL points at the deployed preview and hosted DATABASE_URL/auth values are loaded:',
      'CLAIMBOT_WORKER_SMOKE_SEED=allow npm run worker:file-claim:seed',
      'npm run worker:once',
      'npm run worker:packet',
      '# Deploy npm run worker on a persistent worker host that shares hosted DATABASE_URL.',
      '# Or configure .github/workflows/claimbot-worker.yml with hosted database secrets and run the scheduled worker workflow.',
      'npm run worker:github:doctor',
      'gh variable set SMOKE_BASE_URL --body "https://your-preview.netlify.app"',
      'gh workflow run claimbot-worker.yml -f limit=3 -f seed_smoke_job=true',
      '# Preserve the claimbot-worker-file-claim-smoke-seed, claimbot-worker-smoke-receipt, and claimbot-worker-runtime-packet artifacts from the workflow run.',
      'netlify env:set CLAIMBOT_WORKER_RUNTIME "scheduled-worker" --context production deploy-preview',
      'netlify env:set CLAIMBOT_WORKER_RUNTIME_RECEIPT "verified" --context production deploy-preview',
      'npm run operator:packet',
      'npm run launch:handoff',
    ],
  },
  'hosted-database': {
    objective: 'Connect ClaimBot to persistent hosted storage and prove schema/source import readiness.',
    clientImpact: 'Client accounts, matches, claims, audit events, and source data cannot rely on local file storage.',
    executionBoundary: 'External infrastructure setup. Codex can run migrations and import checks after credentials exist, but the hosted database and secret values must be created by the operator.',
    requiredInputs: ['Hosted DATABASE_URL', 'Database auth token when required by the provider', 'Permission to run migrations against the hosted database', 'Approved source catalog import target'],
    proofArtifacts: ['data/hosted-database-packet.md', 'data/source-readiness-packet.md', 'data/source-catalog-export.json.sha256', 'data/launch-handoff-report.md'],
    commands: [
      'npm run source:packet',
      ...hostedDatabaseSetupCommands,
      'npm run launch:handoff',
    ],
  },
  'matcher-proof': {
    objective: 'Record a fresh account-scoped matcher receipt with zero run errors.',
    clientImpact: 'Client-facing matches should not be treated as preview evidence until the account support packet proves the latest matcher run.',
    executionBoundary: 'Codex-local after source data is ready. This can be run from the repo, but each real client account still needs its own matcher receipt.',
    requiredInputs: ['Current account id', 'Imported settlement source catalog', 'Saved profile facts for the account', 'Zero-error matcher run receipt'],
    proofArtifacts: ['audit:MATCHER_RUN_COMPLETED', 'data/launch-handoff-report.md'],
    commands: [
      'npm run matcher:receipt',
      'npm run launch:handoff',
      'npm run client:checklist',
    ],
  },
  'netlify-identity-proof': {
    objective: 'Record Netlify Identity as enabled with invite-only registration and email confirmation.',
    clientImpact: 'Protected client routes should not be exposed until the deployed auth provider is proved.',
    executionBoundary: 'Netlify dashboard action. Codex can record the non-secret receipt after you confirm the settings, but it cannot truthfully enable or verify dashboard-only settings without that external action.',
    requiredInputs: ['Netlify Identity enabled on the ClaimBot site', 'Invite-only registration confirmed', 'Email confirmation confirmed', 'Safe env keys reviewed in Netlify'],
    proofArtifacts: ['data/netlify-project-setup-receipt.json', 'data/operator-setup-packet.md', 'data/launch-handoff-report.md'],
    commands: [
      ...netlifyProjectSetupReceiptCommands,
      'npm run operator:packet',
    ],
  },
  'business-billing': {
    objective: 'Configure processor-hosted Plus and Pro checkout links plus signed entitlement sync.',
    clientImpact: 'Paid automation cannot be sold until checkout and plan entitlement updates are verifiable.',
    executionBoundary: 'Business/payment-processor setup. Codex can wire and validate the ClaimBot endpoints, but the real checkout links and processor webhook settings must be created in the billing provider.',
    requiredInputs: ['Processor-hosted Plus checkout URL', 'Processor-hosted Pro checkout URL', 'Billing sync secret or Stripe webhook endpoint secret', 'Processor metadata mapping for claimbotUserId or clientReferenceId'],
    proofArtifacts: ['data/billing-activation-packet.md', 'data/launch-handoff-report.md'],
    commands: [
      ...billingSyncSetupCommands,
      'npm run billing:packet',
      'npm run launch:handoff',
    ],
  },
  'legal-review': {
    objective: 'Complete legal/compliance review for Terms, Privacy, trust copy, pricing, proof handling, and filing posture.',
    clientImpact: 'The product should not invite clients until the legal boundary and paid automation claims are reviewed.',
    executionBoundary: 'Human legal/compliance review. Codex can prepare packets and copy, but only a qualified reviewer or business owner can set CLAIMBOT_LEGAL_REVIEW_ACK=reviewed.',
    requiredInputs: ['Reviewer-approved Terms and Privacy pages', 'Reviewed trust/compliance copy', 'Reviewed pricing and paid automation claims', 'Approval to set CLAIMBOT_LEGAL_REVIEW_ACK=reviewed'],
    proofArtifacts: ['data/legal-review-packet.md', 'data/audit-privacy-packet.md', 'data/launch-handoff-report.md'],
    commands: [
      'npm run audit:privacy:packet',
      'npm run legal:packet',
      'npm run validate:legal',
      '# After legal/compliance review is complete:',
      'netlify env:set CLAIMBOT_LEGAL_REVIEW_ACK "reviewed" --context production deploy-preview',
      'npm run launch:handoff',
    ],
  },
  'pwa-readiness': {
    objective: 'Prove the installable app shell, manifest, offline boundary, and hosted PWA headers.',
    clientImpact: 'The PWA should install cleanly without caching private claim data in the offline shell.',
    executionBoundary: 'Mostly Codex-local until deployed. Codex can maintain files and local validators; hosted header proof still depends on the deployed Netlify target.',
    requiredInputs: ['Reviewed app name and install metadata', 'Offline safety-shell approval', 'Hosted URL for header validation'],
    proofArtifacts: ['data/pwa-readiness-packet.md', 'data/responsive-readiness-packet.md', 'public/manifest.webmanifest', 'public/offline.html', 'public/sw.js', 'data/launch-handoff-report.md'],
    commands: ['npm run validate:pwa', 'npm run pwa:packet', 'npm run responsive:packet', 'npm run launch:handoff'],
  },
  'deployed-preview': {
    objective: 'Deploy an HTTPS Netlify preview for the confirmed ClaimBot site and point smoke tests at it.',
    clientImpact: 'Client review needs to happen against the real hosted target, not only localhost.',
    executionBoundary: 'Deployment-operator action. Codex can run deploy and smoke commands when Netlify is linked and authenticated, but the target site and env values must be operator-approved.',
    requiredInputs: ['Confirmed Netlify site slug or dashboard URL', 'HTTPS deployed preview URL', 'SMOKE_BASE_URL pointed at that preview', 'Deployed session and billing smoke secrets'],
    proofArtifacts: ['data/deployability-packet.md', 'data/local-verification-packet.md', 'data/preview-promotion-packet.md', 'data/launch-handoff-report.md'],
    commands: [
      'npm run deploy:packet',
      'npm run local:verify',
      'netlify deploy',
      'npm run preview:packet',
      ...previewSmokeCommands,
      'npm run validate:netlify:strict',
      'npm run launch:handoff',
    ],
  },
  'promotion-receipt': {
    objective: 'Run the deployed-preview promotion gate and preserve the production promotion receipt.',
    clientImpact: 'Production deploys need a fresh receipt proving the exact preview target passed the required checks.',
    executionBoundary: 'Codex can run the gate after a deployed preview exists. Production promotion still requires the operator to use the same confirmed target and preserve the receipt.',
    requiredInputs: ['Fresh deployed preview URL', 'Matching confirmed Netlify site slug', 'Passing preview gate output', 'Saved data/preview-promotion-receipt.json'],
    proofArtifacts: ['data/preview-promotion-receipt.json', 'data/preview-promotion-packet.md', 'data/launch-handoff-report.md'],
    commands: [
      'npm run preview:gate',
      'npm run preview:packet',
      'npm run production:check-receipt',
      'npm run launch:handoff',
    ],
  },
  uncategorized: {
    objective: 'Resolve any blocker that does not yet map to a known launch owner.',
    clientImpact: 'Uncategorized launch evidence should be clarified before a client handoff.',
    executionBoundary: 'Needs triage. Treat this as unresolved until the blocker has an owner, proof artifact, and command path.',
    requiredInputs: ['Named owner for the blocker', 'Specific proof artifact', 'Repeatable validation command'],
    proofArtifacts: ['data/launch-handoff-report.md'],
    commands: ['npm run launch:handoff'],
  },
  ready: {
    objective: 'Keep the final preview receipt fresh and move to production promotion.',
    clientImpact: 'All launch evidence is recorded; the remaining work is preserving the proof chain during production deploy.',
    executionBoundary: 'Operator promotion step. Codex can validate the receipt; production deploy should only proceed against the reviewed Netlify site.',
    requiredInputs: ['Reviewed production deploy target', 'Fresh production receipt check', 'Operator approval to promote'],
    proofArtifacts: ['data/preview-promotion-receipt.json', 'data/launch-handoff-report.md'],
    commands: ['npm run production:check-receipt', 'netlify deploy --prod'],
  },
};

export function buildLaunchActionPlan(criticalPath: LaunchCriticalPathItem[]): LaunchActionPlanStep[] {
  return criticalPath.map((item, index) => {
    const meta = actionPlanMeta[item.key] ?? actionPlanMeta.uncategorized;

    return {
      key: item.key,
      order: index + 1,
      label: item.label,
      owner: item.owner,
      status: item.status,
      blockerCount: item.blockerCount,
      objective: meta.objective,
      clientImpact: meta.clientImpact,
      executionBoundary: meta.executionBoundary,
      requiredInputs: meta.requiredInputs,
      proofNeeded: item.proofNeeded,
      nextAction: item.nextAction,
      proofArtifacts: meta.proofArtifacts,
      commands: meta.commands,
      blockers: item.blockers,
    };
  });
}

export function summarizeLaunchActionPlan(steps: LaunchActionPlanStep[]): LaunchActionPlanSummary {
  const blockedSteps = steps.filter((step) => step.status !== 'confirmed').length;

  return {
    totalSteps: steps.length,
    blockedSteps,
    confirmedSteps: steps.length - blockedSteps,
    nextStep: steps.find((step) => step.status !== 'confirmed') ?? null,
  };
}

function commandRequiresExternalInput(command: string, step?: LaunchActionPlanStep) {
  const normalized = command.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.startsWith('#')) return true;
  if (normalized.startsWith('$env:')) return true;
  if (normalized.startsWith('gh workflow run')) return true;
  if (normalized.startsWith('gh variable set')) return true;
  if (normalized.includes('paste_') || normalized.includes('your_')) return true;
  if (normalized.includes('netlify login')) return true;
  if (normalized.includes('netlify deploy')) return true;
  if (normalized.includes('netlify env:set')) return true;
  if (normalized.includes('netlify link')) return true;
  if (normalized.includes('netlify:record-setup')) return true;
  if (normalized.includes('hosted:env:push')) return true;
  if (normalized.includes('hosted:db:push')) return true;
  if (normalized.includes('launch:push-secrets')) return true;
  if (normalized.includes('preview:gate')) return true;
  if (normalized.includes('production:check-receipt')) return true;
  if (step?.key === 'automation-worker' && normalized.includes('worker:file-claim:seed')) return true;
  if (step?.key === 'automation-worker' && normalized === 'npm run worker:once') return true;
  return false;
}

function commandQueueReason(command: string, step: LaunchActionPlanStep) {
  if (commandRequiresExternalInput(command, step)) {
    return `Requires ${step.owner} input before it can prove ${step.label}.`;
  }
  return `Safe local evidence command for ${step.label}; does not print secrets.`;
}

export function buildLaunchCommandQueue(steps: LaunchActionPlanStep[]): LaunchCommandQueue {
  const localNow: LaunchCommandQueueItem[] = [];
  const externalRequired: LaunchCommandQueueItem[] = [];
  const seen = new Set<string>();

  for (const step of steps) {
    for (const command of step.commands) {
      const trimmed = command.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);

      const item = {
        command: trimmed,
        sourceStepKey: step.key,
        sourceStepLabel: step.label,
        owner: step.owner,
        reason: commandQueueReason(trimmed, step),
      };

      if (commandRequiresExternalInput(trimmed, step)) {
        externalRequired.push(item);
      } else {
        localNow.push(item);
      }
    }
  }

  return {
    localNow,
    externalRequired,
    note: 'The command queue separates non-secret local evidence commands from commands that require account, billing, legal, hosted database, or deployed-preview input.',
  };
}

export function markdownLaunchActionPlan(steps: LaunchActionPlanStep[]) {
  if (steps.length === 0) {
    return ['## Launch Action Plan', '', '- No launch steps recorded.', ''];
  }

  const commandQueue = buildLaunchCommandQueue(steps);

  return [
    '## Launch Action Plan',
    '',
    ...steps.flatMap((step) => [
      `${step.order}. ${step.label}: ${step.status === 'confirmed' ? 'clear' : `${step.blockerCount} blocker${step.blockerCount === 1 ? '' : 's'}`}`,
      `   Owner: ${step.owner}`,
      `   Objective: ${step.objective}`,
      `   Client impact: ${step.clientImpact}`,
      `   Execution boundary: ${step.executionBoundary}`,
      `   Required inputs: ${step.requiredInputs.join(', ')}`,
      `   Proof needed: ${step.proofNeeded}`,
      `   First action: ${step.nextAction}`,
      `   Proof artifacts: ${step.proofArtifacts.join(', ')}`,
      ...step.commands.slice(0, 6).map((command) => `   - \`${command}\``),
      ...(step.commands.length > 6 ? [`   - +${step.commands.length - 6} more commands in the JSON report`] : []),
    ]),
    '',
    '## Operator Command Queue',
    '',
    `Boundary: ${commandQueue.note}`,
    '',
    'Local commands available now:',
    ...(commandQueue.localNow.length === 0
      ? ['- None']
      : commandQueue.localNow.slice(0, 12).map((item) => `- \`${item.command}\` (${item.sourceStepLabel})`)),
    ...(commandQueue.localNow.length > 12 ? [`- +${commandQueue.localNow.length - 12} more local commands in JSON`] : []),
    '',
    'Commands waiting on external input:',
    ...(commandQueue.externalRequired.length === 0
      ? ['- None']
      : commandQueue.externalRequired.slice(0, 12).map((item) => `- \`${item.command}\` (${item.sourceStepLabel})`)),
    ...(commandQueue.externalRequired.length > 12 ? [`- +${commandQueue.externalRequired.length - 12} more external-input commands in JSON`] : []),
    '',
  ];
}
