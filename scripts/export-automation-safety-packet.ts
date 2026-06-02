import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { buildLaunchEvidence } from '../src/lib/audit/support-packet';
import { getBillingCheckoutBlockReason, getBillingReadiness } from '../src/lib/billing/checkout';
import { getBootstrapAuditStamp, effectiveFilingModeForBootstrap } from '../src/lib/bootstrap-audit-stamp';
import { evaluateQueueReadiness } from '../src/lib/claim-filer/queue-readiness';
import {
  FILE_BOUNDARY_ACK,
  QUEUE_BOUNDARY_ACK,
  QUEUE_TRUST_LOCK_ACK,
  SETUP_SHADOW_REVIEW_ACK,
  TERMS_BOUNDARY_ACK,
} from '../src/lib/claim-filer/request-boundary';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'automation-safety-packet.json');
const markdownPath = path.join(outputDir, 'automation-safety-packet.md');

const sourceEvidenceFiles = [
  'src/lib/audit/support-packet.ts',
  'src/lib/claim-filer/request-boundary.ts',
  'src/lib/claim-filer/queue-readiness.ts',
  'src/lib/claim-filer/filer.ts',
  'src/lib/claim-filer/submit.ts',
  'src/lib/auto-pipeline.ts',
  'src/lib/setup-state.ts',
  'src/lib/billing/checkout.ts',
  'src/lib/billing/entitlements.ts',
  'src/app/api/setup/complete/route.ts',
  'src/app/api/claims/file-all/route.ts',
  'src/app/api/billing/checkout/route.ts',
  'tests/unit/queue-readiness.test.ts',
  'tests/unit/auto-pipeline.test.ts',
  'tests/integration/queue-claim-entitlement.test.ts',
  'tests/integration/setup-complete-route.test.ts',
];

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

function queueScenario(label: string, input: Parameters<typeof evaluateQueueReadiness>[0], expectedCanQueue: boolean) {
  const result = evaluateQueueReadiness(input);
  return {
    label,
    expectedCanQueue,
    canQueue: result.canQueue,
    status: result.status,
    readinessLabel: result.label,
    passed: result.canQueue === expectedCanQueue,
  };
}

