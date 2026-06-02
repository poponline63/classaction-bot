import Link from 'next/link';
import {
  billingSyncSetupCommands,
  deployCommands,
  getLaunchFixCommand,
  hostedEnvironmentSetupCommands,
  getLaunchReadiness,
  hostedDatabaseSetupCommands,
  identitySetupSteps,
  launchPacketCommands,
  localAuthSmokeCommands,
  netlifyProjectSetupReceiptCommands,
  netlifySiteLinkCommands,
  previewSmokeCommands,
  secretCommands,
  verificationCommands,
} from '@lib/launch-readiness';
import {
  getLaunchCriticalPath,
  getLaunchExternalBlockerSummary,
  getLaunchHandoffChecklist,
  getMatcherReceiptCriticalPathBlockers,
} from '@lib/launch-handoff';
import { buildLaunchActionPlan, buildLaunchCommandQueue, summarizeLaunchActionPlan } from '@lib/launch-action-plan';
import { readLatestMatcherRunReceipt } from '@lib/audit/support-packet';
import { currentUserId } from '@lib/auth/current-user';
import { getBillingCheckoutBlockReason, getBillingReadiness } from '@lib/billing/checkout';
import { getUserSubscription } from '@lib/billing/entitlements';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import {
  buildFullAutomationLaunchBlockers,
  summarizeFullAutomationLaunchBlockers,
} from '@lib/full-automation-launch-blockers';
import { getLaunchPacketArtifactRows } from '@lib/launch-packet-stack';
import { readLaunchPacketRefreshReport } from '@lib/launch-packet-refresh-report';
import { formatLocalVerificationDuration, readLocalVerificationPacket } from '@lib/local-verification-packet';
import { buildOwnerHandoffBriefs } from '@lib/owner-handoff-briefs';
import CliCommandRows from '../CliCommandRows';
import LaunchReadinessCommandBar from '../LaunchReadinessCommandBar';
import LaunchTrustBridge from '../LaunchTrustBridge';
import SecretSafeSnippet from '../SecretSafeSnippet';

export const dynamic = 'force-dynamic';

const launchActionCommandByKey: Record<string, string> = {
  'local-tooling': 'npm run netlify:doctor',
  'operator-account': 'npm run hosted:env:prepare',
  'hosted-database': 'npm run hosted:db:prepare',
  'netlify-identity-proof': 'npm run netlify:record-setup',
  'business-billing': 'npm run hosted:env:prepare',
  'legal-review': 'npm run validate:legal',
  'deployed-preview': 'npm run validate:netlify:strict',
  'promotion-receipt': 'npm run preview:gate',
  uncategorized: 'npm run launch:handoff',
  ready: 'npm run production:check-receipt',
};

const launchActionHrefByKey: Record<string, string> = {
  'local-tooling': '#production-gates',
  'operator-account': '#production-gates',
  'hosted-database': '#client-data-readiness',
  'netlify-identity-proof': '#production-gates',
  'business-billing': '#billing-handoff',
  'legal-review': '#production-gates',
  'deployed-preview': '#preview-target',
  'promotion-receipt': '#promotion-receipt',
  uncategorized: '#production-gates',
  ready: '#production-gates',
};

const launchProofSurfaceByKey: Record<string, string> = {
  'local-tooling': 'Netlify doctor output and launch handoff report.',
  'operator-account': 'Hosted env doctor, Netlify setup receipt, support packet, and /launch gates.',
  'hosted-database': 'Hosted migration output, schema validator, source import dry-run, and support packet.',
  'netlify-identity-proof': 'Netlify dashboard confirmation and non-secret setup receipt.',
  'business-billing': 'Processor-hosted checkout links, signed entitlement-sync smoke, and billing handoff panel.',
  'legal-review': 'Legal readiness validator, reviewed policy pages, user Terms acknowledgement gate, and launch acknowledgment env gate.',
  'deployed-preview': 'HTTPS Netlify preview URL, strict Netlify preflight, and deployed preview smokes.',
  'promotion-receipt': 'Fresh preview-promotion receipt plus production receipt validation.',
  uncategorized: 'Launch handoff report and operator remediation notes.',
  ready: 'Preview promotion receipt and production receipt check.',
};

