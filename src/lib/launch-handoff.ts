export type LaunchHandoffStatus = 'confirmed' | 'needs-review';

export type LaunchHandoffFlag = {
  key: string;
  enabled: boolean;
};

export type LaunchHandoffInput = {
  mode: string;
  readinessOk: boolean;
  sourceCatalogReady: boolean;
  formCoverage: number;
  pwaReady?: boolean;
  matcherReceiptReady?: boolean;
  matcherReceiptErrorCount?: number | null;
  featureFlags: LaunchHandoffFlag[];
};

export type LaunchHandoffItem = {
  key: string;
  label: string;
  status: LaunchHandoffStatus;
  detail: string;
  action?: string;
};

export type LaunchBlockerCategory =
  | 'hosted-database'
  | 'operator-account'
  | 'automation-worker'
  | 'matcher-proof'
  | 'business-billing'
  | 'legal-review'
  | 'pwa-readiness'
  | 'deployed-preview'
  | 'promotion-receipt'
  | 'local-tooling'
  | 'uncategorized';

export type LaunchBlockerRow = {
  key: string;
  label: string;
  status: string;
  detail: string;
  action?: string | null;
};

export type LaunchExternalBlockerSummary = {
  category: LaunchBlockerCategory;
  label: string;
  count: number;
  owner: 'operator' | 'business' | 'legal' | 'deployment' | 'local';
  proofNeeded: string;
  nextAction: string;
  blockers: LaunchBlockerRow[];
};

export type LaunchCriticalPathItem = {
  key: LaunchBlockerCategory | 'netlify-identity-proof' | 'ready';
  label: string;
  owner: LaunchExternalBlockerSummary['owner'];
  status: 'blocked' | 'confirmed';
  blockerCount: number;
  proofNeeded: string;
  nextAction: string;
  blockers: LaunchBlockerRow[];
};

export type LaunchCriticalPathOptions = {
  netlifyIdentityReady?: boolean;
};

export type MatcherReceiptCriticalPathInput = {
  exists: boolean;
  errorCount: number | null;
};

