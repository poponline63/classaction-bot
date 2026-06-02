import { and, desc, eq } from 'drizzle-orm';
import path from 'node:path';
import { db, schema } from '@db/client';
import type { UserSubscription } from '@lib/billing/entitlements';
import { getBillingCheckoutBlockReason, getBillingReadiness } from '@lib/billing/checkout';
import { getUserSubscription, hasAutomationEntitlement } from '@lib/billing/entitlements';
import { getBootstrapAuditStamp, getBootstrapCriticalEnvAudit } from '@lib/bootstrap-audit-stamp';
import {
  getDatabaseSchemaReadiness,
  type DatabaseSchemaReadinessItem,
} from '@lib/database-schema-readiness';
import { isCspEnforcedForHostedReadiness } from '@lib/deployment-security';
import { getClientFeatureFlags } from '@lib/features';
import {
  buildFullAutomationLaunchBlockers,
  summarizeFullAutomationLaunchBlockers,
} from '@lib/full-automation-launch-blockers';
import { buildLaunchActionPlan, buildLaunchCommandQueue, summarizeLaunchActionPlan } from '@lib/launch-action-plan';
import {
  getLaunchCriticalPath,
  getMatcherReceiptCriticalPathBlockers,
  type LaunchBlockerRow,
} from '@lib/launch-handoff';
import { evaluateHostedReadiness } from '@lib/hosted-readiness';
import { identitySetupSteps, verificationCommands } from '@lib/hosted-remediation';
import { getLaunchPacketArtifactRows, summarizeLaunchPacketArtifactRows } from '@lib/launch-packet-stack';
import { readLaunchPacketRefreshReport } from '@lib/launch-packet-refresh-report';
import { readLocalVerificationPacket } from '@lib/local-verification-packet';
import { evaluateNetlifyCliReadiness } from '@lib/netlify-cli-readiness';
import { evaluateNetlifyPreviewReadiness } from '@lib/netlify-preview-readiness';
import { buildNetlifyLaunchDoctorExport } from '@lib/netlify-launch-doctor-receipt';
import { evaluateNetlifyProjectSetupReceipt } from '@lib/netlify-project-setup-receipt';
import { buildOwnerHandoffBriefs } from '@lib/owner-handoff-briefs';
import { evaluatePreviewPromotionReceipt } from '@lib/preview-promotion-receipt';
import { evaluatePwaReadiness } from '@lib/pwa-readiness';
import {
  getSourceCatalogReadiness,
  type SourceCatalogReadiness,
} from '@lib/source-catalog-readiness';
import { getAllSettings } from '@lib/settings';
import {
  FILE_BOUNDARY_ACK,
  QUEUE_BOUNDARY_ACK,
  QUEUE_TRUST_LOCK_ACK,
  SETUP_SHADOW_REVIEW_ACK,
  TERMS_BOUNDARY_ACK,
} from '@lib/claim-filer/request-boundary';
import { canonicalJson, sha256Digest } from './claim-export';

export type AuditSupportFilters = {
  actor?: string;
  entity?: string;
  severity?: string;
};

function isAttentionEvent(eventType: string) {
  return eventType.includes('FAILED') || eventType.includes('REVOKED') || eventType.includes('ABORTED');
}

export function normalizeAuditFilters(filters: AuditSupportFilters) {
  return {
    actor: filters.actor && filters.actor !== 'all' ? filters.actor : null,
    entity: filters.entity && filters.entity !== 'all' ? filters.entity : null,
    severity: filters.severity && filters.severity !== 'all' ? filters.severity : null,
  };
}

export function buildAuditCheckpoint(events: unknown[]) {
  const normalizedEvents = events.map((event) => canonicalJson(event));
  const basis = normalizedEvents.length > 0
    ? { kind: 'audit-sequence', events: normalizedEvents }
    : { kind: 'audit-genesis', events: [] };
  const value = sha256Digest(basis);

  return {
    algorithm: 'sha256',
    value,
    short: `chk:${normalizedEvents.length === 0 ? 'genesis' : 'seq'}-${value.slice(0, 10)}`,
    eventCount: normalizedEvents.length,
  };
}

