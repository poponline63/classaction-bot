import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getBillingCheckoutBlockReason, getBillingReadiness } from '../src/lib/billing/checkout';
import { loadIgnoredOperatorEnvForReadiness } from '../src/lib/ignored-operator-env';
import { hostedOperatorNotes } from '../src/lib/hosted-remediation';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'billing-activation-packet.json');
const markdownPath = path.join(outputDir, 'billing-activation-packet.md');
const billingSyncReceiptPath = path.join(outputDir, 'billing-sync-smoke-receipt.json');

const requiredSetupRows = [
  {
    key: 'plus-checkout',
    label: 'Plus monthly checkout',
    envKey: 'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
    proof: 'Processor-hosted HTTPS checkout URL for Plus.',
  },
  {
    key: 'pro-checkout',
    label: 'Pro monthly checkout',
    envKey: 'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
    proof: 'Processor-hosted HTTPS checkout URL for Pro.',
  },
  {
    key: 'signed-sync',
    label: 'Signed entitlement sync',
    envKey: 'CLAIMBOT_BILLING_SYNC_SECRET or CLAIMBOT_STRIPE_WEBHOOK_SECRET',
    proof: 'Processor callbacks to /api/billing/entitlement-sync are signed before entitlement rows change.',
  },
];

const optionalSetupRows = [
  {
    key: 'plus-yearly',
    label: 'Plus yearly checkout',
    envKey: 'CLAIMBOT_BILLING_PLUS_YEARLY_URL',
    proof: 'Optional annual Plus checkout URL for the pricing cycle switcher.',
  },
  {
    key: 'pro-yearly',
    label: 'Pro yearly checkout',
    envKey: 'CLAIMBOT_BILLING_PRO_YEARLY_URL',
    proof: 'Optional annual Pro checkout URL for the pricing cycle switcher.',
  },
  {
    key: 'founding',
    label: 'Founding checkout',
    envKey: 'CLAIMBOT_BILLING_FOUNDING_URL',
    proof: 'Optional early-access checkout URL.',
  },
];

const callbackContract = [
  'Send processor events to /api/billing/entitlement-sync.',
  'Use X-ClaimBot-Billing-Signature with sha256=<hmac_sha256(raw_body, CLAIMBOT_BILLING_SYNC_SECRET)> or Stripe-Signature with CLAIMBOT_STRIPE_WEBHOOK_SECRET.',
  'Include claimbotUserId, clientReferenceId, or client_reference_id when possible.',
  'Include a stable eventId/event_id/id so billing_events.event_id can reject duplicate callbacks.',
  'Include plan and status fields or Stripe checkout-session style metadata that maps to Plus, Pro, or Founding.',
];

const nonSecretSamplePayload = {
  eventId: 'processor_event_123',
  processor: 'processor-hosted-checkout',
  email: 'customer@example.com',
  plan: 'pro_monthly',
  status: 'active',
  clientReferenceId: 'claimbot_user_1',
  claimbotUserId: '1',
};

const checkoutHandoffSafety = {
  route: '/api/billing/checkout',
  enforcedBy: 'getBillingCheckoutBlockReason',
  blockReasons: [
    {
      reason: 'checkout-not-configured',
      meaning: 'The selected processor-hosted checkout URL is missing or still placeholder-only.',
      userDestination: '/contact?topic=billing&reason=checkout-not-configured',
    },
    {
      reason: 'signed-sync-not-configured',
      meaning: 'A checkout URL may exist, but ClaimBot cannot safely apply the paid entitlement until HMAC or Stripe webhook signing is configured.',
      userDestination: '/contact?topic=billing&reason=signed-sync-not-configured',
    },
    {
      reason: 'legal-review-not-recorded',
      meaning: 'Checkout and signed entitlement sync may be staged, but paid automation should not be sold until legal/compliance review is recorded.',
      userDestination: '/contact?topic=billing&reason=legal-review-not-recorded',
    },
    {
      reason: 'worker-runtime-not-verified',
      meaning: 'Pro and Founding checkout may be staged, but paid full automation should not be sold until a worker runtime receipt proves file_claim jobs are processed after checkout unlocks queue access.',
      userDestination: '/contact?topic=billing&reason=worker-runtime-not-verified',
    },
  ],
  auditEvent: 'BILLING_CHECKOUT_STARTED',
  auditFields: [
    'processorHostedRedirect',
    'checkoutBlockReason',
    'signedEntitlementSyncReady',
    'clientReferenceId',
  ],
  boundary: 'Users should not be sent to pay unless ClaimBot can preserve the processor redirect reference, verify the callback that activates the entitlement, show recorded legal/compliance review, and prove the paid automation worker runtime for Pro or Founding offers.',
};

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

