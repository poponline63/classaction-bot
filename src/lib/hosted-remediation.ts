import type { HostedReadinessItem } from './hosted-readiness';

const sessionSecretCommand = 'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"';
const netlifyLaunchContextFlag = '--context production deploy-preview';

export const secretCommands = [
  'npm run launch:secrets',
];

export const hostedDatabaseSetupCommands = [
  'npm run hosted:db:packet',
  'npm run hosted:db:receipt',
  'npm run hosted:db:prepare',
  '# Edit .env.hosted.local with the real hosted DATABASE_URL and auth token.',
  'npm run hosted:db:doctor',
  'npm run with:hosted-env -- npm run db:migrate',
  'npm run with:hosted-env -- npm run validate:schema',
  'npm run with:hosted-env -- npm run source:import:dry',
  'npm run with:hosted-env -- npm run source:import',
  'npm run hosted:db:push',
];

export const hostedEnvironmentSetupCommands = [
  'npm run operator:packet',
  'npm run hosted:env:prepare',
  '# Edit .env.hosted.local with real database, support, billing, and legal-review values.',
  'npm run hosted:env:doctor:bootstrap',
  'npm run hosted:env:push:bootstrap',
  'npm run launch:secrets',
  'npm run hosted:env:doctor',
  'npm run hosted:env:push',
];

export const sessionSecretSetupCommands = [
  'npm run launch:secrets',
  'npm run launch:push-secrets',
  '# Fallback if you are not using the generated .env.launch.local helper:',
  sessionSecretCommand,
  `netlify env:set CLAIMBOT_SESSION_SECRET "PASTE_GENERATED_SESSION_SECRET" --secret ${netlifyLaunchContextFlag}`,
];

export const billingSyncSetupCommands = [
  'npm run billing:packet',
  'npm run billing:receipt',
  'npm run launch:secrets',
  'npm run launch:push-secrets',
  '# Fallback if you are not using the generated .env.launch.local helper:',
  sessionSecretCommand,
  `netlify env:set CLAIMBOT_BILLING_SYNC_SECRET "PASTE_GENERATED_BILLING_SYNC_SECRET" --secret ${netlifyLaunchContextFlag}`,
  '# Stripe alternative: use the webhook endpoint secret from Stripe instead of the custom ClaimBot sync secret.',
  `netlify env:set CLAIMBOT_STRIPE_WEBHOOK_SECRET "whsec_YOUR_STRIPE_ENDPOINT_SECRET" --secret ${netlifyLaunchContextFlag}`,
];

export const deployCommands = [
  `netlify env:set DATABASE_URL "libsql://YOUR_DATABASE.turso.io" ${netlifyLaunchContextFlag}`,
  `netlify env:set DATABASE_AUTH_TOKEN "YOUR_DATABASE_TOKEN" --secret ${netlifyLaunchContextFlag}`,
  `netlify env:set CLAIM_FILER_MODE "shadow" ${netlifyLaunchContextFlag}`,
  `netlify env:set CLAIM_FILER_MAX_PER_DAY "20" ${netlifyLaunchContextFlag}`,
  `netlify env:set SCRAPER_USER_AGENT "ClaimBot/0.1 (+https://yourdomain.com/contact)" ${netlifyLaunchContextFlag}`,
  `netlify env:set CLAIMBOT_SUPPORT_EMAIL "support@yourdomain.com" ${netlifyLaunchContextFlag}`,
  `netlify env:set CLAIMBOT_DISABLE_AUTH "false" ${netlifyLaunchContextFlag}`,
  `netlify env:set CLAIMBOT_ENFORCE_CSP "true" ${netlifyLaunchContextFlag}`,
  `netlify env:set CLAIMBOT_FEATURE_SETTLEMENT_SEARCH "true" ${netlifyLaunchContextFlag}`,
  `netlify env:set CLAIMBOT_FEATURE_BREACH_IMPORT "true" ${netlifyLaunchContextFlag}`,
  `netlify env:set CLAIMBOT_FEATURE_LIVE_FILING "false" ${netlifyLaunchContextFlag}`,
  `netlify env:set CLAIMBOT_WORKER_RUNTIME "scheduled-worker" ${netlifyLaunchContextFlag}`,
];