function relativeEvidencePath(filePath: string, root = process.cwd()) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function launchRowsFromItems(
  items: Array<{ key: string; label: string; status: string; detail: string; action?: string | null }>,
  fallbackAction: string,
): LaunchBlockerRow[] {
  return items
    .filter((item) => item.status !== 'pass')
    .map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      detail: item.detail,
      action: item.action ?? fallbackAction,
    }));
}

type LaunchEvidenceInput = {
  cspEnforced?: boolean;
  databaseSchemaReadiness?: {
    ok: boolean;
    failures: DatabaseSchemaReadinessItem[];
    items: DatabaseSchemaReadinessItem[];
  };
  env?: Record<string, string | undefined>;
  matcherRunReceipt?: MatcherRunReceipt;
  root?: string;
  settings?: Record<string, string | undefined>;
  sourceCatalogReadiness?: SourceCatalogReadiness;
  subscription?: UserSubscription;
};

type MatcherRunReceipt = {
  exists: boolean;
  auditEventId: number | null;
  occurredAt: string | null;
  eventType: 'MATCHER_RUN_COMPLETED';
  actor: 'matcher';
  entityType: 'user';
  settlementsProcessed: number | null;
  matchesInserted: number | null;
  matchesUpdated: number | null;
  verdictCounts: Record<string, number>;
  verdictsChanged: number | null;
  errorCount: number | null;
  requiredForClientReadiness: true;
  note: string;
};

function payloadNumber(payload: unknown, key: string) {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function payloadVerdictCounts(payload: unknown) {
  if (!payload || typeof payload !== 'object') return {};
  const value = (payload as Record<string, unknown>).verdictCounts;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, count]) => typeof count === 'number' && Number.isFinite(count)),
  ) as Record<string, number>;
}

function missingMatcherRunReceipt(): MatcherRunReceipt {
  return {
    exists: false,
    auditEventId: null,
    occurredAt: null,
    eventType: 'MATCHER_RUN_COMPLETED',
    actor: 'matcher',
    entityType: 'user',
    settlementsProcessed: null,
    matchesInserted: null,
    matchesUpdated: null,
    verdictCounts: {},
    verdictsChanged: null,
    errorCount: null,
    requiredForClientReadiness: true,
    note: 'No matcher refresh receipt was found for this account yet. Run the matcher from Review or setup before relying on client-facing match evidence.',
  };
}

function buildMatcherRunReceiptFromAuditEvent(event: typeof schema.auditLog.$inferSelect | null): MatcherRunReceipt {
  if (!event) return missingMatcherRunReceipt();

  return {
    exists: true,
    auditEventId: event.id,
    occurredAt: event.occurredAt.toISOString(),
    eventType: 'MATCHER_RUN_COMPLETED',
    actor: 'matcher',
    entityType: 'user',
    settlementsProcessed: payloadNumber(event.payloadJson, 'settlementsProcessed'),
    matchesInserted: payloadNumber(event.payloadJson, 'matchesInserted'),
    matchesUpdated: payloadNumber(event.payloadJson, 'matchesUpdated'),
    verdictCounts: payloadVerdictCounts(event.payloadJson),
    verdictsChanged: payloadNumber(event.payloadJson, 'verdictsChanged'),
    errorCount: payloadNumber(event.payloadJson, 'errorCount'),
    requiredForClientReadiness: true,
    note: 'Latest account-scoped matcher refresh receipt. The support packet includes aggregate counts only, not private profile facts, purchases, breaches, or matcher traces.',
  };
}

