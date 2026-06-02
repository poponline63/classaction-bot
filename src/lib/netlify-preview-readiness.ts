import fs from 'node:fs';
import path from 'node:path';
import { hasTemplatePlaceholder } from '@lib/bootstrap-audit-stamp';

export type NetlifyPreviewReadinessStatus = 'pass' | 'warn' | 'fail';

export type NetlifyPreviewReadinessItem = {
  key: string;
  label: string;
  status: NetlifyPreviewReadinessStatus;
  detail: string;
  action?: string;
  serverObservable: boolean;
};

export type NetlifyPreviewReadiness = {
  ok: boolean;
  strict: boolean;
  buildConfigReady: boolean;
  promotionScriptsReady: boolean;
  netlifySiteSlug: string | null;
  smokeBaseUrlMatchesSite: boolean | null;
  siteLinked: boolean;
  siteLinkSource: 'local-state' | 'env' | 'missing';
  siteLinkStateValid: boolean;
  siteLinkStateError: string | null;
  smokeBaseUrlConfigured: boolean;
  smokeBaseUrlHttps: boolean;
  sessionSmokeSecretConfigured: boolean;
  billingSmokeSecretConfigured: boolean;
  evidenceScope: 'operator-preflight' | 'support-packet';
  failureCount: number;
  warningCount: number;
  items: NetlifyPreviewReadinessItem[];
};

type NetlifyPreviewReadinessInput = {
  env?: Record<string, string | undefined>;
  evidenceScope?: 'operator-preflight' | 'support-packet';
  root?: string;
  strict?: boolean;
};

function hasValue(value: string | undefined) {
  return Boolean(value?.trim()) && !hasTemplatePlaceholder(value);
}