export const netlifySiteLinkCommands = [
  'npm install -g netlify-cli',
  'netlify --version',
  'netlify login',
  'netlify status',
  '# If a confirmed existing ClaimBot Netlify site exists:',
  'netlify link',
  '# If no ClaimBot site exists yet, create a new Netlify site for ClaimBot first, then rerun netlify link.',
  '# For CI only after confirming the correct ClaimBot site:',
  '$env:NETLIFY_SITE_ID="PASTE_CLAIMBOT_SITE_ID"',
];

export const netlifyProjectSetupReceiptCommands = [
  '# After confirming Project configuration > Identity in the Netlify dashboard:',
  'npm run netlify:record-setup -- --identity-enabled --registration invite-only --email-confirmation --safe-env-confirmed --evidence "Identity enabled, invite-only registration, and email confirmation confirmed in Netlify dashboard."',
  'npm run launch:handoff',
];

export const verificationCommands = [
  'npm run hosted:checklist',
  'npm run hosted:env:prepare',
  'npm run hosted:env:doctor:bootstrap',
  'npm run hosted:env:doctor',
  'npm run hosted:db:prepare',
  'npm run hosted:db:doctor',
  'npm run hosted:db:packet',
  'npm run operator:packet',
  'npm run worker:packet',
  'npm run worker:github:doctor',
  'npm run launch:secrets',
  'npm run launch:handoff',
  'npm run launch:refresh:packets',
  'npm run activation:workbook',
  'npm run netlify:doctor',
  'npm run validate:secrets',
  'npm run deploy:packet',
  'npm run local:verify',
  'npm run local:dev:packet',
  'npm run responsive:packet',
  'npm run validate:netlify',
  'npm run validate:ui',
  'npm run validate:legal',
  'npm run automation:safety:packet',
  'npm run audit:privacy:packet',
  'npm run legal:packet',
  'npm run pwa:packet',
  'npm run billing:packet',
  'npm run validate:pwa',
  'netlify dev:exec npm run validate:hosted',
  'npm run db:migrate',
  'npm run validate:schema',
  'npm run with:hosted-env -- npm run db:migrate',
  'npm run with:hosted-env -- npm run validate:schema',
  'npm run validate:source',
  'npm run enrich:source',
  'npm run source:export',
  'npm run validate:source:strict',
  'npm run source:packet',
  'npm run matcher:receipt',
  '# For hosted DB bootstrap, rerun with DATABASE_URL/DATABASE_AUTH_TOKEN pointed at production:',
  'npm run with:hosted-env -- npm run source:import:dry',
  'npm run with:hosted-env -- npm run source:import',
  'npm run build:hosted',
  'npm run smoke:hosted:local',
  '# After netlify deploy and SMOKE_BASE_URL are set:',
  'npm run preview:packet',
  '# Keep NETLIFY_SITE_ID/SITE_ID available if this workspace is not linked with .netlify/state.json:',
  '$env:NETLIFY_SITE_ID="PASTE_CLAIMBOT_SITE_ID"',
  '$env:NETLIFY_SITE_SLUG="YOUR_CONFIRMED_CLAIMBOT_SITE_SLUG"',
  'npm run netlify:doctor:strict',
  'npm run with:launch-secrets -- npm run netlify:doctor',
  'npm run preview:check-env',
  'npm run validate:netlify:strict',
  'npm run preview:gate',
  'npm run preview:packet',
  'npm run production:check-receipt',
];

export const localAuthSmokeCommands = [
  'npm run smoke:auth',
];

