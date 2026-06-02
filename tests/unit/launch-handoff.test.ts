import { describe, expect, it } from 'vitest';
import { buildLaunchActionPlan, buildLaunchCommandQueue, summarizeLaunchActionPlan } from '../../src/lib/launch-action-plan';
import {
  getLaunchCriticalPath,
  getLaunchExternalBlockerSummary,
  getLaunchHandoffChecklist,
  getMatcherReceiptCriticalPathBlockers,
} from '../../src/lib/launch-handoff';
import { previewSmokeCommands, verificationCommands } from '../../src/lib/launch-readiness';

const safeFlags = [
  { key: 'CLAIMBOT_FEATURE_LIVE_FILING', enabled: false },
  { key: 'CLAIMBOT_FEATURE_SETTLEMENT_SEARCH', enabled: true },
];

describe('getLaunchHandoffChecklist', () => {
  it('confirms the client handoff gates for a shadow launch with source coverage', () => {
    const checklist = getLaunchHandoffChecklist({
      mode: 'shadow',
      readinessOk: true,
      sourceCatalogReady: true,
      formCoverage: 72,
      pwaReady: true,
      matcherReceiptReady: true,
      matcherReceiptErrorCount: 0,
      featureFlags: safeFlags,
    });

    expect(checklist).toHaveLength(9);
    expect(checklist.every((item) => item.status === 'confirmed')).toBe(true);
    expect(checklist.map((item) => item.label)).toContain('Shadow-mode first launch');
    expect(checklist.map((item) => item.label)).toContain('Proof-required review');
    expect(checklist.map((item) => item.label)).toContain('User Terms acknowledgement gate');
    expect(checklist.map((item) => item.label)).toContain('Matcher refresh receipt');
    expect(checklist.map((item) => item.label)).toContain('PWA install safety');
    expect(checklist.map((item) => item.label)).toContain('Audit exports available');
  });

  it('marks risky client invite states for review', () => {
    const checklist = getLaunchHandoffChecklist({
      mode: 'live',
      readinessOk: false,
      sourceCatalogReady: false,
      formCoverage: 0,
      pwaReady: false,
      matcherReceiptReady: false,
      matcherReceiptErrorCount: null,
      featureFlags: [
        { key: 'CLAIMBOT_FEATURE_LIVE_FILING', enabled: true },
        { key: 'CLAIMBOT_FEATURE_SETTLEMENT_SEARCH', enabled: false },
      ],
    });

    const reviewItems = checklist.filter((item) => item.status === 'needs-review');
    expect(reviewItems.map((item) => item.key)).toEqual([
      'shadow-first',
      'source-coverage',
      'matcher-refresh-receipt',
      'pwa-install-shell',
      'hosted-verification',
    ]);
    expect(reviewItems.every((item) => item.action)).toBe(true);
  });

  it('uses the local smoke orchestrator for launch verification commands', () => {
    expect(verificationCommands).toContain('npm run hosted:env:prepare');
    expect(verificationCommands).toContain('npm run hosted:env:doctor');
    expect(verificationCommands).toContain('npm run hosted:db:packet');
    expect(verificationCommands).toContain('npm run operator:packet');
    expect(verificationCommands).toContain('npm run db:migrate');
    expect(verificationCommands).toContain('npm run validate:schema');
    expect(verificationCommands).toContain('npm run legal:packet');
    expect(verificationCommands).toContain('npm run billing:packet');
    expect(verificationCommands).toContain('npm run matcher:receipt');
    expect(verificationCommands).toContain('npm run preview:packet');
    expect(verificationCommands).toContain('npm run smoke:hosted:local');
    expect(verificationCommands).not.toContain('npm run smoke:web');
    expect(verificationCommands).not.toContain('npm run smoke:auth');
    expect(verificationCommands).not.toContain('npm run smoke:features');
  });

  it('keeps individual smokes for deployed preview promotion evidence', () => {
    expect(previewSmokeCommands).toContain('npm run smoke:web');
    expect(previewSmokeCommands).toContain('npm run smoke:auth');
    expect(previewSmokeCommands).toContain('npm run smoke:features');
  });

  it('groups launch blockers by the real external owner', () => {
    const summary = getLaunchExternalBlockerSummary([
      {
        key: 'database',
        label: 'Persistent database',
        status: 'fail',
        detail: 'DATABASE_URL is required.',
        action: 'Configure DATABASE_URL',
      },
      {
        key: 'paid-billing',
        label: 'Paid billing gates',
        status: 'fail',
        detail: 'Checkout URLs are missing.',
      },
      {
        key: 'support-contact',
        label: 'Support contact',
        status: 'fail',
        detail: 'Support email is missing.',
      },
      {
        key: 'netlify-auth',
        label: 'Netlify authentication',
        status: 'fail',
        detail: 'Netlify CLI is not authenticated.',
      },
      {
        key: 'legal-review',
        label: 'Legal/compliance review',
        status: 'fail',
        detail: 'Review acknowledgment is missing.',
      },
      {
        key: 'preview-promotion-receipt',
        label: 'Preview promotion receipt',
        status: 'fail',
        detail: 'Receipt is missing.',
      },
    ]);

    expect(summary.map((item) => item.category)).toEqual([
      'hosted-database',
      'business-billing',
      'operator-account',
      'legal-review',
      'promotion-receipt',
    ]);
    expect(summary.find((item) => item.category === 'business-billing')?.owner).toBe('business');
    expect(summary.find((item) => item.category === 'business-billing')?.proofNeeded).toContain('data/billing-activation-packet.md');
    expect(summary.find((item) => item.category === 'operator-account')?.proofNeeded).toContain('data/operator-setup-packet.md');
    expect(summary.find((item) => item.category === 'operator-account')?.blockers.map((item) => item.key)).toEqual([
      'support-contact',
      'netlify-auth',
    ]);
    expect(summary.find((item) => item.category === 'hosted-database')?.proofNeeded).toContain('data/hosted-database-packet.md');
    expect(summary.find((item) => item.category === 'hosted-database')?.nextAction).toBe('Configure DATABASE_URL');
    expect(summary.find((item) => item.category === 'legal-review')?.owner).toBe('legal');
    expect(summary.find((item) => item.category === 'promotion-receipt')?.proofNeeded).toContain('data/preview-promotion-packet.md');
  });

  it('classifies source quality and Netlify build evidence into launch-owner buckets', () => {
    const summary = getLaunchExternalBlockerSummary([
      {
        key: 'deadline-coverage',
        label: 'Deadline coverage',
        status: 'warn',
        detail: 'Deadline coverage needs review.',
      },
      {
        key: 'offline-shell',
        label: 'Offline safety shell',
        status: 'fail',
        detail: 'Offline page is missing.',
      },
      {
        key: 'netlify-build-config',
        label: 'Netlify build config',
        status: 'fail',
        detail: 'Build config is missing.',
      },
      {
        key: 'promotion-scripts',
        label: 'Promotion scripts',
        status: 'fail',
        detail: 'Promotion scripts are missing.',
      },
    ]);

    expect(summary.map((item) => item.category)).toEqual([
      'hosted-database',
      'pwa-readiness',
      'deployed-preview',
    ]);
    expect(summary.find((item) => item.category === 'pwa-readiness')?.proofNeeded).toContain('validate:pwa');
    expect(summary.find((item) => item.category === 'deployed-preview')?.blockers.map((item) => item.key)).toEqual([
      'netlify-build-config',
      'promotion-scripts',
    ]);
  });

  it('promotes missing or errored matcher receipts into the launch critical path', () => {
    expect(getMatcherReceiptCriticalPathBlockers({ exists: true, errorCount: 0 })).toEqual([]);

    const missingReceiptBlockers = getMatcherReceiptCriticalPathBlockers({ exists: false, errorCount: null });
    expect(missingReceiptBlockers).toEqual([
      expect.objectContaining({
        key: 'matcher-refresh-receipt',
        label: 'Matcher refresh receipt',
        status: 'fail',
      }),
    ]);

    const criticalPath = getLaunchCriticalPath(missingReceiptBlockers, {
      netlifyIdentityReady: true,
    });
    expect(criticalPath).toEqual([
      expect.objectContaining({
        key: 'matcher-proof',
        label: 'Matcher refresh receipt',
        owner: 'operator',
        blockerCount: 1,
      }),
    ]);
  });

  it('orders the launch critical path and includes Netlify Identity proof warnings', () => {
    const criticalPath = getLaunchCriticalPath([
      {
        key: 'preview-promotion-receipt',
        label: 'Preview promotion receipt',
        status: 'fail',
        detail: 'Receipt is missing.',
      },
      {
        key: 'database',
        label: 'Persistent database',
        status: 'fail',
        detail: 'DATABASE_URL is required.',
      },
      {
        key: 'paid-billing',
        label: 'Paid billing gates',
        status: 'fail',
        detail: 'Checkout URLs are missing.',
      },
    ], {
      netlifyIdentityReady: false,
    });

    expect(criticalPath.map((item) => item.key)).toEqual([
      'hosted-database',
      'business-billing',
      'netlify-identity-proof',
      'promotion-receipt',
    ]);
    const identityStep = criticalPath.find((item) => item.key === 'netlify-identity-proof');
    expect(identityStep?.proofNeeded).toContain('invite-only');
    expect(identityStep?.blockers).toEqual([
      expect.objectContaining({
        key: 'netlify-identity-proof',
        label: 'Netlify Identity proof',
        action: expect.stringContaining('netlify:record-setup'),
      }),
    ]);
    expect(criticalPath.every((item) => item.status === 'blocked')).toBe(true);
  });

  it('returns a confirmed critical-path row when external blockers and identity proof are clear', () => {
    const criticalPath = getLaunchCriticalPath([], {
      netlifyIdentityReady: true,
    });

    expect(criticalPath).toHaveLength(1);
    expect(criticalPath[0]).toMatchObject({
      key: 'ready',
      status: 'confirmed',
      blockerCount: 0,
    });
  });

  it('builds an operator launch action plan with required inputs, proof artifacts, and commands', () => {
    const criticalPath = getLaunchCriticalPath([
      {
        key: 'support-contact',
        label: 'Support contact',
        status: 'fail',
        detail: 'Support email is missing.',
      },
      {
        key: 'matcher-refresh-receipt',
        label: 'Matcher refresh receipt',
        status: 'fail',
        detail: 'Matcher receipt is missing.',
      },
      {
        key: 'database',
        label: 'Persistent database',
        status: 'fail',
        detail: 'DATABASE_URL is required.',
      },
      {
        key: 'preview-promotion-receipt',
        label: 'Preview promotion receipt',
        status: 'fail',
        detail: 'Receipt is missing.',
      },
    ], {
      netlifyIdentityReady: false,
    });

    const plan = buildLaunchActionPlan(criticalPath);
    const summary = summarizeLaunchActionPlan(plan);

    expect(summary).toMatchObject({
      totalSteps: 5,
      blockedSteps: 5,
      confirmedSteps: 0,
    });
    expect(summary.nextStep?.key).toBe('operator-account');
    expect(plan.find((step) => step.key === 'operator-account')?.proofArtifacts).toContain('data/operator-setup-packet.md');
    expect(plan.find((step) => step.key === 'operator-account')?.executionBoundary).toContain('Operator-owned external setup');
    expect(plan.find((step) => step.key === 'operator-account')?.requiredInputs).toContain('Monitored support email address');
    expect(plan.find((step) => step.key === 'hosted-database')?.commands).toContain('npm run hosted:db:packet');
    expect(plan.find((step) => step.key === 'hosted-database')?.executionBoundary).toContain('External infrastructure setup');
    expect(plan.find((step) => step.key === 'hosted-database')?.requiredInputs).toContain('Hosted DATABASE_URL');
    expect(plan.find((step) => step.key === 'matcher-proof')?.commands).toContain('npm run matcher:receipt');
    expect(plan.find((step) => step.key === 'netlify-identity-proof')?.commands).toContain('npm run netlify:record-setup -- --identity-enabled --registration invite-only --email-confirmation --safe-env-confirmed --evidence "Identity enabled, invite-only registration, and email confirmation confirmed in Netlify dashboard."');
    expect(plan.find((step) => step.key === 'promotion-receipt')?.proofArtifacts).toContain('data/preview-promotion-receipt.json');
  });

  it('separates local evidence commands from external account commands', () => {
    const criticalPath = getLaunchCriticalPath([
      {
        key: 'automation-worker-runtime',
        label: 'Automation worker runtime',
        status: 'fail',
        detail: 'Worker runtime proof is missing.',
      },
      {
        key: 'support-contact',
        label: 'Support contact',
        status: 'fail',
        detail: 'Support email is missing.',
      },
      {
        key: 'preview-promotion-receipt',
        label: 'Preview promotion receipt',
        status: 'fail',
        detail: 'Receipt is missing.',
      },
    ], {
      netlifyIdentityReady: false,
    });

    const queue = buildLaunchCommandQueue(buildLaunchActionPlan(criticalPath));

    expect(queue.localNow.map((item) => item.command)).toContain('npm run operator:packet');
    expect(queue.localNow.map((item) => item.command)).toContain('npm run worker:packet');
    expect(queue.localNow.map((item) => item.command)).toContain('npm run launch:handoff');
    expect(queue.externalRequired.map((item) => item.command)).toContain('npm run netlify:record-setup -- --identity-enabled --registration invite-only --email-confirmation --safe-env-confirmed --evidence "Identity enabled, invite-only registration, and email confirmation confirmed in Netlify dashboard."');
    expect(queue.externalRequired.map((item) => item.command)).toContain('npm run preview:gate');
    expect(queue.externalRequired.map((item) => item.command)).toContain('CLAIMBOT_WORKER_SMOKE_SEED=allow npm run worker:file-claim:seed');
    expect(queue.externalRequired.map((item) => item.command)).toContain('npm run worker:once');
    expect(queue.externalRequired.map((item) => item.command)).toContain('gh variable set SMOKE_BASE_URL --body "https://your-preview.netlify.app"');
    expect(queue.externalRequired.map((item) => item.command)).toContain('gh workflow run claimbot-worker.yml -f limit=3 -f seed_smoke_job=true');
    expect(queue.localNow.map((item) => item.command)).not.toContain('gh workflow run claimbot-worker.yml -f limit=3 -f seed_smoke_job=true');
    expect(queue.externalRequired.every((item) => item.reason.includes('Requires'))).toBe(true);
  });
});
