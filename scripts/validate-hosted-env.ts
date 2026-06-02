import 'dotenv/config';
import { isCspEnforcedForHostedReadiness } from '../src/lib/deployment-security';
import { evaluateHostedReadiness } from '../src/lib/hosted-readiness';
import { isClientFeatureEnabled } from '../src/lib/features';
import { getHostedFixCommands, hostedOperatorNotes, verificationCommands } from '../src/lib/hosted-remediation';

const isHosted = process.env.NETLIFY === 'true' || process.env.CI === 'true' || process.argv.includes('--strict');

const report = evaluateHostedReadiness({
  databaseUrl: process.env.DATABASE_URL,
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN,
  hasDatabaseAuthToken: Boolean(process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN),
  claimFilerMode: process.env.CLAIM_FILER_MODE,
  claimFilerLiveAck: process.env.CLAIM_FILER_LIVE_ACK,
  claimFilerMaxPerDay: process.env.CLAIM_FILER_MAX_PER_DAY,
  scraperUserAgent: process.env.SCRAPER_USER_AGENT,
  supportEmail: process.env.CLAIMBOT_SUPPORT_EMAIL,
  supportUrl: process.env.CLAIMBOT_SUPPORT_URL,
  isHosted,
  authDisabled: process.env.CLAIMBOT_DISABLE_AUTH === 'true',
  sessionSecret: process.env.CLAIMBOT_SESSION_SECRET,
  settlementSearchFeatureEnabled: isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH'),
  liveFilingFeatureEnabled: isClientFeatureEnabled('CLAIMBOT_FEATURE_LIVE_FILING'),
  cspEnforced: isCspEnforcedForHostedReadiness(),
  billingPlusMonthlyUrl: process.env.CLAIMBOT_BILLING_PLUS_MONTHLY_URL,
  billingProMonthlyUrl: process.env.CLAIMBOT_BILLING_PRO_MONTHLY_URL,
  billingSyncSecret: process.env.CLAIMBOT_BILLING_SYNC_SECRET,
  billingStripeWebhookSecret: process.env.CLAIMBOT_STRIPE_WEBHOOK_SECRET,
  legalReviewAck: process.env.CLAIMBOT_LEGAL_REVIEW_ACK,
  workerRuntime: process.env.CLAIMBOT_WORKER_RUNTIME,
  workerRuntimeReceipt: process.env.CLAIMBOT_WORKER_RUNTIME_RECEIPT,
  paidBillingRequired: process.env.CLAIMBOT_BETA_NO_BILLING !== 'true',
});

if (!report.ok) {
  console.error('[validate-hosted-env] failed');
  for (const failure of report.failures) console.error(`- ${failure}`);
  const actions = report.items.filter((item) => item.status === 'fail' && item.action);
  if (actions.length > 0) {
    console.error('next steps:');
    for (const item of actions) console.error(`- ${item.label}: ${item.action}`);
  }
  const warningActions = report.items.filter((item) => item.status === 'warn' && item.action);
  if (report.warnings.length > 0) {
    console.error('warnings:');
    for (const warning of report.warnings) console.error(`- ${warning}`);
  }
  if (warningActions.length > 0) {
    console.error('recommended fixes:');
    for (const item of warningActions) console.error(`- ${item.label}: ${item.action}`);
  }
  const fixCommands = getHostedFixCommands(report.items);
  if (fixCommands.length > 0) {
    console.error('copy-ready remediation commands:');
    for (const command of fixCommands) console.error(`  ${command}`);
    console.error('operator notes:');
    for (const note of hostedOperatorNotes) console.error(`- ${note}`);
    console.error('rerun after updating hosted env:');
    for (const command of verificationCommands) console.error(`  ${command}`);
  }
  process.exit(1);
}

console.log('[validate-hosted-env] ok');
for (const warning of report.warnings) console.warn(`[validate-hosted-env] warning: ${warning}`);
for (const item of report.items) {
  if (item.status === 'warn' && item.action) {
    console.warn(`[validate-hosted-env] recommended: ${item.action}`);
  }
}