export const identitySetupSteps = [
  'Enable Netlify Identity in Project configuration > Identity before inviting clients.',
  'Use invite-only registration for client onboarding unless open signup is intentionally reviewed.',
  'Keep email confirmation enabled for production accounts; use dedicated preview accounts for testing.',
  'Deploy to Netlify before testing /login because Netlify Identity is not available in local dev.',
  'Run the deployed auth smoke with SMOKE_BASE_URL pointed at the preview URL before production promotion.',
];

export const previewSmokeCommands = [
  '$env:NETLIFY_SITE_ID="PASTE_CLAIMBOT_SITE_ID"',
  '$env:NETLIFY_SITE_SLUG="YOUR_CONFIRMED_CLAIMBOT_SITE_SLUG"',
  '$env:SMOKE_BASE_URL="https://your-preview.netlify.app"',
  '$env:CLAIMBOT_SESSION_SECRET="PASTE_THE_DEPLOYED_SESSION_SECRET"',
  '$env:CLAIMBOT_BILLING_SYNC_SECRET="PASTE_THE_DEPLOYED_BILLING_SYNC_SECRET"',
  '# Or, for native Stripe webhooks:',
  '$env:CLAIMBOT_STRIPE_WEBHOOK_SECRET="whsec_YOUR_STRIPE_ENDPOINT_SECRET"',
  '# Run deployed-preview smokes sequentially; local dev-server smokes use isolated NEXT_DIST_DIR folders so they do not overwrite the production .next build.',
  'npm run smoke:web',
  'npm run smoke:auth',
  'npm run smoke:features',
  'npm run preview:check-env',
];

export const launchPacketCommands = [
  'npm run hosted:db:packet',
  'npm run operator:packet',
  'npm run worker:packet',
  'npm run source:packet',
  'npm run automation:safety:packet',
  'npm run audit:privacy:packet',
  'npm run audit:support:packet',
  'npm run billing:packet',
  'npm run legal:packet',
  'npm run pwa:packet',
  'npm run deploy:packet',
  'npm run local:verify',
  'npm run local:dev:packet',
  'npm run netlify:doctor',
  'npm run responsive:packet',
  'npm run preview:packet',
  'npm run matcher:receipt',
  'npm run activation:workbook',
  'npm run client:checklist',
  'npm run launch:handoff',
];

