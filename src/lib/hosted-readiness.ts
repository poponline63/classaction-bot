import { getBillingReadiness } from '@lib/billing/checkout';
import { hasTemplatePlaceholder } from '@lib/bootstrap-audit-stamp';

export type HostedReadinessInput = {
  databaseUrl?: string;
  databaseAuthToken?: string;
  hasDatabaseAuthToken?: boolean;
  claimFilerMode?: string;
  claimFilerLiveAck?: string;
  claimFilerMaxPerDay?: string | number;
  scraperUserAgent?: string;
  supportEmail?: string;
  supportUrl?: string;
  isHosted?: boolean;
  authDisabled?: boolean;
  sessionSecret?: string;
  settlementSearchFeatureEnabled?: boolean;
  liveFilingFeatureEnabled?: boolean;
  cspEnforced?: boolean;
  billingPlusMonthlyUrl?: string;
  billingProMonthlyUrl?: string;
  billingSyncSecret?: string;
  billingStripeWebhookSecret?: string;
  legalReviewAck?: string;
  workerRuntime?: string;
  workerRuntimeReceipt?: string;
  paidBillingRequired?: boolean;
  databaseSchemaReady?: boolean;
  databaseSchemaFailures?: string[];
  singleUserFileDb?: boolean;
};

export type HostedReadinessItem = {
  key: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  action?: string;
};

export type HostedReadinessReport = {
  ok: boolean;
  failures: string[];
  warnings: string[];
  items: HostedReadinessItem[];
};