function statusLabel(configured: boolean) {
  return configured ? 'configured' : 'missing';
}

function readJsonFile(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function billingSyncReceiptSummary() {
  const raw = readJsonFile(billingSyncReceiptPath);
  if (!raw) {
    return {
      exists: false,
      status: 'missing',
      generatedAt: null,
      claimbotSignatureAccepted: null,
      stripeSignatureAccepted: null,
      stableUserReferencePresent: null,
      eventIdPresent: null,
    };
  }

  const checks = raw.checks && typeof raw.checks === 'object'
    ? raw.checks as Record<string, unknown>
    : {};

  return {
    exists: true,
    status: typeof raw.status === 'string' ? raw.status : 'unknown',
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : null,
    claimbotSignatureAccepted: typeof checks.claimbotSignatureAccepted === 'boolean' ? checks.claimbotSignatureAccepted : null,
    stripeSignatureAccepted: typeof checks.stripeSignatureAccepted === 'boolean' ? checks.stripeSignatureAccepted : null,
    stableUserReferencePresent: typeof checks.stableUserReferencePresent === 'boolean' ? checks.stableUserReferencePresent : null,
    eventIdPresent: typeof checks.eventIdPresent === 'boolean' ? checks.eventIdPresent : null,
  };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const ignoredOperatorEnv = loadIgnoredOperatorEnvForReadiness();
  const billing = getBillingReadiness();
  const billingSyncReceipt = billingSyncReceiptSummary();
  const paidAutomationCheckoutLocks = {
    proMonthly: getBillingCheckoutBlockReason('pro_monthly'),
    proYearly: getBillingCheckoutBlockReason('pro_yearly'),
    founding: getBillingCheckoutBlockReason('founding'),
  };
  const paidAutomationSaleReady = Object.values(paidAutomationCheckoutLocks).some((reason) => reason === null);
  const sourceFiles = [
    'src/lib/billing/checkout.ts',
    'src/lib/billing/entitlement-sync.ts',
    'data/billing-sync-smoke-receipt.json',
    'src/app/api/billing/checkout/route.ts',
    'src/app/api/billing/entitlement-sync/route.ts',
    'src/app/pricing/page.tsx',
    'src/middleware.ts',
    'src/db/schema.ts',
    'scripts/smoke-hosted-auth.cjs',
  ];
  const requiredOptionStatus = billing.options
    .filter((option) => option.requiredForPaidLaunch)
    .map((option) => ({
      key: option.key,
      label: option.label,
      envKey: option.envKey,
      configured: option.configured,
      status: statusLabel(option.configured),
    }));
  const optionalOptionStatus = billing.options
    .filter((option) => !option.requiredForPaidLaunch)
    .map((option) => ({
      key: option.key,
      label: option.label,
      envKey: option.envKey,
      configured: option.configured,
      status: statusLabel(option.configured),
    }));
  const packet = {
    format: 'claimbot.billing-activation-packet.v1',
    generatedAt,
    note: 'Non-secret billing activation packet. This packet intentionally omits checkout URLs, webhook URLs, billing secrets, database URLs, tokens, session secrets, and raw user data.',
    approvalBoundary: {
      packetIsBillingActivation: false,
      billingReady: billing.ready,
      paidAutomationSaleReady,
      readyRequires: [
        'Plus monthly checkout URL',
        'Pro monthly checkout URL',
        'ClaimBot HMAC billing sync secret or Stripe webhook endpoint secret',
        'Non-secret data/billing-sync-smoke-receipt.json proving callback signature and user-reference parsing',
        'CLAIMBOT_LEGAL_REVIEW_ACK=reviewed after legal/compliance review',
        'Verified paid automation worker runtime receipt before Pro or Founding checkout is sold',
        'Deployed preview smoke evidence before production',
      ],
    },
    ignoredOperatorEnv,
    readiness: {
      providerModel: billing.providerModel,
      ready: billing.ready,
      requiredConfigured: billing.requiredConfigured,
      requiredTotal: billing.requiredTotal,
      syncSecretConfigured: billing.syncSecretConfigured,
      claimbotSyncSecretConfigured: billing.claimbotSyncSecretConfigured,
      stripeWebhookSecretConfigured: billing.stripeWebhookSecretConfigured,
      paidAutomationWorkerVerified: billing.paidAutomationWorkerVerified,
      paidAutomationSaleReady,
      paidAutomationCheckoutLocks,
      acceptedSignatureHeaders: billing.acceptedSignatureHeaders,
      syncEndpoint: billing.syncEndpoint,
      missingRequiredEnvKeys: billing.missingRequiredEnvKeys,
      requiredOptionStatus,
      optionalOptionStatus,
      note: billing.note,
    },
    billingSyncReceipt,
    setupRows: {
      required: requiredSetupRows,
      optional: optionalSetupRows,
    },
    checkoutHandoffSafety,
    callbackContract,
    nonSecretSamplePayload,
    sourceEvidence: sourceFiles.map(fileEvidence),
    commands: {
      prepareAndCheck: [
        'npm run billing:packet',
        'npm run billing:receipt',
        'npm run hosted:env:prepare',
        'npm run launch:secrets',
        'npm run hosted:env:doctor',
      ],
      pushAfterConfigured: [
        'npm run hosted:env:push',
        'npm run smoke:hosted:local',
      ],
      deployedPreview: [
        'npm run validate:netlify:strict',
        'npm run preview:gate',
        'npm run production:check-receipt',
      ],
    },
    operatorNotes: hostedOperatorNotes.filter((note) => (
      note.toLowerCase().includes('billing')
      || note.toLowerCase().includes('checkout')
      || note.toLowerCase().includes('processor')
      || note.toLowerCase().includes('preview')
    )),
  };

  const markdown = [
    '# ClaimBot Billing Activation Packet',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This is a non-secret billing activation packet. This packet is not proof that processor setup is complete, and it does not print checkout URLs or billing secrets.',
    '',
    '## Current Gate',
    '',
    `Billing ready: ${billing.ready ? 'yes' : 'no'}`,
    `Paid automation checkout ready: ${paidAutomationSaleReady ? 'yes' : 'no'}`,
    `Required gates: ${billing.requiredConfigured}/${billing.requiredTotal}`,
    `Signed sync configured: ${billing.syncSecretConfigured ? 'yes' : 'no'}`,
    `Paid automation worker verified: ${billing.paidAutomationWorkerVerified ? 'yes' : 'no'}`,
    `Pro monthly checkout lock: ${paidAutomationCheckoutLocks.proMonthly ?? 'none'}`,
    `Founding checkout lock: ${paidAutomationCheckoutLocks.founding ?? 'none'}`,
    `Accepted signature headers: ${billing.acceptedSignatureHeaders.length > 0 ? billing.acceptedSignatureHeaders.join(', ') : 'none yet'}`,
    `Missing required env keys: ${billing.missingRequiredEnvKeys.length > 0 ? billing.missingRequiredEnvKeys.join(', ') : 'none'}`,
    `Billing sync smoke receipt: ${billingSyncReceipt.exists ? billingSyncReceipt.status : 'missing'}`,
    `Ignored operator env loaded: ${ignoredOperatorEnv.loaded}/${ignoredOperatorEnv.available} available non-placeholder values`,
    '',
    '## Required Setup',
    '',
    ...requiredSetupRows.map((row) => {
      const configured = requiredOptionStatus.find((option) => option.envKey === row.envKey)?.configured
        ?? billing.syncSecretConfigured;
      return `- ${row.label}: ${configured ? 'configured' : 'missing'} (${row.envKey}) - ${row.proof}`;
    }),
    '',
    '## Optional Setup',
    '',
    ...optionalOptionStatus.map((option) => `- ${option.label}: ${option.status} (${option.envKey})`),
    '',
    '## Checkout Handoff Safety',
    '',
    `Route: ${checkoutHandoffSafety.route}`,
    `Enforced by: ${checkoutHandoffSafety.enforcedBy}`,
    `Audit event: ${checkoutHandoffSafety.auditEvent}`,
    `Audit fields: ${checkoutHandoffSafety.auditFields.join(', ')}`,
    `Boundary: ${checkoutHandoffSafety.boundary}`,
    'Pro and Founding checkout also require verified worker runtime proof so paid full automation is not sold before file_claim jobs can run automatically.',
    '',
    ...checkoutHandoffSafety.blockReasons.map((item) => (
      `- ${item.reason}: ${item.meaning} Redirects to ${item.userDestination}.`
    )),
    '',
    '## Callback Contract',
    '',
    ...callbackContract.map((item) => `- ${item}`),
    '',
    'Non-secret sample payload:',
    '',
    '```json',
    JSON.stringify(nonSecretSamplePayload, null, 2),
    '```',
    '',
    '## Billing Sync Smoke Receipt',
    '',
    billingSyncReceipt.exists
      ? `- Status: ${billingSyncReceipt.status}`
      : '- Status: missing',
    billingSyncReceipt.generatedAt ? `- Generated: ${billingSyncReceipt.generatedAt}` : '',
    billingSyncReceipt.claimbotSignatureAccepted !== null ? `- ClaimBot HMAC accepted: ${billingSyncReceipt.claimbotSignatureAccepted ? 'yes' : 'no'}` : '',
    billingSyncReceipt.stripeSignatureAccepted !== null ? `- Stripe signature accepted: ${billingSyncReceipt.stripeSignatureAccepted ? 'yes' : 'no'}` : '',
    billingSyncReceipt.stableUserReferencePresent !== null ? `- Stable user reference parsed: ${billingSyncReceipt.stableUserReferencePresent ? 'yes' : 'no'}` : '',
    billingSyncReceipt.eventIdPresent !== null ? `- Event id parsed: ${billingSyncReceipt.eventIdPresent ? 'yes' : 'no'}` : '',
    '',
    '## Source Evidence',
    '',
    ...packet.sourceEvidence.map((item) => `- ${item.path}: ${item.exists ? `present, ${item.bytes} bytes` : 'missing'}`),
    '',
    '## Commands',
    '',
    'Prepare and check:',
    '',
    ...packet.commands.prepareAndCheck.map((command) => `- \`${command}\``),
    '',
    'Push after configured:',
    '',
    ...packet.commands.pushAfterConfigured.map((command) => `- \`${command}\``),
    '',
    'Deployed preview:',
    '',
    ...packet.commands.deployedPreview.map((command) => `- \`${command}\``),
    '',
    '## Notes',
    '',
    '- ClaimBot does not handle card data directly.',
    '- Payment does not bypass proof, authorization, audit, shadow-mode, or launch gates.',
    '- Paid automation requires an active entitlement after signed billing sync.',
    '- No secret values were printed.',
    '',
  ].join('\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[billing-activation-packet] wrote non-secret billing packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Billing ready: ${billing.ready ? 'yes' : 'no'}`);
  console.log(`Missing required env keys: ${billing.missingRequiredEnvKeys.length}`);
  console.log('No secret values were printed.');
}

main().catch((error) => {
  console.error('[billing-activation-packet] failed');
  console.error(error);
  process.exit(1);
});