export const launchPacketArtifacts = [
  {
    label: 'Hosted database packet',
    path: 'data/hosted-database-packet.md',
    owner: 'operator',
    command: 'npm run hosted:db:packet',
    proof: 'Hosted database env shape, schema probes, source export/import path, and database promotion readiness.',
  },
  {
    label: 'Operator setup packet',
    path: 'data/operator-setup-packet.md',
    owner: 'operator',
    command: 'npm run operator:packet',
    proof: 'Support contact, scraper identity, auth posture, session/security gates, and Netlify Identity proof.',
  },
  {
    label: 'Worker runtime packet',
    path: 'data/worker-runtime-packet.md',
    owner: 'operator',
    command: 'npm run worker:packet',
    proof: 'Persistent worker or scheduler proof, including data/worker-file-claim-smoke-seed.json plus data/worker-smoke-receipt.json or the claimbot-worker-smoke-receipt and claimbot-worker-runtime-packet artifacts, that paid file_claim jobs are processed automatically after the web app queues them.',
  },
  {
    label: 'Source readiness packet',
    path: 'data/source-readiness-packet.md',
    owner: 'operator',
    command: 'npm run source:packet',
    proof: 'Settlement source coverage, claim-form coverage, source quality, transfer digest, and matcher input readiness.',
  },
  {
    label: 'Automation safety packet',
    path: 'data/automation-safety-packet.md',
    owner: 'operator',
    command: 'npm run automation:safety:packet',
    proof: 'Shadow-mode defaults, setup consent, Terms acknowledgement, queue trust locks, proof gates, authorization gates, paid-plan gates, and audit controls.',
  },
  {
    label: 'Audit and privacy packet',
    path: 'data/audit-privacy-packet.md',
    owner: 'operator',
    command: 'npm run audit:privacy:packet',
    proof: 'Claim audit exports, support packet export, privacy export/request intake, no-store responses, digest/checkpoint evidence, and no automatic destructive deletion.',
  },
  {
    label: 'Audit support packet',
    path: 'data/audit-support-packet.md',
    owner: 'operator',
    command: 'npm run audit:support:packet',
    proof: 'Account support-packet JSON export, digest/checkpoint evidence, masked launch evidence, launch packet stack status, and paid automation blocker summary.',
  },
  {
    label: 'Billing activation packet',
    path: 'data/billing-activation-packet.md',
    owner: 'business',
    command: 'npm run billing:packet',
    proof: 'Processor-hosted checkout links, signed entitlement sync smoke receipt, user reference handling, and idempotency evidence.',
  },
  {
    label: 'Legal review packet',
    path: 'data/legal-review-packet.md',
    owner: 'legal',
    command: 'npm run legal:packet',
    proof: 'Terms, Privacy, proof handling, authorization gates, pricing, billing, filing posture, and compliance review scope.',
  },
  {
    label: 'PWA readiness packet',
    path: 'data/pwa-readiness-packet.md',
    owner: 'deployment',
    command: 'npm run pwa:packet',
    proof: 'Installed-app manifest, workflow shortcuts, offline safety shell, service-worker cache boundary, Kimi install chrome, and hosted PWA headers.',
  },
  {
    label: 'Deployability packet',
    path: 'data/deployability-packet.md',
    owner: 'deployment',
    command: 'npm run deploy:packet',
    proof: 'Secret hygiene, Next.js production build artifacts, hosted build script, and Netlify build configuration.',
  },
  {
    label: 'Local verification packet',
    path: 'data/local-verification-packet.md',
    owner: 'deployment',
    command: 'npm run local:verify',
    proof: 'Typecheck, secret hygiene, UI guardrails, legal readiness, PWA readiness, local Netlify preflight, focused automation tests, production build, and local hosted smoke results captured as a non-secret receipt.',
  },
  {
    label: 'Local dev stability packet',
    path: 'data/local-dev-stability-packet.md',
    owner: 'deployment',
    command: 'npm run local:dev:packet',
    proof: 'Dev server isolation, stale Next.js static chunk detection, isolated smoke server configuration, ignored build folders, and optional localhost health captured as a non-secret receipt.',
  },
  {
    label: 'Netlify launch doctor receipt',
    path: 'data/netlify-launch-doctor.md',
    owner: 'deployment',
    command: 'npm run netlify:doctor',
    proof: 'Netlify CLI/auth status, hosted env/database readiness counts, site-link status, preview URL/site alignment, Identity receipt status, and next commands captured as a non-secret receipt.',
  },
  {
    label: 'Responsive readiness packet',
    path: 'data/responsive-readiness-packet.md',
    owner: 'deployment',
    command: 'npm run responsive:packet',
    proof: 'Mobile and desktop render checks for core Kimi command surfaces, required visible state, and horizontal overflow.',
  },
  {
    label: 'Kimi visual readiness packet',
    path: 'data/kimi-visual-readiness-packet.md',
    owner: 'deployment',
    command: 'npm run kimi:visual:packet',
    proof: 'Screenshot-backed desktop/mobile proof for the Kimi dark shell, sidebar/topbar, mobile bottom nav, trust rail, command surfaces, and horizontal overflow.',
  },
  {
    label: 'Preview promotion packet',
    path: 'data/preview-promotion-packet.md',
    owner: 'deployment',
    command: 'npm run preview:packet',
    proof: 'Deployed HTTPS preview target, site alignment, smoke inputs, preview gate readiness, and promotion receipt state.',
  },
  {
    label: 'Matcher refresh receipt',
    path: 'audit:MATCHER_RUN_COMPLETED',
    owner: 'operator',
    command: 'npm run matcher:receipt',
    proof: 'Latest MATCHER_RUN_COMPLETED summary proving source processing and zero-error matcher refresh before client preview.',
  },
  {
    label: 'External activation workbook',
    path: 'data/external-activation-workbook.md',
    owner: 'operator',
    command: 'npm run activation:workbook',
    proof: 'Current external setup workstreams, owners, proof artifacts, next actions, and starter commands for hosted database, operator setup, billing, legal review, Identity, preview, and promotion receipt activation.',
  },
  {
    label: 'Client preview checklist',
    path: 'data/client-preview-checklist.md',
    owner: 'deployment',
    command: 'npm run client:checklist',
    proof: 'Completion audit across Kimi shell, routes, backend data, feature flags, auth gates, eligibility, authorization, proof review, audit packets, pricing, trust/compliance, and hosted deployment proof.',
  },
  {
    label: 'Launch handoff report',
    path: 'data/launch-handoff-report.md',
    owner: 'deployment',
    command: 'npm run launch:handoff',
    proof: 'Final non-secret handoff showing blockers, warnings, next commands, and operator notes for launch promotion.',
  },
];