function isValidHostedSupportUrl(value: string) {
  if (!value || hasTemplatePlaceholder(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function evaluateHostedReadiness(input: HostedReadinessInput): HostedReadinessReport {
  const isHosted = input.isHosted ?? false;
  const databaseUrl = input.databaseUrl ?? '';
  const databaseAuthToken = input.databaseAuthToken ?? '';
  const mode = input.claimFilerMode ?? 'shadow';
  const liveAck = input.claimFilerLiveAck ?? '';
  const maxPerDay = Number(input.claimFilerMaxPerDay ?? '20');
  const scraperUserAgent = input.scraperUserAgent ?? '';
  const supportEmail = input.supportEmail ?? '';
  const supportUrl = input.supportUrl ?? '';
  const supportUrlConfigured = isValidHostedSupportUrl(supportUrl);
  const supportContactConfigured = (Boolean(supportEmail) && !hasTemplatePlaceholder(supportEmail)) || supportUrlConfigured;
  const hasDatabaseAuthToken = input.hasDatabaseAuthToken ?? false;
  const databaseAuthTokenConfigured = hasDatabaseAuthToken && !hasTemplatePlaceholder(databaseAuthToken);
  const authDisabled = input.authDisabled ?? false;
  const sessionSecret = input.sessionSecret ?? '';
  const settlementSearchFeatureEnabled = input.settlementSearchFeatureEnabled ?? true;
  const liveFilingFeatureEnabled = input.liveFilingFeatureEnabled ?? true;
  const cspEnforced = input.cspEnforced ?? false;
  const paidBillingRequired = input.paidBillingRequired ?? isHosted;
  const databaseSchemaReady = input.databaseSchemaReady ?? true;
  const databaseSchemaFailures = input.databaseSchemaFailures ?? [];
  const legalReviewAck = input.legalReviewAck ?? '';
  const singleUserFileDb = input.singleUserFileDb ?? false;
  const workerRuntime = input.workerRuntime ?? '';
  const workerRuntimeReceipt = input.workerRuntimeReceipt ?? '';
  const workerRuntimeConfigured = ['persistent-worker', 'dedicated-worker', 'external-worker', 'background-worker', 'scheduled-worker', 'github-actions-scheduler'].includes(workerRuntime);
  const workerRuntimeVerified = workerRuntimeReceipt === 'verified';
  const billing = getBillingReadiness({
    CLAIMBOT_BETA_NO_BILLING: input.paidBillingRequired === false ? 'true' : undefined,
    CLAIMBOT_BILLING_PLUS_MONTHLY_URL: input.billingPlusMonthlyUrl,
    CLAIMBOT_BILLING_PRO_MONTHLY_URL: input.billingProMonthlyUrl,
    CLAIMBOT_BILLING_SYNC_SECRET: input.billingSyncSecret,
    CLAIMBOT_STRIPE_WEBHOOK_SECRET: input.billingStripeWebhookSecret,
  });
  const items: HostedReadinessItem[] = [];

  if (!databaseUrl && isHosted && singleUserFileDb) {
    items.push({
      key: 'database',
      label: 'Persistent database',
      status: 'warn',
      detail: 'Single-user website test mode will use temporary file storage instead of hosted persistent storage.',
      action: 'Use this only for private testing. Add a hosted DATABASE_URL before inviting clients or relying on saved production data.',
    });
  } else if (!databaseUrl && isHosted) {
    items.push({
      key: 'database',
      label: 'Persistent database',
      status: 'fail',
      detail: 'DATABASE_URL is required for hosted deployment.',
      action: 'Run npm run hosted:db:packet, create a hosted database, then set DATABASE_URL in Netlify environment variables.',
    });
  } else if (!databaseUrl) {
    items.push({
      key: 'database',
      label: 'Persistent database',
      status: 'warn',
      detail: 'Local development will use ./data/classaction.db.',
      action: 'Run npm run hosted:db:packet and use a hosted database before deploying clients.',
    });
  } else if (isHosted && hasTemplatePlaceholder(databaseUrl)) {
    items.push({
      key: 'database',
      label: 'Persistent database',
      status: 'fail',
      detail: 'DATABASE_URL still contains a hosted setup placeholder.',
      action: 'Run npm run hosted:db:packet, then replace DATABASE_URL with the real hosted database URL before deploying clients.',
    });
  } else if (isHosted && databaseUrl.startsWith('file:') && singleUserFileDb) {
    items.push({
      key: 'database',
      label: 'Persistent database',
      status: 'warn',
      detail: 'Single-user website test mode is using file storage that can reset on redeploys or runtime restarts.',
      action: 'Move to hosted libSQL/Turso before customer launch or anything that must persist reliably.',
    });
  } else if (isHosted && databaseUrl.startsWith('file:')) {
    items.push({
      key: 'database',
      label: 'Persistent database',
      status: 'fail',
      detail: 'Hosted deployment must not use file: local storage.',
      action: 'Run npm run hosted:db:packet, then replace DATABASE_URL with a hosted database URL such as libsql://...',
    });
  } else {
    items.push({
      key: 'database',
      label: 'Persistent database',
      status: 'pass',
      detail: databaseUrl.startsWith('file:')
        ? 'Local file database is acceptable only for development.'
        : 'DATABASE_URL is configured for persistent storage.',
    });
  }

  if (databaseUrl.startsWith('libsql://') && !databaseAuthTokenConfigured) {
    items.push({
      key: 'database-auth',
      label: 'Database auth token',
      status: 'fail',
      detail: hasDatabaseAuthToken
        ? 'DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN still contains a hosted setup placeholder.'
        : 'libsql:// requires DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN.',
      action: 'Set DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN next to DATABASE_URL.',
    });
  } else if (databaseUrl.startsWith('libsql://')) {
    items.push({
      key: 'database-auth',
      label: 'Database auth token',
      status: 'pass',
      detail: 'Hosted libSQL/Turso auth token is present.',
    });
  }

  if (!databaseSchemaReady) {
    items.push({
      key: 'database-schema',
      label: 'Database schema',
      status: 'fail',
      detail: databaseSchemaFailures.length > 0
        ? `Database migrations are incomplete: ${databaseSchemaFailures.join(', ')}.`
        : 'Database migrations are incomplete or could not be verified.',
      action: 'Run npm run hosted:db:packet, then run npm run db:migrate against the hosted database and re-run npm run smoke:auth.',
    });
  } else if (databaseUrl) {
    items.push({
      key: 'database-schema',
      label: 'Database schema',
      status: 'pass',
      detail: 'Required hosted schema columns and ledgers are present.',
    });
  }

  if (mode !== 'shadow' && mode !== 'live') {
    items.push({
      key: 'filing-mode',
      label: 'Filing mode',
      status: 'fail',
      detail: 'CLAIM_FILER_MODE must be shadow or live.',
      action: 'Set CLAIM_FILER_MODE=shadow for hosted onboarding.',
    });
  } else if (mode === 'live' && !liveFilingFeatureEnabled) {
    items.push({
      key: 'filing-mode',
      label: 'Filing mode',
      status: 'fail',
      detail: 'Live filing is disabled by CLAIMBOT_FEATURE_LIVE_FILING.',
      action: 'Set CLAIM_FILER_MODE=shadow or enable CLAIMBOT_FEATURE_LIVE_FILING only after client review.',
    });
  } else if (mode === 'live' && liveAck !== 'reviewed') {
    items.push({
      key: 'filing-mode',
      label: 'Filing mode',
      status: 'fail',
      detail: 'Live filing requires CLAIM_FILER_LIVE_ACK=reviewed.',
      action: 'Keep CLAIM_FILER_MODE=shadow until live filing has been reviewed.',
    });
  } else if (mode === 'live') {
    items.push({
      key: 'filing-mode',
      label: 'Filing mode',
      status: 'warn',
      detail: 'Live mode is enabled and should be monitored closely.',
      action: 'Use shadow mode for new client onboarding unless live submission has been approved.',
    });
  } else {
    items.push({
      key: 'filing-mode',
      label: 'Filing mode',
      status: 'pass',
      detail: 'Shadow mode is active by default.',
    });
  }

  if (isHosted && !settlementSearchFeatureEnabled) {
    items.push({
      key: 'settlement-search-feature',
      label: 'Settlement discovery feature',
      status: 'fail',
      detail: 'CLAIMBOT_FEATURE_SETTLEMENT_SEARCH must stay enabled for client launch because claim matching depends on settlement discovery.',
      action: 'Set CLAIMBOT_FEATURE_SETTLEMENT_SEARCH=true before preview promotion.',
    });
  } else if (settlementSearchFeatureEnabled) {
    items.push({
      key: 'settlement-search-feature',
      label: 'Settlement discovery feature',
      status: 'pass',
      detail: 'Settlement discovery and claim-search surfaces are enabled.',
    });
  } else {
    items.push({
      key: 'settlement-search-feature',
      label: 'Settlement discovery feature',
      status: 'warn',
      detail: 'Settlement discovery is disabled in this local environment.',
      action: 'Set CLAIMBOT_FEATURE_SETTLEMENT_SEARCH=true before client-preview testing.',
    });
  }

  if (!Number.isFinite(maxPerDay) || maxPerDay < 1 || maxPerDay > 100) {
    items.push({
      key: 'daily-cap',
      label: 'Daily claim cap',
      status: 'fail',
      detail: 'CLAIM_FILER_MAX_PER_DAY must be a number from 1 to 100.',
      action: 'Set CLAIM_FILER_MAX_PER_DAY to a conservative integer such as 20.',
    });
  } else {
    items.push({
      key: 'daily-cap',
      label: 'Daily claim cap',
      status: 'pass',
      detail: `Daily claim attempts are capped at ${maxPerDay}.`,
    });
  }

  if (isHosted && paidBillingRequired && (!workerRuntimeConfigured || !workerRuntimeVerified)) {
    items.push({
      key: 'automation-worker-runtime',
      label: 'Automation worker runtime',
      status: 'fail',
      detail: !workerRuntimeConfigured
        ? 'Paid full automation requires a production worker runtime that processes file_claim jobs after web requests create them.'
        : 'Paid full automation worker runtime is configured but no verified worker smoke receipt is recorded.',
      action: 'Deploy npm run worker on a persistent worker host with the same DATABASE_URL, or run npm run worker:once from the GitHub Actions scheduler, then set CLAIMBOT_WORKER_RUNTIME=scheduled-worker and CLAIMBOT_WORKER_RUNTIME_RECEIPT=verified after a successful smoke.',
    });
  } else if (!workerRuntimeConfigured || !workerRuntimeVerified) {
    items.push({
      key: 'automation-worker-runtime',
      label: 'Automation worker runtime',
      status: 'warn',
      detail: isHosted
        ? 'Beta no-billing launch can run without paid automation proof, but full automation is not proved until a worker runtime processes file_claim jobs.'
        : 'Local development can create file_claim jobs, but paid full automation is not proved until a worker runtime processes them.',
      action: isHosted
        ? 'Keep paid automation CTAs disabled in beta, then prove a persistent worker before enabling paid full automation.'
        : 'Run npm run worker locally for development, and prove a persistent worker before hosted client launch.',
    });
  } else {
    items.push({
      key: 'automation-worker-runtime',
      label: 'Automation worker runtime',
      status: 'pass',
      detail: `Paid full automation worker runtime is verified as ${workerRuntime}.`,
    });
  }

  if (isHosted && (!scraperUserAgent || !scraperUserAgent.includes('http') || hasTemplatePlaceholder(scraperUserAgent))) {
    items.push({
      key: 'scraper-contact',
      label: 'Scraper contact',
      status: 'fail',
      detail: hasTemplatePlaceholder(scraperUserAgent)
        ? 'SCRAPER_USER_AGENT still contains the hosted setup placeholder domain.'
        : 'SCRAPER_USER_AGENT must include a contact URL for hosted scraping.',
      action: 'Run npm run operator:packet, then set SCRAPER_USER_AGENT to something like ClaimBot/0.1 (+https://yourdomain.com/contact).',
    });
  } else if (!scraperUserAgent || !scraperUserAgent.includes('http') || hasTemplatePlaceholder(scraperUserAgent)) {
    items.push({
      key: 'scraper-contact',
      label: 'Scraper contact',
      status: 'warn',
      detail: 'SCRAPER_USER_AGENT should include a contact URL before hosted scraping.',
      action: 'Run npm run operator:packet, then set SCRAPER_USER_AGENT to something like ClaimBot/0.1 (+https://yourdomain.com/contact).',
    });
  } else {
    items.push({
      key: 'scraper-contact',
      label: 'Scraper contact',
      status: 'pass',
      detail: 'Hosted scraper user agent includes contact information.',
    });
  }

  if (isHosted && !supportContactConfigured) {
    items.push({
      key: 'support-contact',
      label: 'Support contact',
      status: 'fail',
      detail: hasTemplatePlaceholder(supportEmail) || hasTemplatePlaceholder(supportUrl)
        ? 'CLAIMBOT_SUPPORT_EMAIL still contains the hosted setup placeholder domain.'
        : 'CLAIMBOT_SUPPORT_EMAIL or CLAIMBOT_SUPPORT_URL is required for hosted client support.',
      action: 'Run npm run operator:packet, then set CLAIMBOT_SUPPORT_URL to the Discord support URL or CLAIMBOT_SUPPORT_EMAIL to the address clients and site operators should use.',
    });
  } else if (supportContactConfigured) {
    items.push({
      key: 'support-contact',
      label: 'Support contact',
      status: 'pass',
      detail: supportUrlConfigured ? 'Client support URL is configured.' : 'Client support email is configured.',
    });
  }

  if (isHosted && authDisabled) {
    items.push({
      key: 'hosted-auth',
      label: 'Hosted access gate',
      status: 'fail',
      detail: 'Hosted authentication is disabled. Remove CLAIMBOT_DISABLE_AUTH=true before client deployment.',
      action: 'Remove CLAIMBOT_DISABLE_AUTH=true and confirm Netlify Identity is enabled.',
    });
  } else if (isHosted) {
    items.push({
      key: 'hosted-auth',
      label: 'Hosted access gate',
      status: 'pass',
      detail: 'Hosted routes require a signed app session created from Netlify Identity.',
    });
  } else {
    items.push({
      key: 'hosted-auth',
      label: 'Hosted access gate',
      status: 'warn',
      detail: 'Local development is open; hosted deployments enable the Identity gate.',
      action: 'Set CLAIMBOT_REQUIRE_AUTH=true locally when testing hosted route protection.',
    });
  }

  if (isHosted && !authDisabled && (sessionSecret.length < 32 || hasTemplatePlaceholder(sessionSecret))) {
    items.push({
      key: 'session-secret',
      label: 'Session signing secret',
      status: 'fail',
      detail: hasTemplatePlaceholder(sessionSecret)
        ? 'CLAIMBOT_SESSION_SECRET still contains the hosted setup placeholder.'
        : 'CLAIMBOT_SESSION_SECRET must be at least 32 characters for hosted authentication.',
      action: 'Set CLAIMBOT_SESSION_SECRET to a long random value in the hosted environment.',
    });
  } else if (isHosted && !authDisabled) {
    items.push({
      key: 'session-secret',
      label: 'Session signing secret',
      status: 'pass',
      detail: 'Hosted app sessions are signed with a deployment secret.',
    });
  }

  if (isHosted && !cspEnforced) {
    items.push({
      key: 'security-headers',
      label: 'Security headers',
      status: 'fail',
      detail: 'Hosted deployment must enforce Content-Security-Policy headers.',
      action: 'Deploy on Netlify or set CLAIMBOT_ENFORCE_CSP=true on the production host.',
    });
  } else if (isHosted) {
    items.push({
      key: 'security-headers',
      label: 'Security headers',
      status: 'pass',
      detail: 'Hosted responses enforce CSP plus frame, content-type, referrer, and permissions headers.',
    });
  } else {
    items.push({
      key: 'security-headers',
      label: 'Security headers',
      status: 'warn',
      detail: 'Local development omits CSP so Next.js dev tooling can run.',
      action: 'Use NETLIFY=true or CLAIMBOT_ENFORCE_CSP=true when validating hosted browser hardening.',
    });
  }

  if (paidBillingRequired && !billing.ready) {
    items.push({
      key: 'paid-billing',
      label: 'Paid billing gates',
      status: 'fail',
      detail: `Paid billing requires Plus checkout, Pro checkout, and signed entitlement sync before client deployment. Missing: ${billing.missingRequiredEnvKeys.join(', ')}.`,
      action: 'Run npm run billing:packet, set Plus and Pro processor-hosted checkout URLs, then set CLAIMBOT_BILLING_SYNC_SECRET or CLAIMBOT_STRIPE_WEBHOOK_SECRET for signed entitlement sync.',
    });
  } else if (!billing.ready) {
    items.push({
      key: 'paid-billing',
      label: 'Paid billing gates',
      status: 'warn',
      detail: 'Paid billing checkout and signed entitlement sync are not fully configured.',
      action: 'Run npm run billing:packet and set paid billing env values before relying on paid plan CTAs.',
    });
  } else {
    items.push({
      key: 'paid-billing',
      label: 'Paid billing gates',
      status: 'pass',
      detail: 'Plus and Pro checkout links plus signed entitlement sync are configured.',
    });
  }

  if (isHosted && legalReviewAck !== 'reviewed') {
    items.push({
      key: 'legal-review',
      label: 'Legal/compliance review',
      status: 'fail',
      detail: 'Hosted launch requires legal/compliance review acknowledgment before inviting clients.',
      action: 'Run npm run legal:packet, review data/legal-review-packet.md plus Terms, Privacy Policy, trust copy, proof handling, authorization gates, pricing, billing sync, and filing posture; then set CLAIMBOT_LEGAL_REVIEW_ACK=reviewed.',
    });
  } else if (isHosted) {
    items.push({
      key: 'legal-review',
      label: 'Legal/compliance review',
      status: 'pass',
      detail: 'Legal/compliance review acknowledgment is recorded for hosted launch.',
    });
  } else {
    items.push({
      key: 'legal-review',
      label: 'Legal/compliance review',
      status: 'warn',
      detail: 'Legal/compliance review acknowledgment is required before hosted client launch.',
      action: 'Run npm run legal:packet and complete review before setting CLAIMBOT_LEGAL_REVIEW_ACK=reviewed in production.',
    });
  }

  const failures = items.filter((item) => item.status === 'fail').map((item) => item.detail);
  const warnings = items.filter((item) => item.status === 'warn').map((item) => item.detail);

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    items,
  };
}
