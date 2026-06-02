import { getClientFeatureFlags } from '@lib/features';
import { getAllSettings } from '@lib/settings';
import { isCspEnforcedForHostedReadiness } from '@lib/deployment-security';
import { evaluateHostedReadiness } from '@lib/hosted-readiness';
import { getDatabaseSchemaReadiness } from '@lib/database-schema-readiness';
import { evaluateNetlifyPreviewReadiness } from '@lib/netlify-preview-readiness';
import { evaluateNetlifyCliReadiness } from '@lib/netlify-cli-readiness';
import { evaluateNetlifyProjectSetupReceipt } from '@lib/netlify-project-setup-receipt';
import { evaluatePreviewPromotionReceipt } from '@lib/preview-promotion-receipt';
import { evaluatePwaReadiness } from '@lib/pwa-readiness';
import { getSourceCatalogReadiness } from '@lib/source-catalog-readiness';
import { loadIgnoredOperatorEnvForReadiness } from '@lib/ignored-operator-env';
export {
  deployCommands,
  billingSyncSetupCommands,
  getLaunchFixCommand,
  hostedEnvironmentSetupCommands,
  hostedDatabaseSetupCommands,
  identitySetupSteps,
  launchPacketArtifacts,
  launchPacketCommands,
  localAuthSmokeCommands,
  netlifyProjectSetupReceiptCommands,
  netlifySiteLinkCommands,
  previewSmokeCommands,
  secretCommands,
  verificationCommands,
} from '@lib/hosted-remediation';