const fixCommands: Record<string, string[]> = {
  database: [
    ...hostedDatabaseSetupCommands,
    '# Fallback if you are not using the ignored .env.hosted.local helper:',
    `netlify env:set DATABASE_URL "libsql://YOUR_DATABASE.turso.io" ${netlifyLaunchContextFlag}`,
    `netlify env:set DATABASE_AUTH_TOKEN "YOUR_DATABASE_TOKEN" --secret ${netlifyLaunchContextFlag}`,
  ],
  'database-auth': [
    'npm run hosted:db:prepare',
    'npm run hosted:db:doctor',
    'npm run hosted:db:push',
    '# Fallback if you are not using the ignored .env.hosted.local helper:',
    `netlify env:set DATABASE_AUTH_TOKEN "YOUR_DATABASE_TOKEN" --secret ${netlifyLaunchContextFlag}`,
  ],
  'filing-mode': [
    `netlify env:set CLAIM_FILER_MODE "shadow" ${netlifyLaunchContextFlag}`,
    `netlify env:set CLAIMBOT_FEATURE_LIVE_FILING "false" ${netlifyLaunchContextFlag}`,
  ],
  'daily-cap': [
    `netlify env:set CLAIM_FILER_MAX_PER_DAY "20" ${netlifyLaunchContextFlag}`,
  ],
  'automation-worker-runtime': [
    'npm run automation:safety:packet',
    'npm run worker:file-claim:receipt',
    '# After SMOKE_BASE_URL points at the deployed preview and hosted DATABASE_URL/auth values are loaded:',
    'CLAIMBOT_WORKER_SMOKE_SEED=allow npm run worker:file-claim:seed',
    'npm run worker:once',
    'npm run worker:packet',
    '# Deploy npm run worker on a persistent worker host that shares the hosted DATABASE_URL, or configure .github/workflows/claimbot-worker.yml with hosted database secrets.',
    'npm run worker:github:doctor',
    'gh variable set SMOKE_BASE_URL --body "https://your-preview.netlify.app"',
    'gh workflow run claimbot-worker.yml -f limit=3 -f seed_smoke_job=true',
    '# Preserve data/worker-file-claim-smoke-seed.json, data/worker-smoke-receipt.json, data/worker-runtime-packet.md, or the matching GitHub artifacts from the hosted scheduler smoke.',
    `netlify env:set CLAIMBOT_WORKER_RUNTIME "scheduled-worker" ${netlifyLaunchContextFlag}`,
    `netlify env:set CLAIMBOT_WORKER_RUNTIME_RECEIPT "verified" ${netlifyLaunchContextFlag}`,
  ],
  'scraper-contact': [
    'npm run operator:packet',
    `netlify env:set SCRAPER_USER_AGENT "ClaimBot/0.1 (+https://yourdomain.com/contact)" ${netlifyLaunchContextFlag}`,
  ],
  'support-contact': [
    'npm run operator:packet',
    `netlify env:set CLAIMBOT_SUPPORT_EMAIL "support@yourdomain.com" ${netlifyLaunchContextFlag}`,
  ],
  'hosted-auth': [
    `netlify env:set CLAIMBOT_DISABLE_AUTH "false" ${netlifyLaunchContextFlag}`,
  ],
  'session-secret': [
    ...sessionSecretSetupCommands,
  ],
  'security-headers': [
    `netlify env:set CLAIMBOT_ENFORCE_CSP "true" ${netlifyLaunchContextFlag}`,
  ],
  'legal-review': [
    'npm run legal:packet',
    'npm run validate:legal',
    '# After legal/compliance review is complete:',
    `netlify env:set CLAIMBOT_LEGAL_REVIEW_ACK "reviewed" ${netlifyLaunchContextFlag}`,
  ],
  'paid-billing': [
    'npm run billing:packet',
    'npm run billing:receipt',
    `netlify env:set CLAIMBOT_BILLING_PLUS_MONTHLY_URL "https://YOUR_PROCESSOR_CHECKOUT_LINK" ${netlifyLaunchContextFlag}`,
    `netlify env:set CLAIMBOT_BILLING_PRO_MONTHLY_URL "https://YOUR_PROCESSOR_CHECKOUT_LINK" ${netlifyLaunchContextFlag}`,
    ...billingSyncSetupCommands,
  ],
};