export function buildLaunchEvidence(input: LaunchEvidenceInput = {}) {
  const env = input.env ?? process.env;
  const settings = input.settings ?? {};
  const claimFilerMode = settings.claim_filer_mode ?? env.CLAIM_FILER_MODE ?? 'shadow';
  const claimFilerLiveAck = settings.claim_filer_live_ack ?? env.CLAIM_FILER_LIVE_ACK ?? '';
  const claimFilerMaxPerDay = settings.claim_filer_max_per_day ?? env.CLAIM_FILER_MAX_PER_DAY ?? '20';
  const cspEnforced = input.cspEnforced ?? isCspEnforcedForHostedReadiness();
  const databaseSchemaReadiness = input.databaseSchemaReadiness ?? {
    ok: true,
    failures: [],
    items: [],
  };
  const sourceCatalogReadiness = input.sourceCatalogReadiness ?? null;
  const netlifyProjectSetupReceipt = evaluateNetlifyProjectSetupReceipt(input.root);
  const previewPromotionReceiptReadiness = evaluatePreviewPromotionReceipt({ env, root: input.root });
  const readiness = evaluateHostedReadiness({
    databaseUrl: env.DATABASE_URL,
    databaseAuthToken: env.DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN,
    hasDatabaseAuthToken: Boolean(env.DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN),
    claimFilerMode,
    claimFilerLiveAck,
    claimFilerMaxPerDay,
    scraperUserAgent: env.SCRAPER_USER_AGENT,
    supportEmail: env.CLAIMBOT_SUPPORT_EMAIL,
    isHosted: true,
    authDisabled: env.CLAIMBOT_DISABLE_AUTH === 'true',
    sessionSecret: env.CLAIMBOT_SESSION_SECRET,
    settlementSearchFeatureEnabled: env.CLAIMBOT_FEATURE_SETTLEMENT_SEARCH !== 'false',
    liveFilingFeatureEnabled: env.CLAIMBOT_FEATURE_LIVE_FILING === 'true',
    cspEnforced,
    billingPlusMonthlyUrl: env.CLAIMBOT_BILLING_PLUS_MONTHLY_URL,
    billingProMonthlyUrl: env.CLAIMBOT_BILLING_PRO_MONTHLY_URL,
    billingSyncSecret: env.CLAIMBOT_BILLING_SYNC_SECRET,
    billingStripeWebhookSecret: env.CLAIMBOT_STRIPE_WEBHOOK_SECRET,
    legalReviewAck: env.CLAIMBOT_LEGAL_REVIEW_ACK,
    workerRuntime: env.CLAIMBOT_WORKER_RUNTIME,
    workerRuntimeReceipt: env.CLAIMBOT_WORKER_RUNTIME_RECEIPT,
    databaseSchemaReady: databaseSchemaReadiness.ok,
    databaseSchemaFailures: databaseSchemaReadiness.failures.map((item) => item.label),
  });
  const billing = getBillingReadiness(env);
  const requiredPaidCheckoutBlockReasons = {
    plusMonthly: getBillingCheckoutBlockReason('plus_monthly', env),
    proMonthly: getBillingCheckoutBlockReason('pro_monthly', env),
  };
  const requiredPaidCheckoutReady = Object.values(requiredPaidCheckoutBlockReasons).every((reason) => reason === null);
  const pwaReadiness = evaluatePwaReadiness();
  const netlifyCliReadiness = evaluateNetlifyCliReadiness();
  const localVerificationReceipt = readLocalVerificationPacket(input.root);
  const launchPacketRefreshReport = readLaunchPacketRefreshReport(input.root);
  const netlifyPreview = evaluateNetlifyPreviewReadiness({
    env,
    evidenceScope: 'support-packet',
    strict: false,
  });
  const previewPromotionReceipt = {
    ...previewPromotionReceiptReadiness,
    receiptPath: relativeEvidencePath(previewPromotionReceiptReadiness.receiptPath, input.root),
  };
  const matcherRunReceipt = input.matcherRunReceipt ?? missingMatcherRunReceipt();
  const launchPacketRows = getLaunchPacketArtifactRows(matcherRunReceipt, input.root);
  const launchPacketStackSummary = summarizeLaunchPacketArtifactRows(launchPacketRows);
  const fullAutomationLaunchBlockers = buildFullAutomationLaunchBlockers(launchPacketRows);
  const fullAutomationLaunchBlockerSummary = summarizeFullAutomationLaunchBlockers(fullAutomationLaunchBlockers);
  const externalActivationWorkbook = launchPacketRows.find((row) => row.path === 'data/external-activation-workbook.md') ?? null;
  const clientPreviewChecklist = launchPacketRows.find((row) => row.path === 'data/client-preview-checklist.md') ?? null;
  const launchHandoffReport = launchPacketRows.find((row) => row.path === 'data/launch-handoff-report.md') ?? null;
  const localVerificationPacket = launchPacketRows.find((row) => row.path === 'data/local-verification-packet.md') ?? null;
  const netlifyLaunchDoctor = launchPacketRows.find((row) => row.path === 'data/netlify-launch-doctor.md') ?? null;
  const netlifyLaunchDoctorExport = buildNetlifyLaunchDoctorExport(input.root);
  const launchCriticalPath = getLaunchCriticalPath([
    ...launchRowsFromItems(
      netlifyCliReadiness.items,
      'Install or authenticate Netlify CLI, then rerun npm run netlify:doctor before env push, deploy, or preview promotion.',
    ),
    ...launchRowsFromItems(
      readiness.items,
      'Fix the hosted readiness item, then rerun npm run validate:hosted and npm run smoke:hosted:local.',
    ),
    ...launchRowsFromItems(
      sourceCatalogReadiness?.items ?? [],
      'Run npm run enrich:source, npm run source:export, npm run source:import:dry, and validate source readiness before client previews.',
    ),
    ...launchRowsFromItems(
      pwaReadiness.items,
      'Run npm run validate:pwa and confirm the installed shell, manifest, service worker, and offline safety page before client previews.',
    ),
    ...launchRowsFromItems(
      netlifyPreview.items,
      'Run npm run validate:netlify:strict and npm run preview:gate against the deployed Netlify preview.',
    ),
    ...launchRowsFromItems(
      previewPromotionReceiptReadiness.items,
      'Run npm run preview:gate against the deployed preview, then npm run production:check-receipt before production deploy.',
    ),
    ...getMatcherReceiptCriticalPathBlockers(matcherRunReceipt),
  ], {
    netlifyIdentityReady: netlifyProjectSetupReceipt.identityReady,
  });
  const launchActionPlanRows = buildLaunchActionPlan(launchCriticalPath);
  const launchActionPlanSummary = summarizeLaunchActionPlan(launchActionPlanRows);
  const launchActionCommandQueue = buildLaunchCommandQueue(launchActionPlanRows);
  const ownerHandoffBriefs = buildOwnerHandoffBriefs(
    launchActionPlanRows,
    launchActionCommandQueue,
    launchPacketRows.filter((row) => !row.ready),
  );
  const bootstrapStamp = getBootstrapAuditStamp({
    env,
    filingMode: claimFilerMode === 'live' ? 'live' : 'shadow',
  });

  return {
    format: 'claimbot.launch-evidence.v1',
    localTooling: {
      netlifyCli: netlifyCliReadiness,
      localVerificationPacket: localVerificationReceipt,
      launchPacketRefreshReport,
      note: 'Support packet records local Netlify CLI/auth readiness as non-secret operator evidence; it does not include Netlify tokens or account credentials.',
    },
    readiness: {
      ok: readiness.ok,
      failureCount: readiness.failures.length,
      warningCount: readiness.warnings.length,
      items: readiness.items,
    },
    maskedEnvironment: getBootstrapCriticalEnvAudit(env),
    identityProvider: {
      provider: 'Netlify Identity',
      mustBeEnabledOnDeployedSite: true,
      localDevelopmentUnavailable: true,
      operatorSteps: identitySetupSteps,
    },
    netlifyProjectSetupReceipt: {
      ok: netlifyProjectSetupReceipt.ok,
      receiptPath: relativeEvidencePath(netlifyProjectSetupReceipt.receiptPath, input.root),
      siteName: netlifyProjectSetupReceipt.receipt?.siteName ?? null,
      dashboardUrl: netlifyProjectSetupReceipt.receipt?.dashboardUrl ?? null,
      safeEnvKeyCount: netlifyProjectSetupReceipt.receipt?.configuredSafeEnvKeys.length ?? 0,
      missingSafeEnvKeys: netlifyProjectSetupReceipt.missingSafeEnvKeys,
      identityReady: netlifyProjectSetupReceipt.identityReady,
      identity: netlifyProjectSetupReceipt.receipt?.identity
        ? {
          enabled: netlifyProjectSetupReceipt.receipt.identity.enabled,
          registration: netlifyProjectSetupReceipt.receipt.identity.registration,
          emailConfirmation: netlifyProjectSetupReceipt.receipt.identity.emailConfirmation,
          verifiedAt: netlifyProjectSetupReceipt.receipt.identity.verifiedAt ?? null,
          evidence: netlifyProjectSetupReceipt.receipt.identity.evidence ?? null,
        }
        : null,
      warnings: netlifyProjectSetupReceipt.warnings,
      failures: netlifyProjectSetupReceipt.failures,
      note: 'Non-secret Netlify project and Identity dashboard receipt. Secrets, database URLs, checkout URLs, and user data are not included.',
    },
    netlifyPreview,
    previewPromotionReceipt,
    pwaReadiness,
    launchPacketStack: {
      summary: launchPacketStackSummary,
      rows: launchPacketRows,
      blockedNextActions: launchPacketRows
        .filter((row) => !row.ready)
        .map((row) => ({
          label: row.label,
          path: row.path,
          owner: row.owner,
          nextAction: row.nextAction,
          missingInputs: row.missingInputs.slice(0, 5),
        })),
      localVerificationPacket,
      externalActivationWorkbook,
      clientPreviewChecklist,
      launchHandoffReport,
      netlifyLaunchDoctor,
      launchPacketRefreshReport,
      netlifyLaunchDoctorExport,
      hostedExportPath: '/api/audit/external-activation-workbook',
      hostedExportPaths: {
        externalActivationWorkbook: '/api/audit/external-activation-workbook',
        clientPreviewChecklist: '/api/audit/client-preview-checklist',
        launchHandoff: '/api/audit/launch-handoff',
        netlifyLaunchDoctor: '/api/audit/netlify-launch-doctor',
      },
      note: 'Support packet includes non-secret launch packet artifact status so operators can see whether the local verification receipt, launch packet refresh report, Netlify launch doctor, external activation workbook, client-preview checklist, launch handoff report, and packet proof are ready.',
    },
    fullAutomationLaunchBlockers: {
      summary: fullAutomationLaunchBlockerSummary,
      rows: fullAutomationLaunchBlockers,
      boundary: 'Paid full automation remains locked until this list is empty, the launch packet stack is ready, and the account-specific client-preview checklist is ready.',
    },
    launchCriticalPath,
    launchActionPlan: {
      summary: launchActionPlanSummary,
      rows: launchActionPlanRows,
      commandQueue: launchActionCommandQueue,
      note: 'Support packet launch action plan includes non-secret execution boundaries so operators can see which steps are Codex-runnable and which require external account, business, legal, or deployment action.',
    },
    ownerHandoffBriefs,
    ownerHandoffBriefsNote: 'Owner handoff briefs include safeLocalCommands and externalInputCommands so support operators can separate local evidence work from external account setup.',
    databaseSchema: {
      ok: databaseSchemaReadiness.ok,
      failureCount: databaseSchemaReadiness.failures.length,
      items: databaseSchemaReadiness.items,
      requiredForHostedLaunch: true,
      remediationCommand: 'npm run db:migrate',
    },
    sourceCatalog: sourceCatalogReadiness ?? {
      ok: false,
      requiredForClientPreview: true,
      sourceQualityRequired: false,
      settlementSearchEnabled: env.CLAIMBOT_FEATURE_SETTLEMENT_SEARCH !== 'false',
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
      failureCount: 0,
      warningCount: 0,
      items: [],
      note: 'Source catalog readiness was not loaded for this direct launch-evidence call.',
    },
    matcherRunReceipt,
    verificationCommands,
    featureFlags: getClientFeatureFlags(env).map((flag) => ({
      key: flag.key,
      label: flag.label,
      enabled: flag.enabled,
    })),
    planGate: {
      currentPlan: input.subscription?.plan ?? 'unknown',
      currentStatus: input.subscription?.status ?? 'unknown',
      automationEnabled: input.subscription?.automationEnabled ?? false,
      source: input.subscription?.source ?? 'not-loaded',
      automationPlans: (['pro', 'founding'] as const).map((plan) => ({
        plan,
        activeStatusRequired: true,
        unlocksAutomation: hasAutomationEntitlement(plan, 'active'),
      })),
      freeAndPlusBoundary: 'Free and Plus can review matches and manage evidence; full guarded automation requires active Pro or Founding access.',
      paymentProcessorReady: billing.ready,
      paidCheckoutReady: requiredPaidCheckoutReady,
      paidCheckoutBlockReasons: requiredPaidCheckoutBlockReasons,
      paymentProcessorNote: billing.note,
    },
    billing,
    automationControls: {
      authSessionBridge: {
        eventType: 'AUTH_SESSION_CREATED',
        signOutEventType: 'AUTH_SESSION_ENDED',
        enforcedBy: '/api/auth/session',
        identityProvider: 'Netlify Identity',
        stableSubjectRequired: true,
        note: 'Hosted login creates or links the user by Identity id/sub and audits the app-session handoff before setting the signed session cookie; sign-out clears the cookie and records an account-control event when a valid signed session is present.',
      },
      setupShadowReview: {
        requiredAck: SETUP_SHADOW_REVIEW_ACK,
        requiredTermsAck: TERMS_BOUNDARY_ACK,
        termsEventType: 'USER_TERMS_ACKNOWLEDGED',
        enforcedBy: '/api/setup/complete',
        startsAutomation: ['discovery', 'matching', 'safe queue preparation'],
        userVisibleControl: 'Final setup checkboxes: I acknowledge the ClaimBot Terms boundary and I authorize shadow-mode review.',
      },
      singleQueue: {
        requiredBoundaryAck: QUEUE_BOUNDARY_ACK,
        requiredTrustLockAck: QUEUE_TRUST_LOCK_ACK,
        requiredClientPreviewChecklist: 'claimbot.client-preview-checklist.v1',
        enforcedBy: 'queueClaimFromMatch server action',
        workerJobType: 'file_claim',
        jobEnqueueEventType: 'JOB_ENQUEUED',
        jobPayloadAutomationMode: 'full_guarded',
        existingQueuedClaimsRearmed: true,
        userVisibleControl: 'Required Trust Lock checkbox plus account-scoped client-preview readiness before a reviewed match can create a claim job.',
      },
      bulkQueue: {
        requiredBoundaryAck: QUEUE_BOUNDARY_ACK,
        requiredTrustLockAck: QUEUE_TRUST_LOCK_ACK,
        requiredClientPreviewChecklist: 'claimbot.client-preview-checklist.v1',
        enforcedBy: '/api/claims/file-all',
        workerJobType: 'file_claim',
        jobEnqueueEventType: 'JOB_ENQUEUED',
        resultFields: ['jobsEnqueued', 'jobsReused'],
        jobPayloadAutomationMode: 'full_guarded',
        existingQueuedClaimsRearmed: true,
        userVisibleControl: 'Bulk queue consent checkbox plus account-scoped client-preview readiness before queue-all can stage claims.',
      },
      fileAction: {
        requiredBoundaryAck: FILE_BOUNDARY_ACK,
        requiredClientPreviewChecklist: 'claimbot.client-preview-checklist.v1',
        enforcedBy: '/api/claims/[id]/file and runFileClaim server action',
        boundary: 'File actions require account-scoped client-preview readiness, then still run preflight and shadow/live filing posture checks before external submission.',
      },
      billingCheckoutHandoff: {
        eventType: 'BILLING_CHECKOUT_STARTED',
        enforcedBy: '/api/billing/checkout',
        processorHosted: true,
        appendsStableUserReference: true,
        redirectReferenceParams: ['claimbotUserId', 'clientReferenceId', 'client_reference_id'],
        referenceFormat: 'claimbot_user_<id>',
        requiredLegalReviewAck: 'CLAIMBOT_LEGAL_REVIEW_ACK',
        requiredLegalReviewAckValue: 'reviewed',
        expectedBlockReasonWhenLegalReviewMissing: 'legal-review-not-recorded',
        requiredPaidCheckoutReady,
        checkoutBlockReasons: requiredPaidCheckoutBlockReasons,
        note: 'Checkout redirects are audited without storing payment-link URLs or card data, and paid checkout remains locked until processor links, signed entitlement sync, and recorded legal/compliance review are all ready.',
      },
      billingEntitlementSync: {
        signatureHeader: 'X-ClaimBot-Billing-Signature',
        eventIdRequired: true,
        idempotencyLedger: 'billing_events.event_id',
        claimbotUserReferenceSupported: true,
        acceptedUserReferenceFields: ['claimbotUserId', 'clientReferenceId=claimbot_user_<id>'],
        duplicateRetriesDoNotReapplyEntitlements: true,
      },
    },
    safetyBoundary: {
      noLegalAdvice: true,
      noEligibilityGuarantee: true,
      proofRequiredClaimsStayManual: true,
      userAuthorizationRequired: true,
      shadowModeDefault: true,
      liveFilingFeatureGateRequired: true,
    },
    bootstrapStamp,
  };
}