function main() {
  const generatedAt = new Date().toISOString();
  const launchEvidence = buildLaunchEvidence({
    env: process.env,
    settings: {
      claim_filer_mode: process.env.CLAIM_FILER_MODE ?? 'shadow',
      claim_filer_live_ack: process.env.CLAIM_FILER_LIVE_ACK ?? '',
      claim_filer_max_per_day: process.env.CLAIM_FILER_MAX_PER_DAY ?? '20',
    },
  });
  const billing = getBillingReadiness();
  const bootstrapStamp = getBootstrapAuditStamp({
    env: process.env,
    filingMode: process.env.CLAIM_FILER_MODE === 'live' ? 'live' : 'shadow',
  });
  const forcedShadowMode = effectiveFilingModeForBootstrap({
    env: {
      ...process.env,
      CLAIMBOT_FEATURE_LIVE_FILING: 'false',
    },
    filingMode: 'live',
  });
  const queueScenarios = [
    queueScenario('eligible-authorized-no-proof-paid', {
      verdict: 'ELIGIBLE',
      proofRequired: false,
      claimFormUrl: 'https://example.com/claim',
      hasActiveAuthorization: true,
      hasAutomationEntitlement: true,
    }, true),
    queueScenario('proof-required-stays-review', {
      verdict: 'ELIGIBLE',
      proofRequired: true,
      claimFormUrl: 'https://example.com/claim',
      hasActiveAuthorization: true,
      hasAutomationEntitlement: true,
    }, false),
    queueScenario('authorization-required', {
      verdict: 'ELIGIBLE',
      proofRequired: false,
      claimFormUrl: 'https://example.com/claim',
      hasActiveAuthorization: false,
      hasAutomationEntitlement: true,
    }, false),
    queueScenario('claim-form-required', {
      verdict: 'ELIGIBLE',
      proofRequired: false,
      hasActiveAuthorization: true,
      hasAutomationEntitlement: true,
    }, false),
    queueScenario('paid-plan-required', {
      verdict: 'ELIGIBLE',
      proofRequired: false,
      claimFormUrl: 'https://example.com/claim',
      hasActiveAuthorization: true,
      hasAutomationEntitlement: false,
    }, false),
    queueScenario('eligible-verdict-required', {
      verdict: 'NEEDS_REVIEW',
      proofRequired: false,
      claimFormUrl: 'https://example.com/claim',
      hasActiveAuthorization: true,
      hasAutomationEntitlement: true,
    }, false),
  ];
  const automationControls = launchEvidence.automationControls;
  const safetyBoundary = launchEvidence.safetyBoundary;
  const requiredAckChecks = [
    { key: 'setupShadowReview', expected: SETUP_SHADOW_REVIEW_ACK, actual: automationControls.setupShadowReview.requiredAck },
    { key: 'termsBoundary', expected: TERMS_BOUNDARY_ACK, actual: automationControls.setupShadowReview.requiredTermsAck },
    { key: 'singleQueueBoundary', expected: QUEUE_BOUNDARY_ACK, actual: automationControls.singleQueue.requiredBoundaryAck },
    { key: 'singleQueueTrustLock', expected: QUEUE_TRUST_LOCK_ACK, actual: automationControls.singleQueue.requiredTrustLockAck },
    { key: 'bulkQueueBoundary', expected: QUEUE_BOUNDARY_ACK, actual: automationControls.bulkQueue.requiredBoundaryAck },
    { key: 'bulkQueueTrustLock', expected: QUEUE_TRUST_LOCK_ACK, actual: automationControls.bulkQueue.requiredTrustLockAck },
    { key: 'fileActionBoundary', expected: FILE_BOUNDARY_ACK, actual: automationControls.fileAction.requiredBoundaryAck },
  ].map((check) => ({
    ...check,
    passed: check.actual === check.expected,
  }));
  const checkoutBlockReason = getBillingCheckoutBlockReason('pro_monthly');
  const safetyAssertions = [
    { key: 'noLegalAdvice', passed: safetyBoundary.noLegalAdvice },
    { key: 'noEligibilityGuarantee', passed: safetyBoundary.noEligibilityGuarantee },
    { key: 'proofRequiredClaimsStayManual', passed: safetyBoundary.proofRequiredClaimsStayManual },
    { key: 'userAuthorizationRequired', passed: safetyBoundary.userAuthorizationRequired },
    { key: 'shadowModeDefault', passed: safetyBoundary.shadowModeDefault },
    { key: 'liveFilingFeatureGateRequired', passed: safetyBoundary.liveFilingFeatureGateRequired },
    { key: 'bootstrapShadowEnforced', passed: bootstrapStamp.shadowModeState === 'enforced' },
    { key: 'liveModeFallsBackToShadowWithoutFeatureFlag', passed: forcedShadowMode === 'shadow' },
    { key: 'checkoutDoesNotBypassSignedSyncOrConfiguredUrl', passed: billing.ready || checkoutBlockReason !== null },
    { key: 'queueReadinessScenarios', passed: queueScenarios.every((scenario) => scenario.passed) },
    { key: 'requiredAcknowledgements', passed: requiredAckChecks.every((check) => check.passed) },
  ];
  const ready = safetyAssertions.every((assertion) => assertion.passed);
  const packet = {
    format: 'claimbot.automation-safety-packet.v1',
    generatedAt,
    note: 'Non-secret automation safety packet. This records gate names, acknowledgement constants, queue-readiness outcomes, and safety booleans only; it does not include user profile facts, purchases, breaches, claim records, secrets, tokens, checkout URLs, or raw form data.',
    readiness: {
      ready,
      failureCount: safetyAssertions.filter((assertion) => !assertion.passed).length,
      requiredForClientPreview: true,
      shadowModeState: bootstrapStamp.shadowModeState,
      effectiveLiveWithoutFeatureFlag: forcedShadowMode,
      billingReady: billing.ready,
      proCheckoutBlockReason: checkoutBlockReason,
      note: 'Automation safety proves that paid automation remains guarded by setup consent, Terms acknowledgement, queue trust locks, proof review, category authorization, claim-form availability, plan entitlement, preflight, shadow/live filing posture, and audit events.',
    },
    requiredAckChecks,
    queueScenarios,
    safetyAssertions,
    automationControls: {
      setupShadowReview: automationControls.setupShadowReview,
      singleQueue: automationControls.singleQueue,
      bulkQueue: automationControls.bulkQueue,
      fileAction: automationControls.fileAction,
      billingCheckoutHandoff: automationControls.billingCheckoutHandoff,
      billingEntitlementSync: automationControls.billingEntitlementSync,
    },
    safetyBoundary,
    sourceEvidence: sourceEvidenceFiles.map(fileEvidence),
    commands: [
      'npm run automation:safety:packet',
      'npx vitest run tests/unit/queue-readiness.test.ts tests/unit/auto-pipeline.test.ts tests/integration/queue-claim-entitlement.test.ts tests/integration/setup-complete-route.test.ts',
      'npm run validate:ui',
      'npm run validate:legal',
      'npm run launch:handoff',
    ],
  };

  const markdown = [
    '# ClaimBot Automation Safety Packet',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This is a non-secret automation safety packet. It records gate names, acknowledgement constants, queue-readiness outcomes, and safety booleans only.',
    '',
    '## Current Gate',
    '',
    `Automation safety: ${ready ? 'ready' : 'blocked'}`,
    `Failures: ${packet.readiness.failureCount}`,
    `Shadow mode state: ${bootstrapStamp.shadowModeState}`,
    `Live without feature flag resolves to: ${forcedShadowMode}`,
    `Billing ready: ${billing.ready ? 'yes' : 'no'}`,
    `Pro checkout block reason: ${checkoutBlockReason ?? 'none'}`,
    `Boundary: ${packet.readiness.note}`,
    '',
    '## Safety Assertions',
    '',
    ...safetyAssertions.map((assertion) => `- ${assertion.key}: ${assertion.passed ? 'pass' : 'fail'}`),
    '',
    '## Required Acknowledgements',
    '',
    ...requiredAckChecks.map((check) => `- ${check.key}: ${check.passed ? 'pass' : 'fail'} (${check.actual})`),
    '',
    '## Queue Readiness Scenarios',
    '',
    ...queueScenarios.map((scenario) => `- ${scenario.label}: ${scenario.passed ? 'pass' : 'fail'}; canQueue=${scenario.canQueue}; label=${scenario.readinessLabel}`),
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

  console.log('[automation-safety-packet] wrote non-secret automation safety packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Automation safety: ${ready ? 'ready' : 'blocked'}`);
  console.log(`Failures: ${packet.readiness.failureCount}`);

  if (!ready) process.exit(1);
}

main();