export const hostedOperatorNotes = [
  'Replace placeholders before running commands.',
  'Keep generated secrets out of chat, screenshots, GitHub issues, and committed files.',
  'Use npm run launch:secrets to generate ignored local smoke secrets, then npm run launch:push-secrets after Netlify CLI login to set matching hosted secrets without printing them.',
  'Run npm run operator:packet before inviting clients, then use npm run netlify:record-setup only after confirming the Netlify project and Identity dashboard settings; it writes a non-secret setup receipt and prints no secrets.',
  'Use npm run hosted:env:prepare when you want one ignored operator file for database, support, billing, legal, and launch-critical hosted values.',
  'Use npm run hosted:env:doctor:bootstrap and npm run hosted:env:push:bootstrap when you need to push prerequisite hosted runtime env before legal, billing, and worker-runtime receipt proof exist.',
  'Use npm run hosted:env:doctor before pushing Netlify env to prove the full one-file hosted launch env is non-placeholder and secret-safe.',
  'Run npm run hosted:db:packet, then use npm run hosted:db:prepare to create ignored .env.hosted.local and run hosted database migrations/imports with npm run with:hosted-env -- <command>.',
  'Use npm run hosted:db:doctor to reject placeholder hosted database values before running migrations, imports, or Netlify env pushes.',
  'Use npm run hosted:db:push after Netlify CLI login to set DATABASE_URL and DATABASE_AUTH_TOKEN without printing database secrets.',
  'Use npm run hosted:env:push after Netlify CLI login to push all launch-critical hosted env from .env.hosted.local plus generated launch secrets without printing values.',
  'Launch handoff, Netlify doctor, strict Netlify preflight, and preview promotion load non-placeholder values from ignored .env.hosted.local and .env.launch.local before checking deployed-preview inputs, and still never print raw env values.',
  'Set launch-critical Netlify environment variables for both production and deploy-preview contexts so preview smokes test the same gates before production promotion.',
  'Install and confirm the Netlify CLI before running netlify login, link, env:set, deploy, or deploy --prod.',
  'Run netlify login and netlify link before preview promotion so .netlify/state.json exists locally, or set NETLIFY_SITE_ID/SITE_ID in CI.',
  'Keep NETLIFY_SITE_SLUG or NETLIFY_SITE_DASHBOARD_URL available for preview smokes so SMOKE_BASE_URL can be checked against the confirmed ClaimBot site.',
  'Do not link ClaimBot to an unrelated Netlify project; create or confirm a dedicated ClaimBot site before setting production env vars.',
  'Run npm run validate:secrets before preview deploys to catch pasted API keys or webhook URLs.',
  'Run local dev-server smokes with npm run smoke:hosted:local unless SMOKE_BASE_URL points at a deployed preview; it starts a fresh web target, runs smoke:web, then runs smoke:auth and smoke:features sequentially to avoid port and startup contention.',
  'Local smoke dev servers set isolated NEXT_DIST_DIR folders (.next-smoke-*) so auth and feature smokes do not mutate the production .next build used by npm run start.',
  'Enable Netlify Identity on the deployed site before sending /login links to clients.',
  'Keep CLAIM_FILER_MODE=shadow and CLAIMBOT_FEATURE_LIVE_FILING=false until live filing has been reviewed.',
  'Paid full automation requires a separate worker runtime: the hosted web app creates audited file_claim jobs, and npm run worker or a scheduler running npm run worker:once must process them with the same hosted DATABASE_URL. Use CLAIMBOT_WORKER_SMOKE_SEED=allow npm run worker:file-claim:seed after SMOKE_BASE_URL is set to create a synthetic due file_claim job for worker proof.',
  'Run npm run billing:packet and configure processor-hosted Plus and Pro payment links before relying on paid CTAs.',
  'Wire paid processor events to /api/billing/entitlement-sync with either the X-ClaimBot-Billing-Signature header or Stripe-Signature plus CLAIMBOT_STRIPE_WEBHOOK_SECRET.',
  'Include claimbotUserId or clientReferenceId=claimbot_user_<id> in processor metadata when possible so billing sync links by stable account before email fallback.',
  'Run npm run legal:packet and complete legal/compliance review before setting CLAIMBOT_LEGAL_REVIEW_ACK=reviewed.',
  'Confirm /api/audit/support-packet shows launchEvidence.databaseSchema.ok=true before client launch review.',
  'Confirm validate:source:strict passes before exporting and transferring the source catalog for public-discovery client previews.',
  'Keep data/source-catalog-export.json and data/source-catalog-export.json.sha256 together; hosted imports verify the digest receipt when it is present.',
  'After npm run preview:gate passes against the deployed preview, keep data/preview-promotion-receipt.json and run npm run production:check-receipt before netlify deploy --prod.',
  'Run npm run preview:packet before and after preview:gate so deployed preview target and promotion receipt readiness are captured without secrets.',
  'Confirm /api/audit/support-packet shows launchEvidence.sourceCatalog totals, formCoveragePercent, deadlineCoveragePercent, knownAdministratorPercent, categorizedPercent, textEncodingReady, and mojibakeCount before public-discovery client previews.',
  'Run npm run matcher:receipt, then confirm /api/audit/support-packet shows launchEvidence.matcherRunReceipt from MATCHER_RUN_COMPLETED before relying on client-facing matcher results.',
  'Confirm /api/audit/support-packet shows launchEvidence.netlifyPreview, including Netlify build config, promotion scripts, server-observable checks, and which operator-local smoke inputs are proved by validate:netlify:strict.',
  'Run npm run launch:handoff when handing deployment to another operator; it writes non-secret data/launch-handoff-report.json and data/launch-handoff-report.md.',
  'Run npm run launch:refresh:packets when you want one non-secret local command to regenerate packet artifacts and record which external gates are still blocked.',
  'Run npm run activation:workbook when you need a single non-secret workbook for the remaining external setup owners, proof artifacts, and starter commands.',
  'Proof-required claims, authorization checks, and audit logging remain required even after environment blockers are fixed.',
];

export function getLaunchFixCommand(key: string): string | null {
  return fixCommands[key]?.[0] ?? null;
}

export function getHostedFixCommands(items: HostedReadinessItem[]): string[] {
  const seen = new Set<string>();
  const commands: string[] = [];

  for (const item of items) {
    if (item.status !== 'fail') continue;
    for (const command of fixCommands[item.key] ?? []) {
      if (seen.has(command)) continue;
      seen.add(command);
      commands.push(command);
    }
  }

  return commands;
}