export default async function LaunchPage() {
  const {
    blockers,
    clientPreviewReady: launchReadinessClientPreviewReady,
    featureFlags,
    ignoredOperatorEnvAvailable,
    ignoredOperatorEnvLoaded,
    liveFilingFeatureEnabled,
    liveAck,
    mode,
    netlifyProjectSetupReceiptReadiness,
    netlifyPreviewReadiness,
    previewPromotionReceiptReadiness,
    pwaReadiness,
    readiness,
    sourceCatalogReadiness: sourceCatalog,
    warnings,
  } = await getLaunchReadiness();
  const billing = getBillingReadiness();
  const userId = await currentUserId();
  const [subscription, matcherRunReceipt] = await Promise.all([
    getUserSubscription(userId),
    readLatestMatcherRunReceipt(userId),
  ]);
  const clientPreviewChecklist = await buildClientPreviewChecklist(userId);
  const localVerificationPacket = readLocalVerificationPacket();
  const launchPacketRefreshReport = readLaunchPacketRefreshReport();
  const matcherReceiptReady = matcherRunReceipt.exists && matcherRunReceipt.errorCount === 0;
  const launchPacketRows = getLaunchPacketArtifactRows(matcherRunReceipt);
  const launchPacketReadyCount = launchPacketRows.filter((artifact) => artifact.ready).length;
  const netlifyLaunchDoctorPacket = launchPacketRows.find((artifact) => artifact.path === 'data/netlify-launch-doctor.md') ?? null;
  const fullAutomationLaunchBlockers = buildFullAutomationLaunchBlockers(launchPacketRows);
  const fullAutomationLaunchBlockerSummary = summarizeFullAutomationLaunchBlockers(fullAutomationLaunchBlockers);
  const launchBlockers = [
    ...blockers,
    ...getMatcherReceiptCriticalPathBlockers(matcherRunReceipt),
  ];
  const clientPreviewReady = clientPreviewChecklist.summary.clientPreviewReady;
  const totalSettlements = sourceCatalog.totalSettlements;
  const sourceProviderCount = sourceCatalog.sourceProviderCount;
  const sourceCatalogReady = sourceCatalog.sourceCatalogReady;
  const formCoverage = sourceCatalog.formCoveragePercent;
  const deadlineCoverage = sourceCatalog.deadlineCoveragePercent;
  const knownAdministratorCoverage = sourceCatalog.knownAdministratorPercent;
  const categorizedCoverage = sourceCatalog.categorizedPercent;
  const cleanTextCount = sourceCatalog.cleanTextCount;
  const mojibakeCount = sourceCatalog.mojibakeCount;
  const textEncodingReady = sourceCatalog.textEncodingReady;
  const sourceQualityReady = sourceCatalog.sourceQualityReady;
  const latestSourceImportDigest = sourceCatalog.latestSourceImportDigest;
  const sourceDataIssues = sourceCatalog.items.filter((item) => item.status !== 'pass');
  const lastScraperAuditAt = sourceCatalog.lastScraperAuditAt
    ? new Date(sourceCatalog.lastScraperAuditAt)
    : null;
  const launchBlockerLinks = [
    ...launchBlockers.map((item) => ({
      key: item.key,
      label: item.label,
      detail: item.action ?? item.detail,
      href: '#production-gates',
    })),
    ...(!sourceCatalogReady ? [{
      key: 'source-catalog',
      label: 'Source catalog',
      detail: 'Load settlement sources before client previews.',
      href: '#client-data-readiness',
    }] : []),
    ...(formCoverage === 0 ? [{
      key: 'claim-form-coverage',
      label: 'Claim form coverage',
      detail: 'Link claim forms before treating matching as representative.',
      href: '#client-data-readiness',
    }] : []),
  ].slice(0, 5);
  const handoffChecklist = getLaunchHandoffChecklist({
    mode,
    readinessOk: clientPreviewReady,
    sourceCatalogReady,
    formCoverage,
    pwaReady: pwaReadiness.ok,
    matcherReceiptReady,
    matcherReceiptErrorCount: matcherRunReceipt.errorCount,
    featureFlags,
  });
  const externalBlockerSummary = getLaunchExternalBlockerSummary(launchBlockers);
  const launchCriticalPath = getLaunchCriticalPath(launchBlockers, {
    netlifyIdentityReady: netlifyProjectSetupReceiptReadiness.identityReady,
  });
  const launchActionPlan = buildLaunchActionPlan(launchCriticalPath);
  const launchActionPlanSummary = summarizeLaunchActionPlan(launchActionPlan);
  const operatorCommandQueue = buildLaunchCommandQueue(launchActionPlan);
  const ownerHandoffBriefs = buildOwnerHandoffBriefs(
    launchActionPlan,
    operatorCommandQueue,
    launchPacketRows
      .filter((artifact) => !artifact.ready)
      .map((artifact) => ({
        owner: artifact.owner,
        label: artifact.label,
        path: artifact.path,
        missingInputs: artifact.missingInputs,
      })),
  );
  const nextActivationStep = launchActionPlanSummary.nextStep;
  const criticalPathReadyCount = launchCriticalPath.filter((item) => item.status === 'confirmed').length;
  const operatorUnblockRows = launchCriticalPath.slice(0, 4).map((item, index) => ({
    ...item,
    index: index + 1,
    command: launchActionCommandByKey[item.key] ?? 'npm run launch:handoff',
    href: launchActionHrefByKey[item.key] ?? '#production-gates',
  }));
  const launchProofRows = launchActionPlan.map((item) => ({
    ...item,
    index: item.order,
    command: launchActionCommandByKey[item.key] ?? item.commands[0] ?? 'npm run launch:handoff',
    href: launchActionHrefByKey[item.key] ?? '#production-gates',
    proofSurface: launchProofSurfaceByKey[item.key] ?? 'Launch handoff report and support packet.',
  }));
  const launchProofGapCount = launchProofRows.filter((item) => item.status !== 'confirmed').length;
  const clientPreviewChecklistBlockedRows = clientPreviewChecklist.items.filter((item) => item.status !== 'ready');
  const latestLocalVerificationFailures = localVerificationPacket.commands
    .filter((command) => command.required && !command.ok)
    .slice(0, 3);
  const latestLocalVerificationPasses = localVerificationPacket.commands
    .filter((command) => command.ok)
    .slice(-3);
  const latestLaunchRefreshResults = launchPacketRefreshReport.commands.slice(-3);
  const netlifyDoctorMissingInputs = netlifyLaunchDoctorPacket?.missingInputs ?? [];
  const handoffReadyCount = handoffChecklist.filter((item) => item.status === 'confirmed').length;
  const shadowInviteReady = mode === 'shadow' && !liveFilingFeatureEnabled;
  const legalReviewReady = !blockers.some((item) => item.key === 'legal-review');
  const paidCheckoutBlockReasons = {
    plusMonthly: getBillingCheckoutBlockReason('plus_monthly'),
    proMonthly: getBillingCheckoutBlockReason('pro_monthly'),
  };
  const paidCheckoutReady = Object.values(paidCheckoutBlockReasons).every((reason) => reason === null);
  const paidCheckoutCurrentBlockReason = paidCheckoutBlockReasons.proMonthly
    ?? paidCheckoutBlockReasons.plusMonthly
    ?? 'none';
  const hasBlocker = (key: string) => blockers.some((item) => item.key === key);
  const operatorSetupActionRows = [
    {
      key: 'confirm-netlify-account',
      title: 'Confirm Netlify account and Identity',
      blocked: !netlifyProjectSetupReceiptReadiness.identityReady,
      owner: 'Deployment operator',
      detail: 'Log in to Netlify, confirm the linked ClaimBot site, enable Identity with invite-only registration and email confirmation, then record the non-secret setup receipt.',
      proof: 'data/netlify-project-setup-receipt.json, data/netlify-launch-doctor.md',
      commands: ['netlify login', 'netlify status', 'npm run netlify:doctor', 'npm run netlify:record-setup'],
    },
    {
      key: 'fill-contact-env',
      title: 'Fill support and scraper contact values',
      blocked: hasBlocker('support-contact') || hasBlocker('scraper-contact'),
      owner: 'Support operator',
      detail: 'Put the monitored support mailbox and public scraper contact URL in the ignored hosted env file before client or scraper traffic reaches the app.',
      proof: '.env.hosted.local, data/operator-setup-packet.md',
      commands: ['npm run hosted:env:prepare', 'npm run operator:packet', 'npm run hosted:env:doctor:bootstrap'],
    },
    {
      key: 'push-auth-security',
      title: 'Push auth, session, and security env',
      blocked: hasBlocker('hosted-auth') || hasBlocker('session-secret') || hasBlocker('security-headers'),
      owner: 'Deployment operator',
      detail: 'Keep hosted auth enabled, generate launch secrets, push them only after Netlify login, and verify without printing values.',
      proof: '.env.launch.local, data/netlify-launch-doctor.md, data/operator-setup-packet.md',
      commands: ['npm run launch:secrets', 'npm run hosted:env:push:bootstrap', 'npm run netlify:doctor'],
    },
    {
      key: 'prove-worker-runtime',
      title: 'Prove paid full-automation worker runtime',
      blocked: hasBlocker('automation-worker-runtime'),
      owner: 'Worker operator',
      detail: 'Paid complete automation stays locked until a persistent worker or scheduler proves hosted file_claim jobs are processed automatically.',
      proof: 'data/worker-smoke-receipt.json, data/worker-runtime-packet.md',
      commands: ['CLAIMBOT_WORKER_SMOKE_SEED=allow npm run worker:file-claim:seed', 'npm run worker:once', 'npm run worker:packet'],
    },
  ];
  const operatorSetupBlockedActionCount = operatorSetupActionRows.filter((row) => row.blocked).length;
  const operatorSetupStarterCommands = (operatorSetupActionRows.find((row) => row.blocked) ?? operatorSetupActionRows[0] ?? {
    commands: ['npm run operator:packet'],
  }).commands;
  const supportContactReady = !hasBlocker('support-contact');
  const envHandoffRows = [
    {
      key: 'DATABASE_URL',
      label: 'Persistent database URL',
      gather: 'Create or choose the hosted database connection string for production client records.',
      owner: 'Database / Netlify operator',
      placeholder: 'libsql://YOUR_DATABASE.turso.io',
      missing: hasBlocker('database'),
    },
    {
      key: 'DATABASE_AUTH_TOKEN',
      label: 'Hosted database auth token',
      gather: 'Store the database token as a secret when DATABASE_URL uses libSQL or Turso.',
      owner: 'Database / Netlify operator',
      placeholder: 'YOUR_DATABASE_TOKEN',
      missing: hasBlocker('database-auth'),
    },
    {
      key: 'CLAIM_FILER_MODE',
      label: 'Default filing posture',
      gather: 'Keep first client launches in shadow mode so ClaimBot prepares and audits without external submission.',
      owner: 'Site operator',
      placeholder: 'shadow',
      missing: hasBlocker('filing-mode'),
    },
    {
      key: 'CLAIM_FILER_MAX_PER_DAY',
      label: 'Daily filing cap',
      gather: 'Use a conservative numeric cap even while live filing remains disabled.',
      owner: 'Site operator',
      placeholder: '20',
      missing: hasBlocker('daily-cap'),
    },
    {
      key: 'CLAIMBOT_WORKER_RUNTIME',
      label: 'Paid automation worker runtime',
      gather: 'Record the verified runtime that processes file_claim jobs after the web app queues paid commands.',
      owner: 'Deployment / worker operator',
      placeholder: 'scheduled-worker',
      missing: hasBlocker('automation-worker-runtime'),
    },
    {
      key: 'CLAIMBOT_WORKER_RUNTIME_RECEIPT',
      label: 'Paid automation worker receipt',
      gather: 'Set to verified only after the hosted worker smoke proves due file_claim jobs are processed automatically.',
      owner: 'Deployment / worker operator',
      placeholder: 'verified',
      missing: hasBlocker('automation-worker-runtime'),
    },
    {
      key: 'SCRAPER_USER_AGENT',
      label: 'Scraper contact identity',
      gather: 'Pick the public contact URL that should appear in hosted scraper requests.',
      owner: 'Site operator',
      placeholder: 'ClaimBot/0.1 (+https://yourdomain.com/contact)',
      missing: hasBlocker('scraper-contact'),
    },
    {
      key: 'CLAIMBOT_SUPPORT_EMAIL',
      label: 'Monitored support mailbox',
      gather: 'Choose the mailbox clients and settlement-source operators can contact.',
      owner: 'Support operator',
      placeholder: 'support@yourdomain.com',
      missing: hasBlocker('support-contact'),
    },
    {
      key: 'CLAIMBOT_DISABLE_AUTH',
      label: 'Hosted auth gate',
      gather: 'Set this to false so protected routes require the signed Netlify Identity app session.',
      owner: 'Deployment operator',
      placeholder: 'false',
      missing: hasBlocker('hosted-auth'),
    },
    {
      key: 'CLAIMBOT_ENFORCE_CSP',
      label: 'Security headers enforcement',
      gather: 'Set this on non-Netlify hosts; Netlify deploys can also keep it explicit.',
      owner: 'Deployment operator',
      placeholder: 'true',
      missing: hasBlocker('security-headers'),
    },
    {
      key: 'CLAIMBOT_SESSION_SECRET',
      label: 'Session signing secret',
      gather: 'Generate a long random secret and store it only in hosted environment variables.',
      owner: 'Deployment operator',
      placeholder: 'PASTE_GENERATED_SESSION_SECRET',
      missing: hasBlocker('session-secret'),
    },
    {
      key: 'CLAIMBOT_FEATURE_SETTLEMENT_SEARCH',
      label: 'Settlement discovery feature flag',
      gather: 'Enable settlement discovery for hosted client previews so matching can find claim opportunities.',
      owner: 'Product operator',
      placeholder: 'true',
      missing: hasBlocker('settlement-search-feature'),
    },
    {
      key: 'CLAIMBOT_FEATURE_BREACH_IMPORT',
      label: 'Breach import feature flag',
      gather: 'Enable breach evidence intake only when support and HIBP handling are ready.',
      owner: 'Product operator',
      placeholder: 'true',
      missing: false,
    },
    {
      key: 'CLAIMBOT_FEATURE_LIVE_FILING',
      label: 'Live filing feature flag',
      gather: 'Keep live filing hidden for first hosted client launches until review explicitly approves it.',
      owner: 'Product / legal operator',
      placeholder: 'false',
      missing: false,
    },
    {
      key: 'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
      label: 'Plus checkout link',
      gather: 'Create the processor-hosted Plus checkout link so paid automation CTAs can redirect safely.',
      owner: 'Billing operator',
      placeholder: 'https://YOUR_PROCESSOR_CHECKOUT_LINK',
      missing: !billing.options.find((option) => option.envKey === 'CLAIMBOT_BILLING_PLUS_MONTHLY_URL')?.configured,
    },
    {
      key: 'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
      label: 'Pro checkout link',
      gather: 'Create the processor-hosted Pro checkout link for authorized automation customers.',
      owner: 'Billing operator',
      placeholder: 'https://YOUR_PROCESSOR_CHECKOUT_LINK',
      missing: !billing.options.find((option) => option.envKey === 'CLAIMBOT_BILLING_PRO_MONTHLY_URL')?.configured,
    },
    {
      key: 'CLAIMBOT_BILLING_SYNC_SECRET',
      label: 'Billing webhook verifier',
      gather: 'Generate a separate ClaimBot signing secret or use a Stripe webhook endpoint secret so entitlement callbacks can be verified and replay-safe.',
      owner: 'Billing / deployment operator',
      placeholder: 'PASTE_GENERATED_BILLING_SYNC_SECRET or whsec_YOUR_STRIPE_ENDPOINT_SECRET',
      missing: !billing.syncSecretConfigured,
    },
    {
      key: 'CLAIMBOT_LEGAL_REVIEW_ACK',
      label: 'Legal/compliance review acknowledgment',
      gather: 'Set to reviewed only after Terms, Privacy, proof gates, pricing, billing, and filing posture are reviewed.',
      owner: 'Legal / product operator',
      placeholder: 'reviewed',
      missing: hasBlocker('legal-review'),
    },
  ];
  const missingEnvCount = envHandoffRows.filter((row) => row.missing).length;
  const envSnippet = envHandoffRows.map((row) => `${row.key}="${row.placeholder}"`).join('\n');
  const inviteRows: Array<{
    title: string;
    detail: string;
    status: 'confirmed' | 'needs-review';
  }> = [
    {
      title: 'Invite route',
      detail: readiness.ok
        ? 'Send clients to the hosted /login route after identity, session signing, and auth smoke checks pass.'
        : 'Do not send client invites until hosted identity, session signing, database, and security gates are fixed.',
      status: readiness.ok ? 'confirmed' : 'needs-review',
    },
    {
      title: 'First-run posture',
      detail: shadowInviteReady
        ? 'First client sessions open in shadow mode with live filing disabled.'
        : 'Set the first client run back to shadow mode and keep live filing disabled before invite.',
      status: shadowInviteReady ? 'confirmed' : 'needs-review',
    },
    {
      title: 'Client workflow path',
      detail: sourceCatalogReady && formCoverage > 0
        ? 'Clients can move from /goal to setup, review, and queue with source records and claim forms visible.'
        : 'Load settlement sources and claim-form links before treating client matching as representative.',
      status: sourceCatalogReady && formCoverage > 0 ? 'confirmed' : 'needs-review',
    },
    {
      title: 'Support and pause path',
      detail: supportContactReady
        ? 'Support routing has a validated operator contact; keep settings and audit review ready for pause or rollback questions.'
        : 'Configure CLAIMBOT_SUPPORT_EMAIL so access, privacy, scraper, and safety questions reach an operator.',
      status: supportContactReady ? 'confirmed' : 'needs-review',
    },
    {
      title: 'Legal/compliance review',
      detail: legalReviewReady
        ? 'Hosted Terms, Privacy Policy, trust copy, proof handling, authorization gates, pricing, billing sync, and filing posture have been acknowledged as reviewed.'
        : 'Complete legal/compliance review before sharing the hosted workspace with clients.',
      status: legalReviewReady ? 'confirmed' : 'needs-review',
    },
    {
      title: 'Paid checkout handoff',
      detail: paidCheckoutReady
        ? 'Paid checkout links, signed entitlement sync, and legal-review acknowledgement are ready before clients see paid handoff.'
        : `Paid checkout remains blocked by ${paidCheckoutCurrentBlockReason}; keep users on billing support until launch proof is complete.`,
      status: paidCheckoutReady ? 'confirmed' : 'needs-review',
    },
  ];
  const inviteReadyCount = inviteRows.filter((item) => item.status === 'confirmed').length;
  const launchVerificationRows: Array<{
    title: string;
    detail: string;
    status: 'confirmed' | 'needs-review';
  }> = [
    {
      title: 'Netlify preview target',
      detail: netlifyPreviewReadiness.ok
        ? 'A confirmed Netlify site, HTTPS preview URL, and smoke-test secrets are ready for preview promotion.'
        : `${netlifyPreviewReadiness.failureCount} strict Netlify preview gate${netlifyPreviewReadiness.failureCount === 1 ? '' : 's'} still need setup.`,
      status: netlifyPreviewReadiness.ok ? 'confirmed' : 'needs-review',
    },
    {
      title: 'Netlify project setup receipt',
      detail: netlifyProjectSetupReceiptReadiness.identityReady
        ? 'The non-secret project receipt records the confirmed ClaimBot Netlify site, Identity enabled, invite-only registration, and email confirmation.'
        : 'Record the confirmed Netlify project and Identity dashboard settings before client invites.',
      status: netlifyProjectSetupReceiptReadiness.identityReady ? 'confirmed' : 'needs-review',
    },
    {
      title: 'Production promotion receipt',
      detail: previewPromotionReceiptReadiness.ok
        ? 'A fresh deployed-preview receipt proves preview:gate passed against the confirmed Netlify preview before production deploy.'
        : `${previewPromotionReceiptReadiness.failureCount} receipt gate${previewPromotionReceiptReadiness.failureCount === 1 ? '' : 's'} still need proof before production deploy.`,
      status: previewPromotionReceiptReadiness.ok ? 'confirmed' : 'needs-review',
    },
    {
      title: 'Environment handoff',
      detail: missingEnvCount === 0
        ? 'Required production environment keys are validated with real non-placeholder values for hosted shadow launch review.'
        : `${missingEnvCount} production environment value${missingEnvCount === 1 ? '' : 's'} still need operator handoff.`,
      status: missingEnvCount === 0 ? 'confirmed' : 'needs-review',
    },
    {
      title: 'Access provisioning',
      detail: readiness.ok
        ? 'Hosted access can be checked through the login route, Netlify Identity setup, and auth smoke commands.'
        : 'Access remains blocked until hosted database, Netlify Identity, support, session, and security gates pass.',
      status: readiness.ok ? 'confirmed' : 'needs-review',
    },
    {
      title: 'Operational readiness',
      detail: sourceCatalogReady && formCoverage > 0
        ? 'Source records and claim-form links are visible for client workflow testing.'
        : 'Source records and claim-form links are not ready for representative client testing.',
      status: sourceCatalogReady && formCoverage > 0 ? 'confirmed' : 'needs-review',
    },
    {
      title: 'Shadow-mode evidence',
      detail: shadowInviteReady
        ? 'First client preview remains in shadow mode with live filing disabled.'
        : 'Return the deployment to shadow mode and disable live filing before client preview.',
      status: shadowInviteReady ? 'confirmed' : 'needs-review',
    },
    {
      title: 'PWA install shell',
      detail: pwaReadiness.ok
        ? 'Manifest, workflow shortcuts, offline safety shell, service-worker cache boundary, install status, and hosted PWA headers are ready.'
        : `${pwaReadiness.failureCount} PWA readiness gate${pwaReadiness.failureCount === 1 ? '' : 's'} need review before client installs.`,
      status: pwaReadiness.ok ? 'confirmed' : 'needs-review',
    },
    {
      title: 'User Terms acknowledgement gate',
      detail: 'Setup cannot start discovery, matching, or safe queue preparation until the user checks the Terms boundary control; the server records USER_TERMS_ACKNOWLEDGED with TERMS_BOUNDARY_ACK.',
      status: 'confirmed',
    },
    {
      title: 'Billing checkout handoff',
      detail: paidCheckoutReady
        ? 'Plus and Pro paid CTAs can redirect to processor-hosted checkout with signed entitlement sync and legal-review acknowledgement recorded.'
        : `Payment handoff stays locked: ${paidCheckoutCurrentBlockReason}. Processor billing ready is tracked separately from paid checkout readiness.`,
      status: paidCheckoutReady ? 'confirmed' : 'needs-review',
    },
    {
      title: 'Matcher refresh receipt',
      detail: matcherRunReceipt.exists
        ? `MATCHER_RUN_COMPLETED audit event #${matcherRunReceipt.auditEventId} records ${matcherRunReceipt.settlementsProcessed ?? 0} processed source${matcherRunReceipt.settlementsProcessed === 1 ? '' : 's'}, ${matcherRunReceipt.verdictsChanged ?? 0} changed verdict${matcherRunReceipt.verdictsChanged === 1 ? '' : 's'}, and ${matcherRunReceipt.errorCount ?? 0} run error${matcherRunReceipt.errorCount === 1 ? '' : 's'}.`
        : 'Run the matcher from Review so the account support packet can prove the latest refresh before relying on client-facing matcher results.',
      status: matcherRunReceipt.exists && matcherRunReceipt.errorCount === 0 ? 'confirmed' : 'needs-review',
    },
    {
      title: 'Legal/compliance review',
      detail: legalReviewReady
        ? 'Legal/compliance acknowledgment is recorded for the hosted deployment.'
        : 'Set CLAIMBOT_LEGAL_REVIEW_ACK=reviewed only after reviewing legal boundaries, proof gates, pricing, billing, and filing posture.',
      status: legalReviewReady ? 'confirmed' : 'needs-review',
    },
  ];
  const launchVerificationReadyCount = launchVerificationRows.filter((row) => row.status === 'confirmed').length;
  const billingHandoffCommands = billing.missingRequiredEnvKeys.flatMap((key) => (
    key === 'CLAIMBOT_BILLING_SYNC_SECRET' || key === 'CLAIMBOT_BILLING_SYNC_SECRET_OR_STRIPE_WEBHOOK_SECRET'
      ? billingSyncSetupCommands
      : [`netlify env:set ${key} "https://YOUR_PROCESSOR_CHECKOUT_LINK" --context production deploy-preview`]
  ));

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Hosted deployment</div>
          <h1>Launch checklist</h1>
          <p>
            Verify the production environment, access gate, support contact, and safety posture
            before sharing ClaimBot with clients.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/settings">Runtime settings</Link>
          <a className="btn ghost" href="/api/health">Health check</a>
        </div>
      </div>

      <LaunchTrustBridge currentStep="launch" tierName={subscription.plan} />

      <LaunchReadinessCommandBar
        blockers={blockers}
        warnings={warnings}
        mode={mode}
        liveAck={liveAck}
        liveFilingFeatureEnabled={liveFilingFeatureEnabled}
        blockerHref="#production-gates"
      />

      <section className={`launch-unblock-console ${clientPreviewReady ? 'ready' : 'blocked'}`} aria-label="Operator unblock console">
        <header className="launch-unblock-console-head">
          <div>
            <div className="eyebrow">Operator unblock console</div>
            <h2>{clientPreviewReady ? 'Client preview can move to promotion checks' : 'Finish these workstreams before inviting clients'}</h2>
            <p>
              This turns the current launch report into a short action queue. It shows what to gather,
              where the proof appears, and the first non-secret command to run without exposing env values.
            </p>
          </div>
          <span className={`tag ${clientPreviewReady ? 'good' : 'warn'}`}>
            {launchBlockers.length} blocker{launchBlockers.length === 1 ? '' : 's'} active
          </span>
        </header>

        <div className="launch-unblock-grid">
          {operatorUnblockRows.map((item) => (
            <article className={`launch-unblock-card ${item.status}`} key={item.key}>
              <span className="launch-unblock-step">{item.index}</span>
              <div>
                <div className="launch-unblock-card-head">
                  <strong>{item.label}</strong>
                  <span className={`tag ${item.status === 'confirmed' ? 'good' : 'warn'}`}>
                    {item.status === 'confirmed' ? 'Clear' : `${item.blockerCount} blocker${item.blockerCount === 1 ? '' : 's'}`}
                  </span>
                </div>
                <p><b>Gather:</b> {item.proofNeeded}</p>
                <p><b>Proof surface:</b> Launch handoff, support packet, and this readiness page.</p>
                <code>{item.command}</code>
                <Link className="btn ghost sm" href={item.href}>Open proof area</Link>
              </div>
            </article>
          ))}
        </div>

        <div className="launch-unblock-boundary">
          <strong>Still locked until evidence exists</strong>
          <span>
            Placeholder env values, local-only smokes, unrecorded Identity settings, missing checkout links,
            and absent preview receipts never count as client-ready launch evidence.
          </span>
        </div>
      </section>

      <section className="launch-proof-matrix" aria-label="Client launch action plan">
        <header className="launch-proof-matrix-head">
          <div>
            <div className="eyebrow">Client launch action plan</div>
            <h2>
              {launchActionPlanSummary.blockedSteps === 0
                ? 'All missing-step workstreams are cleared'
                : `${launchActionPlanSummary.blockedSteps} workstream${launchActionPlanSummary.blockedSteps === 1 ? '' : 's'} still need external proof`}
            </h2>
            <p>
              This is the operator-facing runbook generated from the current blockers. Each step names the owner,
              client impact, proof artifacts, and the commands that create non-secret evidence for the next handoff.
            </p>
          </div>
          <span className={`tag ${launchActionPlanSummary.blockedSteps === 0 ? 'good' : 'warn'}`}>
            {launchActionPlanSummary.confirmedSteps}/{launchActionPlanSummary.totalSteps} clear
          </span>
        </header>

        {nextActivationStep && (
          <div className="launch-activation-brief" aria-label="Next evidence activation runbook">
            <div className="launch-activation-brief-main">
              <span className="launch-activation-kicker">Next evidence activation</span>
              <strong>{nextActivationStep.label}</strong>
              <p>{nextActivationStep.nextAction}</p>
              <p><b>Why it matters:</b> {nextActivationStep.clientImpact}</p>
              <p><b>Execution boundary:</b> {nextActivationStep.executionBoundary}</p>
              <p><b>Required inputs:</b> {nextActivationStep.requiredInputs.join(', ')}</p>
              <p><b>Workbook:</b> data/external-activation-workbook.md</p>
              <p><b>Hosted export:</b> /api/audit/external-activation-workbook</p>
              <p><b>Handoff export:</b> /api/audit/launch-handoff</p>
            </div>
            <div className="launch-activation-brief-proof">
              <span>Proof bundle</span>
              <ul>
                {nextActivationStep.proofArtifacts.map((artifact) => (
                  <li key={artifact}>{artifact}</li>
                ))}
              </ul>
            </div>
            <div className="launch-activation-brief-commands">
              <span>Starter commands</span>
              <CliCommandRows commands={nextActivationStep.commands.slice(0, 6)} compact />
              {nextActivationStep.commands.length > 6 && (
                <small className="muted">+{nextActivationStep.commands.length - 6} more in the generated handoff report</small>
              )}
            </div>
          </div>
        )}

        <div className={`launch-activation-brief ${operatorSetupBlockedActionCount === 0 ? 'confirmed' : 'blocked'}`} aria-label="Operator account setup action map">
          <div className="launch-activation-brief-main">
            <span className="launch-activation-kicker">Operator account setup actions</span>
            <strong>
              {operatorSetupBlockedActionCount === 0
                ? 'Operator account setup actions are clear'
                : `${operatorSetupBlockedActionCount} operator action${operatorSetupBlockedActionCount === 1 ? '' : 's'} still need proof`}
            </strong>
            <p>
              This is the short-form path for the current Operator account settings gate:
              confirm the Netlify site, fill public contact values, push auth/security env,
              and prove the paid worker runtime before clients see full automation.
            </p>
            <p><b>Packet:</b> data/operator-setup-packet.md</p>
            <p><b>Boundary:</b> The map names proof files and commands only; it never treats local placeholders, pasted secrets, or dashboard claims as launch evidence by themselves.</p>
          </div>
          <div className="launch-activation-brief-proof">
            <span>{operatorSetupBlockedActionCount === 0 ? 'Action proof' : 'Blocked action proof'}</span>
            <ul>
              {operatorSetupActionRows.map((row) => (
                <li key={row.key}>
                  {row.title}: {row.blocked ? 'blocked' : 'ready'} - {row.proof}
                </li>
              ))}
            </ul>
          </div>
          <div className="launch-activation-brief-commands">
            <span>Current starter commands</span>
            <CliCommandRows commands={operatorSetupStarterCommands} compact />
            <small className="muted">
              Full action details are regenerated by npm run operator:packet.
            </small>
          </div>
        </div>

        <div className="launch-command-queue" aria-label="Operator command queue">
          <div className="launch-command-queue-head">
            <div>
              <div className="eyebrow">Operator command queue</div>
              <h3>Run local evidence first, then external account commands</h3>
              <p>
                The queue separates commands that can regenerate non-secret local proof from commands that
                wait on Netlify login, hosted database values, billing links, legal review, or deployed-preview input.
              </p>
            </div>
            <span className="tag warn">
              {operatorCommandQueue.externalRequired.length} external-input command{operatorCommandQueue.externalRequired.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="launch-command-queue-grid">
            <article className="launch-command-queue-column">
              <strong>Safe local evidence commands</strong>
              <p>{operatorCommandQueue.note}</p>
              <CliCommandRows commands={operatorCommandQueue.localNow.slice(0, 8).map((item) => item.command)} compact />
              {operatorCommandQueue.localNow.length > 8 && (
                <small className="muted">+{operatorCommandQueue.localNow.length - 8} more local commands in the exported JSON.</small>
              )}
            </article>
            <article className="launch-command-queue-column blocked">
              <strong>Requires external input first</strong>
              <p>
                These commands are shown for planning, but they should wait for the named account,
                legal, billing, database, or preview input.
              </p>
              <div className="launch-command-queue-list">
                {operatorCommandQueue.externalRequired.slice(0, 8).map((item) => (
                  <div className="launch-command-queue-item" key={`${item.sourceStepKey}:${item.command}`}>
                    <code>{item.command}</code>
                    <span>{item.reason}</span>
                  </div>
                ))}
              </div>
              {operatorCommandQueue.externalRequired.length > 8 && (
                <small className="muted">+{operatorCommandQueue.externalRequired.length - 8} more external-input commands in the exported JSON.</small>
              )}
            </article>
          </div>
        </div>

        <div className={`launch-activation-brief ${localVerificationPacket.ready ? 'confirmed' : 'blocked'}`} aria-label="Local verification receipt">
          <div className="launch-activation-brief-main">
            <span className="launch-activation-kicker">Local verification receipt</span>
            <strong>
              {localVerificationPacket.ready
                ? `Local checks passed ${localVerificationPacket.passed}/${localVerificationPacket.total}`
                : 'Local verification needs a fresh passing packet'}
            </strong>
            <p>{localVerificationPacket.boundary}</p>
            <p>
              <b>Evidence:</b> {localVerificationPacket.path}
              {localVerificationPacket.generatedAt ? ` generated ${new Date(localVerificationPacket.generatedAt).toLocaleString('en-US')}` : ''}
            </p>
            <p><b>Duration:</b> {formatLocalVerificationDuration(localVerificationPacket.totalDurationMs)}</p>
            <p><b>Customer page guard:</b> {localVerificationPacket.guardEvidence.customerRenderedCopyGuard.ready ? 'ready' : 'blocked'} via {localVerificationPacket.guardEvidence.customerRenderedCopyGuard.source}</p>
            <p><b>Stale source files:</b> {localVerificationPacket.staleSourceFiles.length}</p>
            <p><b>External boundary:</b> Netlify authentication, hosted database credentials, billing links, legal review, and deployed preview proof are still separate launch gates.</p>
          </div>
          <div className="launch-activation-brief-proof">
            <span>{localVerificationPacket.staleSourceFiles.length > 0 ? 'Stale source files' : latestLocalVerificationFailures.length > 0 ? 'Required failures' : 'Latest passing commands'}</span>
            <ul>
              {localVerificationPacket.staleSourceFiles.length > 0
                ? localVerificationPacket.staleSourceFiles.slice(0, 5).map((sourceFile) => (
                  <li key={sourceFile}>{sourceFile}</li>
                ))
                : (latestLocalVerificationFailures.length > 0 ? latestLocalVerificationFailures : latestLocalVerificationPasses).map((command) => (
                  <li key={command.key}>{command.label}: {command.ok ? 'pass' : 'failed'}</li>
                ))}
              {localVerificationPacket.staleSourceFiles.length > 5 && (
                <li>+{localVerificationPacket.staleSourceFiles.length - 5} more changed files</li>
              )}
              {localVerificationPacket.commands.length === 0 && <li>No local verification commands recorded yet.</li>}
            </ul>
          </div>
          <div className="launch-activation-brief-commands">
            <span>Refresh command</span>
            <CliCommandRows commands={['npm run local:verify', 'npm run launch:handoff', 'npm run client:checklist']} compact />
            <small className="muted">This receipt is local proof only; it does not replace deployed preview smokes.</small>
          </div>
        </div>

        <div className={`launch-activation-brief ${netlifyLaunchDoctorPacket?.ready ? 'confirmed' : 'blocked'}`} aria-label="Netlify launch doctor receipt">
          <div className="launch-activation-brief-main">
            <span className="launch-activation-kicker">Netlify launch doctor receipt</span>
            <strong>
              {netlifyLaunchDoctorPacket
                ? `${netlifyLaunchDoctorPacket.label}: ${netlifyLaunchDoctorPacket.statusLabel}`
                : 'Netlify launch doctor receipt missing'}
            </strong>
            <p>
              {netlifyLaunchDoctorPacket
                ? netlifyLaunchDoctorPacket.statusDetail
                : 'Run the Netlify launch doctor so local CLI authentication, hosted env readiness, preview URL alignment, and Identity receipt state are visible before client preview.'}
            </p>
            <p><b>Evidence:</b> data/netlify-launch-doctor.md</p>
            <p><b>Updated:</b> {netlifyLaunchDoctorPacket?.updatedAtLabel ?? 'Not generated'}</p>
            <p><b>Hosted export:</b> /api/audit/netlify-launch-doctor</p>
            <p><b>Boundary:</b> This receipt proves operator-machine Netlify readiness only; it does not print secrets or replace deployed preview smokes.</p>
          </div>
          <div className="launch-activation-brief-proof">
            <span>{netlifyDoctorMissingInputs.length > 0 ? 'Current blockers' : 'Doctor checks'}</span>
            <ul>
              {netlifyDoctorMissingInputs.length > 0 ? (
                netlifyDoctorMissingInputs.slice(0, 5).map((input) => (
                  <li key={input}>{input}</li>
                ))
              ) : (
                <>
                  <li>Netlify CLI/auth evidence is clear.</li>
                  <li>Hosted env, preview target, and Identity receipt checks are clear.</li>
                </>
              )}
              {netlifyDoctorMissingInputs.length > 5 && (
                <li>+{netlifyDoctorMissingInputs.length - 5} more in data/netlify-launch-doctor.json</li>
              )}
            </ul>
          </div>
          <div className="launch-activation-brief-commands">
            <span>Refresh command</span>
            <CliCommandRows commands={['npm run netlify:doctor', 'npm run netlify:doctor:strict', 'npm run launch:handoff']} compact />
            <a className="btn ghost sm" href="/api/audit/netlify-launch-doctor">Export Netlify doctor</a>
            <small className="muted">Run strict mode only after Netlify login, hosted env values, and a deployed preview URL are available.</small>
          </div>
        </div>

        <div className="launch-activation-brief" aria-label="Client preview checklist export">
          <div className="launch-activation-brief-main">
            <span className="launch-activation-kicker">Client preview completion audit</span>
            <strong>
              {clientPreviewChecklist.summary.clientPreviewReady
                ? 'Client preview checklist is clear'
                : `${clientPreviewChecklist.summary.blockedCount} blocked, ${clientPreviewChecklist.summary.reviewCount} review`}
            </strong>
            <p>
              This export checks the full product promise: Kimi shell, connected routes, backend data, feature flags,
              auth gates, eligibility, authorization, proof review, audit packets, pricing, compliance, and deployment proof.
            </p>
            {clientPreviewChecklist.summary.nextStep && (
              <>
                <p><b>Next external proof:</b> {clientPreviewChecklist.summary.nextStep.label} - {clientPreviewChecklist.summary.nextStep.nextAction}</p>
                <p><b>Execution boundary:</b> {clientPreviewChecklist.summary.nextStep.executionBoundary}</p>
                <p><b>Required inputs:</b> {clientPreviewChecklist.summary.nextStep.requiredInputs.join(', ')}</p>
                <p><b>Proof artifacts:</b> {clientPreviewChecklist.summary.nextStep.proofArtifacts.slice(0, 3).join(', ')}{clientPreviewChecklist.summary.nextStep.proofArtifacts.length > 3 ? `, +${clientPreviewChecklist.summary.nextStep.proofArtifacts.length - 3} more` : ''}</p>
              </>
            )}
            <p>
              <b>Account scope:</b> ClaimBot account #{clientPreviewChecklist.accountScope.accountId};
              matcher proof is account-scoped before client-facing matches are relied on.
            </p>
          </div>
          <div className="launch-activation-brief-proof">
            <span>Blocked or review items</span>
            <ul>
              {clientPreviewChecklistBlockedRows.slice(0, 6).map((item) => (
                <li key={item.key}>{item.label}: {item.owner}</li>
              ))}
              {clientPreviewChecklistBlockedRows.length > 6 && (
                <li>+{clientPreviewChecklistBlockedRows.length - 6} more in JSON</li>
              )}
            </ul>
          </div>
          <div className="launch-activation-brief-commands">
            <span>Checklist export</span>
            <a className="btn ghost sm" href="/api/audit/client-preview-checklist">Export client preview checklist</a>
            <small className="muted">
              {clientPreviewChecklist.summary.readyCount}/{clientPreviewChecklist.summary.totalCount} product requirements ready;
              packets {clientPreviewChecklist.summary.launchPacketReadyCount}/{clientPreviewChecklist.summary.launchPacketTotalCount}.
            </small>
          </div>
        </div>

        <div className="launch-proof-matrix-grid">
          {launchActionPlan.map((step) => (
            <article className={`launch-proof-matrix-row ${step.status}`} key={step.key}>
              <div className="launch-proof-matrix-index">{step.order}</div>
              <div className="launch-proof-matrix-main">
                <div className="launch-proof-matrix-title">
                  <strong>{step.label}</strong>
                  <span className={`tag ${step.status === 'confirmed' ? 'good' : 'warn'}`}>
                    {step.status === 'confirmed' ? 'Clear' : `${step.blockerCount} blocker${step.blockerCount === 1 ? '' : 's'}`}
                  </span>
                </div>
                <p><b>Owner:</b> {step.owner}</p>
                <p><b>Objective:</b> {step.objective}</p>
                <p><b>Client impact:</b> {step.clientImpact}</p>
                <p><b>Execution boundary:</b> {step.executionBoundary}</p>
                <p><b>Required inputs:</b> {step.requiredInputs.join(', ')}</p>
                <p><b>Proof artifacts:</b> {step.proofArtifacts.join(', ')}</p>
              </div>
              <div className="launch-proof-matrix-action">
                <span>Runbook commands</span>
                <CliCommandRows commands={step.commands.slice(0, 4)} compact />
                {step.commands.length > 4 && (
                  <small className="muted">+{step.commands.length - 4} more in launch handoff JSON</small>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className={`launch-activation-brief ${launchPacketRefreshReport.ready ? 'confirmed' : 'blocked'}`} aria-label="Launch packet refresh receipt">
          <div className="launch-activation-brief-main">
            <span className="launch-activation-kicker">Launch packet refresh receipt</span>
            <strong>
              {launchPacketRefreshReport.ready
                ? `Packet refresh passed ${launchPacketRefreshReport.passed}/${launchPacketRefreshReport.total}`
                : 'Launch packet refresh needs a fresh passing report'}
            </strong>
            <p>{launchPacketRefreshReport.boundary}</p>
            <p>
              <b>Evidence:</b> {launchPacketRefreshReport.path}
              {launchPacketRefreshReport.generatedAt ? ` generated ${new Date(launchPacketRefreshReport.generatedAt).toLocaleString('en-US')}` : ''}
            </p>
            <p><b>Duration:</b> {formatLocalVerificationDuration(launchPacketRefreshReport.totalDurationMs)}</p>
          </div>
          <div className="launch-activation-brief-proof">
            <span>{launchPacketRefreshReport.failed > 0 ? 'Refresh failures' : 'Latest packet commands'}</span>
            <ul>
              {latestLaunchRefreshResults.map((command) => (
                <li key={command.key}>{command.label}: {command.ok ? 'pass' : 'failed'}</li>
              ))}
              {launchPacketRefreshReport.commands.length === 0 && <li>No launch packet refresh commands recorded yet.</li>}
            </ul>
          </div>
          <div className="launch-activation-brief-commands">
            <span>Refresh command</span>
            <CliCommandRows commands={['npm run launch:refresh:packets', 'npm run launch:handoff', 'npm run client:checklist']} compact />
            <small className="muted">This report refreshes packet evidence; it does not clear external account, billing, legal, or preview gates.</small>
          </div>
        </div>
      </section>

      <section className="launch-proof-matrix" aria-label="Missing launch proof matrix">
        <header className="launch-proof-matrix-head">
          <div>
            <div className="eyebrow">Missing launch proof matrix</div>
            <h2>{clientPreviewReady ? 'Proof chain is complete' : 'Every blocked workstream needs a receipt'}</h2>
            <p>
              This is the operational bridge between the Kimi launch UI and the non-secret handoff report:
              each row says who owns the work, what evidence unlocks it, and which command starts the next check.
            </p>
          </div>
          <span className={`tag ${clientPreviewReady ? 'good' : 'warn'}`}>
            {launchProofGapCount} proof gap{launchProofGapCount === 1 ? '' : 's'}
          </span>
        </header>

        <div className="launch-proof-matrix-grid">
          {launchProofRows.map((item) => (
            <article className={`launch-proof-matrix-row ${item.status}`} key={item.key}>
              <div className="launch-proof-matrix-index">{item.index}</div>
              <div className="launch-proof-matrix-main">
                <div className="launch-proof-matrix-title">
                  <strong>{item.label}</strong>
                  <span className={`tag ${item.status === 'confirmed' ? 'good' : 'warn'}`}>
                    {item.status === 'confirmed' ? 'Receipt ready' : `${item.blockerCount} missing`}
                  </span>
                </div>
                <p><b>Owner:</b> {item.owner}</p>
                <p><b>Required inputs:</b> {item.requiredInputs.join(', ')}</p>
                <p><b>Missing proof:</b> {item.proofNeeded}</p>
                <p><b>Verified in:</b> {item.proofSurface}</p>
                <p><b>Proof artifacts:</b> {item.proofArtifacts.slice(0, 4).join(', ')}{item.proofArtifacts.length > 4 ? `, +${item.proofArtifacts.length - 4} more` : ''}</p>
                <p><b>Next check:</b> {item.nextAction}</p>
                {item.blockers.length > 0 && (
                  <div className="status-row compact">
                    {item.blockers.slice(0, 4).map((blocker) => (
                      <span className="tag warn" key={blocker.key}>{blocker.label}</span>
                    ))}
                    {item.blockers.length > 4 && (
                      <span className="tag warn">+{item.blockers.length - 4} more</span>
                    )}
                  </div>
                )}
              </div>
              <div className="launch-proof-matrix-action">
                <span>Non-secret commands</span>
                <CliCommandRows commands={item.commands.slice(0, 3)} compact />
                {item.commands.length > 3 && (
                  <small className="muted">+{item.commands.length - 3} more in the launch action plan</small>
                )}
                <Link className="btn ghost sm" href={item.href}>Open gate</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="launch-proof-matrix" aria-label="Launch packet stack">
        <header className="launch-proof-matrix-head">
          <div>
            <div className="eyebrow">Launch packet stack</div>
            <h2>Missing steps become non-secret packets before client preview</h2>
            <p>
              These are the proof files that close the remaining launch gaps. They do not print secrets;
              they record whether the hosted database, operator setup, billing, legal review, PWA install
              shell, preview target, matcher receipt, and handoff report are ready.
            </p>
          </div>
          <span className={`tag ${launchPacketReadyCount === launchPacketRows.length ? 'good' : 'warn'}`}>
            {launchPacketReadyCount}/{launchPacketRows.length} packets ready
          </span>
        </header>

        <div className="launch-proof-matrix-grid">
          {launchPacketRows.map((artifact, index) => (
            <article className={`launch-proof-matrix-row ${artifact.ready ? 'confirmed' : 'blocked'}`} key={artifact.path}>
              <div className="launch-proof-matrix-index">{index + 1}</div>
              <div className="launch-proof-matrix-main">
                <div className="launch-proof-matrix-title">
                  <strong>{artifact.label}</strong>
                  <span className={`tag ${artifact.ready ? 'good' : 'warn'}`}>{artifact.statusLabel}</span>
                </div>
                <p><b>Artifact:</b> {artifact.path}</p>
                <p><b>Proves:</b> {artifact.proof}</p>
                <p><b>Status:</b> {artifact.statusDetail}</p>
                <p><b>Next:</b> {artifact.nextAction}</p>
                {artifact.missingInputs.length > 0 && (
                  <p><b>Needed:</b> {artifact.missingInputs.slice(0, 3).join('; ')}{artifact.missingInputs.length > 3 ? `; +${artifact.missingInputs.length - 3} more in the packet` : ''}</p>
                )}
              </div>
              <div className="launch-proof-matrix-action">
                <span>{artifact.owner}</span>
                <code>{artifact.command}</code>
                <code>{artifact.updatedAtLabel}</code>
              </div>
            </article>
          ))}
        </div>

        <div>
          <p className="muted small">
            Run this packet stack after external account values are staged, then rerun the launch handoff.
          </p>
          <CliCommandRows commands={launchPacketCommands} compact />
        </div>
        <div className="status-row">
          <a className="btn ghost sm" href="/api/audit/client-preview-checklist">Export client preview checklist (JSON)</a>
          <a className="btn ghost sm" href="/api/audit/external-activation-workbook">Export activation workbook (JSON)</a>
          <a className="btn ghost sm" href="/api/audit/launch-handoff">Export launch handoff (JSON)</a>
          <a className="btn ghost sm" href="/api/audit/support-packet">Export support packet (JSON)</a>
        </div>
      </section>

      <section className="launch-proof-matrix" aria-label="Paid full automation launch blockers">
        <header className="launch-proof-matrix-head">
          <div>
            <div className="eyebrow">Paid full automation blockers</div>
            <h2>{fullAutomationLaunchBlockerSummary.ready ? 'Paid automation launch gates are clear' : 'Hands-off paid filing stays locked until these packets clear'}</h2>
            <p>
              This matrix translates packet readiness into the product promise: Pro can run eligible no-proof
              claims hands-off only after hosted data, operator trust, billing, legal, and preview proof are real.
            </p>
          </div>
          <span className={`tag ${fullAutomationLaunchBlockerSummary.ready ? 'good' : 'warn'}`}>
            {fullAutomationLaunchBlockerSummary.blockedCount} blocker{fullAutomationLaunchBlockerSummary.blockedCount === 1 ? '' : 's'}
          </span>
        </header>

        <div className="launch-proof-matrix-grid">
          {fullAutomationLaunchBlockers.length === 0 ? (
            <article className="launch-proof-matrix-row confirmed">
              <div className="launch-proof-matrix-index">OK</div>
              <div className="launch-proof-matrix-main">
                <div className="launch-proof-matrix-title">
                  <strong>Full automation proof chain</strong>
                  <span className="tag good">Clear</span>
                </div>
                <p>{fullAutomationLaunchBlockerSummary.note}</p>
              </div>
              <div className="launch-proof-matrix-action">
                <span>deployment</span>
                <code>npm run launch:handoff</code>
              </div>
            </article>
          ) : fullAutomationLaunchBlockers.map((blocker, index) => (
            <article className="launch-proof-matrix-row blocked" key={blocker.path}>
              <div className="launch-proof-matrix-index">{index + 1}</div>
              <div className="launch-proof-matrix-main">
                <div className="launch-proof-matrix-title">
                  <strong>{blocker.gate}</strong>
                  <span className="tag warn">{blocker.statusLabel}</span>
                </div>
                <p><b>Packet:</b> {blocker.label}</p>
                <p><b>Why paid automation is locked:</b> {blocker.clientImpact}</p>
                <p><b>Proof boundary:</b> {blocker.proofBoundary}</p>
                {blocker.missingInputs.length > 0 && (
                  <p><b>Missing:</b> {blocker.missingInputs.slice(0, 3).join('; ')}{blocker.missingInputs.length > 3 ? `; +${blocker.missingInputs.length - 3} more in ${blocker.path}` : ''}</p>
                )}
              </div>
              <div className="launch-proof-matrix-action">
                <span>{blocker.owner}</span>
                <code>{blocker.command}</code>
                <code>npm run launch:handoff</code>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="launch-critical-path" aria-label="Next launch actions">
        <header className="launch-critical-path-head">
          <div>
            <div className="eyebrow">Next launch actions</div>
            <h2>{clientPreviewReady ? 'Critical path is clear' : 'Critical path to client preview'}</h2>
            <p>
              This is the shortest ordered path from the current blockers to a client-safe hosted preview.
              It stays non-secret and points each step at the proof that will unlock the next gate.
            </p>
          </div>
          <span className={`tag ${criticalPathReadyCount === launchCriticalPath.length ? 'good' : 'warn'}`}>
            {criticalPathReadyCount}/{launchCriticalPath.length} clear
          </span>
        </header>
        <ol className="launch-critical-path-list">
          {launchCriticalPath.map((item, index) => (
            <li className={`launch-critical-path-item ${item.status}`} key={item.key}>
              <span className="launch-critical-path-index">{index + 1}</span>
              <div>
                <div className="launch-critical-path-title">
                  <strong>{item.label}</strong>
                  <span className={`tag ${item.status === 'confirmed' ? 'good' : 'warn'}`}>
                    {item.status === 'confirmed' ? 'Clear' : `${item.blockerCount} blocker${item.blockerCount === 1 ? '' : 's'}`}
                  </span>
                </div>
                <p><b>Owner:</b> {item.owner}</p>
                <p><b>Proof:</b> {item.proofNeeded}</p>
                <p><b>Next:</b> {item.nextAction}</p>
                {item.blockers.length > 0 && (
                  <div className="status-row compact">
                    {item.blockers.slice(0, 4).map((blocker) => (
                      <span className="tag warn" key={blocker.key}>{blocker.label}</span>
                    ))}
                    {item.blockers.length > 4 && (
                      <span className="tag warn">+{item.blockers.length - 4} more</span>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="launch-verification-ledger" aria-label="External blocker ownership">
        <header className="launch-verification-ledger-head">
          <div>
            <div className="eyebrow">External blocker ownership</div>
            <h2>What still needs a real account, business, legal, or deploy action</h2>
            <p>
              ClaimBot keeps these grouped by owner so generated secrets, local checks, billing decisions,
              legal approval, and deployed-preview evidence do not blur together.
            </p>
          </div>
          <span className={`tag ${externalBlockerSummary.length === 0 ? 'good' : 'warn'}`}>
            {launchBlockers.length} blocker{launchBlockers.length === 1 ? '' : 's'}
          </span>
        </header>
        <div className="launch-verification-ledger-grid">
          {externalBlockerSummary.length === 0 ? (
            <article className="launch-verification-ledger-item confirmed">
              <span className="readiness-dot pass" aria-hidden="true" />
              <div>
                <strong>No external launch blockers</strong>
                <p>Hosted preview gates can proceed once the deployment target is selected.</p>
              </div>
            </article>
          ) : externalBlockerSummary.map((group) => (
            <article className="launch-verification-ledger-item needs-review" key={group.category}>
              <span className="readiness-dot warn" aria-hidden="true" />
              <div>
                <strong>{group.label}</strong>
                <p>{group.count} blocker{group.count === 1 ? '' : 's'} owned by {group.owner}.</p>
                <p><b>Proof needed:</b> {group.proofNeeded}</p>
                <p><b>Next:</b> {group.nextAction}</p>
                <div className="status-row compact">
                  {group.blockers.slice(0, 3).map((blocker) => (
                    <span className="tag warn" key={blocker.key}>{blocker.label}</span>
                  ))}
                  {group.blockers.length > 3 && (
                    <span className="tag warn">+{group.blockers.length - 3} more</span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={`env-diagnostic-bar ${missingEnvCount === 0 ? 'ready' : 'blocked'}`} aria-label="Masked environment diagnostics">
        <div className="env-diagnostic-summary">
          <div>
            <div className="eyebrow">Masked env diagnostic</div>
            <h2>{missingEnvCount === 0 ? 'Required hosted env gates are validated' : 'Hosted env gates are still blocked'}</h2>
            <p>
              Values are intentionally masked. This view reports only validated or missing gates so secrets
              and copied setup placeholders never appear as launch-ready evidence.
            </p>
            {ignoredOperatorEnvAvailable > 0 && (
              <p className="muted small">
                Found {ignoredOperatorEnvAvailable} non-placeholder value{ignoredOperatorEnvAvailable === 1 ? '' : 's'} in ignored local operator env files for this readiness view
                {ignoredOperatorEnvLoaded > 0 ? `; ${ignoredOperatorEnvLoaded} loaded during this request` : ''}. No raw values are shown.
              </p>
            )}
          </div>
          <span className={`tag ${missingEnvCount === 0 ? 'good' : 'warn'}`}>
            {envHandoffRows.length - missingEnvCount}/{envHandoffRows.length} validated
          </span>
        </div>
        <div className="env-diagnostic-grid">
          {envHandoffRows.map((row) => (
            <article className={`env-diagnostic-item ${row.missing ? 'missing' : 'configured'}`} key={row.key}>
              <span className={`readiness-dot ${row.missing ? 'warn' : 'pass'}`} aria-hidden="true" />
              <div>
                <strong>{row.key}</strong>
                <small>{row.missing ? 'missing' : 'validated'}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="launch-verification-ledger" aria-label="Launch Verification Ledger">
        <header className="launch-verification-ledger-head">
          <div>
            <div className="eyebrow">Launch verification ledger</div>
            <h2>Evidence for a client-safe shadow launch</h2>
            <p>
              This checkpoint turns hosted setup into auditable launch evidence: environment handoff,
              access provisioning, operational readiness, and shadow-mode posture.
            </p>
          </div>
          <span className={`tag ${launchVerificationReadyCount === launchVerificationRows.length ? 'good' : 'warn'}`}>
            {launchVerificationReadyCount}/{launchVerificationRows.length} evidence checks ready
          </span>
        </header>
        <div className="launch-verification-ledger-grid">
          {launchVerificationRows.map((row) => (
            <article className={`launch-verification-ledger-item ${row.status}`} key={row.title}>
              <span className={`readiness-dot ${row.status === 'confirmed' ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>{row.title}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="status-row">
          <Link className="btn ghost sm" href="#production-gates">Review evidence log</Link>
          <Link className="btn ghost sm" href="/settings#launch-checklist">Run pre-launch verification</Link>
        </div>
      </section>

      <section className="support-readiness-receipt" aria-label="Launch matcher receipt readiness">
        <header className="support-readiness-receipt-head">
          <div>
            <div className="eyebrow">Matcher refresh receipt</div>
            <h3>Matcher proof before client preview</h3>
            <p>
              The Launch page checks the same MATCHER_RUN_COMPLETED receipt exported by the
              support packet, so operators can confirm matcher evidence without opening JSON.
            </p>
          </div>
          <span className={`tag ${matcherRunReceipt.exists && matcherRunReceipt.errorCount === 0 ? 'good' : 'warn'}`}>
            {matcherRunReceipt.exists ? 'Receipt recorded' : 'Run matcher first'}
          </span>
        </header>
        <div className="support-readiness-receipt-grid">
          {[
            {
              label: 'Last refresh',
              value: matcherRunReceipt.exists && matcherRunReceipt.occurredAt
                ? new Date(matcherRunReceipt.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'Not recorded',
              detail: matcherRunReceipt.exists ? `Audit event #${matcherRunReceipt.auditEventId}` : 'Run matcher from Review before relying on match output.',
              ok: matcherRunReceipt.exists,
            },
            {
              label: 'Sources processed',
              value: matcherRunReceipt.settlementsProcessed === null ? 'Pending' : String(matcherRunReceipt.settlementsProcessed),
              detail: 'Aggregate source count from the latest matcher refresh.',
              ok: matcherRunReceipt.settlementsProcessed !== null,
            },
            {
              label: 'Verdicts changed',
              value: matcherRunReceipt.verdictsChanged === null ? 'Pending' : String(matcherRunReceipt.verdictsChanged),
              detail: 'Changed verdicts also write individual matcher audit events.',
              ok: matcherRunReceipt.verdictsChanged !== null,
            },
            {
              label: 'Run errors',
              value: matcherRunReceipt.errorCount === null ? 'Pending' : String(matcherRunReceipt.errorCount),
              detail: 'Resolve nonzero matcher errors before client handoff.',
              ok: matcherRunReceipt.errorCount === 0,
            },
          ].map((item) => (
            <article className={`support-readiness-receipt-item ${item.ok ? 'pass' : 'warn'}`} key={item.label}>
              <span className={`status-dot ${item.ok ? 'ok' : 'warn'}`} aria-hidden="true" />
              <div>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="status-row">
          <Link className="btn ghost sm" href="/review">Open Review matcher</Link>
          <Link className="btn ghost sm" href="/api/audit/support-packet">Export support packet</Link>
          <Link className="btn ghost sm" href="/api/audit/launch-handoff">Export launch handoff</Link>
        </div>
      </section>

      <section id="preview-target" className={`netlify-preview-panel ${netlifyPreviewReadiness.ok ? 'ready' : 'blocked'}`} aria-label="Netlify preview promotion readiness">
        <header className="billing-handoff-head">
          <div>
            <div className="eyebrow">Netlify preview target</div>
            <h2>{netlifyPreviewReadiness.ok ? 'Preview promotion target is ready' : 'Preview promotion target is not ready'}</h2>
            <p>
              These checks mirror the deployed-preview preflight: a confirmed ClaimBot Netlify site,
              hosted build configuration, promotion scripts, an HTTPS preview URL, and the local
              smoke-test secrets needed to verify auth and billing.
            </p>
          </div>
          <span className={`tag ${netlifyPreviewReadiness.ok ? 'good' : 'warn'}`}>
            {netlifyPreviewReadiness.items.length - netlifyPreviewReadiness.failureCount}/{netlifyPreviewReadiness.items.length} strict gates
          </span>
        </header>
        <div className="billing-handoff-grid">
          {netlifyPreviewReadiness.items.map((item) => (
            <article className={`billing-handoff-item ${item.status === 'pass' ? 'ready' : 'missing'}`} key={item.key}>
              <span className={`readiness-dot ${item.status}`} aria-hidden="true" />
              <div>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
                {item.action && <small>{item.action}</small>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="promotion-receipt" className={`netlify-preview-panel ${previewPromotionReceiptReadiness.ok ? 'ready' : 'blocked'}`} aria-label="Production promotion receipt readiness">
        <header className="billing-handoff-head">
          <div>
            <div className="eyebrow">Production promotion receipt</div>
            <h2>{previewPromotionReceiptReadiness.ok ? 'Production receipt is ready' : 'Production receipt is missing or stale'}</h2>
            <p>
              After the deployed preview passes, ClaimBot writes a non-secret receipt that records
              the preview URL, confirmed Netlify site slug, gate command list, timestamp, and source
              catalog digest when available. Production deploy should stay locked until this receipt passes.
            </p>
          </div>
          <span className={`tag ${previewPromotionReceiptReadiness.ok ? 'good' : 'warn'}`}>
            {previewPromotionReceiptReadiness.items.length - previewPromotionReceiptReadiness.failureCount}/{previewPromotionReceiptReadiness.items.length} receipt gates
          </span>
        </header>
        <div className="billing-handoff-grid">
          {previewPromotionReceiptReadiness.items.map((item) => (
            <article className={`billing-handoff-item ${item.status === 'pass' ? 'ready' : 'missing'}`} key={item.key}>
              <span className={`readiness-dot ${item.status}`} aria-hidden="true" />
              <div>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
                {item.action && <small>{item.action}</small>}
              </div>
            </article>
          ))}
        </div>
        <div className={`billing-sync-receipt ${previewPromotionReceiptReadiness.ok ? 'ready' : 'missing'}`}>
          <span className={`readiness-dot ${previewPromotionReceiptReadiness.ok ? 'pass' : 'warn'}`} aria-hidden="true" />
          <div>
            <strong>Receipt file</strong>
            <p>
              {previewPromotionReceiptReadiness.exists
                ? `Created ${previewPromotionReceiptReadiness.createdAt ?? 'without timestamp'} for ${previewPromotionReceiptReadiness.netlifySiteSlug ?? 'an unverified site slug'}.`
                : 'Run npm run preview:gate against the deployed preview to create data/preview-promotion-receipt.json.'}
            </p>
            <code>npm run production:check-receipt</code>
          </div>
        </div>
      </section>

      <section className={`system-posture ${readiness.ok ? 'live' : 'shadow'}`}>
        <div>
          <strong>{readiness.ok ? 'Ready for hosted shadow launch' : 'Hosted launch is blocked'}</strong>
          <span>
            {readiness.ok
              ? 'The required deployment gates are present. Keep first client onboarding in shadow mode.'
              : `${readiness.failures.length} blocker${readiness.failures.length === 1 ? '' : 's'} must be fixed before production launch.`}
          </span>
          {!readiness.ok && launchBlockerLinks.length > 0 && (
            <div className="launch-blocker-panel">
              <strong>Hosted launch blockers</strong>
              <ol className="launch-blocker-list">
                {launchBlockerLinks.map((item) => (
                  <li key={item.key}>
                    <a href={item.href}>{item.label}</a>
                    <span>{item.detail}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </section>

      {!readiness.ok && (
        <section className="launch-operator-action" aria-label="Hosted launch operator action">
          <div>
            <div className="eyebrow">Operator action required</div>
            <h2>{readiness.failures.length} Hosted Launch Blockers - Operator Action Required</h2>
            <p>
              ClaimBot remains in shadow mode; launch is blocked until all invariants pass.
              No auto-submission, category authorization, and proof-reviewed audit trail enforced.
            </p>
          </div>
          <div className="launch-operator-actions">
            <Link className="btn" href="/settings#launch-checklist">Open Settings &amp; Apply Fixes</Link>
            <Link className="btn ghost" href="#production-gates">Review production gates</Link>
          </div>
        </section>
      )}

      <section className={`founder-handoff ${readiness.ok ? 'ready' : 'blocked'}`} aria-label="Founder hosted launch handoff">
        <div className="founder-handoff-head">
          <div>
            <div className="eyebrow">Founder handoff</div>
            <h2>Production launch remains locked until env, billing, and review gates pass</h2>
            <p>
              This packet is safe to share with the person setting up Netlify. It lists what to gather
              without exposing secrets or weakening shadow mode, proof review, authorization, or audit gates.
            </p>
          </div>
          <div className="launch-lock-lever" aria-label="Production launch lock state">
            <span className={`launch-lock-switch ${readiness.ok ? 'ready' : 'blocked'}`} aria-hidden="true" />
            <strong>{readiness.ok ? 'Shadow launch gate clear' : `Locked: ${missingEnvCount} handoff gate${missingEnvCount === 1 ? '' : 's'} need attention`}</strong>
            <small>{readiness.ok ? 'Keep first client run in shadow mode.' : 'Production invite remains blocked.'}</small>
          </div>
        </div>
        <div className="founder-handoff-body">
          <div className="founder-env-card">
            <div className="founder-env-card-head">
              <strong>Secret-safe env template</strong>
              <span className={`tag ${missingEnvCount === 0 ? 'good' : 'warn'}`}>
                {envHandoffRows.length - missingEnvCount}/{envHandoffRows.length} validated
              </span>
            </div>
            <SecretSafeSnippet label="Required production env template" value={envSnippet} />
            <p>
              Replace placeholders only inside Netlify or your secret manager. Real values should never
              be pasted into chat, GitHub, screenshots, client-visible pages, or support tickets.
            </p>
          </div>
          <div className="founder-env-list">
            {envHandoffRows.map((row) => (
              <article className={`founder-env-item ${row.missing ? 'missing' : 'ready'}`} key={row.key}>
                <span className={`readiness-dot ${row.missing ? 'warn' : 'pass'}`} aria-hidden="true" />
                <div>
                  <strong>{row.label}</strong>
                  <code>{row.key}</code>
                  <p>{row.gather}</p>
                  <small>Owner: {row.owner}</small>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="founder-safety-strip" aria-label="Launch safety gates">
          <span>Shadow Mode: {mode === 'live' ? 'Needs review' : 'Active'}</span>
          <span>Proof Gate: Manual</span>
          <span>Category Auth: Required</span>
          <span>Audit Trail: Required</span>
        </div>
      </section>

      <section id="billing-handoff" className={`billing-handoff-panel ${paidCheckoutReady ? 'ready' : 'blocked'}`} aria-label="Billing checkout handoff">
        <header className="billing-handoff-head">
          <div>
            <div className="eyebrow">Billing checkout handoff</div>
            <h2>{paidCheckoutReady ? 'Paid checkout can be tested' : 'Paid checkout is locked before payment'}</h2>
            <p>
              Plus and Pro pricing CTAs use processor-hosted payment links. This keeps card handling out
              of ClaimBot while a signed entitlement sync updates the database before automation can unlock.
              Paid checkout still requires recorded legal review before users are sent to payment.
            </p>
          </div>
          <span className={`tag ${paidCheckoutReady ? 'good' : 'warn'}`}>
            {paidCheckoutReady ? 'Checkout clear' : paidCheckoutCurrentBlockReason}
          </span>
        </header>
        <div className="billing-handoff-grid">
          {billing.options.map((option) => (
            <article className={`billing-handoff-item ${option.configured ? 'ready' : 'missing'}`} key={option.key}>
              <span className={`readiness-dot ${option.configured ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>{option.label}</strong>
                <p>{option.configured ? 'Configured as a hosted checkout redirect.' : `Set ${option.envKey} in production before relying on this paid CTA.`}</p>
                <small>{option.requiredForPaidLaunch ? 'Required for paid launch' : 'Optional checkout path'}</small>
              </div>
            </article>
          ))}
        </div>
        <div className={`billing-sync-receipt ${billing.syncSecretConfigured ? 'ready' : 'missing'}`}>
          <span className={`readiness-dot ${billing.syncSecretConfigured ? 'pass' : 'warn'}`} aria-hidden="true" />
          <div>
            <strong>Signed entitlement sync</strong>
            <p>
              {billing.syncSecretConfigured
                ? 'The billing sync endpoint is armed for signed processor events.'
                : 'Set CLAIMBOT_BILLING_SYNC_SECRET or CLAIMBOT_STRIPE_WEBHOOK_SECRET so paid events can update Plus, Pro, and Founding entitlement rows.'}
            </p>
            <code>{billing.syncEndpoint}</code>
          </div>
        </div>
        <div className={`billing-sync-receipt ${paidCheckoutReady ? 'ready' : 'missing'}`}>
          <span className={`readiness-dot ${paidCheckoutReady ? 'pass' : 'warn'}`} aria-hidden="true" />
          <div>
            <strong>{paidCheckoutReady ? 'Paid checkout readiness' : 'Paid checkout readiness lock'}</strong>
            <p>
              {paidCheckoutReady
                ? 'Processor checkout, signed entitlement sync, and legal/compliance review acknowledgement are ready for paid handoff testing.'
                : `Current paid checkout block reason: ${paidCheckoutCurrentBlockReason}. Legal-review-only lock reason: legal-review-not-recorded.`}
            </p>
            <code>CLAIMBOT_LEGAL_REVIEW_ACK=reviewed</code>
          </div>
        </div>
      </section>

      <section className="stats-grid" aria-label="Launch readiness summary">
        <div className={`stat-card ${launchBlockers.length > 0 ? 'needs-review' : ''}`}>
          <div className="stat-label">Launch blockers</div>
          <div className={`stat-value ${launchBlockers.length > 0 ? 'warn' : 'green'}`}>{launchBlockers.length}</div>
        </div>
        <div className={`stat-card ${warnings.length > 0 ? 'needs-review' : ''}`}>
          <div className="stat-label">Warnings</div>
          <div className={`stat-value ${warnings.length > 0 ? 'warn' : 'green'}`}>{warnings.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Filing posture</div>
          <div className={`stat-value text ${mode === 'live' ? 'warn' : 'green'}`}>{mode}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Live review ack</div>
          <div className={`stat-value text ${liveAck ? 'warn' : ''}`}>{liveAck ? 'reviewed' : 'not set'}</div>
        </div>
      </section>

      <section className="launch-proof-matrix" aria-label="Owner handoff queue">
        <header className="launch-proof-matrix-head">
          <div>
            <div className="eyebrow">Owner handoff queue</div>
            <h2>Who needs to act next</h2>
            <p>
              This operator-only queue groups the remaining launch work by owner so hosted database,
              billing, legal review, worker runtime, and deployment proof can move in parallel.
            </p>
          </div>
          <span className={`tag ${ownerHandoffBriefs.length === 0 ? 'good' : 'warn'}`}>
            {ownerHandoffBriefs.length} owner{ownerHandoffBriefs.length === 1 ? '' : 's'}
          </span>
        </header>
        <div className="launch-proof-matrix-grid">
          {ownerHandoffBriefs.length === 0 ? (
            <article className="launch-proof-matrix-row confirmed">
              <div className="launch-proof-matrix-index">OK</div>
              <div className="launch-proof-matrix-main">
                <div className="launch-proof-matrix-title">
                  <strong>All launch owners are clear</strong>
                  <span className="tag good">Ready</span>
                </div>
                <p>No blocked owner workstreams are recorded in the launch action plan.</p>
              </div>
              <div className="launch-proof-matrix-action">
                <code>npm run launch:handoff</code>
              </div>
            </article>
          ) : ownerHandoffBriefs.map((brief, index) => (
            <article className="launch-proof-matrix-row blocked" key={brief.owner}>
              <div className="launch-proof-matrix-index">{index + 1}</div>
              <div className="launch-proof-matrix-main">
                <div className="launch-proof-matrix-title">
                  <strong>{brief.owner}</strong>
                  <span className="tag warn">
                    {brief.blockedWorkstreamCount} workstream{brief.blockedWorkstreamCount === 1 ? '' : 's'}
                  </span>
                </div>
                <p><b>First action:</b> {brief.firstAction}</p>
                <p>
                  <b>Required inputs:</b>{' '}
                  {brief.requiredInputs.length > 0 ? brief.requiredInputs.slice(0, 4).join('; ') : 'No additional inputs listed.'}
                  {brief.requiredInputs.length > 4 ? `; +${brief.requiredInputs.length - 4} more` : ''}
                </p>
                <p>
                  <b>Blocked packets:</b>{' '}
                  {brief.blockedPacketCount > 0
                    ? `${brief.blockedPacketCount} setup packet${brief.blockedPacketCount === 1 ? '' : 's'} need proof`
                    : 'No packet-level blockers for this owner.'}
                </p>
                {brief.blockedPackets[0]?.nextAction && (
                  <p><b>Next packet action:</b> {brief.blockedPackets[0].nextAction}</p>
                )}
              </div>
              <div className="launch-proof-matrix-action">
                <span>{brief.safeLocalCommands.length} local command{brief.safeLocalCommands.length === 1 ? '' : 's'} ready</span>
                {brief.safeLocalCommands.slice(0, 2).map((command) => (
                  <code key={command}>{command}</code>
                ))}
                {brief.externalInputCommands.length > 0 && (
                  <code>{brief.externalInputCommands.length} waiting on external input</code>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="client-invite-packet" aria-label="Client invite packet">
        <div className="client-invite-head">
          <div>
            <div className="client-invite-kicker">Client invite packet</div>
            <h2>Ready-to-send handoff summary</h2>
            <p>
              Use this packet before sharing the hosted URL. It separates access readiness, first-run
              filing posture, client workflow scope, and support escalation.
            </p>
          </div>
          <span className={`tag ${inviteReadyCount === inviteRows.length ? 'good' : 'warn'}`}>
            {inviteReadyCount}/{inviteRows.length} invite checks ready
          </span>
        </div>
        <div className="client-invite-grid">
          {inviteRows.map((item) => (
            <article className={`client-invite-item ${item.status}`} key={item.title}>
              <span className={`readiness-dot ${item.status === 'confirmed' ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="status-row">
          <Link className="btn ghost sm" href="/login">Preview hosted access</Link>
          <Link className="btn ghost sm" href="/goal">Preview client start</Link>
          <Link className="btn ghost sm" href="/settings">Open safety settings</Link>
        </div>
      </section>

      <section className="dashboard-section" id="production-gates">
        <div className="card launch-handoff-card">
          <div className="readiness-head">
            <div>
              <div className="eyebrow">Client handoff</div>
              <h2>Pre-invite safety gate</h2>
              <p className="muted small">
                Use this before sending client invites. It keeps the first launch simulated, reviewed,
                scoped to explicit authorizations, and auditable.
              </p>
            </div>
            <span className={`tag ${handoffReadyCount === handoffChecklist.length ? 'good' : 'warn'}`}>
              {handoffReadyCount}/{handoffChecklist.length} confirmed
            </span>
          </div>
          <div className="handoff-grid" aria-label="Pre-invite safety gate">
            {handoffChecklist.map((item) => (
              <article className={`handoff-item ${item.status}`} key={item.key}>
                <div>
                  <span className={`readiness-dot ${item.status === 'confirmed' ? 'pass' : 'warn'}`} aria-hidden="true" />
                </div>
                <div>
                  <div className="handoff-item-head">
                    <strong>{item.label}</strong>
                    <span className={`tag ${item.status === 'confirmed' ? 'good' : 'warn'}`}>
                      {item.status === 'confirmed' ? 'Confirmed' : 'Needs review'}
                    </span>
                  </div>
                  <p>{item.detail}</p>
                  {item.action && <p><b>Next:</b> {item.action}</p>}
                </div>
              </article>
            ))}
          </div>
          <div className="notice notice-followup">
            <h3>Emergency pause path</h3>
            <p>
              If anything looks wrong during onboarding, keep or switch the workspace to shadow mode,
              leave live filing disabled, and review the audit export before re-opening invitations.
            </p>
          </div>
        </div>
      </section>

      <section className="dashboard-section" id="client-data-readiness">
        <div className={`card readiness-card ${readiness.ok ? 'ready' : 'blocked'}`}>
          <div className="readiness-head">
            <div>
              <div className="eyebrow">Production gates</div>
              <h2>{readiness.ok ? 'No required blockers' : 'Required fixes'}</h2>
              <p className="muted small">
                These checks intentionally evaluate hosted deployment rules, not the relaxed local developer runtime.
              </p>
            </div>
            <span className={`tag ${readiness.ok ? 'good' : 'warn'}`}>
              {readiness.ok ? 'Ready' : `${readiness.failures.length} blocker${readiness.failures.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="readiness-list">
            {readiness.items.map((item) => (
              <div className="readiness-item" key={item.key}>
                <span className={`readiness-dot ${item.status}`} aria-hidden="true" />
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                  {item.action && <p><b>Next:</b> {item.action}</p>}
                  {item.status !== 'pass' && getLaunchFixCommand(item.key) && (
                    <code className="inline-fix-command">{getLaunchFixCommand(item.key)}</code>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <header className="section-header">
          <h2>Client data readiness</h2>
          <p className="muted">
            Hosted environment variables are only one side of launch. Client previews also need a
            populated settlement catalog, linked claim forms, and scraper/audit visibility.
          </p>
        </header>
        <div className="stats-grid" aria-label="Client launch data readiness">
          <div className={`stat-card ${sourceCatalogReady ? '' : 'needs-review'}`}>
            <div className="stat-label">Source catalog</div>
            <div className={`stat-value ${sourceCatalogReady ? 'green' : 'warn'}`}>{totalSettlements}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Source providers</div>
            <div className="stat-value text">{sourceProviderCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Claim form coverage</div>
            <div className={`stat-value ${formCoverage > 0 ? 'green' : 'text'}`}>{formCoverage}%</div>
          </div>
          <div className={`stat-card ${sourceCatalog.deadlineCoverageReady ? '' : 'needs-review'}`}>
            <div className="stat-label">Deadline coverage</div>
            <div className={`stat-value ${sourceCatalog.deadlineCoverageReady ? 'green' : 'warn'}`}>{deadlineCoverage}%</div>
          </div>
          <div className={`stat-card ${sourceCatalog.administratorCoverageReady ? '' : 'needs-review'}`}>
            <div className="stat-label">Known admins</div>
            <div className={`stat-value ${sourceCatalog.administratorCoverageReady ? 'green' : 'warn'}`}>{knownAdministratorCoverage}%</div>
          </div>
          <div className={`stat-card ${sourceCatalog.categorizationReady ? '' : 'needs-review'}`}>
            <div className="stat-label">Categorized</div>
            <div className={`stat-value ${sourceCatalog.categorizationReady ? 'green' : 'warn'}`}>{categorizedCoverage}%</div>
          </div>
          <div className={`stat-card ${textEncodingReady ? '' : 'needs-review'}`}>
            <div className="stat-label">SOURCE TEXT ENCODING</div>
            <div className={`stat-value ${textEncodingReady ? 'green' : 'warn'}`}>
              {textEncodingReady ? 'Clean' : `${mojibakeCount} issue${mojibakeCount === 1 ? '' : 's'}`}
            </div>
            <div className="stat-note">{cleanTextCount} clean record{cleanTextCount === 1 ? '' : 's'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Last scraper audit</div>
            <div className="stat-value text">
              {lastScraperAuditAt ? lastScraperAuditAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'None'}
            </div>
          </div>
          <div className={`stat-card ${latestSourceImportDigest ? '' : 'needs-review'}`}>
            <div className="stat-label">Source import receipt</div>
            <div className={`stat-value text ${latestSourceImportDigest ? 'green' : 'warn'}`}>
              {latestSourceImportDigest ? `${latestSourceImportDigest.slice(0, 10)}...` : 'Missing'}
            </div>
            <div className="stat-note">SHA-256 catalog digest</div>
          </div>
        </div>
        {sourceDataIssues.length > 0 && (
          <div className="notice warn notice-followup">
            <h3>{sourceCatalogReady && sourceQualityReady ? 'Review source catalog warnings' : 'Source catalog needs review'}</h3>
            <p>
              Do not treat weak or empty catalog data as proof that no claims pertain to a user. Load settlement
              sources, confirm form links, enrich deadlines and administrator metadata, run the matcher, and review audit output before client previews.
            </p>
            <div className="readiness-list compact">
              {sourceDataIssues.map((item) => (
                <div className="readiness-item" key={item.key}>
                  <span className={`readiness-dot ${item.status}`} aria-hidden="true" />
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="status-row">
              <Link className="btn ghost sm" href="/settlements">Review discovery health</Link>
              <Link className="btn ghost sm" href="/review">Open review queue</Link>
              <Link className="btn ghost sm" href="/audit">Check audit trail</Link>
            </div>
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <div className="card launch-card">
          <div className="readiness-head">
            <div>
              <div className="eyebrow">Operator checklist</div>
              <h2>Before inviting clients</h2>
            </div>
            <span className={`tag ${netlifyProjectSetupReceiptReadiness.identityReady ? 'good' : 'warn'}`}>
              {netlifyProjectSetupReceiptReadiness.identityReady ? 'Identity proof recorded' : 'Identity proof needed'}
            </span>
          </div>
          <div className="launch-steps" aria-label="Hosted launch checklist">
            <div>
              <strong>1. Confirm the ClaimBot Netlify site</strong>
              <p>
                Link this repo only to a confirmed ClaimBot project. Create a dedicated site first
                if one does not exist yet.
              </p>
              <p className="muted small">
                Do not link this repo to an unrelated Netlify project or set production secrets
                on an unrelated site.
              </p>
              <CliCommandRows commands={netlifySiteLinkCommands} compact />
            </div>
            <div>
              <strong>2. Generate launch smoke secrets</strong>
              <p>Generate ignored local launch secrets without printing them, then push them after Netlify CLI login.</p>
              <CliCommandRows commands={secretCommands} compact />
            </div>
            <div>
              <strong>3. Prepare the hosted database</strong>
              <p>
                Create the ignored hosted env file, run migrations and source import checks against
                the real database, then push only the database env values after Netlify CLI login.
              </p>
              <CliCommandRows commands={hostedDatabaseSetupCommands} compact />
            </div>
            <div>
              <strong>4. Enable Netlify Identity</strong>
              <p>
                Turn on Identity in Netlify before sharing /login. The provider is verified on a deployed
                preview, not in local development.
              </p>
              <ul className="launch-identity-checklist">
                {identitySetupSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
              <CliCommandRows commands={netlifyProjectSetupReceiptCommands} compact />
            </div>
            <div>
              <strong>5. Set production environment</strong>
              <p>
                Use the one-file env path after .env.hosted.local has real database, support,
                billing, and legal-review values. The push script also loads generated launch
                secrets from .env.launch.local and does not print values.
              </p>
              <CliCommandRows commands={hostedEnvironmentSetupCommands} compact />
            </div>
            <div>
              <strong>6. Manual environment fallback</strong>
              <p>Store real secrets in Netlify. Do not commit them into the repo or paste them into client-visible pages.</p>
              <CliCommandRows commands={deployCommands} />
            </div>
            <div>
              <strong>7. Configure paid checkout links</strong>
              <p>Use processor-hosted payment links and a signed sync secret so card data stays outside ClaimBot.</p>
              <CliCommandRows commands={billingHandoffCommands} compact />
            </div>
            <div>
              <strong>8. Verify the gates</strong>
              <p>Run these after production and deploy-preview environment variables exist and before a client preview.</p>
              <CliCommandRows commands={verificationCommands} compact />
            </div>
            <div>
              <strong>9. Prove hosted access locally</strong>
              <p>The hosted auth smoke starts an isolated auth-required local server unless you point it at a deployed URL.</p>
              <CliCommandRows commands={localAuthSmokeCommands} compact />
            </div>
            <div>
              <strong>10. Smoke the deployed preview</strong>
              <p>Point the smoke tests at the preview URL. Use the deployed session secret only in your local terminal, then let preview:gate write the non-secret promotion receipt.</p>
              <CliCommandRows commands={previewSmokeCommands} compact />
            </div>
            <div>
              <strong>11. Verify the production receipt</strong>
              <p>Run the receipt check immediately before production deploy so the deploy is tied to the reviewed preview.</p>
              <CliCommandRows commands={['npm run production:check-receipt']} compact />
            </div>
            <div>
              <strong>12. Launch in shadow mode</strong>
              <p>
                Confirm profile facts, category authorizations, proof-required matches, queue readiness,
                audit records, and support routing before enabling live filing.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <header className="section-header">
          <h2>Client deployment switches</h2>
          <p className="muted">
            Feature flags should expose only the capabilities that are reviewed and supported for the current client.
          </p>
        </header>
        <div className="safeguard-grid">
          {featureFlags.map((flag) => (
            <article className="safeguard-card" key={flag.key}>
              <span className={`tag ${flag.enabled ? 'good' : 'warn'}`}>{flag.enabled ? 'Enabled' : 'Disabled'}</span>
              <h3>{flag.label}</h3>
              <p>{flag.description}</p>
              <p className="small muted"><b>Env:</b> {flag.key}={flag.enabled ? 'true' : 'false'}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