export async function readFilteredAuditEvents(userId: number, filters: AuditSupportFilters = {}, limit = 200) {
  const normalized = normalizeAuditFilters(filters);
  const clauses = [eq(schema.auditLog.userId, userId)];

  if (normalized.actor) clauses.push(eq(schema.auditLog.actor, normalized.actor));
  if (normalized.entity) clauses.push(eq(schema.auditLog.entityType, normalized.entity));

  const rows = await db
    .select()
    .from(schema.auditLog)
    .where(and(...clauses))
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(limit);

  return normalized.severity === 'attention'
    ? rows.filter((event) => isAttentionEvent(event.eventType))
    : rows;
}

export async function readLatestMatcherRunReceipt(userId: number) {
  const rows = await db
    .select()
    .from(schema.auditLog)
    .where(and(
      eq(schema.auditLog.userId, userId),
      eq(schema.auditLog.eventType, 'MATCHER_RUN_COMPLETED'),
    ))
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(1);

  return buildMatcherRunReceiptFromAuditEvent(rows[0] ?? null);
}

export async function buildAuditSupportPacket(userId: number, filters: AuditSupportFilters = {}) {
  const events = await readFilteredAuditEvents(userId, filters, 200);
  const [
    settings,
    subscription,
    databaseSchemaReadiness,
    sourceCatalogReadiness,
    matcherRunReceipt,
  ] = await Promise.all([
    getAllSettings(),
    getUserSubscription(userId),
    getDatabaseSchemaReadiness(),
    getSourceCatalogReadiness(),
    readLatestMatcherRunReceipt(userId),
  ]);
  const normalizedFilters = normalizeAuditFilters(filters);
  const checkpoint = buildAuditCheckpoint(events);
  const exportedAt = new Date();
  const body = {
    format: 'claimbot.audit-support-packet.v1',
    accountId: userId,
    exportedAt,
    appliedFilters: normalizedFilters,
    eventCount: events.length,
    checkpoint,
    attestation: events.length === 0
      ? `Zero events recorded as of ${exportedAt.toISOString()}; append-only log integrity checkpoint generated.`
      : `${events.length} event${events.length === 1 ? '' : 's'} exported as of ${exportedAt.toISOString()}; append-only log integrity checkpoint generated.`,
    safetyBoundary: {
      noLegalAdvice: true,
      noEligibilityGuarantee: true,
      proofRequiredClaimsStayManual: true,
      userAuthorizationRequired: true,
      shadowModeDefault: true,
    },
    launchEvidence: buildLaunchEvidence({
      settings,
      subscription,
      databaseSchemaReadiness,
      sourceCatalogReadiness,
      matcherRunReceipt,
    }),
    events,
  };

  return {
    ...body,
    digest: {
      algorithm: 'sha256',
      value: sha256Digest(body),
      note: 'Recompute this digest over the packet without the digest field to detect accidental changes.',
    },
  };
}