function isHttpsPreviewUrl(value: string | undefined) {
  if (!hasValue(value)) return false;
  try {
    const url = new URL(value!);
    return url.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function slugFromDashboardUrl(value: string | undefined) {
  if (!hasValue(value)) return '';
  try {
    const url = new URL(value!);
    const parts = url.pathname.split('/').filter(Boolean);
    const sitesIndex = parts.indexOf('sites');
    if (sitesIndex < 0) return '';
    return parts[sitesIndex + 1]?.trim() ?? '';
  } catch {
    return '';
  }
}

function previewHostMatchesSlug(smokeBaseUrl: string | undefined, siteSlug: string) {
  if (!isHttpsPreviewUrl(smokeBaseUrl) || !hasValue(siteSlug)) return false;
  try {
    const hostname = new URL(smokeBaseUrl!).hostname.toLowerCase();
    const normalizedSlug = siteSlug.toLowerCase();
    return hostname === `${normalizedSlug}.netlify.app` || hostname.endsWith(`--${normalizedSlug}.netlify.app`);
  } catch {
    return false;
  }
}

function buildItem(
  key: string,
  label: string,
  status: NetlifyPreviewReadinessStatus,
  detail: string,
  action?: string,
  serverObservable = true,
): NetlifyPreviewReadinessItem {
  return { key, label, status, detail, action, serverObservable };
}

function readIfExists(filePath: string) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

export function evaluateNetlifyPreviewReadiness(input: NetlifyPreviewReadinessInput = {}): NetlifyPreviewReadiness {
  const env = input.env ?? process.env;
  const evidenceScope = input.evidenceScope ?? 'operator-preflight';
  const root = input.root ?? process.cwd();
  const strict = input.strict ?? false;
  const netlifyToml = readIfExists(path.join(root, 'netlify.toml'));
  const packageJson = readIfExists(path.join(root, 'package.json'));
  const buildConfigReady =
    netlifyToml.includes('command = "npm run build:hosted"')
    && netlifyToml.includes('publish = ".next"')
    && netlifyToml.includes('Content-Security-Policy');
  const promotionScriptsReady =
    packageJson.includes('"netlify:doctor:strict"')
    && packageJson.includes('"validate:netlify:strict"')
    && packageJson.includes('"preview:gate"')
    && packageJson.includes('"build:hosted"');
  const localStatePath = path.join(root, '.netlify', 'state.json');
  const hasLocalState = fs.existsSync(localStatePath);
  let localStateSiteId = '';
  let localStateSiteName = '';
  let localStateAdminUrl = '';
  let siteLinkStateError: string | null = null;
  if (hasLocalState) {
    try {
      const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
      localStateSiteId = typeof localState?.siteId === 'string' ? localState.siteId.trim() : '';
      localStateSiteName = typeof localState?.siteName === 'string' ? localState.siteName.trim() : '';
      localStateAdminUrl = typeof localState?.adminUrl === 'string' ? localState.adminUrl.trim() : '';
      if (!hasValue(localStateSiteId)) {
        siteLinkStateError = 'Local .netlify/state.json exists but does not include a real siteId.';
      }
    } catch (error) {
      siteLinkStateError = `Local .netlify/state.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const hasEnvSiteId = hasValue(env.NETLIFY_SITE_ID) || hasValue(env.SITE_ID);
  const hasValidLocalState = hasLocalState && !siteLinkStateError;
  const siteLinked = hasValidLocalState || hasEnvSiteId;
  const siteLinkSource: NetlifyPreviewReadiness['siteLinkSource'] = hasValidLocalState
    ? 'local-state'
    : hasEnvSiteId
      ? 'env'
      : 'missing';
  const smokeBaseUrlConfigured = hasValue(env.SMOKE_BASE_URL);
  const smokeBaseUrlHttps = isHttpsPreviewUrl(env.SMOKE_BASE_URL);
  const netlifySiteSlug =
    (hasValue(env.NETLIFY_SITE_SLUG) ? env.NETLIFY_SITE_SLUG!.trim() : '')
    || slugFromDashboardUrl(env.NETLIFY_SITE_DASHBOARD_URL)
    || (hasValue(localStateSiteName) ? localStateSiteName : '')
    || slugFromDashboardUrl(localStateAdminUrl)
    || '';
  const smokeBaseUrlMatchesSite = hasValue(netlifySiteSlug)
    ? previewHostMatchesSlug(env.SMOKE_BASE_URL, netlifySiteSlug)
    : null;
  const sessionSmokeSecretConfigured = hasValue(env.CLAIMBOT_SESSION_SECRET);
  const billingSmokeSecretConfigured = hasValue(env.CLAIMBOT_BILLING_SYNC_SECRET) || hasValue(env.CLAIMBOT_STRIPE_WEBHOOK_SECRET);
  const missingStatus: NetlifyPreviewReadinessStatus = strict ? 'fail' : 'warn';
  const operatorLocalStatus: NetlifyPreviewReadinessStatus = evidenceScope === 'support-packet' ? 'warn' : missingStatus;
  const operatorLocalAction = evidenceScope === 'support-packet'
    ? 'Verify this from the operator terminal with npm run validate:netlify:strict and npm run preview:gate.'
    : undefined;
  const operatorLocalSmokeItems = evidenceScope === 'support-packet'
    ? [
      buildItem(
        'smoke-base-url',
        'Deployed preview URL',
        'warn',
        smokeBaseUrlHttps
          ? 'SMOKE_BASE_URL is present server-side, but the deployed preview URL must still be verified from the operator terminal.'
          : 'The HTTPS SMOKE_BASE_URL is operator-local preview-gate input and is not reliably observable from a deployed support packet.',
        operatorLocalAction,
        false,
      ),
      buildItem(
        'session-smoke-secret',
        'Session smoke secret',
        'warn',
        sessionSmokeSecretConfigured
          ? 'CLAIMBOT_SESSION_SECRET is present server-side; the matching smoke secret must still be supplied from the operator terminal without exposing it.'
          : 'The local session smoke secret is operator-terminal input and is not reliably observable from a deployed support packet.',
        operatorLocalAction,
        false,
      ),
      buildItem(
        'billing-smoke-secret',
        'Billing smoke verifier',
        'warn',
        billingSmokeSecretConfigured
          ? 'A billing sync or Stripe verifier is present server-side; the matching smoke verifier must still be supplied from the operator terminal without exposing it.'
          : 'The local billing smoke verifier is operator-terminal input and is not reliably observable from a deployed support packet.',
        operatorLocalAction,
        false,
      ),
    ]
    : null;

  const items = [
    buildConfigReady
      ? buildItem(
        'netlify-build-config',
        'Netlify build config',
        'pass',
        'netlify.toml routes Netlify builds through build:hosted and applies hosted security headers.',
      )
      : buildItem(
        'netlify-build-config',
        'Netlify build config',
        missingStatus,
        'netlify.toml must use npm run build:hosted, publish .next, and include hosted security headers.',
        'Restore the ClaimBot netlify.toml build and headers config before preview promotion.',
      ),
    promotionScriptsReady
      ? buildItem(
        'promotion-scripts',
        'Promotion scripts',
        'pass',
        'package.json exposes strict Netlify doctor, strict preflight, hosted build, and preview gate scripts.',
      )
      : buildItem(
        'promotion-scripts',
        'Promotion scripts',
        missingStatus,
        'package.json must expose strict Netlify and preview-promotion scripts before hosted release.',
        'Restore netlify:doctor:strict, validate:netlify:strict, build:hosted, and preview:gate scripts.',
      ),
    siteLinked
      ? buildItem(
        'netlify-site-link',
        'ClaimBot Netlify site',
        'pass',
        siteLinkSource === 'local-state'
          ? 'Local .netlify/state.json exists for this workspace.'
          : 'NETLIFY_SITE_ID or SITE_ID is set for CI-style site targeting.',
      )
      : buildItem(
        'netlify-site-link',
        'ClaimBot Netlify site',
        missingStatus,
        siteLinkStateError ?? 'This workspace is not linked to a confirmed ClaimBot Netlify site.',
        'Confirm or create a dedicated ClaimBot Netlify site, then run netlify link.',
      ),
    ...(operatorLocalSmokeItems ?? [
      smokeBaseUrlHttps
      ? buildItem(
        'smoke-base-url',
        'Deployed preview URL',
        'pass',
        'SMOKE_BASE_URL points at an HTTPS deployed preview URL.',
      )
      : buildItem(
        'smoke-base-url',
        'Deployed preview URL',
        operatorLocalStatus,
        smokeBaseUrlConfigured
          ? 'SMOKE_BASE_URL is set but must be an HTTPS deployed preview URL, not localhost.'
          : 'SMOKE_BASE_URL is not set for deployed preview smokes.',
        'Deploy a Netlify preview, then set SMOKE_BASE_URL to the HTTPS preview URL before npm run preview:gate.',
      ),
    smokeBaseUrlMatchesSite === null
      ? buildItem(
        'preview-site-alignment',
        'Preview site alignment',
        strict ? 'fail' : 'warn',
        'No Netlify site slug is available to prove SMOKE_BASE_URL belongs to the confirmed ClaimBot site.',
        'Set NETLIFY_SITE_SLUG or NETLIFY_SITE_DASHBOARD_URL after confirming the ClaimBot Netlify project.',
      )
      : smokeBaseUrlMatchesSite
        ? buildItem(
          'preview-site-alignment',
          'Preview site alignment',
          'pass',
          `SMOKE_BASE_URL belongs to the confirmed Netlify site slug ${netlifySiteSlug}.`,
        )
        : buildItem(
          'preview-site-alignment',
          'Preview site alignment',
          strict ? 'fail' : 'warn',
          `SMOKE_BASE_URL does not match the confirmed Netlify site slug ${netlifySiteSlug}.`,
          'Use the preview URL generated for the confirmed ClaimBot Netlify site before npm run preview:gate.',
        ),
    sessionSmokeSecretConfigured
      ? buildItem(
        'session-smoke-secret',
        'Session smoke secret',
        'pass',
        'CLAIMBOT_SESSION_SECRET is available to sign deployed preview smoke-test sessions.',
      )
      : buildItem(
        'session-smoke-secret',
        'Session smoke secret',
        operatorLocalStatus,
        'CLAIMBOT_SESSION_SECRET is not available in the operator environment for deployed preview smokes.',
        'Use the same session secret configured on the deployed preview in the local terminal running smokes.',
      ),
    billingSmokeSecretConfigured
      ? buildItem(
        'billing-smoke-secret',
        'Billing smoke verifier',
        'pass',
        'A billing sync or Stripe webhook secret is available for deployed billing callback smokes.',
      )
      : buildItem(
        'billing-smoke-secret',
        'Billing smoke verifier',
        operatorLocalStatus,
        'No billing sync or Stripe webhook verifier is available for deployed preview smokes.',
        'Set CLAIMBOT_BILLING_SYNC_SECRET or CLAIMBOT_STRIPE_WEBHOOK_SECRET in the local terminal running smokes.',
      ),
    ]),
  ];
  const failureCount = items.filter((entry) => entry.status === 'fail').length;
  const warningCount = items.filter((entry) => entry.status === 'warn').length;

  return {
    ok: failureCount === 0 && warningCount === 0,
    strict,
    buildConfigReady,
    promotionScriptsReady,
    netlifySiteSlug: netlifySiteSlug || null,
    smokeBaseUrlMatchesSite,
    siteLinked,
    siteLinkSource,
    siteLinkStateValid: !siteLinkStateError,
    siteLinkStateError,
    smokeBaseUrlConfigured,
    smokeBaseUrlHttps,
    sessionSmokeSecretConfigured,
    billingSmokeSecretConfigured,
    evidenceScope,
    failureCount,
    warningCount,
    items,
  };
}
