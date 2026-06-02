import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalJson, sha256Digest } from '../../src/lib/audit/claim-export';
import { buildAuditCheckpoint, buildLaunchEvidence } from '../../src/lib/audit/support-packet';
import { NETLIFY_PROJECT_SETUP_RECEIPT_FORMAT, expectedSafeNetlifyEnvKeys } from '../../src/lib/netlify-project-setup-receipt';

const roots: string[] = [];

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-launch-evidence-'));
  roots.push(root);
  return root;
}

function writeNetlifyProjectReceipt(root: string, identityReady = true) {
  const dir = path.join(root, 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'netlify-project-setup-receipt.json'), `${JSON.stringify({
    format: NETLIFY_PROJECT_SETUP_RECEIPT_FORMAT,
    generatedAt: '2026-05-26T18:01:45.000Z',
    siteId: '40fd46c0-14d2-41b2-8538-b918109b7dcb',
    siteName: 'claimbot-app',
    dashboardUrl: 'https://app.netlify.com/projects/claimbot-app',
    configuredSafeEnvKeys: [...expectedSafeNetlifyEnvKeys],
    identity: identityReady
      ? {
        enabled: true,
        registration: 'invite-only',
        emailConfirmation: true,
        verifiedAt: '2026-05-26T18:01:45.000Z',
        evidence: 'Netlify dashboard Identity settings confirmed by operator.',
      }
      : undefined,
  }, null, 2)}\n`);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('claim audit export digest helpers', () => {
  it('canonicalizes object keys before hashing', () => {
    const a = { claim: { id: 1, status: 'QUEUED' }, events: [{ b: 2, a: 1 }] };
    const b = { events: [{ a: 1, b: 2 }], claim: { status: 'QUEUED', id: 1 } };

    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(sha256Digest(a)).toBe(sha256Digest(b));
  });

  it('normalizes dates to stable ISO values', () => {
    const payload = { queuedAt: new Date('2026-05-25T10:00:00.000Z') };

    expect(canonicalJson(payload)).toContain('2026-05-25T10:00:00.000Z');
  });

  it('creates a stable genesis checkpoint for empty audit logs', () => {
    const checkpoint = buildAuditCheckpoint([]);

    expect(checkpoint.short).toMatch(/^chk:genesis-/);
    expect(checkpoint.value).toMatch(/^[a-f0-9]{64}$/);
    expect(checkpoint.eventCount).toBe(0);
  });

  it('changes checkpoint identity when audit events are present', () => {
    const checkpoint = buildAuditCheckpoint([{ id: 1, eventType: 'CLAIM_QUEUED' }]);

    expect(checkpoint.short).toMatch(/^chk:seq-/);
    expect(checkpoint.eventCount).toBe(1);
  });

  it('builds launch evidence without exposing secret values', () => {
    const root = makeTempRoot();
    writeNetlifyProjectReceipt(root);
    const evidence = buildLaunchEvidence({
      root,
      cspEnforced: true,
      env: {
        DATABASE_URL: 'libsql://private-database.turso.io',
        DATABASE_AUTH_TOKEN: 'super-secret-db-token',
        SCRAPER_USER_AGENT: 'ClaimBot/0.1 (+https://example.com/contact)',
        CLAIMBOT_SUPPORT_EMAIL: 'support@example.com',
        CLAIMBOT_SESSION_SECRET: 'a-long-random-session-secret-for-tests',
        CLAIMBOT_DISABLE_AUTH: 'false',
        CLAIMBOT_FEATURE_LIVE_FILING: 'false',
        CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://checkout.example.com/plus',
        CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://checkout.example.com/pro',
        CLAIMBOT_BILLING_SYNC_SECRET: 'a-long-random-billing-sync-secret-for-tests',
        CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
        CLAIMBOT_WORKER_RUNTIME: 'scheduled-worker',
        CLAIMBOT_WORKER_RUNTIME_RECEIPT: 'verified',
      },
      settings: {
        claim_filer_mode: 'shadow',
        claim_filer_max_per_day: '20',
      },
      subscription: {
        plan: 'pro',
        status: 'active',
        automationEnabled: true,
        source: 'database',
      },
      matcherRunReceipt: {
        exists: true,
        auditEventId: 42,
        occurredAt: '2026-05-25T12:00:00.000Z',
        eventType: 'MATCHER_RUN_COMPLETED',
        actor: 'matcher',
        entityType: 'user',
        settlementsProcessed: 12,
        matchesInserted: 4,
        matchesUpdated: 8,
        verdictCounts: { ELIGIBLE: 3, INELIGIBLE: 7, NEEDS_REVIEW: 2 },
        verdictsChanged: 1,
        errorCount: 0,
        requiredForClientReadiness: true,
        note: 'Aggregate matcher receipt for test launch evidence.',
      },
      databaseSchemaReadiness: {
        ok: true,
        failures: [],
        items: [
          {
            key: 'identity-subject-column',
            label: 'Hosted identity subject',
            status: 'pass',
            detail: 'users.external_subject is available for stable hosted account mapping.',
          },
          {
            key: 'billing-event-ledger',
            label: 'Billing event idempotency ledger',
            status: 'pass',
            detail: 'billing_events.event_id is available for signed billing callback replay protection.',
          },
        ],
      },
      sourceCatalogReadiness: {
        ok: true,
        requiredForClientPreview: true,
        sourceQualityRequired: false,
        settlementSearchEnabled: true,
        totalSettlements: 12,
        linkedClaimForms: 9,
        deadlineCount: 7,
        knownAdministratorCount: 4,
        categorizedCount: 10,
        cleanTextCount: 12,
        mojibakeCount: 0,
        sourceProviderCount: 2,
        formCoveragePercent: 75,
        deadlineCoveragePercent: 58,
        knownAdministratorPercent: 33,
        categorizedPercent: 83,
        sourceCatalogReady: true,
        claimFormCoverageReady: true,
        deadlineCoverageReady: true,
        administratorCoverageReady: true,
        categorizationReady: true,
        textEncodingReady: true,
        sourceQualityReady: true,
        lastScraperAuditAt: '2026-05-25T10:00:00.000Z',
        lastScraperAuditEventType: 'SCRAPE_COMPLETED',
        latestSourceImportAt: '2026-05-25T11:00:00.000Z',
        latestSourceImportDigest: 'a'.repeat(64),
        latestSourceImportExportedAt: '2026-05-25T10:30:00.000Z',
        latestSourceImportRecordCount: 12,
        failureCount: 0,
        warningCount: 0,
        items: [
          {
            key: 'source-catalog',
            label: 'Source catalog',
            status: 'pass',
            detail: '12 settlement source records available for matching review.',
          },
          {
            key: 'claim-form-coverage',
            label: 'Claim form coverage',
            status: 'pass',
            detail: '75% of indexed settlement records include claim-form links.',
          },
        ],
      },
    });
    const serialized = JSON.stringify(evidence);

    expect(evidence.format).toBe('claimbot.launch-evidence.v1');
    expect(evidence.readiness.ok).toBe(true);
    expect(evidence.readiness.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'legal-review', status: 'pass' }),
      expect.objectContaining({ key: 'automation-worker-runtime', status: 'pass' }),
    ]));
    expect(evidence.maskedEnvironment).toContainEqual({ key: 'DATABASE_URL', status: 'configured' });
    expect(evidence.identityProvider.operatorSteps.join(' ')).toContain('Enable Netlify Identity');
    expect(evidence.netlifyProjectSetupReceipt).toMatchObject({
      ok: true,
      receiptPath: 'data/netlify-project-setup-receipt.json',
      siteName: 'claimbot-app',
      dashboardUrl: 'https://app.netlify.com/projects/claimbot-app',
      safeEnvKeyCount: expectedSafeNetlifyEnvKeys.length,
      identityReady: true,
      identity: {
        enabled: true,
        registration: 'invite-only',
        emailConfirmation: true,
      },
    });
    expect(evidence.netlifyProjectSetupReceipt.warnings).toEqual([]);
    expect(evidence.netlifyProjectSetupReceipt.receiptPath).not.toContain(root);
    expect(evidence.netlifyPreview).toMatchObject({
      evidenceScope: 'support-packet',
      strict: false,
      smokeBaseUrlHttps: false,
    });
    expect(['missing', 'local-state', 'env']).toContain(evidence.netlifyPreview.siteLinkSource);
    expect(evidence.netlifyPreview.items.find((item) => item.key === 'smoke-base-url')).toMatchObject({
      status: 'warn',
      serverObservable: false,
    });
    expect(evidence.previewPromotionReceipt).toMatchObject({
      receiptPath: 'data/preview-promotion-receipt.json',
      exists: false,
      ok: false,
      failureCount: 5,
    });
    expect(evidence.previewPromotionReceipt.receiptPath).not.toContain(root);
    expect(evidence.previewPromotionReceipt.items[0]).toMatchObject({
      key: 'preview-promotion-receipt',
      serverObservable: false,
    });
    expect(evidence.pwaReadiness).toMatchObject({
      ok: true,
      requiredForClientPreview: true,
      failureCount: 0,
    });
    expect(evidence.pwaReadiness.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'pwa-manifest', status: 'pass' }),
      expect.objectContaining({ key: 'offline-shell', status: 'pass' }),
      expect.objectContaining({ key: 'service-worker-boundary', status: 'pass' }),
    ]));
    expect(evidence.pwaReadiness.note).toContain('does not cache claim data');
    expect(evidence.launchPacketStack.summary).toMatchObject({
      totalCount: expect.any(Number),
      blockedCount: expect.any(Number),
    });
    expect(evidence.launchPacketStack.hostedExportPath).toBe('/api/audit/external-activation-workbook');
    expect(evidence.launchPacketStack.hostedExportPaths).toMatchObject({
      externalActivationWorkbook: '/api/audit/external-activation-workbook',
      clientPreviewChecklist: '/api/audit/client-preview-checklist',
      netlifyLaunchDoctor: '/api/audit/netlify-launch-doctor',
    });
    expect(evidence.launchPacketStack.rows.map((row) => row.path)).toContain('data/external-activation-workbook.md');
    expect(evidence.launchPacketStack.rows.map((row) => row.path)).toContain('data/client-preview-checklist.md');
    expect(evidence.launchPacketStack.rows.map((row) => row.path)).toContain('data/netlify-launch-doctor.md');
    expect(evidence.launchPacketStack.rows.every((row) => typeof row.nextAction === 'string' && row.nextAction.length > 0)).toBe(true);
    expect(evidence.launchPacketStack.blockedNextActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'data/netlify-launch-doctor.md',
        nextAction: expect.stringContaining('rerun the Netlify doctor'),
      }),
    ]));
    expect(evidence.launchPacketStack.externalActivationWorkbook).toMatchObject({
      label: 'External activation workbook',
      path: 'data/external-activation-workbook.md',
    });
    expect(evidence.launchPacketStack.clientPreviewChecklist).toMatchObject({
      label: 'Client preview checklist',
      path: 'data/client-preview-checklist.md',
    });
    expect(evidence.launchPacketStack.netlifyLaunchDoctor).toMatchObject({
      label: 'Netlify launch doctor receipt',
      path: 'data/netlify-launch-doctor.md',
    });
    expect(evidence.launchPacketStack.launchPacketRefreshReport).toMatchObject({
      path: 'data/launch-packet-refresh-report.md',
    });
    expect(evidence.localTooling.launchPacketRefreshReport.path).toBe('data/launch-packet-refresh-report.md');
    expect(evidence.launchPacketStack.netlifyLaunchDoctorExport).toMatchObject({
      format: 'claimbot.netlify-launch-doctor-export.v1',
      artifact: 'data/netlify-launch-doctor.md',
    });
    expect(evidence.launchCriticalPath.map((item) => item.label)).toEqual(expect.arrayContaining([
      'Deployed preview target',
      'Preview promotion receipt',
    ]));
    expect(evidence.launchCriticalPath.find((item) => item.key === 'netlify-identity-proof')).toBeUndefined();
    expect(JSON.stringify(evidence.launchCriticalPath)).not.toContain(root);
    expect(evidence.launchActionPlan.summary).toMatchObject({
      totalSteps: expect.any(Number),
      blockedSteps: expect.any(Number),
    });
    expect(evidence.launchActionPlan.commandQueue.localNow).toEqual(expect.any(Array));
    expect(evidence.launchActionPlan.commandQueue.externalRequired).toEqual(expect.any(Array));
    expect(evidence.launchActionPlan.rows.find((item) => item.key === 'deployed-preview')?.executionBoundary).toContain('Deployment-operator action');
    expect(evidence.launchActionPlan.note).toContain('execution boundaries');
    expect(evidence.ownerHandoffBriefs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        owner: 'deployment',
        blockedWorkstreamCount: expect.any(Number),
        blockedPacketCount: expect.any(Number),
        firstAction: expect.any(String),
      }),
    ]));
    expect(evidence.databaseSchema).toMatchObject({
      ok: true,
      failureCount: 0,
      requiredForHostedLaunch: true,
      remediationCommand: 'npm run db:migrate',
    });
    expect(evidence.databaseSchema.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'identity-subject-column', status: 'pass' }),
      expect.objectContaining({ key: 'billing-event-ledger', status: 'pass' }),
    ]));
    expect(evidence.sourceCatalog).toMatchObject({
      ok: true,
      requiredForClientPreview: true,
      totalSettlements: 12,
      linkedClaimForms: 9,
      formCoveragePercent: 75,
      deadlineCoveragePercent: 58,
      knownAdministratorPercent: 33,
      categorizedPercent: 83,
      cleanTextCount: 12,
      mojibakeCount: 0,
      latestSourceImportDigest: 'a'.repeat(64),
      latestSourceImportRecordCount: 12,
      sourceCatalogReady: true,
      claimFormCoverageReady: true,
      textEncodingReady: true,
      sourceQualityReady: true,
    });
    expect(evidence.sourceCatalog.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'source-catalog', status: 'pass' }),
      expect.objectContaining({ key: 'claim-form-coverage', status: 'pass' }),
    ]));
    expect(evidence.matcherRunReceipt).toMatchObject({
      exists: true,
      auditEventId: 42,
      occurredAt: '2026-05-25T12:00:00.000Z',
      eventType: 'MATCHER_RUN_COMPLETED',
      actor: 'matcher',
      entityType: 'user',
      settlementsProcessed: 12,
      matchesInserted: 4,
      matchesUpdated: 8,
      verdictsChanged: 1,
      errorCount: 0,
      requiredForClientReadiness: true,
    });
    expect(evidence.matcherRunReceipt.verdictCounts).toEqual({
      ELIGIBLE: 3,
      INELIGIBLE: 7,
      NEEDS_REVIEW: 2,
    });
    expect(evidence.verificationCommands).toContain('npm run smoke:hosted:local');
    expect(evidence.planGate.currentPlan).toBe('pro');
    expect(evidence.planGate.automationEnabled).toBe(true);
    expect(evidence.planGate.freeAndPlusBoundary).toContain('full guarded automation requires active Pro or Founding');
    expect(evidence.planGate.paymentProcessorReady).toBe(true);
    expect(evidence.planGate.paidCheckoutReady).toBe(true);
    expect(evidence.planGate.paidCheckoutBlockReasons).toEqual({
      plusMonthly: null,
      proMonthly: null,
    });
    expect(evidence.billing.ready).toBe(true);
    expect(evidence.billing.syncSecretConfigured).toBe(true);
    expect(evidence.billing.configuredOptions.map((option) => option.envKey)).toContain('CLAIMBOT_BILLING_PRO_MONTHLY_URL');
    expect(evidence.automationControls.setupShadowReview).toMatchObject({
      requiredAck: 'setup-shadow-review:v1',
      requiredTermsAck: 'terms-boundary:v1',
      termsEventType: 'USER_TERMS_ACKNOWLEDGED',
      enforcedBy: '/api/setup/complete',
    });
    expect(evidence.automationControls.singleQueue).toMatchObject({
      requiredBoundaryAck: 'full-guarded-automation:v1',
      requiredTrustLockAck: 'acknowledged',
      workerJobType: 'file_claim',
      jobEnqueueEventType: 'JOB_ENQUEUED',
      jobPayloadAutomationMode: 'full_guarded',
      existingQueuedClaimsRearmed: true,
    });
    expect(evidence.automationControls.bulkQueue).toMatchObject({
      requiredBoundaryAck: 'full-guarded-automation:v1',
      requiredTrustLockAck: 'acknowledged',
      enforcedBy: '/api/claims/file-all',
      workerJobType: 'file_claim',
      jobEnqueueEventType: 'JOB_ENQUEUED',
      jobPayloadAutomationMode: 'full_guarded',
      existingQueuedClaimsRearmed: true,
    });
    expect(evidence.automationControls.bulkQueue.resultFields).toEqual(['jobsEnqueued', 'jobsReused']);
    expect(evidence.automationControls.fileAction.requiredBoundaryAck).toBe('single-claim-full-guarded-automation:v1');
    expect(evidence.automationControls.billingCheckoutHandoff).toMatchObject({
      eventType: 'BILLING_CHECKOUT_STARTED',
      enforcedBy: '/api/billing/checkout',
      processorHosted: true,
      appendsStableUserReference: true,
      referenceFormat: 'claimbot_user_<id>',
      requiredLegalReviewAck: 'CLAIMBOT_LEGAL_REVIEW_ACK',
      requiredLegalReviewAckValue: 'reviewed',
      expectedBlockReasonWhenLegalReviewMissing: 'legal-review-not-recorded',
      requiredPaidCheckoutReady: true,
      checkoutBlockReasons: {
        plusMonthly: null,
        proMonthly: null,
      },
    });
    expect(evidence.automationControls.billingCheckoutHandoff.redirectReferenceParams).toEqual([
      'claimbotUserId',
      'clientReferenceId',
      'client_reference_id',
    ]);
    expect(evidence.automationControls.billingEntitlementSync).toMatchObject({
      eventIdRequired: true,
      idempotencyLedger: 'billing_events.event_id',
      duplicateRetriesDoNotReapplyEntitlements: true,
    });
    expect(serialized).not.toContain('private-database');
    expect(serialized).not.toContain('super-secret-db-token');
    expect(serialized).not.toContain('a-long-random-session-secret-for-tests');
    expect(serialized).not.toContain('support@example.com');
  });

  it('marks copied hosted setup placeholders as missing in masked launch evidence', () => {
    const root = makeTempRoot();
    const evidence = buildLaunchEvidence({
      root,
      cspEnforced: true,
      env: {
        DATABASE_URL: 'libsql://YOUR_DATABASE.turso.io',
        DATABASE_AUTH_TOKEN: 'YOUR_DATABASE_TOKEN',
        SCRAPER_USER_AGENT: 'ClaimBot/0.1 (+https://yourdomain.com/contact)',
        CLAIMBOT_SUPPORT_EMAIL: 'support@yourdomain.com',
        CLAIMBOT_SESSION_SECRET: 'PASTE_GENERATED_SESSION_SECRET',
        CLAIMBOT_BILLING_PLUS_MONTHLY_URL: 'https://YOUR_PROCESSOR_CHECKOUT_LINK',
        CLAIMBOT_BILLING_PRO_MONTHLY_URL: 'https://YOUR_PROCESSOR_CHECKOUT_LINK',
        CLAIMBOT_BILLING_SYNC_SECRET: 'PASTE_GENERATED_BILLING_SYNC_SECRET',
        CLAIMBOT_LEGAL_REVIEW_ACK: 'reviewed',
      },
    });

    expect(evidence.readiness.ok).toBe(false);
    expect(evidence.maskedEnvironment).toEqual(expect.arrayContaining([
      { key: 'DATABASE_URL', status: 'missing' },
      { key: 'SCRAPER_USER_AGENT', status: 'missing' },
      { key: 'CLAIMBOT_SUPPORT_EMAIL', status: 'missing' },
      { key: 'CLAIMBOT_SESSION_SECRET', status: 'missing' },
      { key: 'CLAIMBOT_BILLING_PLUS_MONTHLY_URL', status: 'missing' },
      { key: 'CLAIMBOT_BILLING_PRO_MONTHLY_URL', status: 'missing' },
      { key: 'CLAIMBOT_BILLING_SYNC_SECRET', status: 'missing' },
    ]));
  });

  it('records missing hosted launch blockers in launch evidence', () => {
    const root = makeTempRoot();
    const evidence = buildLaunchEvidence({
      root,
      cspEnforced: false,
      env: {
        CLAIMBOT_DISABLE_AUTH: 'false',
        CLAIMBOT_FEATURE_LIVE_FILING: 'false',
      },
      settings: {
        claim_filer_mode: 'shadow',
      },
      databaseSchemaReadiness: {
        ok: false,
        failures: [
          {
            key: 'identity-subject-column',
            label: 'Hosted identity subject',
            status: 'fail',
            detail: 'SQLITE_ERROR: no such column: external_subject',
          },
        ],
        items: [
          {
            key: 'identity-subject-column',
            label: 'Hosted identity subject',
            status: 'fail',
            detail: 'SQLITE_ERROR: no such column: external_subject',
          },
        ],
      },
      sourceCatalogReadiness: {
        ok: false,
        requiredForClientPreview: true,
        sourceQualityRequired: false,
        settlementSearchEnabled: true,
        totalSettlements: 0,
        linkedClaimForms: 0,
        deadlineCount: 0,
        knownAdministratorCount: 0,
        categorizedCount: 0,
        cleanTextCount: 0,
        mojibakeCount: 0,
        sourceProviderCount: 0,
        formCoveragePercent: 0,
        deadlineCoveragePercent: 0,
        knownAdministratorPercent: 0,
        categorizedPercent: 0,
        sourceCatalogReady: false,
        claimFormCoverageReady: false,
        deadlineCoverageReady: false,
        administratorCoverageReady: false,
        categorizationReady: false,
        textEncodingReady: true,
        sourceQualityReady: false,
        lastScraperAuditAt: null,
        lastScraperAuditEventType: null,
        latestSourceImportAt: null,
        latestSourceImportDigest: null,
        latestSourceImportExportedAt: null,
        latestSourceImportRecordCount: null,
        failureCount: 2,
        warningCount: 0,
        items: [
          {
            key: 'source-catalog',
            label: 'Source catalog',
            status: 'fail',
            detail: 'No settlement source records are loaded for public discovery preview.',
          },
          {
            key: 'claim-form-coverage',
            label: 'Claim form coverage',
            status: 'fail',
            detail: 'No indexed settlement records include claim-form links yet.',
          },
        ],
      },
    });

    expect(evidence.readiness.ok).toBe(false);
    expect(evidence.databaseSchema).toMatchObject({
      ok: false,
      failureCount: 1,
      remediationCommand: 'npm run db:migrate',
    });
    expect(evidence.readiness.items.some((item) => item.key === 'database-schema' && item.status === 'fail')).toBe(true);
    expect(evidence.maskedEnvironment).toContainEqual({ key: 'DATABASE_URL', status: 'missing' });
    expect(evidence.maskedEnvironment).toContainEqual({ key: 'CLAIMBOT_SESSION_SECRET', status: 'missing' });
    expect(evidence.readiness.items.some((item) => item.key === 'security-headers' && item.status === 'fail')).toBe(true);
    expect(evidence.netlifyPreview.warningCount).toBeGreaterThan(0);
    expect(evidence.previewPromotionReceipt.ok).toBe(false);
    expect(evidence.netlifyPreview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'smoke-base-url', status: 'warn' }),
    ]));
    expect(evidence.launchCriticalPath.map((item) => item.label)).toEqual(expect.arrayContaining([
      'Hosted database',
      'Operator account settings',
      'Matcher refresh receipt',
      'Netlify Identity proof',
      'Business billing setup',
      'Deployed preview target',
      'Preview promotion receipt',
    ]));
    expect(evidence.launchCriticalPath.every((item) => item.status === 'blocked')).toBe(true);
    const siteLinkItem = evidence.netlifyPreview.items.find((item) => item.key === 'netlify-site-link');
    expect(siteLinkItem?.status).toMatch(/^(pass|warn)$/);
    expect(evidence.planGate.automationEnabled).toBe(false);
    expect(evidence.planGate.paymentProcessorReady).toBe(false);
    expect(evidence.planGate.paidCheckoutReady).toBe(false);
    expect(evidence.planGate.paidCheckoutBlockReasons.proMonthly).toBe('checkout-not-configured');
    expect(evidence.billing.missingRequiredEnvKeys).toContain('CLAIMBOT_BILLING_PRO_MONTHLY_URL');
    expect(evidence.billing.missingRequiredEnvKeys).toContain('CLAIMBOT_BILLING_SYNC_SECRET_OR_STRIPE_WEBHOOK_SECRET');
    expect(evidence.sourceCatalog).toMatchObject({
      ok: false,
      requiredForClientPreview: true,
      totalSettlements: 0,
      formCoveragePercent: 0,
      cleanTextCount: 0,
      mojibakeCount: 0,
      textEncodingReady: true,
      failureCount: 2,
    });
    expect(evidence.sourceCatalog.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'source-catalog', status: 'fail' }),
      expect.objectContaining({ key: 'claim-form-coverage', status: 'fail' }),
    ]));
    expect(evidence.automationControls.setupShadowReview.requiredAck).toBe('setup-shadow-review:v1');
    expect(evidence.automationControls.bulkQueue.requiredTrustLockAck).toBe('acknowledged');
    expect(evidence.matcherRunReceipt).toMatchObject({
      exists: false,
      auditEventId: null,
      occurredAt: null,
      eventType: 'MATCHER_RUN_COMPLETED',
      actor: 'matcher',
      entityType: 'user',
      settlementsProcessed: null,
      requiredForClientReadiness: true,
    });
    expect(evidence.safetyBoundary.proofRequiredClaimsStayManual).toBe(true);
  });
});