const categoryMeta: Record<LaunchBlockerCategory, {
  label: string;
  owner: LaunchExternalBlockerSummary['owner'];
  proofNeeded: string;
  nextAction: string;
}> = {
  'hosted-database': {
    label: 'Hosted database',
    owner: 'operator',
    proofNeeded: 'Real hosted DATABASE_URL/auth values, data/hosted-database-packet.md, successful hosted migrations, source import dry-run, and support-packet schema/source evidence.',
    nextAction: 'Run npm run hosted:db:packet, npm run hosted:db:prepare, edit .env.hosted.local with real values, then run the hosted migration/import commands.',
  },
  'operator-account': {
    label: 'Operator account settings',
    owner: 'operator',
    proofNeeded: 'Confirmed data/operator-setup-packet.md, support contact, scraper contact identity, auth posture, session secret, security headers, and linked ClaimBot Netlify site.',
    nextAction: 'Run npm run operator:packet, finish Netlify/account setup, push non-placeholder env values, and rerun npm run netlify:doctor.',
  },
  'automation-worker': {
    label: 'Automation worker runtime',
    owner: 'operator',
    proofNeeded: 'Persistent worker runtime or scheduler proof, including a synthetic hosted file_claim seed receipt plus a non-secret worker smoke receipt, that file_claim jobs are processed automatically after paid commands create them.',
    nextAction: 'After hosted DATABASE_URL/auth and SMOKE_BASE_URL are loaded, run CLAIMBOT_WORKER_SMOKE_SEED=allow npm run worker:file-claim:seed, run npm run worker:once, or set the GitHub SMOKE_BASE_URL variable and run the scheduled worker with seed_smoke_job=true; preserve the seed and worker smoke receipt artifacts, then record CLAIMBOT_WORKER_RUNTIME=scheduled-worker and CLAIMBOT_WORKER_RUNTIME_RECEIPT=verified after the hosted smoke.',
  },
  'matcher-proof': {
    label: 'Matcher refresh receipt',
    owner: 'operator',
    proofNeeded: 'Fresh account-scoped MATCHER_RUN_COMPLETED receipt with zero errors, exported through the support packet before client preview.',
    nextAction: 'Run the matcher from Review or npm run matcher:receipt for the launch account, confirm zero errors, then export the support packet.',
  },
  'business-billing': {
    label: 'Business billing setup',
    owner: 'business',
    proofNeeded: 'Processor-hosted Plus/Pro checkout links, data/billing-activation-packet.md, and a signed billing entitlement-sync verifier.',
    nextAction: 'Run npm run billing:packet, create the paid checkout links, configure the billing sync secret or Stripe endpoint secret, and run deployed billing smokes.',
  },
  'legal-review': {
    label: 'Legal/compliance review',
    owner: 'legal',
    proofNeeded: 'Documented review of data/legal-review-packet.md, Terms, Privacy, trust copy, proof handling, authorization gates, pricing, billing sync, and filing posture.',
    nextAction: 'Run npm run legal:packet, complete legal/compliance review, then set CLAIMBOT_LEGAL_REVIEW_ACK=reviewed.',
  },
  'pwa-readiness': {
    label: 'PWA install/offline readiness',
    owner: 'deployment',
    proofNeeded: 'Passing npm run validate:pwa, manifest/install metadata, Kimi installed-app chrome, offline safety shell, service-worker cache boundary, and hosted PWA headers.',
    nextAction: 'Run npm run validate:pwa, review /offline.html, /manifest.webmanifest, /sw.js, and confirm the installed shell caches no claim data.',
  },
  'deployed-preview': {
    label: 'Deployed preview target',
    owner: 'deployment',
    proofNeeded: 'A deployed HTTPS Netlify preview URL, data/preview-promotion-packet.md, confirmed ClaimBot site slug, and smoke-test inputs.',
    nextAction: 'Run netlify deploy, npm run preview:packet, set SMOKE_BASE_URL and NETLIFY_SITE_SLUG, then run npm run validate:netlify:strict.',
  },
  'promotion-receipt': {
    label: 'Preview promotion receipt',
    owner: 'deployment',
    proofNeeded: 'Fresh data/preview-promotion-receipt.json and data/preview-promotion-packet.md created by npm run preview:gate against the deployed preview.',
    nextAction: 'Run npm run preview:gate after deployed preview smokes pass, rerun npm run preview:packet, then npm run production:check-receipt before production deploy.',
  },
  'local-tooling': {
    label: 'Local CLI/tooling availability',
    owner: 'local',
    proofNeeded: 'Required local CLI/tooling installed on the operator machine with local verification passing.',
    nextAction: 'Install the missing local tool or rerun npm run local:verify, then rerun the launch doctor.',
  },
  uncategorized: {
    label: 'Uncategorized blockers',
    owner: 'operator',
    proofNeeded: 'Reviewed blocker details and a recorded operator decision for how to close each item.',
    nextAction: 'Review each blocker action in the launch handoff and add a specific remediation path.',
  },
};

const blockerCategories: Record<string, LaunchBlockerCategory> = {
  database: 'hosted-database',
  'database-auth': 'hosted-database',
  'database-schema': 'hosted-database',
  'source-catalog': 'hosted-database',
  'source-providers': 'hosted-database',
  'source-quality': 'hosted-database',
  'claim-form-coverage': 'hosted-database',
  'deadline-coverage': 'hosted-database',
  'administrator-coverage': 'hosted-database',
  'category-coverage': 'hosted-database',
  'text-encoding': 'hosted-database',
  'scraper-audit': 'hosted-database',
  'source-import-receipt': 'hosted-database',
  'settlement-search-feature': 'hosted-database',
  'filing-mode': 'operator-account',
  'daily-cap': 'operator-account',
  'automation-worker-runtime': 'automation-worker',
  'scraper-contact': 'operator-account',
  'support-contact': 'operator-account',
  'security-headers': 'operator-account',
  'hosted-auth': 'operator-account',
  'session-secret': 'operator-account',
  'netlify-project-setup-receipt': 'operator-account',
  'netlify-cli': 'local-tooling',
  'netlify-auth': 'operator-account',
  'netlify-site-link': 'operator-account',
  'matcher-refresh-receipt': 'matcher-proof',
  'paid-billing': 'business-billing',
  'billing-smoke-secret': 'business-billing',
  'legal-review': 'legal-review',
  'pwa-manifest': 'pwa-readiness',
  'pwa-shortcuts': 'pwa-readiness',
  'offline-shell': 'pwa-readiness',
  'service-worker-boundary': 'pwa-readiness',
  'install-status-copy': 'pwa-readiness',
  'pwa-hosted-headers': 'pwa-readiness',
  'netlify-build-config': 'deployed-preview',
  'promotion-scripts': 'deployed-preview',
  'smoke-base-url': 'deployed-preview',
  'preview-site-alignment': 'deployed-preview',
  'session-smoke-secret': 'deployed-preview',
  'preview-promotion-receipt': 'promotion-receipt',
  'receipt-freshness': 'promotion-receipt',
  'receipt-preview-target': 'promotion-receipt',
  'receipt-command-coverage': 'promotion-receipt',
  'receipt-current-target-match': 'promotion-receipt',
};