export async function getLaunchReadiness() {
  const ignoredOperatorEnv = loadIgnoredOperatorEnvForReadiness();
  const current = await getAllSettings();
  const databaseSchemaReadiness = await getDatabaseSchemaReadiness();
  const netlifyCliReadiness = evaluateNetlifyCliReadiness();
  const netlifyPreviewReadiness = evaluateNetlifyPreviewReadiness({ strict: true });
  const netlifyProjectSetupReceiptReadiness = evaluateNetlifyProjectSetupReceipt();
  const previewPromotionReceiptReadiness = evaluatePreviewPromotionReceipt();
  const pwaReadiness = evaluatePwaReadiness();
  const featureFlags = getClientFeatureFlags();
  const liveFilingFeatureEnabled = featureFlags.find((flag) => flag.key === 'CLAIMBOT_FEATURE_LIVE_FILING')?.enabled ?? false;
  const settlementSearchFeatureEnabled = featureFlags.find((flag) => flag.key === 'CLAIMBOT_FEATURE_SETTLEMENT_SEARCH')?.enabled ?? true;
  const breachImportEnabled = featureFlags.find((flag) => flag.key === 'CLAIMBOT_FEATURE_BREACH_IMPORT')?.enabled ?? true;
  const sourceCatalogReadiness = await getSourceCatalogReadiness({
    settlementSearchEnabled: settlementSearchFeatureEnabled,
    sourceQualityRequired: true,
  });
  const mode = current.claim_filer_mode ?? 'shadow';
  const liveAck = current.claim_filer_live_ack === 'reviewed';
  const readiness = evaluateHostedReadiness({
    databaseUrl: process.env.DATABASE_URL,
    databaseAuthToken: process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN,
    hasDatabaseAuthToken: Boolean(process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN),
    claimFilerMode: current.claim_filer_mode ?? process.env.CLAIM_FILER_MODE,
    claimFilerLiveAck: current.claim_filer_live_ack ?? process.env.CLAIM_FILER_LIVE_ACK,
    claimFilerMaxPerDay: current.claim_filer_max_per_day ?? process.env.CLAIM_FILER_MAX_PER_DAY,
    scraperUserAgent: process.env.SCRAPER_USER_AGENT,
    supportEmail: process.env.CLAIMBOT_SUPPORT_EMAIL,
    supportUrl: process.env.CLAIMBOT_SUPPORT_URL,
    isHosted: true,
    authDisabled: process.env.CLAIMBOT_DISABLE_AUTH === 'true',
    sessionSecret: process.env.CLAIMBOT_SESSION_SECRET,
    settlementSearchFeatureEnabled,
    liveFilingFeatureEnabled,
    cspEnforced: isCspEnforcedForHostedReadiness(),
    billingPlusMonthlyUrl: process.env.CLAIMBOT_BILLING_PLUS_MONTHLY_URL,
    billingProMonthlyUrl: process.env.CLAIMBOT_BILLING_PRO_MONTHLY_URL,
    billingSyncSecret: process.env.CLAIMBOT_BILLING_SYNC_SECRET,
    billingStripeWebhookSecret: process.env.CLAIMBOT_STRIPE_WEBHOOK_SECRET,
    legalReviewAck: process.env.CLAIMBOT_LEGAL_REVIEW_ACK,
    workerRuntime: process.env.CLAIMBOT_WORKER_RUNTIME,
    workerRuntimeReceipt: process.env.CLAIMBOT_WORKER_RUNTIME_RECEIPT,
    paidBillingRequired: process.env.CLAIMBOT_BETA_NO_BILLING !== 'true',
    databaseSchemaReady: databaseSchemaReadiness.ok,
    databaseSchemaFailures: databaseSchemaReadiness.failures.map((item) => item.label),
  });
  const sourceBlockers = sourceCatalogReadiness.items
    .filter((item) => item.status === 'fail')
    .map((item) => ({
      ...item,
      action: item.key === 'source-catalog'
        ? 'Run npm run scrape:once, npm run enrich:source, and npm run source:import before client launch review.'
        : item.key === 'claim-form-coverage'
          ? 'Run npm run enrich:source and verify claim-form links before inviting clients.'
          : 'Run npm run enrich:source until source quality meets client-preview thresholds.',
    }));
  const sourceWarnings = sourceCatalogReadiness.items
    .filter((item) => item.status === 'warn')
    .map((item) => ({
      ...item,
      action: 'Review source catalog readiness before client launch.',
    }));
  const netlifyPreviewBlockers = netlifyPreviewReadiness.items
    .filter((item) => item.status === 'fail')
    .map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      detail: item.detail,
      action: item.action ?? 'Run npm run validate:netlify:strict and npm run preview:gate after deploying a preview.',
    }));
  const netlifyPreviewWarnings = netlifyPreviewReadiness.items
    .filter((item) => item.status === 'warn')
    .map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      detail: item.detail,
      action: item.action ?? 'Review Netlify preview readiness before inviting clients.',
    }));
  const previewPromotionReceiptBlockers = previewPromotionReceiptReadiness.items
    .filter((item) => item.status === 'fail')
    .map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      detail: item.detail,
      action: item.action ?? 'Run npm run production:check-receipt after npm run preview:gate.',
    }));
  const previewPromotionReceiptWarnings = previewPromotionReceiptReadiness.items
    .filter((item) => item.status === 'warn')
    .map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      detail: item.detail,
      action: item.action ?? 'Review the preview promotion receipt before production deploy.',
    }));
  const netlifyProjectSetupWarnings = netlifyProjectSetupReceiptReadiness.warnings.map((warning) => ({
    key: 'netlify-project-setup-receipt',
    label: 'Netlify project setup receipt',
    status: 'warn' as const,
    detail: warning,
    action: 'Confirm the Netlify project and Identity dashboard settings, then run npm run netlify:record-setup.',
  }));
  const blockers = [
    ...netlifyCliReadiness.items.filter((item) => item.status === 'fail'),
    ...readiness.items.filter((item) => item.status === 'fail'),
    ...sourceBlockers,
    ...pwaReadiness.items.filter((item) => item.status === 'fail'),
    ...netlifyPreviewBlockers,
    ...previewPromotionReceiptBlockers,
  ];
  const warnings = [
    ...readiness.items.filter((item) => item.status === 'warn'),
    ...sourceWarnings,
    ...pwaReadiness.items.filter((item) => item.status === 'warn'),
    ...netlifyPreviewWarnings,
    ...netlifyProjectSetupWarnings,
    ...previewPromotionReceiptWarnings,
  ];
  const clientPreviewReady =
    readiness.ok
    && sourceCatalogReadiness.ok
    && pwaReadiness.ok
    && netlifyPreviewReadiness.ok
    && netlifyProjectSetupReceiptReadiness.ok;

  return {
    blockers,
    breachImportEnabled,
    clientPreviewReady,
    current,
    databaseSchemaReadiness,
    featureFlags,
    ignoredOperatorEnvAvailable: ignoredOperatorEnv.available,
    ignoredOperatorEnvLoaded: ignoredOperatorEnv.loaded,
    liveAck,
    liveFilingFeatureEnabled,
    mode,
    netlifyCliReadiness,
    netlifyProjectSetupReceiptReadiness,
    netlifyPreviewReadiness,
    previewPromotionReceiptReadiness,
    pwaReadiness,
    readiness,
    sourceCatalogReadiness,
    warnings,
  };
}