const criticalPathOrder: LaunchBlockerCategory[] = [
  'local-tooling',
  'operator-account',
  'automation-worker',
  'hosted-database',
  'matcher-proof',
  'business-billing',
  'legal-review',
  'pwa-readiness',
  'deployed-preview',
  'promotion-receipt',
  'uncategorized',
];

const netlifyIdentityProofBlocker: LaunchBlockerRow = {
  key: 'netlify-identity-proof',
  label: 'Netlify Identity proof',
  status: 'fail',
  detail: 'Netlify Identity proof is not recorded as enabled with invite-only registration and email confirmation.',
  action: 'Confirm Identity in the Netlify dashboard, then run npm run netlify:record-setup with the Identity confirmation flags.',
};

function flagEnabled(flags: LaunchHandoffFlag[], key: string) {
  return flags.find((flag) => flag.key === key)?.enabled ?? false;
}

function categoryForBlocker(key: string): LaunchBlockerCategory {
  return blockerCategories[key] ?? 'uncategorized';
}

export function getMatcherReceiptCriticalPathBlockers(
  receipt: MatcherReceiptCriticalPathInput,
): LaunchBlockerRow[] {
  if (receipt.exists && receipt.errorCount === 0) {
    return [];
  }

  return [{
    key: 'matcher-refresh-receipt',
    label: 'Matcher refresh receipt',
    status: receipt.exists ? 'warn' : 'fail',
    detail: receipt.exists
      ? `Latest MATCHER_RUN_COMPLETED receipt has ${receipt.errorCount ?? 'unknown'} run error(s).`
      : 'No account-scoped MATCHER_RUN_COMPLETED receipt is recorded for this launch account.',
    action: 'Run the matcher from Review or npm run matcher:receipt for the launch account, confirm zero errors, then export the support packet.',
  }];
}

export function getLaunchExternalBlockerSummary(blockers: LaunchBlockerRow[]): LaunchExternalBlockerSummary[] {
  const grouped = new Map<LaunchBlockerCategory, LaunchBlockerRow[]>();

  for (const blocker of blockers) {
    const category = categoryForBlocker(blocker.key);
    grouped.set(category, [...(grouped.get(category) ?? []), blocker]);
  }

  return [...grouped.entries()].map(([category, rows]) => {
    const meta = categoryMeta[category];
    return {
      category,
      label: meta.label,
      count: rows.length,
      owner: meta.owner,
      proofNeeded: meta.proofNeeded,
      nextAction: rows.find((row) => row.action)?.action ?? meta.nextAction,
      blockers: rows,
    };
  });
}

export function getLaunchCriticalPath(
  blockers: LaunchBlockerRow[],
  options: LaunchCriticalPathOptions = {},
): LaunchCriticalPathItem[] {
  const grouped = new Map(
    getLaunchExternalBlockerSummary(blockers).map((item) => [item.category, item]),
  );
  const rows: LaunchCriticalPathItem[] = [];

  for (const category of criticalPathOrder) {
    const summary = grouped.get(category);
    if (!summary) {
      continue;
    }

    rows.push({
      key: category,
      label: summary.label,
      owner: summary.owner,
      status: 'blocked',
      blockerCount: summary.count,
      proofNeeded: summary.proofNeeded,
      nextAction: summary.nextAction,
      blockers: summary.blockers,
    });
  }

  if (options.netlifyIdentityReady === false) {
    rows.splice(Math.min(rows.length, 2), 0, {
      key: 'netlify-identity-proof',
      label: 'Netlify Identity proof',
      owner: 'operator',
      status: 'blocked',
      blockerCount: 1,
      proofNeeded: 'Netlify Identity enabled on the confirmed ClaimBot site, invite-only registration, email confirmation, and a non-secret setup receipt.',
      nextAction: 'Confirm Identity in the Netlify dashboard, then run npm run netlify:record-setup with the Identity confirmation flags.',
      blockers: [netlifyIdentityProofBlocker],
    });
  }

  if (rows.length === 0) {
    rows.push({
      key: 'ready',
      label: 'Client preview critical path',
      owner: 'deployment',
      status: 'confirmed',
      blockerCount: 0,
      proofNeeded: 'All external launch blockers and Netlify Identity proof are recorded.',
      nextAction: 'Run npm run preview:gate against the deployed preview, then npm run production:check-receipt before production deploy.',
      blockers: [],
    });
  }

  return rows;
}

export function getLaunchHandoffChecklist(input: LaunchHandoffInput): LaunchHandoffItem[] {
  const liveFilingEnabled = flagEnabled(input.featureFlags, 'CLAIMBOT_FEATURE_LIVE_FILING');
  const settlementSearchEnabled = flagEnabled(input.featureFlags, 'CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');
  const shadowFirst = input.mode === 'shadow' && !liveFilingEnabled;
  const sourceReady = input.sourceCatalogReady && settlementSearchEnabled && input.formCoverage > 0;
  const pwaReady = input.pwaReady ?? true;
  const matcherReceiptReady = input.matcherReceiptReady === true && (input.matcherReceiptErrorCount ?? 0) === 0;

  return [
    {
      key: 'shadow-first',
      label: 'Shadow-mode first launch',
      status: shadowFirst ? 'confirmed' : 'needs-review',
      detail: shadowFirst
        ? 'ClaimBot is configured to prepare claims without transmitting them during first client onboarding.'
        : 'First client onboarding should stay in shadow mode with live filing disabled.',
      action: shadowFirst ? undefined : 'Set CLAIM_FILER_MODE=shadow and CLAIMBOT_FEATURE_LIVE_FILING=false before inviting users.',
    },
    {
      key: 'proof-review',
      label: 'Proof-required review',
      status: 'confirmed',
      detail: 'Matches that require receipts, breach notices, or other evidence stay in the review queue until proof is staged.',
    },
    {
      key: 'authorization-scope',
      label: 'Scoped category authorizations',
      status: 'confirmed',
      detail: 'Queueing uses saved category attestations and keeps unauthorized settlement categories out of filing preflight.',
    },
    {
      key: 'user-terms-boundary',
      label: 'User Terms acknowledgement gate',
      status: 'confirmed',
      detail: 'Setup automation requires the TERMS_BOUNDARY_ACK control and records USER_TERMS_ACKNOWLEDGED before discovery, matching, or safe queue preparation can start.',
    },
    {
      key: 'source-coverage',
      label: 'Settlement source coverage',
      status: sourceReady ? 'confirmed' : 'needs-review',
      detail: sourceReady
        ? `${input.formCoverage}% of indexed settlements include claim-form links for client preview.`
        : 'The settlement catalog needs records, enabled search, and linked claim forms before client previews.',
      action: sourceReady ? undefined : 'Load settlement sources, confirm claim-form links, then run matcher and route smoke checks.',
    },
    {
      key: 'matcher-refresh-receipt',
      label: 'Matcher refresh receipt',
      status: matcherReceiptReady ? 'confirmed' : 'needs-review',
      detail: matcherReceiptReady
        ? 'The account support packet can prove the latest matcher refresh with a MATCHER_RUN_COMPLETED receipt and zero run errors.'
        : 'Client previews should have a fresh MATCHER_RUN_COMPLETED audit receipt before relying on matcher output.',
      action: matcherReceiptReady ? undefined : 'Run the matcher from Review, confirm the receipt has zero errors, then export the support packet.',
    },
    {
      key: 'pwa-install-shell',
      label: 'PWA install safety',
      status: pwaReady ? 'confirmed' : 'needs-review',
      detail: pwaReady
        ? 'The installed app manifest, shortcuts, offline safety shell, service-worker cache boundary, install chrome, and hosted headers are ready.'
        : 'The installed app shell must pass PWA readiness before client previews because offline mode must not expose claim data or filing controls.',
      action: pwaReady ? undefined : 'Run npm run validate:pwa and fix manifest, offline shell, service worker, install status, or hosted PWA headers before client invites.',
    },
    {
      key: 'audit-export',
      label: 'Audit exports available',
      status: 'confirmed',
      detail: 'Claim detail pages expose an audit export containing eligibility, authorization, artifact, and event history.',
    },
    {
      key: 'hosted-verification',
      label: 'Hosted verification passed',
      status: input.readinessOk ? 'confirmed' : 'needs-review',
      detail: input.readinessOk
        ? 'Production gates are present for database, auth, session signing, support, scraper contact, and security headers.'
        : 'Hosted deployment gates still have blockers or warnings that should be resolved before user invites.',
      action: input.readinessOk ? undefined : 'Fix the production gate findings, then run validation, build, web smoke, auth smoke, and feature smoke.',
    },
  ];
}
