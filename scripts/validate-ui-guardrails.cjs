const fs = require('node:fs');
const path = require('node:path');
const { findNextRouteExportHygieneLeaks } = require('./lib/next-route-export-hygiene.cjs');

const cssPath = path.join(process.cwd(), 'src', 'app', 'globals.css');
const css = fs.readFileSync(cssPath, 'utf8');
const failures = [];

function readIfExists(file) {
  try {
    return fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  } catch {
    return '';
  }
}

function extractExportedArray(source, name) {
  const pattern = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\];`);
  return source.match(pattern)?.[1] ?? '';
}

const packageJson = readIfExists('package.json');
const routeExportValidator = readIfExists('scripts/validate-next-route-exports.cjs');
const routeExportHygieneHelper = readIfExists('scripts/lib/next-route-export-hygiene.cjs');
const billingActivationPacketExporter = readIfExists('scripts/export-billing-activation-packet.ts');
const hostedDatabasePacketExporter = readIfExists('scripts/export-hosted-database-packet.ts');
const operatorSetupPacketExporter = readIfExists('scripts/export-operator-setup-packet.ts');
const previewPromotionPacketExporter = readIfExists('scripts/export-preview-promotion-packet.ts');
const localVerificationPacketExporter = readIfExists('scripts/export-local-verification-packet.cjs');
const kimiVisualPacketExporter = readIfExists('scripts/export-kimi-visual-readiness-packet.cjs');
const previewGate = readIfExists('scripts/preview-promotion-gate.cjs');
const previewReceiptValidator = readIfExists('scripts/validate-preview-promotion-receipt.cjs');
const launchHandoffExporter = readIfExists('scripts/export-launch-handoff.ts');
const externalActivationWorkbookExporter = readIfExists('scripts/export-external-activation-workbook.ts');
const clientPreviewChecklistExporter = readIfExists('scripts/export-client-preview-checklist.ts');
const externalActivationWorkbookBuilder = readIfExists('src/lib/external-activation-workbook.ts');
const externalActivationWorkbookRoute = readIfExists('src/app/api/audit/external-activation-workbook/route.ts');
const clientPreviewChecklistBuilder = readIfExists('src/lib/client-preview-checklist.ts');
const clientPreviewChecklistRoute = readIfExists('src/app/api/audit/client-preview-checklist/route.ts');
const ownerHandoffBriefsBuilder = readIfExists('src/lib/owner-handoff-briefs.ts');
const netlifyLaunchDoctorExport = readIfExists('src/lib/netlify-launch-doctor-receipt.ts');
const netlifyLaunchDoctorRoute = readIfExists('src/app/api/audit/netlify-launch-doctor/route.ts');
const launchHandoffBuilder = readIfExists('src/lib/launch-handoff.ts');
const launchHandoffReportBuilder = readIfExists('src/lib/launch-handoff-report.ts');
const launchHandoffRoute = readIfExists('src/app/api/audit/launch-handoff/route.ts');
const legalReviewPacketExporter = readIfExists('scripts/export-legal-review-packet.ts');
const launchSecretPreparer = readIfExists('scripts/prepare-launch-secrets.cjs');
const launchSecretRunner = readIfExists('scripts/run-with-launch-secrets.cjs');
const launchSecretPusher = readIfExists('scripts/push-launch-secrets.cjs');
const netlifyProjectSetupRecorder = readIfExists('scripts/record-netlify-project-setup.ts');
const hostedLocalSmoke = readIfExists('scripts/smoke-hosted-local.cjs');
const hostedDatabasePreparer = readIfExists('scripts/prepare-hosted-database.cjs');
const hostedEnvPreparer = readIfExists('scripts/prepare-hosted-env.cjs');
const hostedEnvRunner = readIfExists('scripts/run-with-hosted-env.cjs');
const hostedEnvPusher = readIfExists('scripts/push-hosted-env.cjs');
const hostedDatabasePusher = readIfExists('scripts/push-hosted-database.cjs');
const hostedDatabaseDoctor = readIfExists('scripts/validate-hosted-database-env.cjs');
const clientSafeLaunchCopy = readIfExists('src/lib/client-safe-launch-copy.ts');
const clientSafeLaunchCopyTest = readIfExists('tests/unit/client-safe-launch-copy.test.ts');
const middlewareSource = readIfExists('src/middleware.ts');
const nextConfig = readIfExists('next.config.mjs');
const smokeHostedAuth = readIfExists('scripts/smoke-hosted-auth.cjs');
const smokeFeatureFlags = readIfExists('scripts/smoke-feature-flags.cjs');
const smokeHostedLocal = readIfExists('scripts/smoke-hosted-local.cjs');
const claimAuditExport = readIfExists('src/lib/audit/claim-export.ts');

if (/radial-gradient\s*\(/i.test(css)) {
  failures.push('globals.css should not use decorative radial-gradient backgrounds.');
}

if (/font-size\s*:[^;]*\bvw\b/i.test(css) || /font-size\s*:\s*clamp\([^;]*\bvw\b[^;]*\)/i.test(css)) {
  failures.push('globals.css should not scale font-size with viewport width.');
}

if (/letter-spacing\s*:\s*-\d/i.test(css)) {
  failures.push('globals.css should not use negative letter spacing.');
}

if (!/\.btn\s*\{[\s\S]*?min-height\s*:\s*44px\s*;/m.test(css)) {
  failures.push('.btn must keep a 44px minimum touch target.');
}

const riskyCopyFiles = [
  'README.md',
  'LEGAL.md',
  'src/app/layout.tsx',
  'src/app/ClaimStatusLockup.tsx',
  'src/app/LaunchTrustBridge.tsx',
  'src/app/pricing/page.tsx',
  'src/app/goal/page.tsx',
  'src/app/eligibility/page.tsx',
  'src/app/page.tsx',
  'src/app/claims/page.tsx',
  'src/app/claims/[id]/LiveViewer.tsx',
  'src/app/packets/page.tsx',
  'src/app/review/page.tsx',
  'src/app/status/page.tsx',
  'src/app/settings/page.tsx',
  'src/app/settings/SettingsForm.tsx',
  'src/app/trust/page.tsx',
  'src/app/help/page.tsx',
  'src/app/contact/page.tsx',
  'src/app/SupportEscalationPanel.tsx',
  'src/app/settlements/page.tsx',
  'src/app/settlements/[id]/page.tsx',
  'src/app/profile/page.tsx',
  'src/app/purchases/page.tsx',
  'src/app/login/page.tsx',
  'src/app/CliCommandRows.tsx',
  'src/app/SecretSafeSnippet.tsx',
  'src/lib/claim-filer/authorization-preview.ts',
  'src/lib/claim-filer/settlement-self-assessment.ts',
  'src/lib/claim-filer/queue-readiness.ts',
  'public/manifest.webmanifest',
  'scripts/kimi-design-brief.mjs',
];

const riskyCopyPatterns = [
  { pattern: /free money/i, label: 'free money' },
  { pattern: /\byou qualify for\b/i, label: 'you qualify for' },
  { pattern: /\bmay qualify for\b/i, label: 'may qualify for' },
  { pattern: /automatic submission/i, label: 'automatic submission' },
  { pattern: /automatic preflight/i, label: 'automatic preflight' },
  { pattern: /\bautomatic filing\b/i, label: 'automatic filing' },
  { pattern: /\bauto-file\b/i, label: 'auto-file' },
  { pattern: /\bmay qualify\b/i, label: 'may qualify' },
  { pattern: /\beligible claims\b/i, label: 'eligible claims' },
  { pattern: /\beligible matches\b/i, label: 'eligible matches' },
  { pattern: /\beligible queue\b/i, label: 'eligible queue' },
  { pattern: /\beligible,\s*authorized\b/i, label: 'eligible, authorized' },
  { pattern: /\beligible authorized\b/i, label: 'eligible authorized' },
  { pattern: /guaranteed payout/i, label: 'guaranteed payout' },
  { pattern: /qualify for a class/i, label: 'qualify for a class' },
];

for (const file of riskyCopyFiles) {
  const content = readIfExists(file);
  for (const { pattern, label } of riskyCopyPatterns) {
    if (pattern.test(content)) {
      failures.push(`${file} should not use risky claim-marketing phrase: "${label}".`);
    }
  }
}

const clientSafePageFiles = [
  'src/app/page.tsx',
  'src/app/AppFooter.tsx',
  'src/app/AuthStatus.tsx',
  'src/app/EvidenceHandlingPanel.tsx',
  'src/app/FileAllButton.tsx',
  'src/app/InstallAppButton.tsx',
  'src/app/LegalBoundarySummary.tsx',
  'src/app/OperationalZeroState.tsx',
  'src/app/ProofGateBanner.tsx',
  'src/app/PwaConnectionStatus.tsx',
  'src/app/SupportEscalationPanel.tsx',
  'src/app/goal/page.tsx',
  'src/app/pricing/page.tsx',
  'src/app/pricing/PricingFaqBrowser.tsx',
  'src/app/pricing/PricingPlanCards.tsx',
  'src/app/login/page.tsx',
  'src/app/login/AuthAccessBrowser.tsx',
  'src/app/login/LoginPanel.tsx',
  'src/app/help/page.tsx',
  'src/app/help/HelpCommandBrowser.tsx',
  'src/app/contact/page.tsx',
  'src/app/contact/SupportCommandBrowser.tsx',
  'src/app/trust/page.tsx',
  'src/app/trust/TrustComplianceBrowser.tsx',
  'src/app/status/page.tsx',
  'src/app/status/StatusTimelineBrowser.tsx',
  'src/app/onboarding/page.tsx',
  'src/app/eligibility/page.tsx',
  'src/app/eligibility/EligibilityCandidateBrowser.tsx',
  'src/app/settlements/page.tsx',
  'src/app/settlements/SearchBar.tsx',
  'src/app/settlements/SettlementDiscoveryBrowser.tsx',
  'src/app/settlements/[id]/page.tsx',
  'src/app/settlements/[id]/SettlementDetailBrowser.tsx',
  'src/app/review/page.tsx',
  'src/app/review/ReviewMatchBrowser.tsx',
  'src/app/claims/page.tsx',
  'src/app/claims/ClaimsQueueBrowser.tsx',
  'src/app/claims/[id]/page.tsx',
  'src/app/claims/[id]/not-found.tsx',
  'src/app/claims/[id]/ClaimDetailPacketBrowser.tsx',
  'src/app/claims/[id]/LiveViewer.tsx',
  'src/app/profile/page.tsx',
  'src/app/setup/page.tsx',
  'src/app/setup/AuthGateBlock.tsx',
  'src/app/setup/SetupWizard.tsx',
  'src/app/permissions/page.tsx',
  'src/app/authorizations/AuthorizationCard.tsx',
  'src/app/authorizations/AuthorizationCommandBrowser.tsx',
  'src/app/purchases/page.tsx',
  'src/app/purchases/PurchaseEvidenceBrowser.tsx',
  'src/app/breaches/page.tsx',
  'src/app/breaches/BreachEvidenceBrowser.tsx',
  'src/app/privacy-policy/page.tsx',
  'src/app/terms/page.tsx',
];

const clientSafeLeakPatterns = [
  { pattern: /Export client preview checklist/i, label: 'client preview checklist export link' },
  { pattern: /Export launch handoff/i, label: 'launch handoff export link' },
  { pattern: /Export activation workbook/i, label: 'activation workbook export link' },
  { pattern: /Export support packet/i, label: 'support packet export link' },
  { pattern: /\/api\/audit\/(?:client-preview-checklist|launch-handoff|external-activation-workbook|netlify-launch-doctor|support-packet)/, label: 'raw audit export URL' },
  { pattern: /\/api\/claims\/.*audit-export/, label: 'raw claim audit export URL' },
  { pattern: /npm run [a-z0-9:-]+/i, label: 'raw npm command' },
  { pattern: /data\/[a-z0-9-]+\.(?:md|json)/i, label: 'raw proof artifact path' },
  { pattern: /\bsource setup needed\b/i, label: 'source-setup-needed wording' },
  { pattern: /\bsource setup required\b/i, label: 'source-setup-required wording' },
  { pattern: /\bsource setup issue\b/i, label: 'source-setup-issue wording' },
  { pattern: /\bsetup mode\b/i, label: 'setup-mode wording' },
  { pattern: /\blaunch setup issue\b/i, label: 'launch-setup wording' },
  { pattern: /\bcomplete launch source setup\b/i, label: 'launch-source-setup wording' },
  { pattern: /\breadiness files?\b/i, label: 'readiness-file wording' },
  { pattern: /\braw files?\b/i, label: 'raw-file wording' },
  { pattern: /\braw records?\b/i, label: 'raw-record wording' },
  { pattern: /\bexport files?\b/i, label: 'export-file wording' },
  { pattern: /\binternal records?\b/i, label: 'internal-record wording' },
  { pattern: /\binternal readiness details?\b/i, label: 'internal-readiness-detail wording' },
  { pattern: /\binternal details?\b/i, label: 'internal-detail wording' },
  { pattern: /\binternally clear\b/i, label: 'internally-clear wording' },
  { pattern: /\braw setup files?\b/i, label: 'raw setup-file wording' },
  { pattern: /\bsetup files?\b/i, label: 'setup-file wording' },
  { pattern: /\bsetup artifacts?\b/i, label: 'setup-artifact wording' },
  { pattern: /\bsetup evidence\b/i, label: 'setup-evidence wording' },
  { pattern: /\boperator proof\b/i, label: 'operator-proof wording' },
  { pattern: /\boperator-only commands?\b/i, label: 'operator-command wording' },
  { pattern: /\blaunch-console\b/i, label: 'launch-console wording' },
  { pattern: /\bproof artifact paths?\b/i, label: 'proof-artifact-path wording' },
  { pattern: /\bcommand surface\b/i, label: 'command-surface wording' },
  { pattern: /\benvironment variables?\b/i, label: 'environment-variable wording' },
  { pattern: /\bsupport packets?\b/i, label: 'support-packet wording' },
  { pattern: /\bclient handoff\b/i, label: 'client-handoff wording' },
  { pattern: /\binviting clients\b/i, label: 'inviting-clients wording' },
  { pattern: /\bbefore inviting clients\b/i, label: 'before-inviting-clients wording' },
  { pattern: /\binviting customers\b/i, label: 'inviting-customers wording' },
  { pattern: /\bbefore inviting customers\b/i, label: 'before-inviting-customers wording' },
  { pattern: /\bfirst client run\b/i, label: 'first-client-run wording' },
  { pattern: /\bclient deployment\b/i, label: 'client-deployment wording' },
  { pattern: /\bclient questions\b/i, label: 'client-questions wording' },
  { pattern: /\bclient-ready\b/i, label: 'client-ready wording' },
  { pattern: /\bclient workspace\b/i, label: 'client-workspace wording' },
  { pattern: /\bclient scope\b/i, label: 'client-scope wording' },
  { pattern: /\bclient portal\b/i, label: 'client-portal wording' },
  { pattern: /\bclients can\b/i, label: 'clients-can wording' },
  { pattern: /\bclients inspect\b/i, label: 'clients-inspect wording' },
  { pattern: /\bNetlify CLI\b/i, label: 'netlify-cli wording' },
  { pattern: /\bSMOKE_BASE_URL\b/, label: 'smoke-base-url wording' },
  { pattern: /proofArtifacts\.(?:slice|join|map)/, label: 'rendered proof artifact field' },
  { pattern: /\.(?:nextAction)\b/, label: 'raw launch next-action field' },
  { pattern: /owner\s*\?\?\s*['"`]owner needed['"`]/, label: 'raw owner fallback' },
  { pattern: /business-owned|deployment-owned|legal-owned|operator-owned|operator gate|business gate|deployment gate|legal gate|hosted data gate|business setup gate|automation processing gate|paid entitlement gate|hosted preview gate/i, label: 'raw owner/gate label' },
  { pattern: /\bplan gates?\b/i, label: 'internal plan gate wording' },
  { pattern: /\bproof gates?\b/i, label: 'internal proof gate wording' },
  { pattern: /\bpermission gates?\b/i, label: 'internal permission gate wording' },
  { pattern: /\bsafety gates?\b/i, label: 'internal safety gate wording' },
  { pattern: /\breadiness gates?\b/i, label: 'internal readiness gate wording' },
  { pattern: /\bblocked gates?\b/i, label: 'internal blocked gate wording' },
  { pattern: /\bgate filter\b/i, label: 'internal gate-filter wording' },
  { pattern: /\bevery gate\b/i, label: 'internal every-gate wording' },
  { pattern: /\bfiling gates\b/i, label: 'internal filing-gates wording' },
  { pattern: /\bautomation remains gated\b/i, label: 'internal automation-gated wording' },
  { pattern: /\bpaid billing gates\b/i, label: 'internal paid-billing-gates wording' },
  { pattern: /\brequired gates\b/i, label: 'internal required-gates wording' },
  { pattern: /\bpre-invite auth gate\b/i, label: 'internal auth-gate wording' },
  { pattern: /\bmanual approval gate\b/i, label: 'internal approval-gate wording' },
  { pattern: /\bgated automation\b/i, label: 'internal gated-automation wording' },
  { pattern: /\bbypass gates\b/i, label: 'internal bypass-gates wording' },
  { pattern: /\bgate used for review\b/i, label: 'internal gate-used wording' },
  { pattern: /\bgate between\b/i, label: 'internal gate-between wording' },
  { pattern: /\bpaid automation gate\b/i, label: 'internal paid-automation-gate wording' },
  { pattern: /\bgates? pass\b/i, label: 'internal gates-pass wording' },
  { pattern: /\bgates? clear\b/i, label: 'internal gates-clear wording' },
  { pattern: /\bgates? still apply\b/i, label: 'internal gates-still-apply wording' },
  { pattern: /\b(?:plan|permission|proof|review)-gated\b/i, label: 'internal gated wording' },
  { pattern: /\baudit gates?\b/i, label: 'internal audit-gate wording' },
  { pattern: /\bfiling-mode gates?\b/i, label: 'internal filing-mode-gate wording' },
  { pattern: /Hosted database, Identity, billing/i, label: 'raw hosted readiness component list' },
  { pattern: /\bIdentity and contact facts\b/i, label: 'identity-provider flavored profile wording' },
  { pattern: /\bIdentity and contact\b/i, label: 'identity-provider flavored contact wording' },
  { pattern: /\bidentity setup\b/i, label: 'identity-provider flavored setup wording' },
  { pattern: /\bOpen identity facts\b/i, label: 'identity-provider flavored profile action' },
  { pattern: /\bReview identity\b/i, label: 'identity-provider flavored profile review copy' },
  { pattern: /\bIdentity is not available\b/i, label: 'identity-provider flavored sign-in error' },
  { pattern: /\bIdentity is ready\b/i, label: 'identity-provider flavored sign-in status' },
  { pattern: /\bIdentity not ready\b/i, label: 'identity-provider flavored profile status' },
  { pattern: /\baudit capture\b/i, label: 'internal audit-capture wording' },
  { pattern: /\binternal launch readiness\b/i, label: 'internal launch-readiness wording' },
  { pattern: /\bfile-claim worker\b/i, label: 'internal worker job wording' },
  { pattern: /<(?:strong|small|span|p)[^>]*>\{blocker\.gate\}/, label: 'raw blocker gate field' },
  { pattern: /<CliCommandRows\b/, label: 'copy-ready command rows' },
  { pattern: /nextStep\.commands\?\.\[0\]|step\.commands\[0\]|commands\[0\]|blockedPackets\[0\]\?\.command|blocker\.command/, label: 'rendered command field' },
  { pattern: /Next setup item:\s*\{(?:nextStep|clientPreviewGate\.nextStep)\.label/i, label: 'raw next setup label' },
  { pattern: /\bnextExternalProof\.label\b|\bclientPreviewNextStep\?\.label\b|\bclientPreviewGate\.nextStep\?\.label\b/, label: 'raw next setup label field' },
  { pattern: /key=\{blocker\.path\}/, label: 'raw proof path React key' },
];

for (const file of clientSafePageFiles) {
  const content = readIfExists(file);
  for (const { pattern, label } of clientSafeLeakPatterns) {
    if (pattern.test(content)) {
      failures.push(`${file} must route clients to Launch/Packet Center/Contact instead of exposing ${label}.`);
    }
  }
}

if (!clientSafeLaunchCopy.includes("replace(/\\bhosted setup value\\b/gi, 'database connection')") || !clientSafeLaunchCopy.includes("replace(/\\bhosted setup\\b/gi, 'account readiness')") || !clientSafeLaunchCopy.includes("replace(/\\bsetup readiness\\b/gi, 'account readiness')") || !clientSafeLaunchCopy.includes("replace(/\\bsetup status\\b/gi, 'readiness status')") || !clientSafeLaunchCopy.includes("replace(/\\bidentity setup\\b/gi, 'hosted sign-in setup')") || !clientSafeLaunchCopy.includes("replace(/\\bidentity facts?\\b/gi, 'name and contact')") || !clientSafeLaunchCopy.includes("replace(/\\bidentity is not available\\b/gi, 'account sign-in is not available')") || !clientSafeLaunchCopy.includes("replace(/\\bNetlify preview URL\\b/gi, 'hosted preview')") || !clientSafeLaunchCopy.includes("replace(/\\bNetlify\\b/gi, 'hosted site')") || !clientSafeLaunchCopy.includes("replace(/\\bauth tokens?\\b/gi, 'database access')") || !clientSafeLaunchCopy.includes("replace(/\\bsecrets?\\b/gi, 'private setup values')") || !clientSafeLaunchCopy.includes('clientSafeLaunchLabel') || !clientSafeLaunchCopy.includes('clientSafeRequiredInputLabel') || !clientSafeLaunchCopy.includes("return 'Hosted readiness'") || !clientSafeLaunchCopy.includes("return 'Account readiness'") || !clientSafeLaunchCopy.includes('refresh readiness status') || !clientSafeLaunchCopy.includes('readiness status and Packet Center')) {
  failures.push('src/lib/client-safe-launch-copy.ts must keep customer-safe account readiness wording for hosted setup/setup status/operator runbook text.');
}
if (!clientSafeLaunchCopyTest.includes('hosted-setup terms away from customer surfaces') || !clientSafeLaunchCopyTest.includes('provider-specific identity wording away from customer surfaces') || !clientSafeLaunchCopyTest.includes('hosting-provider and private setup wording away from customer surfaces') || !clientSafeLaunchCopyTest.includes('launch proof labels into customer-safe readiness labels') || !clientSafeLaunchCopyTest.includes('Confirmed dedicated ClaimBot Netlify site') || !clientSafeLaunchCopyTest.includes('database connection') || !clientSafeLaunchCopyTest.includes('readiness status') || !clientSafeLaunchCopyTest.includes('hosted sign-in setup') || !clientSafeLaunchCopyTest.includes('account sign-in is not available') || !clientSafeLaunchCopyTest.includes('hosted preview') || !clientSafeLaunchCopyTest.includes('private billing setup') || !clientSafeLaunchCopyTest.includes('Hosted readiness') || !clientSafeLaunchCopyTest.includes('Account setup')) {
  failures.push('tests/unit/client-safe-launch-copy.test.ts must lock customer-safe readiness wording for launch-copy sanitization helpers.');
}
if (middlewareSource.includes('hosted setup can create intake records') || !middlewareSource.includes('Session signing must be configured before hosted account intake can create records.')) {
  failures.push('src/middleware.ts must use customer-safe account intake wording when session signing is missing.');
}
if (!middlewareSource.includes("process.env.NODE_ENV === 'development'") || !middlewareSource.includes("process.env.NETLIFY !== 'true'") || !middlewareSource.includes("process.env.CLAIMBOT_ENFORCE_CSP === 'true'")) {
  failures.push('src/middleware.ts must keep production/Netlify CSP enforcement while avoiding dev-server CSP failures on localhost.');
}
if (clientPreviewChecklistBuilder.includes('setup-readiness-required') || !clientPreviewChecklistBuilder.includes('account-readiness-required') || !clientPreviewChecklistBuilder.includes("'hosted setup'") || !clientPreviewChecklistBuilder.includes("'source setup needed'") || !clientPreviewChecklistBuilder.includes("'source setup required'") || !clientPreviewChecklistBuilder.includes("'source setup issue'") || !clientPreviewChecklistBuilder.includes("'setup mode'") || !clientPreviewChecklistBuilder.includes("'launch setup issue'") || !clientPreviewChecklistBuilder.includes("'complete launch source setup'") || !clientPreviewChecklistBuilder.includes("'setup readiness'") || !clientPreviewChecklistBuilder.includes("'setup status'") || !clientPreviewChecklistBuilder.includes("'client invites'") || !clientPreviewChecklistBuilder.includes("'identity setup'") || !clientPreviewChecklistBuilder.includes("'identity facts'") || !clientPreviewChecklistBuilder.includes("'identity and contact'") || !clientPreviewChecklistBuilder.includes("'identity is not available'") || !clientPreviewChecklistBuilder.includes("'plan gate'") || !clientPreviewChecklistBuilder.includes("'permission gate'") || !clientPreviewChecklistBuilder.includes("'safety gates'") || !clientPreviewChecklistBuilder.includes("'gate filter'") || !clientPreviewChecklistBuilder.includes("'every gate'") || !clientPreviewChecklistBuilder.includes("'filing gates'") || !clientPreviewChecklistBuilder.includes("'automation remains gated'") || !clientPreviewChecklistBuilder.includes("'paid billing gates'") || !clientPreviewChecklistBuilder.includes("'manual approval gate'") || !clientPreviewChecklistBuilder.includes("'gated automation'") || !clientPreviewChecklistBuilder.includes("'bypass gates'") || !clientPreviewChecklistBuilder.includes("'paid automation gate'") || !clientPreviewChecklistBuilder.includes("'gates pass'") || !clientPreviewChecklistBuilder.includes("'gates clear'") || !clientPreviewChecklistBuilder.includes("'plan-gated'") || !clientPreviewChecklistBuilder.includes("'claim gates'")) {
  failures.push('src/lib/client-preview-checklist.ts must keep account-readiness evidence labels and require the rendered customer-copy guard to block confusing setup/invite/gate wording.');
}
if (!clientPreviewChecklistBuilder.includes("'src/app/onboarding/page.tsx'")) {
  failures.push('src/lib/client-preview-checklist.ts must include onboarding in the customer-safe surface scan.');
}
if (!clientPreviewChecklistBuilder.includes('source-setup-needed wording') || !clientPreviewChecklistBuilder.includes('source-setup-issue wording') || !clientPreviewChecklistBuilder.includes('launch-source-setup wording') || !clientPreviewChecklistBuilder.includes('raw setup-file wording') || !clientPreviewChecklistBuilder.includes('setup-artifact wording') || !clientPreviewChecklistBuilder.includes('setup-evidence wording') || !clientPreviewChecklistBuilder.includes('operator-proof wording') || !clientPreviewChecklistBuilder.includes('operator-command wording') || !clientPreviewChecklistBuilder.includes('launch-console wording') || !clientPreviewChecklistBuilder.includes('proof-artifact-path wording') || !clientPreviewChecklistBuilder.includes('command-surface wording') || !clientPreviewChecklistBuilder.includes('environment-variable wording') || !clientPreviewChecklistBuilder.includes('support-packet wording') || !clientPreviewChecklistBuilder.includes('client-handoff wording') || !clientPreviewChecklistBuilder.includes('inviting-customers wording') || !clientPreviewChecklistBuilder.includes('first-client-run wording') || !clientPreviewChecklistBuilder.includes('client-deployment wording') || !clientPreviewChecklistBuilder.includes('client-questions wording') || !clientPreviewChecklistBuilder.includes('client-ready wording') || !clientPreviewChecklistBuilder.includes('client-workspace wording') || !clientPreviewChecklistBuilder.includes('client-scope wording') || !clientPreviewChecklistBuilder.includes('client-portal wording') || !clientPreviewChecklistBuilder.includes('netlify-cli wording') || !clientPreviewChecklistBuilder.includes('smoke-base-url wording')) {
  failures.push('src/lib/client-preview-checklist.ts must scan customer-safe source files for the same setup artifact, operator proof, launch-console, proof-path, command-surface, support-packet, client/customer-copy, and env wording blocked by validate:ui.');
}
if (!localVerificationPacketExporter.includes("'source setup issue'") || !localVerificationPacketExporter.includes("'complete launch source setup'") || !localVerificationPacketExporter.includes("'setup artifact'") || !localVerificationPacketExporter.includes("'setup evidence'") || !localVerificationPacketExporter.includes("'operator proof'") || !localVerificationPacketExporter.includes("'operator-proof-note'") || !localVerificationPacketExporter.includes("'contact-operator-drawer'") || !localVerificationPacketExporter.includes("'profile-advanced-drawer'") || !localVerificationPacketExporter.includes("'operator-only commands'") || !localVerificationPacketExporter.includes("'launch-console'") || !localVerificationPacketExporter.includes("'proof artifact paths'")) {
  failures.push('scripts/export-local-verification-packet.cjs must describe the stricter rendered customer-copy guard evidence used by smoke:web.');
}

const routeExportHygiene = findNextRouteExportHygieneLeaks(process.cwd());
for (const leak of routeExportHygiene.leaks) {
  failures.push(leak.message);
}

const launchPage = readIfExists('src/app/launch/page.tsx');
const launchCommandBar = readIfExists('src/app/LaunchReadinessCommandBar.tsx');
const launchGoalPage = readIfExists('src/app/goal/page.tsx');
if (!launchGoalPage.includes('buildLaunchActionPlan') || !launchGoalPage.includes('Account readiness details') || !launchGoalPage.includes('What still needs setup') || !launchGoalPage.includes('blockedLaunchActionPlanRows') || !launchGoalPage.includes('clientSafeLaunchAction') || !launchGoalPage.includes('clientSafeRequiredInputSummary') || !launchGoalPage.includes('clientSafeProofArtifactSummary') || !launchGoalPage.includes('Setup handoff') || !launchGoalPage.includes('Customer access readiness')) {
  failures.push('src/app/goal/page.tsx must render a Kimi-style launch readiness resolver with ordered blockers while routing setup details to Launch and Packet Center.');
}
if (!launchPage.includes('<CliCommandRows commands={verificationCommands} compact />')) {
  failures.push('src/app/launch/page.tsx must render copy-ready verification command rows.');
}
if (!launchPage.includes('<SecretSafeSnippet label="Required production env template" value={envSnippet} />')) {
  failures.push('src/app/launch/page.tsx must render the copy-ready SecretSafeSnippet env template.');
}
for (const requiredLaunchEnv of ['CLAIMBOT_WORKER_RUNTIME', 'CLAIMBOT_WORKER_RUNTIME_RECEIPT', 'CLAIMBOT_BILLING_PLUS_MONTHLY_URL', 'CLAIMBOT_BILLING_PRO_MONTHLY_URL', 'CLAIMBOT_BILLING_SYNC_SECRET', 'CLAIMBOT_LEGAL_REVIEW_ACK']) {
  if (!launchPage.includes(requiredLaunchEnv)) {
    failures.push(`src/app/launch/page.tsx must include ${requiredLaunchEnv} in the secret-safe production env handoff.`);
  }
}
if (!launchPage.includes('Paid automation worker runtime') || !launchPage.includes('Paid automation worker receipt') || !launchPage.includes('file_claim jobs are processed automatically')) {
  failures.push('src/app/launch/page.tsx must include paid automation worker runtime proof in the operator env handoff.');
}
if (!launchPage.includes('netlifySiteLinkCommands') || !launchPage.includes('Confirm the ClaimBot Netlify site')) {
  failures.push('src/app/launch/page.tsx must render explicit ClaimBot Netlify site-link safeguards before env setup.');
}
if (!launchPage.includes('hostedDatabaseSetupCommands') || !launchPage.includes('Prepare the hosted database') || !launchPage.includes('<CliCommandRows commands={hostedDatabaseSetupCommands} compact />')) {
  failures.push('src/app/launch/page.tsx must render copy-ready hosted database bootstrap commands before production env setup.');
}
if (!launchPage.includes('netlifyPreviewReadiness') || !launchPage.includes('Netlify preview target')) {
  failures.push('src/app/launch/page.tsx must render deployed-preview Netlify promotion readiness evidence.');
}
if (!launchPage.includes('getLaunchExternalBlockerSummary') || !launchPage.includes('External blocker ownership') || !launchPage.includes('What still needs a real account, business, legal, or deploy action') || !launchPage.includes('Proof needed') || !launchPage.includes('group.nextAction')) {
  failures.push('src/app/launch/page.tsx must render external blocker ownership grouping with proof needed and next actions for operator handoff.');
}
if (!launchPage.includes('getLaunchCriticalPath') || !launchPage.includes('Next launch actions') || !launchPage.includes('Critical path to client preview') || !launchPage.includes('shortest ordered path') || !launchPage.includes('launchCriticalPath.map')) {
  failures.push('src/app/launch/page.tsx must render an ordered critical path that turns current launch blockers into next actions.');
}
if (!launchPage.includes('operatorUnblockRows') || !launchPage.includes('Operator unblock console') || !launchPage.includes('Finish these workstreams before inviting clients') || !launchPage.includes('launchActionCommandByKey') || !launchPage.includes('Still locked until evidence exists')) {
  failures.push('src/app/launch/page.tsx must render a Kimi-style operator unblock console that turns launch blockers into proof-oriented workstreams.');
}
if (!launchPage.includes('nextActivationStep') || !launchPage.includes('Next evidence activation') || !launchPage.includes('Proof bundle') || !launchPage.includes('Starter commands') || !launchPage.includes('Execution boundary') || !launchPage.includes('Required inputs') || !launchPage.includes('nextActivationStep.requiredInputs') || !launchPage.includes('data/external-activation-workbook.md') || !launchPage.includes('/api/audit/external-activation-workbook') || !launchPage.includes('/api/audit/launch-handoff') || !launchPage.includes('nextActivationStep.commands.slice(0, 6)')) {
  failures.push('src/app/launch/page.tsx must render the next activation step with required inputs, proof artifacts, execution boundary, and starter commands from the generated launch action plan.');
}
if (!launchPage.includes('operatorSetupActionRows') || !launchPage.includes('Operator account setup actions') || !launchPage.includes('confirm the Netlify site') || !launchPage.includes('prove the paid worker runtime') || !launchPage.includes('data/operator-setup-packet.md') || !launchPage.includes('operatorSetupBlockedActionCount')) {
  failures.push('src/app/launch/page.tsx must render a compact operator account setup action map for Netlify Identity, contact env, auth/security env, and paid worker runtime proof.');
}
if (!launchPage.includes('buildLaunchCommandQueue') || !launchPage.includes('operatorCommandQueue') || !launchPage.includes('Operator command queue') || !launchPage.includes('Run local evidence first, then external account commands') || !launchPage.includes('Safe local evidence commands') || !launchPage.includes('Requires external input first') || !launchPage.includes('operatorCommandQueue.localNow') || !launchPage.includes('operatorCommandQueue.externalRequired')) {
  failures.push('src/app/launch/page.tsx must render an operator command queue separating safe local evidence commands from external-account commands.');
}
if (!launchPage.includes('buildOwnerHandoffBriefs') || !launchPage.includes('ownerHandoffBriefs') || !launchPage.includes('Owner handoff queue') || !launchPage.includes('Who needs to act next') || !launchPage.includes('brief.firstAction') || !launchPage.includes('brief.requiredInputs') || !launchPage.includes('brief.safeLocalCommands') || !launchPage.includes('brief.externalInputCommands')) {
  failures.push('src/app/launch/page.tsx must render an owner handoff queue from the shared owner handoff helper so external setup owners can act in parallel.');
}
if (!launchPage.includes('readLocalVerificationPacket') || !launchPage.includes('Local verification receipt') || !launchPage.includes('Local checks passed') || !launchPage.includes('localVerificationPacket.path') || !launchPage.includes('localVerificationPacket.staleSourceFiles') || !launchPage.includes('Stale source files') || !launchPage.includes('Netlify authentication, hosted database credentials, billing links, legal review, and deployed preview proof are still separate launch gates') || !launchPage.includes("['npm run local:verify', 'npm run launch:handoff', 'npm run client:checklist']")) {
  failures.push('src/app/launch/page.tsx must surface the local verification packet separately from hosted Netlify/account launch gates.');
}
if (!launchPage.includes('netlifyLaunchDoctorPacket') || !launchPage.includes('Netlify launch doctor receipt') || !launchPage.includes('data/netlify-launch-doctor.md') || !launchPage.includes('/api/audit/netlify-launch-doctor') || !launchPage.includes('npm run netlify:doctor:strict')) {
  failures.push('src/app/launch/page.tsx must surface the Netlify launch doctor receipt as its own operator-visible launch proof card.');
}
if (!launchPage.includes('buildClientPreviewChecklist') || !launchPage.includes('Client preview completion audit') || !launchPage.includes('/api/audit/client-preview-checklist') || !launchPage.includes('/api/audit/launch-handoff') || !launchPage.includes('Kimi shell') || !launchPage.includes('backend data') || !launchPage.includes('pricing') || !launchPage.includes('deployment proof') || !launchPage.includes('clientPreviewChecklist.summary.nextStep.executionBoundary') || !launchPage.includes('clientPreviewChecklist.summary.nextStep.requiredInputs') || !launchPage.includes('clientPreviewChecklist.summary.nextStep.proofArtifacts')) {
  failures.push('src/app/launch/page.tsx must render the client preview completion audit, export link, and next external proof execution boundary across the real product requirements.');
}
if (!launchPage.includes('launchProofRows') || !launchPage.includes('launchProofSurfaceByKey') || !launchPage.includes('Missing launch proof matrix') || !launchPage.includes('Every blocked workstream needs a receipt') || !launchPage.includes('Non-secret commands') || !launchPage.includes('item.requiredInputs.join') || !launchPage.includes('item.proofArtifacts.slice') || !launchPage.includes('item.commands.slice(0, 3)')) {
  failures.push('src/app/launch/page.tsx must render a missing launch proof matrix that maps each launch workstream to owner, required inputs, proof artifacts, proof surface, and non-secret next commands.');
}
if (!launchPage.includes('getLaunchPacketArtifactRows') || !launchPage.includes('launchPacketRows') || !launchPage.includes('artifact.command') || !launchPage.includes('launchPacketCommands') || !launchPage.includes('Launch packet stack') || !launchPage.includes('Missing steps become non-secret packets before client preview') || !launchPage.includes('<CliCommandRows commands={launchPacketCommands} compact />')) {
  failures.push('src/app/launch/page.tsx must render the non-secret launch packet stack with real artifact status and copy-ready packet commands.');
}
if (!launchPage.includes('buildFullAutomationLaunchBlockers') || !launchPage.includes('Paid full automation blockers') || !launchPage.includes('Hands-off paid filing stays locked until these packets clear') || !launchPage.includes('Why paid automation is locked') || !launchPage.includes('Proof boundary:')) {
  failures.push('src/app/launch/page.tsx must translate blocked launch packets into paid full-automation blockers with owner, impact, proof boundary, and next packet command.');
}
const launchPacketsPage = readIfExists('src/app/packets/page.tsx');
if (!launchPacketsPage.includes('getLaunchPacketArtifactRows') || !launchPacketsPage.includes('launchPacketRows') || !launchPacketsPage.includes('Setup packet ledger') || !launchPacketsPage.includes('Client-preview blockers are tracked as setup records') || !launchPacketsPage.includes('artifact.path') || !launchPacketsPage.includes('artifact.command')) {
  failures.push('src/app/packets/page.tsx must expose the operator launch packet ledger with real artifact status alongside claim packet review.');
}
if (!launchPacketsPage.includes('buildClientPreviewChecklist') || !launchPacketsPage.includes('ownerHandoffBriefs') || !launchPacketsPage.includes('Packet Center owner handoff queue') || !launchPacketsPage.includes('Blocked packet work grouped by owner') || !launchPacketsPage.includes('brief.firstAction') || !launchPacketsPage.includes('brief.safeLocalCommands') || !launchPacketsPage.includes('brief.externalInputCommands')) {
  failures.push('src/app/packets/page.tsx must mirror owner handoff briefs from the client-preview checklist so Packet Center groups blocked setup packet work by owner.');
}
if (!launchPage.includes('previewPromotionReceiptReadiness') || !launchPage.includes('Production promotion receipt') || !launchPage.includes('npm run production:check-receipt')) {
  failures.push('src/app/launch/page.tsx must render the production promotion receipt gate before production deploy.');
}
if (!launchPage.includes('User Terms acknowledgement gate') || !launchPage.includes('USER_TERMS_ACKNOWLEDGED') || !launchPage.includes('TERMS_BOUNDARY_ACK')) {
  failures.push('src/app/launch/page.tsx must surface the in-product user Terms acknowledgement gate as launch evidence.');
}
if (!launchPage.includes('getBillingCheckoutBlockReason') || !launchPage.includes('paidCheckoutReady') || !launchPage.includes('Paid checkout is locked before payment') || !launchPage.includes('legal-review-not-recorded')) {
  failures.push('src/app/launch/page.tsx must separate processor billing readiness from paid checkout readiness before client launch.');
}
if (!launchPage.includes('pwaReadiness') || !launchPage.includes('PWA install shell') || !launchPage.includes('service-worker cache boundary')) {
  failures.push('src/app/launch/page.tsx must render PWA install/offline readiness as client-preview launch evidence.');
}
if (!launchPage.includes('readLatestMatcherRunReceipt') || !launchPage.includes('getMatcherReceiptCriticalPathBlockers') || !launchPage.includes('clientPreviewChecklist.summary.clientPreviewReady') || !launchPage.includes('Matcher proof before client preview') || !launchPage.includes('MATCHER_RUN_COMPLETED') || !launchPage.includes('Open Review matcher')) {
  failures.push('src/app/launch/page.tsx must render matcher-run receipt readiness before client preview.');
}
if (!launchPage.includes('identitySetupSteps') || !launchPage.includes('Enable Netlify Identity')) {
  failures.push('src/app/launch/page.tsx must render explicit Netlify Identity setup guidance before client invites.');
}
if (!launchPage.includes('netlifyProjectSetupReceiptCommands') || !readIfExists('src/lib/hosted-remediation.ts').includes('npm run netlify:record-setup')) {
  failures.push('src/app/launch/page.tsx must render copy-ready Netlify project setup receipt commands after Identity setup guidance.');
}
if (!launchPage.includes('netlifyProjectSetupReceiptReadiness') || !launchPage.includes('Netlify project setup receipt') || !launchPage.includes('Identity proof needed')) {
  failures.push('src/app/launch/page.tsx must render current Netlify project and Identity receipt readiness, not only setup instructions.');
}
if (!launchPage.includes('supportContactReady') || launchPage.includes('supportEmail ?')) {
  failures.push('src/app/launch/page.tsx must derive support readiness from hosted blockers so placeholder support emails cannot appear launch-ready.');
}
if (!launchPage.includes('validated or missing gates') || !launchPage.includes('non-placeholder values')) {
  failures.push('src/app/launch/page.tsx must label masked env readiness as validated non-placeholder gates, not mere presence.');
}
if (!readIfExists('src/app/contact/page.tsx').includes('hasTemplatePlaceholder(email)') || !readIfExists('src/app/help/page.tsx').includes('hasTemplatePlaceholder(email)')) {
  failures.push('Contact and Help support surfaces must reject placeholder CLAIMBOT_SUPPORT_EMAIL values before showing support as configured.');
}
if (!readIfExists('src/app/contact/page.tsx').includes('scraperContactReady') || !readIfExists('src/app/contact/page.tsx').includes('hasTemplatePlaceholder(userAgent)') || !readIfExists('src/app/contact/page.tsx').includes('Scraper operator contact ready')) {
  failures.push('src/app/contact/page.tsx must derive scraper contact readiness from non-placeholder SCRAPER_USER_AGENT instead of always showing a warning.');
}
if (!readIfExists('src/app/contact/page.tsx').includes('Operator contact activation') || !readIfExists('src/app/contact/page.tsx').includes('operatorContactRequiredInputs') || !readIfExists('src/app/contact/page.tsx').includes('Operator-only setup details stay in Launch and Packet Center') || !readIfExists('src/app/contact/page.tsx').includes('/packets') || readIfExists('src/app/contact/page.tsx').includes('operatorContactCommands') || readIfExists('src/app/contact/page.tsx').includes('<CliCommandRows')) {
  failures.push('src/app/contact/page.tsx must expose the support/scraper operator activation handoff with required inputs while routing setup details to Launch/Packet Center.');
}
if (!launchCommandBar.includes('NETLIFY_SITE_DASHBOARD_URL') || !launchCommandBar.includes('NETLIFY_SITE_SLUG') || launchCommandBar.includes('NETLIFY_SITE_ID?.trim()')) {
  failures.push('src/app/LaunchReadinessCommandBar.tsx must use an explicit Netlify dashboard URL or site slug, not NETLIFY_SITE_ID as a dashboard route.');
}

const netlifyPreflight = readIfExists('scripts/validate-netlify-preflight.cjs');
if (!netlifyPreflight.includes('.netlify') || !netlifyPreflight.includes('NETLIFY_SITE_ID') || !netlifyPreflight.includes('SMOKE_BASE_URL')) {
  failures.push('scripts/validate-netlify-preflight.cjs must prove Netlify link state and deployed preview URL before preview promotion.');
}
if (!netlifyPreflight.includes('JSON.parse') || !netlifyPreflight.includes('linkedStateSiteId') || !netlifyPreflight.includes('Rerun netlify link')) {
  failures.push('scripts/validate-netlify-preflight.cjs must parse Netlify link state and require a usable linked siteId before strict preview promotion.');
}
if (!netlifyPreflight.includes('hasTemplatePlaceholder') || !netlifyPreflight.includes('your-')) {
  failures.push('scripts/validate-netlify-preflight.cjs must reject copied placeholder site IDs, smoke URLs, and smoke secrets before preview promotion.');
}
if (!netlifyPreflight.includes('loadIgnoredOperatorEnv') || !netlifyPreflight.includes('.env.hosted.local') || !netlifyPreflight.includes('.env.launch.local') || !netlifyPreflight.includes('no values printed')) {
  failures.push('scripts/validate-netlify-preflight.cjs must load ignored hosted/launch env files for strict Netlify preflight without printing values.');
}
if (!packageJson.includes('"validate:netlify"') || !packageJson.includes('"validate:netlify:strict"') || !packageJson.includes('validate-netlify-preflight.cjs --strict')) {
  failures.push('package.json must expose advisory and strict Netlify preflight scripts for hosted preview promotion.');
}
if (!packageJson.includes('"netlify:doctor"') || !packageJson.includes('"netlify:doctor:strict"') || !readIfExists('scripts/netlify-launch-doctor.cjs').includes('ClaimBot Netlify launch doctor')) {
  failures.push('package.json must expose the redacted Netlify launch doctor and keep scripts/netlify-launch-doctor.cjs available for operator handoff.');
}
if (!nextConfig.includes('process.env.NEXT_DIST_DIR') || !readIfExists('.gitignore').includes('/.next-smoke*/')) {
  failures.push('next.config.mjs and .gitignore must support isolated .next-smoke* dist directories for local smoke dev servers.');
}
if (!smokeHostedAuth.includes("NEXT_DIST_DIR: '.next-smoke-auth-main'") || !smokeHostedAuth.includes("NEXT_DIST_DIR: '.next-smoke-auth-gate'") || !smokeFeatureFlags.includes("NEXT_DIST_DIR: '.next-smoke-features'") || !smokeHostedLocal.includes("NEXT_DIST_DIR: '.next-smoke-hosted-web'")) {
  failures.push('local smoke scripts must run Next dev servers with isolated NEXT_DIST_DIR values so they do not overwrite the production .next build.');
}
if (!smokeHostedAuth.includes('cleanupSmokeDistDirs') || !smokeHostedAuth.includes("'.next-smoke-auth-main'") || !smokeFeatureFlags.includes('cleanupSmokeDistDirs') || !smokeHostedLocal.includes('cleanupSmokeDistDirs')) {
  failures.push('local smoke scripts must clean up isolated .next-smoke* dist directories after local dev-server smokes finish.');
}
if (!packageJson.includes('"netlify:record-setup"') || !packageJson.includes('scripts/record-netlify-project-setup.ts')) {
  failures.push('package.json must expose netlify:record-setup for the non-secret Netlify project and Identity setup receipt.');
}
if (!netlifyProjectSetupRecorder.includes('NETLIFY_PROJECT_SETUP_RECEIPT_FORMAT') || !netlifyProjectSetupRecorder.includes('--identity-enabled') || !netlifyProjectSetupRecorder.includes('--registration') || !netlifyProjectSetupRecorder.includes('--email-confirmation') || !netlifyProjectSetupRecorder.includes('validateIdentityProofArgs') || !netlifyProjectSetupRecorder.includes('No secret values were printed')) {
  failures.push('scripts/record-netlify-project-setup.ts must write a non-secret Netlify setup receipt with explicit Identity confirmation flags.');
}
const netlifyLaunchDoctor = readIfExists('scripts/netlify-launch-doctor.cjs');
if (!netlifyLaunchDoctor.includes('Identity setup receipt') || !netlifyLaunchDoctor.includes('npm run netlify:record-setup -- --identity-enabled --registration invite-only --email-confirmation --safe-env-confirmed')) {
  failures.push('scripts/netlify-launch-doctor.cjs must print the safe Identity receipt command when dashboard proof is missing.');
}
if (!netlifyLaunchDoctor.includes('netlifyCliStatus') || !netlifyLaunchDoctor.includes('npm install -g netlify-cli') || !netlifyLaunchDoctor.includes('Netlify CLI is not available') || !netlifyLaunchDoctor.includes('Netlify authentication') || !netlifyLaunchDoctor.includes('netlify login before env push, deploy, or production promotion')) {
  failures.push('scripts/netlify-launch-doctor.cjs must report missing Netlify CLI and unauthenticated Netlify CLI state before login/link/deploy commands.');
}
if (!netlifyLaunchDoctor.includes('claimbot.netlify-launch-doctor.v1') || !netlifyLaunchDoctor.includes('netlify-launch-doctor.json') || !netlifyLaunchDoctor.includes('netlify-launch-doctor.md') || !netlifyLaunchDoctor.includes('Wrote non-secret receipt') || !netlifyLaunchDoctor.includes('No secret values were printed.')) {
  failures.push('scripts/netlify-launch-doctor.cjs must write a versioned non-secret Netlify launch doctor receipt.');
}
if (!netlifyLaunchDoctor.includes('hostedDatabaseStatus') || !netlifyLaunchDoctor.includes('hostedEnvironmentStatus') || !netlifyLaunchDoctor.includes('Hosted database values') || !netlifyLaunchDoctor.includes('Hosted environment values') || !netlifyLaunchDoctor.includes('no secrets printed') || !netlifyLaunchDoctor.includes('npm run hosted:env:doctor') || !netlifyLaunchDoctor.includes('npm run hosted:env:prepare') || !netlifyLaunchDoctor.includes('npm run hosted:db:doctor')) {
  failures.push('scripts/netlify-launch-doctor.cjs must surface hosted env/database readiness and remediation commands without printing secrets.');
}
if (!netlifyLaunchDoctor.includes('loadIgnoredOperatorEnv') || !netlifyLaunchDoctor.includes('.env.hosted.local') || !netlifyLaunchDoctor.includes('.env.launch.local') || !netlifyLaunchDoctor.includes('no values printed')) {
  failures.push('scripts/netlify-launch-doctor.cjs must load ignored hosted/launch env files before reporting Netlify launch readiness without printing values.');
}
if (!previewGate.includes('validate:netlify:strict') || !previewGate.includes('validate:routes')) {
  failures.push('scripts/preview-promotion-gate.cjs must run validate:netlify:strict and validate:routes for deployed preview promotion.');
}
if (!previewGate.includes('hasTemplatePlaceholder') || !previewGate.includes('netlify:doctor:strict') || !previewGate.includes('SMOKE_BASE_URL must be a deployed HTTPS preview URL')) {
  failures.push('scripts/preview-promotion-gate.cjs must reject hosted setup placeholders and run the Netlify doctor before deployed preview promotion.');
}
if (!previewGate.includes('loadIgnoredOperatorEnv') || !previewGate.includes('.env.hosted.local') || !previewGate.includes('.env.launch.local') || !previewGate.includes('no values printed')) {
  failures.push('scripts/preview-promotion-gate.cjs must load ignored hosted/launch env files for preview gates without printing values.');
}
if (!previewGate.includes('localNetlifyState') || !previewGate.includes('A confirmed ClaimBot Netlify site target is required')) {
  failures.push('scripts/preview-promotion-gate.cjs must require a confirmed Netlify site target before fast preview env checks can pass.');
}
if (!previewGate.includes('smokeUrlMatchesSiteSlug') || !previewGate.includes('SMOKE_BASE_URL must belong to the confirmed Netlify site slug')) {
  failures.push('scripts/preview-promotion-gate.cjs must verify SMOKE_BASE_URL belongs to the confirmed Netlify site slug.');
}
if (!packageJson.includes('"production:check-receipt"') || !previewGate.includes('claimbot.preview-promotion-receipt.v1') || !previewReceiptValidator.includes('claimbot.preview-promotion-receipt.v1')) {
  failures.push('package.json and preview promotion scripts must create and validate a deployed-preview promotion receipt before production deploy.');
}

const secretSafeSnippet = readIfExists('src/app/SecretSafeSnippet.tsx');
if (!secretSafeSnippet.includes('Copy template') || !secretSafeSnippet.includes('navigator.clipboard.writeText(value)')) {
  failures.push('src/app/SecretSafeSnippet.tsx must provide a copy-ready placeholder template.');
}
const secretHygiene = readIfExists('scripts/validate-secret-hygiene.cjs');
for (const requiredSecretKey of [
  'CLAIMBOT_BILLING_PLUS_MONTHLY_URL',
  'CLAIMBOT_BILLING_PRO_MONTHLY_URL',
  'CLAIMBOT_BILLING_SYNC_SECRET',
  'CLAIMBOT_STRIPE_WEBHOOK_SECRET',
  'CLAIMBOT_SESSION_SECRET',
  'DATABASE_AUTH_TOKEN',
]) {
  if (!secretHygiene.includes(`'${requiredSecretKey}'`)) {
    failures.push(`scripts/validate-secret-hygiene.cjs must scan ${requiredSecretKey} assignments.`);
  }
}
if (!secretHygiene.includes('whsec_YOUR')) {
  failures.push('scripts/validate-secret-hygiene.cjs must allow Stripe webhook placeholder values while rejecting real webhook secrets.');
}

const loginPage = readIfExists('src/app/login/page.tsx');
const loginPanel = readIfExists('src/app/login/LoginPanel.tsx');
const loginSurface = `${loginPage}\n${loginPanel}`;
if (!loginSurface.includes('getSettings') || !loginSurface.includes('disableSignup') || !loginSurface.includes('providers?.google')) {
  failures.push('src/app/login/page.tsx must use Netlify Identity settings before showing signup or Google auth controls.');
}
if (!loginSurface.includes('acceptInvite') || !loginSurface.includes("callback?.type === 'invite'") || !loginSurface.includes('Accept your ClaimBot invitation')) {
  failures.push('src/app/login/page.tsx must handle Netlify Identity invite callbacks for invite-only client onboarding.');
}
if (!loginSurface.includes('updateUser') || !loginSurface.includes("callback?.type === 'recovery'") || !loginSurface.includes('Set a new ClaimBot password')) {
  failures.push('src/app/login/page.tsx must handle Netlify Identity recovery callbacks before hosted launch.');
}
if (!loginSurface.includes('preInviteGateRows') || !loginSurface.includes('Pre-invite access check') || !loginSurface.includes('Do not send login links until account access is confirmed') || !loginSurface.includes('/launch#production-gates') || !loginSurface.includes('Protected workspace routes open only after the hosted sign-in and signed app session line up.')) {
  failures.push('src/app/login/page.tsx must render a customer-safe pre-invite access check that ties client login links to hosted account setup and signed app-session exchange.');
}
const authAccessBrowser = readIfExists('src/app/login/AuthAccessBrowser.tsx');
if (!loginSurface.includes('<AuthAccessBrowser rows={accessBrowserRows} />') || !loginSurface.includes('accessBrowserRows') || !authAccessBrowser.includes('Check sign-in readiness before entering the workspace') || !authAccessBrowser.includes('All access items') || !authAccessBrowser.includes('This view is read-only') || !authAccessBrowser.includes('Filters never sign in users')) {
  failures.push('src/app/login must expose a real-state read-only Kimi-style access details view without creating sessions, accounts, or claim authority.');
}
if (!loginPage.includes('buildClientPreviewChecklist') || !loginPage.includes('ClientPreviewLoginGate') || !loginPage.includes('clientSafeLaunchAction') || !loginPage.includes('clientSafeLaunchLabel') || !loginPage.includes('clientSafeRequiredInputLabel') || !loginPanel.includes('Login readiness') || !loginPanel.includes('Login invites wait for account readiness') || !loginPanel.includes('/packets') || !loginPanel.includes('/contact') || !loginPanel.includes('clientSafeRequiredInputSummary') || !loginPanel.includes('clientSafeProofArtifactSummary') || loginPanel.includes('Export client preview checklist')) {
  failures.push('src/app/login must tie hosted login invites to the account-scoped client-preview checklist and route users to app pages instead of raw audit exports.');
}

const settingsPage = readIfExists('src/app/settings/page.tsx');
if (!settingsPage.includes('<CliCommandRows commands={verificationCommands} compact />')) {
  failures.push('src/app/settings/page.tsx must render copy-ready verification command rows.');
}
if (!settingsPage.includes('hasTemplatePlaceholder(databaseUrl)') || !settingsPage.includes('hasTemplatePlaceholder(scraperUserAgent)') || !settingsPage.includes('hasTemplatePlaceholder(supportEmail)') || !settingsPage.includes('hasTemplatePlaceholder(sessionSecret)')) {
  failures.push('src/app/settings/page.tsx must reject placeholder hosted env values before showing launch handoff fields as configured.');
}
const settingsControlBrowser = readIfExists('src/app/settings/SettingsControlBrowser.tsx');
if (!settingsPage.includes('SettingsControlBrowser') || !settingsControlBrowser.includes('Search runtime and launch controls before changing settings') || !settingsControlBrowser.includes('All controls') || !settingsControlBrowser.includes('Needs attention') || !settingsControlBrowser.includes('This browser is read-only') || !settingsControlBrowser.includes('saved settings still go through the guarded form below')) {
  failures.push('src/app/settings must expose a read-only Kimi-style control browser while preserving guarded settings form behavior.');
}
if (!settingsPage.includes('buildClientPreviewChecklist') || !settingsPage.includes('clientPreviewChecklist.summary.clientPreviewReady') || !settingsPage.includes('Client Preview Checklist') || !settingsPage.includes('Launch Packet Stack') || !settingsPage.includes('/api/audit/client-preview-checklist') || !settingsPage.includes('/api/audit/launch-handoff')) {
  failures.push('src/app/settings/page.tsx must gate client invites on the account-scoped client-preview checklist and expose checklist/handoff exports.');
}
if (!settingsPage.includes('buildLaunchActionPlan') || !settingsPage.includes('settingsActionPlanSummary') || !settingsPage.includes('Business setup handoff') || !settingsPage.includes('Execution boundary:') || !settingsPage.includes('Required inputs:') || !settingsPage.includes('step.requiredInputs') || !settingsPage.includes('/api/audit/external-activation-workbook')) {
  failures.push('src/app/settings/page.tsx must surface the launch action plan execution boundaries and required external inputs for operator handoff.');
}
if (!settingsPage.includes('paidAutomationBlockers') || !settingsPage.includes('Paid automation readiness') || !settingsPage.includes('Paid automation needs setup') || !settingsPage.includes('clientPreviewChecklist.fullAutomationLaunchBlockers') || !settingsPage.includes('hosted data, business setup, billing, legal review')) {
  failures.push('src/app/settings/page.tsx must surface paid full-automation launch blockers before client invite controls.');
}
const statusPage = readIfExists('src/app/status/page.tsx');
const statusTimelineBrowser = readIfExists('src/app/status/StatusTimelineBrowser.tsx');
if (!statusPage.includes('<StatusTimelineBrowser rows={timelineRows} />') || !statusPage.includes('currentStep: stepIndex(claim.status)')) {
  failures.push('src/app/status/page.tsx must feed real user-owned claim timeline rows into the interactive status browser.');
}
if (!statusPage.includes('buildClientPreviewChecklist') || !statusPage.includes('Customer access status') || !statusPage.includes('/packets') || !statusPage.includes('Launch packet stack') || !statusPage.includes('Next setup item') || !statusPage.includes('nextExternalProof') || !statusPage.includes('blockedLaunchActionPlanRows') || !statusPage.includes('Customer access setup plan') || !statusPage.includes('Blocked workstreams with setup owners') || !statusPage.includes('clientPreviewChecklist.launchActionPlan.summary.blockedSteps') || !statusPage.includes('Setup details stay in Launch and Packet Center') || !statusPage.includes('executionBoundary') || !statusPage.includes('clientSafeLaunchAction') || !statusPage.includes('clientSafeLaunchLabel') || !statusPage.includes('clientSafeLaunchLabel(step)') || !statusPage.includes('clientSafeRequiredInputSummary') || !statusPage.includes('clientSafeProofArtifactSummary')) {
  failures.push('src/app/status/page.tsx must surface client-preview checklist posture and next external proof execution boundaries while routing raw commands and exports to Launch/Packet Center.');
}
if (!statusPage.includes('paidAutomationBlockers') || !statusPage.includes('Paid full automation status lock') || !statusPage.includes('Hands-off paid filing remains locked') || !statusPage.includes('clientPreviewChecklist.fullAutomationLaunchBlockers') || !statusPage.includes('hosted data, business setup, billing, legal, and customer-access readiness blockers clear')) {
  failures.push('src/app/status/page.tsx must render paid full-automation launch blockers before claim timelines.');
}
if (!statusPage.includes('schema.jobs') || !statusPage.includes("eq(schema.jobs.type, 'file_claim')") || !statusPage.includes('latestWorkerJobByClaimId') || !statusPage.includes('activeWorkerJobCount') || !statusPage.includes('Automation runs')) {
  failures.push('src/app/status/page.tsx must join real file_claim worker jobs into claim timelines and summary stats.');
}
if (!statusTimelineBrowser.includes('Search claim status history') || !statusTimelineBrowser.includes('status-filter-tabs') || !statusTimelineBrowser.includes('aria-expanded={isExpanded}')) {
  failures.push('src/app/status/StatusTimelineBrowser.tsx must render searchable, filterable, expandable Kimi-style claim status timelines.');
}
if (!statusTimelineBrowser.includes('Shadow Match') || !statusTimelineBrowser.includes('Manual approval remains active') || !statusTimelineBrowser.includes('status-visual-timeline') || !statusPage.includes('payoutEstimate: settlement.payoutEstimate')) {
  failures.push('src/app/status must preserve Kimi website-builder detailed timeline cues while feeding real settlement payout, deadline, proof, and claim-form metadata.');
}
if (!statusTimelineBrowser.includes('Paid automation run receipt') || !statusTimelineBrowser.includes('Automation run error') || !statusTimelineBrowser.includes('workerJobStatus') || !statusTimelineBrowser.includes('workerJobCadence')) {
  failures.push('src/app/status/StatusTimelineBrowser.tsx must expose worker-job lifecycle receipts for paid full automation timelines.');
}

const auditPage = readIfExists('src/app/audit/page.tsx');
const auditTrailBrowser = readIfExists('src/app/audit/AuditTrailBrowser.tsx');
if (!auditPage.includes('<AuditTrailBrowser rows={auditBrowserRows} supportPacketHref={supportPacketHref} />') || !auditPage.includes('auditBrowserRows') || !auditTrailBrowser.includes('Search append-only events without changing the record') || !auditTrailBrowser.includes('All events') || !auditTrailBrowser.includes('This browser is read-only') || !auditTrailBrowser.includes('Browser filters do not edit events')) {
  failures.push('src/app/audit must expose a real-data read-only Kimi-style audit browser without changing append-only audit or support-export behavior.');
}
if (!auditPage.includes('buildClientPreviewChecklist') || !auditPage.includes('clientPreviewChecklist.launchActionPlan.rows') || !auditPage.includes('blockedAuditLaunchActionRows') || !auditPage.includes('Client preview action plan') || !auditPage.includes('Blocked workstreams are audit-visible') || !auditPage.includes('clientPreviewChecklist.launchActionPlan.summary.blockedSteps') || !auditPage.includes('step.commands[0]') || !auditPage.includes('executionBoundary') || !auditPage.includes('requiredInputs.slice') || !auditPage.includes('/api/audit/client-preview-checklist') || !auditPage.includes('/api/audit/launch-handoff')) {
  failures.push('src/app/audit/page.tsx must make client-preview launch action-plan blockers audit-visible with non-secret commands and export links.');
}
if (!auditPage.includes('paidAutomationBlockers') || !auditPage.includes('Paid full automation setup lock') || !auditPage.includes('Hands-off paid filing is still locked') || !auditPage.includes('clientPreviewChecklist.fullAutomationLaunchBlockers') || !auditPage.includes('eligible no-proof claims can run hands-off')) {
  failures.push('src/app/audit/page.tsx must make paid full-automation launch blockers audit-visible with packet evidence commands.');
}

const claimsPage = readIfExists('src/app/claims/page.tsx');
if (!claimsPage.includes('getUserSubscription') || !claimsPage.includes('Paid plan check') || !claimsPage.includes('guarded filings per month')) {
  failures.push('src/app/claims/page.tsx must show the paid plan check before the authorized filing lane can be used.');
}
if (!claimsPage.includes('Full Automation Lane') || !claimsPage.includes('Paid commands run fully automated when checks pass') || !claimsPage.includes('Fully automated guarded filing') || !claimsPage.includes('Hard blockers only') || !claimsPage.includes('without the user clicking each step')) {
  failures.push('src/app/claims/page.tsx must make the Pro lane full guarded automation, not semi-automated review prep.');
}
if (!claimsPage.includes('buildClientPreviewChecklist') || !claimsPage.includes('paidAutomationBlockers') || !claimsPage.includes('Paid full automation lock') || !claimsPage.includes('Full automation waits for account readiness') || !claimsPage.includes('Eligible no-proof claims cannot run hands-off from claim tracking') || !claimsPage.includes('customer-access readiness clear') || !claimsPage.includes('clientPreviewChecklist.fullAutomationLaunchBlockers')) {
  failures.push('src/app/claims/page.tsx must surface paid full-automation launch blockers directly on claim tracking before filing actions look available.');
}
if (!claimsPage.includes('latestQueueAuditReceipt') || !claimsPage.includes('Tracking audit receipt') || !claimsPage.includes('CLAIM_QUEUE_BLOCKED') || !claimsPage.includes('server-side audit event')) {
  failures.push('src/app/claims/page.tsx must show an audit-backed tracking receipt tying tracked claims to CLAIM_QUEUED and blocked tracking attempts.');
}
const claimsQueueBrowser = readIfExists('src/app/claims/ClaimsQueueBrowser.tsx');
if (!claimsPage.includes('<ClaimsQueueBrowser rows={queueBrowserRows} />') || !claimsPage.includes('match.confidence') || !claimsQueueBrowser.includes('Search tracked claims') || !claimsQueueBrowser.includes('All claims') || !claimsQueueBrowser.includes('Trust-lock receipt') || !claimsQueueBrowser.includes('Filing actions still require the guarded claim detail route')) {
  failures.push('src/app/claims must expose a real-data read-only Kimi-style claim tracker without changing filing, proof, permission, or claim-detail gates.');
}
const purchasesPage = readIfExists('src/app/purchases/page.tsx');
const purchaseEvidenceBrowser = readIfExists('src/app/purchases/PurchaseEvidenceBrowser.tsx');
if (!purchasesPage.includes('<PurchaseEvidenceBrowser rows={purchaseBrowserRows} />') || !purchasesPage.includes('purchaseBrowserRows') || !purchaseEvidenceBrowser.includes('Search purchase facts without changing saved evidence') || !purchaseEvidenceBrowser.includes('All evidence') || !purchaseEvidenceBrowser.includes('This browser is read-only') || !purchaseEvidenceBrowser.includes('Browser filters never delete evidence')) {
  failures.push('src/app/purchases must expose a real-data read-only Kimi-style purchase evidence browser while preserving guarded add/delete evidence forms.');
}
const breachesPage = readIfExists('src/app/breaches/page.tsx');
const breachEvidenceBrowser = readIfExists('src/app/breaches/BreachEvidenceBrowser.tsx');
if (!breachesPage.includes('<BreachEvidenceBrowser rows={breachBrowserRows} />') || !breachesPage.includes('CLAIMBOT_FEATURE_BREACH_IMPORT') || !breachEvidenceBrowser.includes('Search breach facts without changing saved exposure evidence') || !breachEvidenceBrowser.includes('All exposures') || !breachEvidenceBrowser.includes('This browser is read-only') || !breachEvidenceBrowser.includes('Browser filters never delete exposure evidence')) {
  failures.push('src/app/breaches must expose a real-data read-only Kimi-style breach evidence browser only when breach import is enabled.');
}
const claimDetailPage = readIfExists('src/app/claims/[id]/page.tsx');
const claimDetailNotFound = readIfExists('src/app/claims/[id]/not-found.tsx');
const claimDetailPacketBrowser = readIfExists('src/app/claims/[id]/ClaimDetailPacketBrowser.tsx');
const claimSafetyConsole = readIfExists('src/lib/claim-filer/claim-safety-console.ts');
if (!claimDetailNotFound.includes('Claim record not found') || !claimDetailNotFound.includes('No claim action started') || !claimDetailNotFound.includes('/claims') || !claimDetailNotFound.includes('/review') || !claimDetailNotFound.includes('/status')) {
  failures.push('src/app/claims/[id]/not-found.tsx must provide customer-safe claim-detail recovery actions without starting automation.');
}
if (!claimDetailPage.includes('getUserSubscription') || !claimDetailPage.includes('automationEntitlementActive: subscription.automationEnabled') || !claimSafetyConsole.includes("key: 'plan-gate'") || !claimSafetyConsole.includes('final checks pause when the allowance is used')) {
  failures.push('claim detail safety console must show current paid automation plan check before retrying final checks.');
}
if (!claimDetailPage.includes('<ClaimDetailPacketBrowser rows={claimPacketRows} claimId={claim.id} />') || !claimDetailPage.includes('claimPacketRows') || !claimDetailPacketBrowser.includes('Search claim packet evidence without starting final checks') || !claimDetailPacketBrowser.includes('All packet items') || !claimDetailPacketBrowser.includes('This browser is read-only') || !claimDetailPacketBrowser.includes('Browser filters never start final checks')) {
  failures.push('src/app/claims/[id] must expose a real-data read-only Kimi-style packet browser without starting final checks or changing claim state.');
}
if (!claimDetailPage.includes("eq(schema.jobs.type, 'file_claim')") || !claimDetailPage.includes('latestWorkerJob') || !claimDetailPage.includes('Worker lifecycle receipt') || !claimDetailPacketBrowser.includes('Worker jobs') || !claimDetailPacketBrowser.includes("PacketKind = 'gate' | 'artifact' | 'audit' | 'worker'")) {
  failures.push('src/app/claims/[id] must include file_claim worker lifecycle evidence in the claim packet browser.');
}
if (!claimAuditExport.includes('workerLifecycle') || !claimAuditExport.includes("workerJobType: 'file_claim'") || !claimAuditExport.includes("jobEnqueueEventType: 'JOB_ENQUEUED'") || !claimAuditExport.includes('paidAutomationWorkerAudited') || !claimAuditExport.includes('workerCadence')) {
  failures.push('src/lib/audit/claim-export.ts must include claim-scoped file_claim worker lifecycle evidence in digest-backed audit exports.');
}

const eligibilityPage = readIfExists('src/app/eligibility/page.tsx');
if (!eligibilityPage.includes('getUserSubscription') || !eligibilityPage.includes('Automation plan needed') || !eligibilityPage.includes('Plan check before claim tracking')) {
  failures.push('src/app/eligibility/page.tsx must show the paid automation plan check before queue eligibility is implied.');
}
const eligibilityBrowser = readIfExists('src/app/eligibility/EligibilityCandidateBrowser.tsx');
if (!eligibilityPage.includes('EligibilityCandidateBrowser') || !eligibilityBrowser.includes('Search matches by status and deadline') || !eligibilityBrowser.includes('All candidates') || !eligibilityBrowser.includes('Documents needed') || !eligibilityBrowser.includes('Tracking still requires document, permission, and plan checks')) {
  failures.push('src/app/eligibility must expose a real-data Kimi-style candidate browser without weakening proof, authorization, or plan checks.');
}
const reviewPage = readIfExists('src/app/review/page.tsx');
const reviewBrowser = readIfExists('src/app/review/ReviewMatchBrowser.tsx');
if (!reviewPage.includes('ReviewMatchBrowser') || !reviewBrowser.includes('Search match results before tracking claims') || !reviewBrowser.includes('Claim actions remain guarded below') || !reviewBrowser.includes('Browser review is read-only') || !reviewBrowser.includes('All matches') || !reviewBrowser.includes('Ready to track')) {
  failures.push('src/app/review must expose a real-data Kimi-style review browser while keeping claim actions server-rendered and safety-check gated.');
}
if (!reviewPage.includes('Match refresh history') || !reviewPage.includes('MATCHER_RUN_COMPLETED') || !reviewPage.includes('latestMatcherReceipt') || !reviewPage.includes('/audit?actor=matcher')) {
  failures.push('src/app/review/page.tsx must surface the latest matcher-run audit receipt so matcher refreshes are visible even when no verdict changes.');
}
if (!reviewPage.includes('Review-to-tracking receipt') || !reviewPage.includes('reviewToQueueReceiptRows') || !reviewPage.includes('CLAIM_QUEUE_BLOCKED') || !reviewPage.includes('server check')) {
  failures.push('src/app/review/page.tsx must show a review-to-tracking receipt backed by server tracking gates, safety acknowledgement, plan, proof, permission, and blocked-audit semantics.');
}
const authorizationsPage = readIfExists('src/app/permissions/page.tsx');
const authorizationsRedirectPage = readIfExists('src/app/authorizations/page.tsx');
const authorizationBrowser = readIfExists('src/app/authorizations/AuthorizationCommandBrowser.tsx');
if (!authorizationsPage.includes('AuthorizationCommandBrowser') || !authorizationBrowser.includes('Search claim permissions before automation') || !authorizationBrowser.includes('All categories') || !authorizationBrowser.includes('Permission saved') || !authorizationBrowser.includes('Filters only change this view') || !authorizationBrowser.includes('Open permission controls')) {
  failures.push('src/app/permissions must expose a real-data Kimi-style permission browser without changing save/revoke semantics.');
}
if (!authorizationsRedirectPage.includes("redirect('/permissions')")) {
  failures.push('src/app/authorizations/page.tsx must remain a customer-safe redirect to /permissions so legacy authorization links use the simplified Kimi permissions surface.');
}
const profilePage = readIfExists('src/app/profile/page.tsx');
if (!profilePage.includes('ProfileFactsBrowser') || !profilePage.includes('Review saved facts without changing them') || !profilePage.includes('All') || !profilePage.includes('Needs attention') || !profilePage.includes('This browser is read-only') || !profilePage.includes('No eligibility is fabricated')) {
  failures.push('src/app/profile/page.tsx must expose a Kimi-style profile facts browser while keeping saved facts, proof, permission, and filing posture read-only in that surface.');
}

const goalPage = readIfExists('src/app/goal/page.tsx');
if (!goalPage.includes('getUserSubscription') || !goalPage.includes('evaluateQueueReadiness') || !goalPage.includes('Paid Automation Receipt') || !goalPage.includes('Payment can unlock full guarded automation')) {
  failures.push('src/app/goal/page.tsx must show a paid automation readiness receipt backed by subscription and queue-readiness gates.');
}
if (!goalPage.includes('subscription.automationEnabled') || !goalPage.includes('View automation plans') || !goalPage.includes('paid plans remove the cap')) {
  failures.push('src/app/goal/page.tsx must keep unpaid users pointed to pricing and avoid implying automation is unlocked.');
}
if (!goalPage.includes('buildClientPreviewChecklist') || !goalPage.includes('Customer access') || !goalPage.includes('Customer access waits for readiness') || !goalPage.includes('Required inputs:') || !goalPage.includes('clientSafeRequiredInputSummary(nextExternalProof.requiredInputs') || !goalPage.includes('clientSafeLaunchLabel') || !goalPage.includes('clientSafeLaunchLabel(item)') || !goalPage.includes('/packets') || !goalPage.includes('Open readiness status') || goalPage.includes('Export checklist')) {
  failures.push('src/app/goal/page.tsx must surface the account-scoped client-preview checklist and route users to app proof pages instead of raw exports.');
}
if (!goalPage.includes('paidAutomationBlockers') || !goalPage.includes('Paid automation readiness') || !goalPage.includes('Hands-off paid filing still blocked') || !goalPage.includes('clientPreviewChecklist.fullAutomationLaunchBlockers') || !goalPage.includes('Eligible no-proof claims can') || !goalPage.includes('/packets')) {
  failures.push('src/app/goal/page.tsx must surface paid full-automation launch blockers from the account-scoped checklist.');
}

const settlementDetailPage = readIfExists('src/app/settlements/[id]/page.tsx');
const settlementsPage = readIfExists('src/app/settlements/page.tsx');
const settlementDiscoveryBrowser = readIfExists('src/app/settlements/SettlementDiscoveryBrowser.tsx');
const settlementDetailBrowser = readIfExists('src/app/settlements/[id]/SettlementDetailBrowser.tsx');
if (!settlementsPage.includes('<SettlementDiscoveryBrowser rows={settlementBrowserRows} />') || !settlementsPage.includes('readinessBySettlementId') || !settlementDiscoveryBrowser.includes('Search source records without implying claim permission') || !settlementDiscoveryBrowser.includes('All records') || !settlementDiscoveryBrowser.includes('Claim forms remain server-rendered below') || !settlementDiscoveryBrowser.includes('Discovery browser is read-only')) {
  failures.push('src/app/settlements must expose a real-data read-only Kimi-style discovery browser while keeping source records separate from claim permission.');
}
if (!settlementDetailPage.includes('<SettlementDetailBrowser rows={settlementDetailRows} settlementId={row.id} />') || !settlementDetailPage.includes('settlementDetailRows') || !settlementDetailBrowser.includes('Search settlement source context without granting claim permission') || !settlementDetailBrowser.includes('All source items') || !settlementDetailBrowser.includes('This browser is read-only') || !settlementDetailBrowser.includes('Browser filters never track claims')) {
  failures.push('src/app/settlements/[id] must expose a real-data read-only Kimi-style source browser without changing tracking, proof, permission, or eligibility checks.');
}
const settlementSelfAssessment = readIfExists('src/lib/claim-filer/settlement-self-assessment.ts');
if (!settlementDetailPage.includes('automationEntitlementActive: subscription.automationEnabled') || !settlementSelfAssessment.includes('automation-plan') || !settlementSelfAssessment.includes('monthly filing allowance')) {
  failures.push('settlement detail self-assessment must include the paid automation plan check.');
}

const setupPagePlanGate = readIfExists('src/app/setup/page.tsx');
const setupWizardPlanGate = readIfExists('src/app/setup/SetupWizard.tsx');
const setupCompleteRoutePlanGate = readIfExists('src/app/api/setup/complete/route.ts');
if (!setupPagePlanGate.includes('getUserSubscription') || !setupWizardPlanGate.includes('Automation plan check') || !setupWizardPlanGate.includes('5 included filings per month')) {
  failures.push('src/app/setup must show the current plan check before setup completion implies authorized automation.');
}
if (!setupCompleteRoutePlanGate.includes('getUserSubscription') || !setupCompleteRoutePlanGate.includes('planGate') || !setupCompleteRoutePlanGate.includes('5 guarded filings per month')) {
  failures.push('src/app/api/setup/complete/route.ts must record setup shadow-review plan-gate evidence.');
}
if (!setupWizardPlanGate.includes('TERMS_BOUNDARY_ACK') || !setupWizardPlanGate.includes('I acknowledge the ClaimBot Terms boundary') || !setupCompleteRoutePlanGate.includes('USER_TERMS_ACKNOWLEDGED') || !setupCompleteRoutePlanGate.includes('terms boundary acknowledgement required')) {
  failures.push('src/app/setup must require and audit a user-facing Terms boundary acknowledgement before setup automation starts.');
}

const authGateBlock = readIfExists('src/app/setup/AuthGateBlock.tsx');
if (!authGateBlock.includes('Hosted access setup required') || !authGateBlock.includes('Session-signing commands stay in Launch, Packet Center, Audit, or Settings') || authGateBlock.includes('<CliCommandRows')) {
  failures.push('src/app/setup/AuthGateBlock.tsx must keep setup client-safe by routing session-signing commands to operator proof pages.');
}

const kimiAppShell = readIfExists('src/app/KimiAppShell.tsx');
if (!kimiAppShell.includes('<MobileBottomNav featureFlags={featureFlags} />')) {
  failures.push('src/app/KimiAppShell.tsx must mount the mobile PWA bottom nav inside the Kimi app shell.');
}
if (!kimiAppShell.includes('<PwaConnectionStatus />')) {
  failures.push('src/app/KimiAppShell.tsx must mount the PWA hosted connection status in the Kimi topbar.');
}
const pwaConnectionStatus = readIfExists('src/app/PwaConnectionStatus.tsx');
if (!pwaConnectionStatus.includes('PWA hosted connection status') || !pwaConnectionStatus.includes('Hosted online') || !pwaConnectionStatus.includes('Offline safety hold') || !pwaConnectionStatus.includes('No claim data cached')) {
  failures.push('src/app/PwaConnectionStatus.tsx must keep hosted online/offline safety status and no-local-claim-cache copy.');
}
const pwaReadiness = readIfExists('src/lib/pwa-readiness.ts');
const pwaManifest = readIfExists('public/manifest.webmanifest');
if (!pwaReadiness.includes('evaluatePwaReadiness') || !pwaReadiness.includes('pwa-manifest') || !pwaReadiness.includes('pwa-install-previews') || !pwaReadiness.includes('offline-shell') || !pwaReadiness.includes('service-worker-boundary') || !pwaReadiness.includes('does not cache claim data')) {
  failures.push('src/lib/pwa-readiness.ts must derive auditable PWA install/offline readiness without allowing offline claim-data caching.');
}
if (!pwaManifest.includes('"screenshots"') || !pwaManifest.includes('/pwa-preview-dashboard.svg') || !pwaManifest.includes('/pwa-preview-launch.svg') || !readIfExists('public/pwa-preview-dashboard.svg').includes('ClaimBot dashboard command center preview') || !readIfExists('public/pwa-preview-launch.svg').includes('ClaimBot launch readiness mobile preview')) {
  failures.push('public/manifest.webmanifest must include wide and narrow Kimi-style ClaimBot install preview assets.');
}
if (!readIfExists('scripts/export-pwa-readiness-packet.ts').includes('public/pwa-preview-dashboard.svg') || !readIfExists('scripts/export-pwa-readiness-packet.ts').includes('wide and narrow install previews')) {
  failures.push('scripts/export-pwa-readiness-packet.ts must include PWA install preview assets in non-secret source evidence.');
}
if (!kimiAppShell.includes('Workspace trust boundaries') || !kimiAppShell.includes('Permission required') || !kimiAppShell.includes('Proof manual') || !kimiAppShell.includes('Account history')) {
  failures.push('src/app/KimiAppShell.tsx must keep the Kimi topbar trust rail visible for permission, proof, and account-history boundaries.');
}
const appFooter = readIfExists('src/app/AppFooter.tsx');
if (!kimiAppShell.includes('navGroups') || !kimiAppShell.includes("label: 'Tasks'") || !kimiAppShell.includes("label: 'Find'") || !kimiAppShell.includes("label: 'More'") || !kimiAppShell.includes('kimi-nav-disclosure') || !kimiAppShell.includes('<AppFooter />') || kimiAppShell.includes("{ label: 'Legal'")) {
  failures.push('src/app/KimiAppShell.tsx must keep the simplified Kimi shell: customer tasks first, discovery/support second, extra launch pages tucked behind a More disclosure, and no Legal item in the side nav.');
}
if (!kimiAppShell.includes("label: 'Start Here'") || !kimiAppShell.includes("label: 'Profile'") || !kimiAppShell.includes("label: 'Review'") || !kimiAppShell.includes("label: 'Claims'") || !kimiAppShell.includes("label: 'Status'") || !kimiAppShell.includes("label: 'Eligibility', href: '/eligibility'") || !kimiAppShell.includes("label: 'Help', href: '/help'") || !kimiAppShell.includes("label: 'Plan'") || !kimiAppShell.includes("label: 'Launch'")) {
  failures.push('src/app/KimiAppShell.tsx must keep the customer workflow simple with short labels while preserving Plan/Launch surfaces behind the More disclosure.');
}
if (!appFooter.includes('aria-label="Legal links"') || !appFooter.includes('/privacy-policy') || !appFooter.includes('/terms') || !appFooter.includes('/contact') || !appFooter.includes('/help')) {
  failures.push('src/app/AppFooter.tsx must keep privacy, terms, contact, and help as global footer footnote links.');
}

const hostedRemediation = readIfExists('src/lib/hosted-remediation.ts');
if (!hostedRemediation.includes("'npm run hosted:checklist'")) {
  failures.push('src/lib/hosted-remediation.ts must include npm run hosted:checklist in verification commands.');
}
if (!hostedRemediation.includes("'npm run launch:secrets'") || !hostedRemediation.includes("'npm run launch:push-secrets'")) {
  failures.push('src/lib/hosted-remediation.ts must include generated launch-secret setup and push commands.');
}
if (!hostedRemediation.includes('hostedDatabaseSetupCommands') || !hostedRemediation.includes("'npm run hosted:db:prepare'") || !hostedRemediation.includes("'npm run hosted:db:doctor'") || !hostedRemediation.includes("'npm run hosted:db:push'") || !hostedRemediation.includes("'npm run with:hosted-env -- npm run source:import:dry'")) {
  failures.push('src/lib/hosted-remediation.ts must include the ignored hosted database prepare, migrate/import, and push workflow.');
}
if (!hostedRemediation.includes("'npm run hosted:db:packet'")) {
  failures.push('src/lib/hosted-remediation.ts must include npm run hosted:db:packet so hosted database setup has a non-secret packet before preview.');
}
if (!hostedRemediation.includes('launchPacketCommands') || !hostedRemediation.includes('launchPacketArtifacts') || !hostedRemediation.includes("command: 'npm run hosted:db:packet'") || !hostedRemediation.includes("command: 'npm run audit:support:packet'") || !hostedRemediation.includes("command: 'npm run matcher:receipt'") || !hostedRemediation.includes("command: 'npm run netlify:doctor'") || !hostedRemediation.includes('data/operator-setup-packet.md') || !hostedRemediation.includes('data/worker-runtime-packet.md') || !hostedRemediation.includes('data/audit-support-packet.md') || !hostedRemediation.includes('data/billing-activation-packet.md') || !hostedRemediation.includes('data/legal-review-packet.md') || !hostedRemediation.includes('data/local-verification-packet.md') || !hostedRemediation.includes('data/netlify-launch-doctor.md') || !hostedRemediation.includes('data/preview-promotion-packet.md') || !hostedRemediation.includes('data/external-activation-workbook.md') || !hostedRemediation.includes('data/client-preview-checklist.md') || !hostedRemediation.includes('data/launch-handoff-report.md')) {
  failures.push('src/lib/hosted-remediation.ts must define a reusable non-secret launch packet command/artifact stack for Launch and Packet Center.');
}
if (!hostedRemediation.includes('scheduled-worker') || !hostedRemediation.includes('claimbot-worker-smoke-receipt') || !hostedRemediation.includes('gh workflow run claimbot-worker.yml -f limit=3')) {
  failures.push('src/lib/hosted-remediation.ts must route paid automation runtime remediation through the scheduled worker and worker smoke receipt artifact.');
}
const launchPacketStack = readIfExists('src/lib/launch-packet-stack.ts');
if (!launchPacketStack.includes('getLaunchPacketArtifactRows') || !launchPacketStack.includes('command: string') || !launchPacketStack.includes('existsSync') || !launchPacketStack.includes('audit:MATCHER_RUN_COMPLETED') || !launchPacketStack.includes('Packet present') || !launchPacketStack.includes('Receipt ready')) {
  failures.push('src/lib/launch-packet-stack.ts must derive real non-secret packet artifact and matcher receipt status for the launch packet stack.');
}
if (!launchPacketStack.includes('workerRuntimeReady') || !launchPacketStack.includes('Worker runtime readiness')) {
  failures.push('src/lib/launch-packet-stack.ts must treat the worker runtime packet as first-class launch-packet readiness proof.');
}
if (!launchPacketStack.includes('paidAutomationSaleReady') || !launchPacketStack.includes('Paid automation checkout readiness') || !launchPacketStack.includes('billingReady')) {
  failures.push('src/lib/launch-packet-stack.ts must treat billing activation as blocked until paid automation checkout is sale-ready, not merely payment-link configured.');
}
if (!launchPacketStack.includes('Doctor readiness') || !launchPacketStack.includes('packet.blockers')) {
  failures.push('src/lib/launch-packet-stack.ts must treat the Netlify launch doctor top-level readiness and blockers as first-class packet evidence.');
}
const fullAutomationLaunchBlockers = readIfExists('src/lib/full-automation-launch-blockers.ts');
if (!fullAutomationLaunchBlockers.includes('data/worker-runtime-packet.md') || !fullAutomationLaunchBlockers.includes('Automation processing gate') || !fullAutomationLaunchBlockers.includes('hosted background processing is verified')) {
  failures.push('src/lib/full-automation-launch-blockers.ts must keep worker runtime proof as a paid full-automation blocker.');
}
if (!fullAutomationLaunchBlockers.includes('data/netlify-launch-doctor.md') || !fullAutomationLaunchBlockers.includes('Hosted setup check')) {
  failures.push('src/lib/full-automation-launch-blockers.ts must keep Netlify operator readiness as a paid full-automation blocker.');
}
if (!hostedRemediation.includes("'npm run db:migrate'") || !hostedRemediation.includes("'npm run validate:schema'")) {
  failures.push('src/lib/hosted-remediation.ts must require database migration and schema validation before hosted promotion.');
}
const verificationCommandsSource = extractExportedArray(hostedRemediation, 'verificationCommands');
const previewSmokeCommandsSource = extractExportedArray(hostedRemediation, 'previewSmokeCommands');
if (!verificationCommandsSource.includes("'npm run smoke:hosted:local'")) {
  failures.push('src/lib/hosted-remediation.ts must include the sequential hosted local smoke orchestrator in verification commands.');
}
if (!verificationCommandsSource.includes("'npm run matcher:receipt'")) {
  failures.push('src/lib/hosted-remediation.ts must include npm run matcher:receipt so matcher audit proof is generated before client preview.');
}
if (!verificationCommandsSource.includes("'npm run legal:packet'")) {
  failures.push('src/lib/hosted-remediation.ts must include npm run legal:packet so legal review has a non-secret packet before acknowledgment.');
}
if (!verificationCommandsSource.includes("'npm run billing:packet'")) {
  failures.push('src/lib/hosted-remediation.ts must include npm run billing:packet so paid billing setup has a non-secret packet before paid CTAs are treated as live.');
}
if (!verificationCommandsSource.includes("'npm run operator:packet'")) {
  failures.push('src/lib/hosted-remediation.ts must include npm run operator:packet so operator contact/auth setup has a non-secret packet before client invites.');
}
if (!verificationCommandsSource.includes("'npm run preview:packet'")) {
  failures.push('src/lib/hosted-remediation.ts must include npm run preview:packet so deployed preview target and promotion receipt readiness are captured before production.');
}
if (!verificationCommandsSource.includes("'npm run local:verify'")) {
  failures.push('src/lib/hosted-remediation.ts must include npm run local:verify so local command results are captured as a non-secret receipt.');
}
for (const localSmokeCommand of ["'npm run smoke:web'", "'npm run smoke:auth'", "'npm run smoke:features'"]) {
  if (verificationCommandsSource.includes(localSmokeCommand)) {
    failures.push('src/lib/hosted-remediation.ts verification commands must use npm run smoke:hosted:local instead of individual local smoke commands.');
  }
}
if (!previewSmokeCommandsSource.includes("'npm run smoke:web'") || !previewSmokeCommandsSource.includes("'npm run smoke:auth'") || !previewSmokeCommandsSource.includes("'npm run smoke:features'")) {
  failures.push('src/lib/hosted-remediation.ts must keep individual web, auth, and feature smokes in deployed preview smoke commands.');
}
if (
  !hostedRemediation.includes("'npm run enrich:source',\r\n  'npm run source:export',\r\n  'npm run validate:source:strict'")
  && !hostedRemediation.includes("'npm run enrich:source',\n  'npm run source:export',\n  'npm run validate:source:strict'")
) {
  failures.push('src/lib/hosted-remediation.ts must validate strict source quality after enrichment/export and before hosted source transfer.');
}
if (!hostedRemediation.includes('identitySetupSteps') || !hostedRemediation.includes('Enable Netlify Identity')) {
  failures.push('src/lib/hosted-remediation.ts must keep reusable Netlify Identity launch setup steps.');
}
if (!hostedRemediation.includes('netlifySiteLinkCommands') || !hostedRemediation.includes('Do not link ClaimBot to an unrelated Netlify project')) {
  failures.push('src/lib/hosted-remediation.ts must keep explicit Netlify site-link safeguards before preview promotion.');
}
if (!hostedRemediation.includes('--context production deploy-preview') || !hostedRemediation.includes('Set launch-critical Netlify environment variables for both production and deploy-preview contexts')) {
  failures.push('src/lib/hosted-remediation.ts must set launch-critical Netlify env values for both production and deploy-preview contexts.');
}

const hostedChecklist = readIfExists('scripts/hosted-setup-checklist.ts');
if (!hostedChecklist.includes('identitySetupSteps') || !hostedChecklist.includes('Enable Netlify Identity for hosted login')) {
  failures.push('scripts/hosted-setup-checklist.ts must include Netlify Identity setup before validation and deploy.');
}
if (!hostedChecklist.includes('secretCommands') || !hostedChecklist.includes('npm run launch:push-secrets')) {
  failures.push('scripts/hosted-setup-checklist.ts must include generated launch-secret setup and push commands.');
}
if (!hostedChecklist.includes('hostedDatabaseSetupCommands') || !hostedChecklist.includes('Prepare, migrate, import, and push the hosted database') || !hostedChecklist.includes('npm run hosted:db:doctor') || !hostedChecklist.includes('npm run hosted:db:push')) {
  failures.push('scripts/hosted-setup-checklist.ts must include the secret-safe hosted database setup workflow.');
}
if (!hostedChecklist.includes('npm run hosted:db:packet') || !hostedChecklist.includes('data/hosted-database-packet.md')) {
  failures.push('scripts/hosted-setup-checklist.ts must include the non-secret hosted database packet before hosted database promotion.');
}
if (!hostedRemediation.includes('npm install -g netlify-cli') || !hostedRemediation.includes('netlify --version')) {
  failures.push('src/lib/hosted-remediation.ts must include Netlify CLI installation before login/link/deploy commands.');
}
if (!hostedChecklist.includes('npm run netlify:doctor') || !hostedChecklist.includes('npm run netlify:doctor:strict')) {
  failures.push('scripts/hosted-setup-checklist.ts must include the Netlify launch doctor before preview promotion.');
}
if (!hostedChecklist.includes('Set production and deploy-preview environment variables') || !hostedChecklist.includes('production deploy-preview')) {
  failures.push('scripts/hosted-setup-checklist.ts must instruct operators to configure both production and deploy-preview Netlify env contexts.');
}
if (!hostedChecklist.includes('launchEvidence.databaseSchema.ok=true') || !hostedChecklist.includes('/api/audit/support-packet')) {
  failures.push('scripts/hosted-setup-checklist.ts must tell operators to verify support-packet database schema launch evidence.');
}
if (!hostedChecklist.includes('launchEvidence.sourceCatalog') || !hostedChecklist.includes('formCoveragePercent') || !hostedChecklist.includes('deadlineCoveragePercent') || !hostedChecklist.includes('textEncodingReady') || !hostedChecklist.includes('mojibakeCount')) {
  failures.push('scripts/hosted-setup-checklist.ts must tell operators to verify support-packet source catalog, source quality, and text encoding launch evidence.');
}
if (!hostedChecklist.includes('launchEvidence.netlifyPreview')) {
  failures.push('scripts/hosted-setup-checklist.ts must tell operators to verify support-packet Netlify preview launch evidence.');
}
if (!hostedChecklist.includes('launchEvidence.matcherRunReceipt') || !hostedChecklist.includes('MATCHER_RUN_COMPLETED')) {
  failures.push('scripts/hosted-setup-checklist.ts must tell operators to verify support-packet matcher-run receipt evidence.');
}
if (!hostedChecklist.includes('npm run legal:packet') || !hostedChecklist.includes('data/legal-review-packet.md')) {
  failures.push('scripts/hosted-setup-checklist.ts must include the non-secret legal review packet before setting CLAIMBOT_LEGAL_REVIEW_ACK.');
}
if (!hostedChecklist.includes('npm run billing:packet') || !hostedChecklist.includes('data/billing-activation-packet.md')) {
  failures.push('scripts/hosted-setup-checklist.ts must include the non-secret billing activation packet before relying on paid CTAs.');
}
if (!hostedChecklist.includes('npm run operator:packet') || !hostedChecklist.includes('data/operator-setup-packet.md')) {
  failures.push('scripts/hosted-setup-checklist.ts must include the non-secret operator setup packet before client invites.');
}
if (!hostedChecklist.includes('npm run production:check-receipt') || !hostedChecklist.includes('preview-promotion-receipt.json')) {
  failures.push('scripts/hosted-setup-checklist.ts must require the preview promotion receipt check before production deploy.');
}
if (!hostedChecklist.includes('npm run preview:packet') || !hostedChecklist.includes('data/preview-promotion-packet.md')) {
  failures.push('scripts/hosted-setup-checklist.ts must include the non-secret preview promotion packet before production deploy.');
}
if (!hostedChecklist.includes('npm run launch:handoff') || !hostedChecklist.includes('launch-handoff-report.json')) {
  failures.push('scripts/hosted-setup-checklist.ts must include the non-secret launch handoff report command.');
}
if (!hostedChecklist.includes('npm run client:checklist') || !hostedChecklist.includes('data/client-preview-checklist.md') || !hostedChecklist.includes('product-requirement completion audit')) {
  failures.push('scripts/hosted-setup-checklist.ts must include the non-secret client preview checklist command and artifact.');
}

const schemaReadiness = readIfExists('src/lib/database-schema-readiness.ts');
if (!schemaReadiness.includes('identity-subject-column') || !schemaReadiness.includes('billing-event-ledger')) {
  failures.push('src/lib/database-schema-readiness.ts must probe hosted identity and billing schema before launch.');
}

if (!packageJson.includes('"validate:schema"') || !packageJson.includes('"validate:legal"') || !packageJson.includes('npm run db:migrate && npm run validate:schema && npm run build')) {
  failures.push('package.json must expose validate:schema and validate:legal, and run schema after db:migrate in build:hosted.');
}
if (!packageJson.includes('"validate:source"') || !packageJson.includes('"validate:source:strict"') || !packageJson.includes('"source:export"') || !packageJson.includes('"source:import"') || !packageJson.includes('"source:import:dry"') || !packageJson.includes('scripts/validate-source-catalog.ts')) {
  failures.push('package.json must expose validate:source, validate:source:strict, source:export, source:import, and source:import:dry for public-discovery source catalog readiness checks.');
}
if (!packageJson.includes('"preview:check-env"') || !packageJson.includes('"preview:gate"') || !packageJson.includes('"preview:gate:local"') || !packageJson.includes('scripts/preview-promotion-gate.cjs')) {
  failures.push('package.json must expose preview:check-env, preview:gate, and preview:gate:local promotion checks.');
}
if (!packageJson.includes('"smoke:hosted:local"') || !packageJson.includes('scripts/smoke-hosted-local.cjs')) {
  failures.push('package.json must expose smoke:hosted:local through the local smoke orchestrator.');
}
if (!hostedLocalSmoke.includes('SMOKE_HOSTED_LOCAL_WEB_PORT') || !hostedLocalSmoke.includes('SMOKE_BASE_URL') || !hostedLocalSmoke.includes("npmRun('smoke:web'") || !hostedLocalSmoke.includes("npmRun('smoke:auth'") || !hostedLocalSmoke.includes("npmRun('smoke:features'") || !hostedLocalSmoke.includes("['SMOKE_BASE_URL']")) {
  failures.push('scripts/smoke-hosted-local.cjs must start a fresh web target and run web, auth, and feature smokes sequentially without leaking SMOKE_BASE_URL into local auth/feature smokes.');
}
if (!previewReceiptValidator.includes('validate:routes')) {
  failures.push('scripts/validate-preview-promotion-receipt.cjs must require validate:routes command coverage before production promotion.');
}
if (!packageJson.includes('"production:check-receipt"') || !packageJson.includes('scripts/validate-preview-promotion-receipt.cjs')) {
  failures.push('package.json must expose production:check-receipt for production promotion receipt validation.');
}
if (!packageJson.includes('"launch:handoff"') || !packageJson.includes('scripts/export-launch-handoff.ts')) {
  failures.push('package.json must expose launch:handoff for non-secret operator launch handoff reports.');
}
if (!packageJson.includes('"activation:workbook"') || !packageJson.includes('scripts/export-external-activation-workbook.ts')) {
  failures.push('package.json must expose activation:workbook for the non-secret external setup workbook.');
}
if (!packageJson.includes('"client:checklist"') || !packageJson.includes('scripts/export-client-preview-checklist.ts')) {
  failures.push('package.json must expose client:checklist for the non-secret client preview completion audit.');
}
if (!externalActivationWorkbookExporter.includes('buildExternalActivationWorkbook') || !externalActivationWorkbookExporter.includes('markdownExternalActivationWorkbook') || !externalActivationWorkbookExporter.includes('Account scope') || !externalActivationWorkbookExporter.includes('Codex-owned product work ready') || !externalActivationWorkbookExporter.includes('External product blockers') || !externalActivationWorkbookExporter.includes('No secret values were printed.')) {
  failures.push('scripts/export-external-activation-workbook.ts must write the shared non-secret activation workbook without printing secrets.');
}
if (!clientPreviewChecklistExporter.includes('buildClientPreviewChecklist') || !clientPreviewChecklistExporter.includes('markdownClientPreviewChecklist') || !clientPreviewChecklistExporter.includes('Account scope') || !clientPreviewChecklistExporter.includes('Product requirements ready') || !clientPreviewChecklistExporter.includes('Codex-owned product work ready') || !clientPreviewChecklistExporter.includes('External product blockers') || !clientPreviewChecklistExporter.includes('No secret values were printed.')) {
  failures.push('scripts/export-client-preview-checklist.ts must write the shared non-secret client preview checklist without printing secrets.');
}
if (!externalActivationWorkbookBuilder.includes('claimbot.external-activation-workbook.v1') || !externalActivationWorkbookBuilder.includes('accountScope') || !externalActivationWorkbookBuilder.includes('account-scoped') || !externalActivationWorkbookBuilder.includes('launchPacketSummary.ready') || !externalActivationWorkbookBuilder.includes('This workbook captures the current launch blockers') || !externalActivationWorkbookBuilder.includes('Execution boundary') || !externalActivationWorkbookBuilder.includes('Required inputs') || !externalActivationWorkbookBuilder.includes('requiredInputs') || !externalActivationWorkbookBuilder.includes('getLaunchCriticalPath') || !externalActivationWorkbookBuilder.includes('buildLaunchActionPlan') || !externalActivationWorkbookBuilder.includes('buildLaunchCommandQueue') || !externalActivationWorkbookBuilder.includes('Owner Handoff Briefs') || !externalActivationWorkbookBuilder.includes('ownerHandoffBriefs') || !externalActivationWorkbookBuilder.includes('safeLocalCommands') || !externalActivationWorkbookBuilder.includes('externalInputCommands') || !externalActivationWorkbookBuilder.includes('Operator Command Queue') || !externalActivationWorkbookBuilder.includes('operatorCommandQueue') || !externalActivationWorkbookBuilder.includes('clientPreviewChecklistSummary') || !externalActivationWorkbookBuilder.includes('Product Readiness Split') || !externalActivationWorkbookBuilder.includes('Codex-owned product work ready') || !externalActivationWorkbookBuilder.includes('External product blockers') || !externalActivationWorkbookBuilder.includes('data/external-activation-workbook.md') || !externalActivationWorkbookBuilder.includes('localTooling') || !externalActivationWorkbookBuilder.includes('netlifyCli: launchReadiness.netlifyCliReadiness') || !externalActivationWorkbookBuilder.includes('readLocalVerificationPacket') || !externalActivationWorkbookBuilder.includes('Local verification packet:') || !externalActivationWorkbookBuilder.includes('Local verification stale source files:') || !externalActivationWorkbookBuilder.includes('Netlify authentication:')) {
  failures.push('src/lib/external-activation-workbook.ts must build a versioned non-secret activation workbook from the current launch critical path with required inputs, execution boundaries, and local Netlify CLI/auth readiness.');
}
if (!externalActivationWorkbookRoute.includes('currentUserId') || !externalActivationWorkbookRoute.includes('buildExternalActivationWorkbook') || !externalActivationWorkbookRoute.includes('Content-Disposition') || !externalActivationWorkbookRoute.includes('claimbot-external-activation-workbook.json') || !externalActivationWorkbookRoute.includes('Cache-Control') || !externalActivationWorkbookRoute.includes('no-store')) {
  failures.push('src/app/api/audit/external-activation-workbook/route.ts must expose an authenticated no-store JSON activation workbook export.');
}
if (!clientPreviewChecklistBuilder.includes('claimbot.client-preview-checklist.v1') || !clientPreviewChecklistBuilder.includes('accountScope') || !clientPreviewChecklistBuilder.includes('account-scoped') || !clientPreviewChecklistBuilder.includes('data/client-preview-checklist.md') || !clientPreviewChecklistBuilder.includes('checklistOnly') || !clientPreviewChecklistBuilder.includes('markdownClientPreviewChecklist') || !clientPreviewChecklistBuilder.includes('Command: ${row.command}') || !clientPreviewChecklistBuilder.includes('Launch Action Plan') || !clientPreviewChecklistBuilder.includes('launchActionPlan') || !clientPreviewChecklistBuilder.includes('rows: actionPlan') || !clientPreviewChecklistBuilder.includes('commandQueue') || !clientPreviewChecklistBuilder.includes('ownerHandoffBriefs') || !clientPreviewChecklistBuilder.includes('Owner Handoff Briefs') || !clientPreviewChecklistBuilder.includes('safeLocalCommands') || !clientPreviewChecklistBuilder.includes('externalInputCommands') || !clientPreviewChecklistBuilder.includes('Operator Command Queue') || !clientPreviewChecklistBuilder.includes('Local commands available now') || !clientPreviewChecklistBuilder.includes('Commands waiting on external input') || !clientPreviewChecklistBuilder.includes('Non-secret commands') || !clientPreviewChecklistBuilder.includes('Execution boundary') || !clientPreviewChecklistBuilder.includes('Required inputs') || !clientPreviewChecklistBuilder.includes('requiredInputs') || !clientPreviewChecklistBuilder.includes('proofArtifacts') || !clientPreviewChecklistBuilder.includes('commands.slice(0, 6)') || !clientPreviewChecklistBuilder.includes('kimi-visual-system') || !clientPreviewChecklistBuilder.includes('readKimiVisualPacketEvidence') || !clientPreviewChecklistBuilder.includes('kimiVisualScreenshots') || !clientPreviewChecklistBuilder.includes('kimiVisualRoutes') || !clientPreviewChecklistBuilder.includes('kimiVisualDynamicClaimDetail') || !clientPreviewChecklistBuilder.includes('kimiVisualDynamicSettlementDetail') || !clientPreviewChecklistBuilder.includes('kimiVisualTemporaryDatabase') || !clientPreviewChecklistBuilder.includes('kimiVisualDynamicNote=') || !clientPreviewChecklistBuilder.includes('client-safe-surfaces') || !clientPreviewChecklistBuilder.includes('clientSafeSurfaceLeaks') || !clientPreviewChecklistBuilder.includes('operatorProofPages=Launch,Packet Center,Audit,Settings') || !clientPreviewChecklistBuilder.includes('routeExportHygiene') || !clientPreviewChecklistBuilder.includes('routeExportLeaks') || !clientPreviewChecklistBuilder.includes('routeExportAllowedNames') || !clientPreviewChecklistBuilder.includes('backend-data-readiness') || !clientPreviewChecklistBuilder.includes('paid-full-automation-command-contract') || !clientPreviewChecklistBuilder.includes('Paid commands run fully automated worker jobs') || !clientPreviewChecklistBuilder.includes('paidAutomationContractReady') || !clientPreviewChecklistBuilder.includes('manualStops=hard-blockers-only') || !clientPreviewChecklistBuilder.includes('workerRuntimeProof') || !clientPreviewChecklistBuilder.includes('auth-identity-gates') || !clientPreviewChecklistBuilder.includes('pricing-billing') || !clientPreviewChecklistBuilder.includes('hosted-deployment-preview') || !clientPreviewChecklistBuilder.includes('/api/audit/client-preview-checklist') || !clientPreviewChecklistBuilder.includes('localTooling') || !clientPreviewChecklistBuilder.includes('netlifyCli: launchReadiness.netlifyCliReadiness') || !clientPreviewChecklistBuilder.includes('readLocalVerificationPacket') || !clientPreviewChecklistBuilder.includes('Local verification packet:') || !clientPreviewChecklistBuilder.includes('Local verification stale source files:') || !clientPreviewChecklistBuilder.includes('Netlify authentication:')) {
  failures.push('src/lib/client-preview-checklist.ts must build a versioned non-secret completion audit across the Kimi shell, backend, auth, pricing, deployment, local Netlify CLI/auth readiness, and next-step required-input/execution-boundary requirements.');
}
if (!clientPreviewChecklistBuilder.includes('raw owner fallback') || !clientPreviewChecklistBuilder.includes('raw owner/gate label') || !clientPreviewChecklistBuilder.includes('raw blocker gate field') || !clientPreviewChecklistBuilder.includes("'legal-owned'") || !clientPreviewChecklistBuilder.includes("'legal gate'") || !clientPreviewChecklistBuilder.includes("'Hosted data gate'") || !clientPreviewChecklistBuilder.includes("'Paid entitlement gate'")) {
  failures.push('src/lib/client-preview-checklist.ts must mirror the customer-safe source leak patterns for raw setup-owner, setup-gate, and blocker-gate labels.');
}
if (!ownerHandoffBriefsBuilder.includes('buildOwnerHandoffBriefs') || !ownerHandoffBriefsBuilder.includes('blockedWorkstreamCount') || !ownerHandoffBriefsBuilder.includes('safeLocalCommands') || !ownerHandoffBriefsBuilder.includes('externalInputCommands') || !clientPreviewChecklistBuilder.includes("@lib/owner-handoff-briefs") || !externalActivationWorkbookBuilder.includes("@lib/owner-handoff-briefs") || !launchHandoffReportBuilder.includes("@lib/owner-handoff-briefs")) {
  failures.push('src/lib/owner-handoff-briefs.ts must be the shared owner handoff helper used by checklist, activation workbook, and launch handoff exports.');
}
for (const routeFile of [
  'src/app/page.tsx',
  'src/app/setup/page.tsx',
  'src/app/review/page.tsx',
  'src/app/claims/page.tsx',
  'src/app/status/page.tsx',
  'src/app/audit/page.tsx',
  'src/app/permissions/page.tsx',
]) {
  if (!clientPreviewChecklistBuilder.includes(routeFile)) {
    failures.push(`src/lib/client-preview-checklist.ts must include ${routeFile} in core client-facing route readiness.`);
  }
}
if (!clientPreviewChecklistBuilder.includes('buildFullAutomationLaunchBlockers') || !clientPreviewChecklistBuilder.includes('fullAutomationLaunchBlockers') || !clientPreviewChecklistBuilder.includes('Paid Full Automation Blockers') || !clientPreviewChecklistBuilder.includes('Paid full automation remains locked until this list is empty')) {
  failures.push('src/lib/client-preview-checklist.ts must include the paid full-automation blocker matrix in JSON and markdown checklist exports.');
}
if (!clientPreviewChecklistBuilder.includes('getBillingCheckoutBlockReason') || !clientPreviewChecklistBuilder.includes('paidCheckoutReady') || !clientPreviewChecklistBuilder.includes('plusMonthlyCheckoutBlock') || !clientPreviewChecklistBuilder.includes('proMonthlyCheckoutBlock')) {
  failures.push('src/lib/client-preview-checklist.ts must block pricing-billing until paid checkout readiness, not just billing infrastructure readiness, is clear.');
}
if (!clientPreviewChecklistRoute.includes('currentUserId') || !clientPreviewChecklistRoute.includes('buildClientPreviewChecklist') || !clientPreviewChecklistRoute.includes('Content-Disposition') || !clientPreviewChecklistRoute.includes('claimbot-client-preview-checklist.json') || !clientPreviewChecklistRoute.includes('Cache-Control') || !clientPreviewChecklistRoute.includes('no-store')) {
  failures.push('src/app/api/audit/client-preview-checklist/route.ts must expose an authenticated no-store JSON client preview checklist export.');
}
if (!netlifyLaunchDoctorExport.includes('claimbot.netlify-launch-doctor-export.v1') || !netlifyLaunchDoctorExport.includes('data/netlify-launch-doctor.json') || !netlifyLaunchDoctorExport.includes('data/netlify-launch-doctor.md') || !netlifyLaunchDoctorExport.includes('does not run Netlify CLI commands from the hosted app') || !netlifyLaunchDoctorExport.includes('without printing tokens, database URLs, checkout URLs, or raw environment values')) {
  failures.push('src/lib/netlify-launch-doctor-receipt.ts must build a versioned non-secret export wrapper around the saved Netlify launch doctor receipt.');
}
if (!netlifyLaunchDoctorRoute.includes('currentUserId') || !netlifyLaunchDoctorRoute.includes('buildNetlifyLaunchDoctorExport') || !netlifyLaunchDoctorRoute.includes('Content-Disposition') || !netlifyLaunchDoctorRoute.includes('claimbot-netlify-launch-doctor.json') || !netlifyLaunchDoctorRoute.includes('Cache-Control') || !netlifyLaunchDoctorRoute.includes('no-store')) {
  failures.push('src/app/api/audit/netlify-launch-doctor/route.ts must expose an authenticated no-store JSON Netlify launch doctor export.');
}
if (!launchHandoffReportBuilder.includes('claimbot.launch-handoff-report.v1') || !launchHandoffReportBuilder.includes('accountScope') || !launchHandoffReportBuilder.includes('account-scoped') || !launchHandoffReportBuilder.includes('handoffOnly') || !launchHandoffReportBuilder.includes('launchPacketStackSummary.ready') || !launchHandoffReportBuilder.includes('getLaunchCriticalPath') || !launchHandoffReportBuilder.includes('buildLaunchActionPlan') || !launchHandoffReportBuilder.includes('ownerHandoffBriefs') || !launchHandoffReportBuilder.includes('Owner Handoff Briefs') || !launchHandoffReportBuilder.includes('safeLocalCommands') || !launchHandoffReportBuilder.includes('externalInputCommands') || !launchHandoffReportBuilder.includes('netlifyCli: launchReadiness.netlifyCliReadiness') || !launchHandoffReportBuilder.includes('readLocalVerificationPacket') || !launchHandoffReportBuilder.includes('Local verification packet:') || !launchHandoffReportBuilder.includes('Local verification stale source files:') || !launchHandoffReportBuilder.includes('src/lib/netlify-cli-readiness.ts') || !launchHandoffReportBuilder.includes('src/lib/netlify-launch-doctor-receipt.ts') || !launchHandoffReportBuilder.includes('/api/audit/launch-handoff') || !launchHandoffReportBuilder.includes('/api/audit/netlify-launch-doctor') || !launchHandoffReportBuilder.includes('markdownLaunchHandoffReport') || !launchHandoffReportBuilder.includes('verificationCommands') || !launchHandoffReportBuilder.includes('operatorNotes')) {
  failures.push('src/lib/launch-handoff-report.ts must build shared versioned account-scoped non-secret JSON and Markdown hosted launch handoff exports from current readiness evidence.');
}
if (!launchHandoffRoute.includes('currentUserId') || !launchHandoffRoute.includes('buildLaunchHandoffReport') || !launchHandoffRoute.includes('Content-Disposition') || !launchHandoffRoute.includes('claimbot-launch-handoff-report.json') || !launchHandoffRoute.includes('Cache-Control') || !launchHandoffRoute.includes('no-store')) {
  failures.push('src/app/api/audit/launch-handoff/route.ts must expose an authenticated no-store JSON launch handoff export.');
}
if (!packageJson.includes('"matcher:receipt"') || !packageJson.includes('scripts/run-matcher-receipt.ts')) {
  failures.push('package.json must expose matcher:receipt for non-secret matcher-run audit proof.');
}
if (!packageJson.includes('"billing:packet"') || !packageJson.includes('scripts/export-billing-activation-packet.ts') || !packageJson.includes('"billing:receipt"') || !packageJson.includes('scripts/run-billing-sync-receipt.ts')) {
  failures.push('package.json must expose billing:packet and billing:receipt for non-secret billing activation proof.');
}
if (!billingActivationPacketExporter.includes('claimbot.billing-activation-packet.v1') || !billingActivationPacketExporter.includes('This packet is not proof that processor setup is complete') || !billingActivationPacketExporter.includes('No secret values were printed.') || !billingActivationPacketExporter.includes('CLAIMBOT_BILLING_PLUS_MONTHLY_URL') || !billingActivationPacketExporter.includes('CLAIMBOT_BILLING_PRO_MONTHLY_URL') || !billingActivationPacketExporter.includes('CLAIMBOT_BILLING_SYNC_SECRET or CLAIMBOT_STRIPE_WEBHOOK_SECRET') || !billingActivationPacketExporter.includes('billing_events.event_id') || !billingActivationPacketExporter.includes('billing-sync-smoke-receipt.json') || !billingActivationPacketExporter.includes('worker-runtime-not-verified') || !billingActivationPacketExporter.includes('paidAutomationWorkerVerified') || !billingActivationPacketExporter.includes('paidAutomationSaleReady') || !billingActivationPacketExporter.includes('approvalBoundary')) {
  failures.push('scripts/export-billing-activation-packet.ts must write a versioned non-secret billing activation packet covering checkout links, signed callbacks, smoke receipts, user references, and idempotency proof.');
}
const billingSyncReceipt = readIfExists('scripts/run-billing-sync-receipt.ts');
if (!billingSyncReceipt.includes('claimbot.billing-sync-smoke-receipt.v1') || !billingSyncReceipt.includes('verifyBillingSyncSignature') || !billingSyncReceipt.includes('verifyStripeWebhookSignature') || !billingSyncReceipt.includes('doesNotApplyEntitlement')) {
  failures.push('scripts/run-billing-sync-receipt.ts must write a non-secret billing sync smoke receipt without applying entitlements.');
}
if (!packageJson.includes('"legal:packet"') || !packageJson.includes('scripts/export-legal-review-packet.ts')) {
  failures.push('package.json must expose legal:packet for the non-secret legal/compliance review packet.');
}
if (!legalReviewPacketExporter.includes('claimbot.legal-review-packet.v1') || !legalReviewPacketExporter.includes('This packet is not approval') || !legalReviewPacketExporter.includes('No secret values were printed.') || !legalReviewPacketExporter.includes('Terms and product boundary') || !legalReviewPacketExporter.includes('Proof-required review flow') || !legalReviewPacketExporter.includes('Authorization and attestation gates') || !legalReviewPacketExporter.includes('Pricing, billing, and paid full automation')) {
  failures.push('scripts/export-legal-review-packet.ts must write a versioned non-secret legal review packet covering product, privacy, proof, authorization, filing, and billing boundaries.');
}
if (!packageJson.includes('"launch:secrets"') || !packageJson.includes('"launch:push-secrets"') || !packageJson.includes('"with:launch-secrets"')) {
  failures.push('package.json must expose launch secret generation, push, and local wrapper commands.');
}
if (!packageJson.includes('"hosted:env:prepare"') || !packageJson.includes('"hosted:env:doctor"') || !packageJson.includes('"hosted:env:doctor:bootstrap"') || !packageJson.includes('"hosted:env:push"') || !packageJson.includes('"hosted:env:push:bootstrap"') || !packageJson.includes('"hosted:db:prepare"') || !packageJson.includes('"hosted:db:doctor"') || !packageJson.includes('"hosted:db:push"') || !packageJson.includes('"with:hosted-env"')) {
  failures.push('package.json must expose hosted env/database prepare, doctor, push, and local wrapper commands.');
}
if (!packageJson.includes('"hosted:db:packet"') || !packageJson.includes('scripts/export-hosted-database-packet.ts')) {
  failures.push('package.json must expose hosted:db:packet for the non-secret hosted database activation packet.');
}
if (!hostedDatabasePacketExporter.includes('claimbot.hosted-database-packet.v1') || !hostedDatabasePacketExporter.includes('This packet is not proof that hosted storage is configured') || !hostedDatabasePacketExporter.includes('No database secret values were printed.') || !hostedDatabasePacketExporter.includes('DATABASE_URL') || !hostedDatabasePacketExporter.includes('databaseSchema') || !hostedDatabasePacketExporter.includes('sourceCatalogExport') || !hostedDatabasePacketExporter.includes('source:import:dry')) {
  failures.push('scripts/export-hosted-database-packet.ts must write a versioned non-secret hosted database packet covering database env, schema probes, source export, and hosted import commands.');
}
if (!packageJson.includes('"operator:packet"') || !packageJson.includes('scripts/export-operator-setup-packet.ts')) {
  failures.push('package.json must expose operator:packet for the non-secret operator setup packet.');
}
if (!operatorSetupPacketExporter.includes('claimbot.operator-setup-packet.v1') || !operatorSetupPacketExporter.includes('This packet is not proof that operator setup is complete') || !operatorSetupPacketExporter.includes('No secret values were printed.') || !operatorSetupPacketExporter.includes('SCRAPER_USER_AGENT') || !operatorSetupPacketExporter.includes('CLAIMBOT_SUPPORT_EMAIL') || !operatorSetupPacketExporter.includes('Netlify Identity proof') || !operatorSetupPacketExporter.includes('identitySetupSteps')) {
  failures.push('scripts/export-operator-setup-packet.ts must write a versioned non-secret operator setup packet covering support, scraper, auth, session/security, and Identity proof.');
}
if (!operatorSetupPacketExporter.includes('operatorActionPlan') || !operatorSetupPacketExporter.includes('Next Operator Actions') || !operatorSetupPacketExporter.includes('Confirm the ClaimBot Netlify account and Identity settings') || !operatorSetupPacketExporter.includes('Prove the paid full-automation worker runtime') || !operatorSetupPacketExporter.includes('data/worker-runtime-packet.md')) {
  failures.push('scripts/export-operator-setup-packet.ts must include a next-operator-actions plan covering Netlify Identity, contact env, auth/security env, worker runtime proof, and handoff regeneration.');
}
if (!packageJson.includes('"preview:packet"') || !packageJson.includes('scripts/export-preview-promotion-packet.ts')) {
  failures.push('package.json must expose preview:packet for the non-secret preview promotion packet.');
}
if (!previewPromotionPacketExporter.includes('claimbot.preview-promotion-packet.v1') || !previewPromotionPacketExporter.includes('This packet is not production approval') || !previewPromotionPacketExporter.includes('No secret values were printed.') || !previewPromotionPacketExporter.includes('evaluateNetlifyPreviewReadiness') || !previewPromotionPacketExporter.includes('evaluatePreviewPromotionReceipt') || !previewPromotionPacketExporter.includes('SMOKE_BASE_URL') || !previewPromotionPacketExporter.includes('preview:gate') || !previewPromotionPacketExporter.includes('production:check-receipt')) {
  failures.push('scripts/export-preview-promotion-packet.ts must write a versioned non-secret preview promotion packet covering target readiness, receipt readiness, smoke inputs, and promotion commands.');
}
if (!packageJson.includes('"validate:routes"') || !packageJson.includes('scripts/validate-next-route-exports.cjs')) {
  failures.push('package.json must expose validate:routes for standalone Next App Router route export hygiene.');
}
if (!routeExportValidator.includes('findNextRouteExportHygieneLeaks') || !routeExportValidator.includes('[validate-next-route-exports] ok') || !routeExportHygieneHelper.includes('routeExportAllowedNames') || !routeExportHygieneHelper.includes('move helpers/types into src/lib')) {
  failures.push('scripts/validate-next-route-exports.cjs and scripts/lib/next-route-export-hygiene.cjs must enforce standalone Next App Router route export hygiene.');
}
if (!packageJson.includes('"local:verify"') || !packageJson.includes('scripts/export-local-verification-packet.cjs')) {
  failures.push('package.json must expose local:verify for the non-secret local verification packet.');
}
if (!localVerificationPacketExporter.includes('claimbot.local-verification-packet.v1') || !localVerificationPacketExporter.includes('No secret values were printed.') || !localVerificationPacketExporter.includes('npm run typecheck') || !localVerificationPacketExporter.includes('npm run validate:routes') || !localVerificationPacketExporter.includes('npm run validate:ui') || !localVerificationPacketExporter.includes('npm run validate:legal') || !localVerificationPacketExporter.includes('npm run responsive:packet') || !localVerificationPacketExporter.includes('npm run kimi:visual:packet') || !localVerificationPacketExporter.includes('npm run audit:support:packet') || !localVerificationPacketExporter.includes('npm run worker:file-claim:receipt') || !localVerificationPacketExporter.includes('npm run smoke:hosted:local') || !localVerificationPacketExporter.includes('customerRenderedCopyGuard') || !localVerificationPacketExporter.includes('forbiddenCustomerHtmlText + page.content()') || !localVerificationPacketExporter.includes('REDACTED_API_KEY') || !localVerificationPacketExporter.includes('data/local-verification-packet.md')) {
  failures.push('scripts/export-local-verification-packet.cjs must write a versioned non-secret local verification packet covering typecheck, validators, build, smokes, and redacted output tails.');
}
if (!localVerificationPacketExporter.includes('tests/unit/launch-handoff.test.ts') || !localVerificationPacketExporter.includes('tests/unit/launch-packet-stack.test.ts') || !localVerificationPacketExporter.includes('tests/unit/client-preview-checklist.test.ts') || !localVerificationPacketExporter.includes('tests/unit/billing-checkout.test.ts') || !localVerificationPacketExporter.includes('tests/unit/hosted-env-push.test.ts') || !localVerificationPacketExporter.includes('tests/integration/billing-checkout-route.test.ts')) {
  failures.push('scripts/export-local-verification-packet.cjs must include launch handoff, packet-stack, client-preview checklist, and billing checkout gate tests in local verification.');
}
if (!kimiVisualPacketExporter.includes("path: '/setup'") || !kimiVisualPacketExporter.includes("path: '/eligibility'") || !kimiVisualPacketExporter.includes("path: '/review'") || !kimiVisualPacketExporter.includes("path: '/trust'") || !kimiVisualPacketExporter.includes("path: '/status'") || !kimiVisualPacketExporter.includes("path: '/audit'") || !kimiVisualPacketExporter.includes("path: '/permissions'") || !kimiVisualPacketExporter.includes("path: '/authorizations'") || !kimiVisualPacketExporter.includes("path: '/profile'") || !kimiVisualPacketExporter.includes("path: '/settings'") || !kimiVisualPacketExporter.includes("path: '/settlements'") || !kimiVisualPacketExporter.includes("path: '/purchases'") || !kimiVisualPacketExporter.includes("path: '/breaches'") || !kimiVisualPacketExporter.includes("path: '/login'") || !kimiVisualPacketExporter.includes("path: '/contact'") || !kimiVisualPacketExporter.includes("path: '/help'") || !kimiVisualPacketExporter.includes("path: '/terms'") || !kimiVisualPacketExporter.includes("path: '/privacy-policy'") || !kimiVisualPacketExporter.includes('prepareLocalVisualDatabase') || !kimiVisualPacketExporter.includes('visualDatabase=temporary-copy') || !kimiVisualPacketExporter.includes('visualClaimSeed=temporary') || !kimiVisualPacketExporter.includes('discoverDynamicRoutes') || !kimiVisualPacketExporter.includes('settlementDetail=checked') || !kimiVisualPacketExporter.includes('claimDetail=checked') || !kimiVisualPacketExporter.includes('requiredAny') || !kimiVisualPacketExporter.includes('Core setup, review, claims, pricing, trust, status, audit, permissions, launch, and packet routes render in the Kimi shell') || !kimiVisualPacketExporter.includes('Extended profile, settings, discovery, evidence, access, support, help, terms, and privacy routes render in the Kimi shell') || !kimiVisualPacketExporter.includes('Eligibility and available settlement/claim detail routes render with real Kimi read-only browsers and guarded action surfaces')) {
  failures.push('scripts/export-kimi-visual-readiness-packet.cjs must capture the expanded core Kimi app workflow with alternate valid route states.');
}
if (!launchHandoffExporter.includes('buildLaunchHandoffReport') || !launchHandoffExporter.includes('markdownLaunchHandoffReport') || !launchHandoffExporter.includes('launch-handoff-report.json') || !launchHandoffExporter.includes('launch-handoff-report.md') || !launchHandoffExporter.includes('Codex-owned product work ready') || !launchHandoffExporter.includes('External product blockers') || !launchHandoffExporter.includes('No secret values were printed.')) {
  failures.push('scripts/export-launch-handoff.ts must write launch handoff JSON and Markdown through the shared non-secret launch handoff builder used by /api/audit/launch-handoff.');
}
if (!launchHandoffReportBuilder.includes('launchActionPlan: {') || !launchHandoffReportBuilder.includes('summary: actionPlanSummary') || !launchHandoffReportBuilder.includes('rows: actionPlan') || !launchHandoffReportBuilder.includes('operatorCommandQueue') || !launchHandoffReportBuilder.includes('Operator Command Queue') || !launchHandoffReportBuilder.includes('ownerHandoffBriefs') || !launchHandoffReportBuilder.includes('localNow') || !launchHandoffReportBuilder.includes('externalRequired') || !launchHandoffReportBuilder.includes('launchActionPlanRows')) {
  failures.push('src/lib/launch-handoff-report.ts must keep launch action plan JSON aligned with the API shape while preserving legacy row access.');
}
if (!launchHandoffBuilder.includes('netlifyIdentityProofBlocker') || !launchHandoffBuilder.includes('Netlify Identity proof is not recorded') || !launchHandoffBuilder.includes('blockers: [netlifyIdentityProofBlocker]')) {
  failures.push('src/lib/launch-handoff.ts must expose missing Netlify Identity proof as an actionable critical-path blocker row.');
}
if (!launchHandoffBuilder.includes('getMatcherReceiptCriticalPathBlockers') || !launchHandoffBuilder.includes("'matcher-proof'") || !launchHandoffBuilder.includes("'matcher-refresh-receipt'") || !launchHandoffBuilder.includes('No account-scoped MATCHER_RUN_COMPLETED receipt')) {
  failures.push('src/lib/launch-handoff.ts must classify missing matcher receipts as launch critical-path blockers.');
}
if (!launchHandoffReportBuilder.includes('ignoredOperatorEnvLoaded') || !launchHandoffReportBuilder.includes('.env.hosted.local') || !launchHandoffReportBuilder.includes('.env.launch.local') || !launchHandoffReportBuilder.includes('no raw env values are written to this export')) {
  failures.push('src/lib/launch-handoff-report.ts must surface ignored hosted/launch env readiness without writing raw env values.');
}
const netlifyProjectSetupReceipt = readIfExists('src/lib/netlify-project-setup-receipt.ts');
if (!netlifyProjectSetupReceipt.includes('identityReady') || !netlifyProjectSetupReceipt.includes('invite-only') || !netlifyProjectSetupReceipt.includes('emailConfirmation')) {
  failures.push('src/lib/netlify-project-setup-receipt.ts must require non-secret Netlify Identity dashboard proof before treating the project setup receipt as complete.');
}
if (!readIfExists('src/lib/launch-readiness.ts').includes('evaluateNetlifyProjectSetupReceipt') || !readIfExists('src/lib/launch-readiness.ts').includes('netlifyProjectSetupReceiptReadiness')) {
  failures.push('src/lib/launch-readiness.ts must expose Netlify project setup receipt readiness to the in-app launch page.');
}
if (!readIfExists('src/lib/launch-readiness.ts').includes('&& netlifyProjectSetupReceiptReadiness.ok')) {
  failures.push('src/lib/launch-readiness.ts must require Netlify project and Identity receipt readiness before clientPreviewReady can be true.');
}
if (!launchSecretPreparer.includes('.env.launch.local') || !launchSecretPreparer.includes('No secret values were printed') || !launchSecretPreparer.includes('randomBytes(48)')) {
  failures.push('scripts/prepare-launch-secrets.cjs must generate ignored local launch secrets without printing values.');
}
if (!launchSecretRunner.includes('.env.launch.local') || !launchSecretRunner.includes('spawnSync') || !launchSecretRunner.includes('expandPowerShellEnvRefs')) {
  failures.push('scripts/run-with-launch-secrets.cjs must load ignored local launch secrets into child process checks.');
}
if (!launchSecretPusher.includes('.env.launch.local') || !launchSecretPusher.includes('--secret') || !launchSecretPusher.includes('No secret values were printed')) {
  failures.push('scripts/push-launch-secrets.cjs must push generated secrets to Netlify without printing values.');
}
if (!hostedDatabasePreparer.includes('.env.hosted.local') || !hostedDatabasePreparer.includes('DATABASE_URL') || !hostedDatabasePreparer.includes('No secret values were printed')) {
  failures.push('scripts/prepare-hosted-database.cjs must create ignored hosted database env without printing values.');
}
if (!hostedEnvPreparer.includes('.env.hosted.example') || !hostedEnvPreparer.includes('.env.hosted.local') || !hostedEnvPreparer.includes('hosted:env:doctor:bootstrap') || !hostedEnvPreparer.includes('hosted:env:push:bootstrap') || !hostedEnvPreparer.includes('hosted:env:doctor') || !hostedEnvPreparer.includes('hosted:env:push') || !hostedEnvPreparer.includes('CLAIMBOT_WORKER_RUNTIME') || !hostedEnvPreparer.includes('CLAIMBOT_WORKER_RUNTIME_RECEIPT') || !hostedEnvPreparer.includes('No secret values were printed')) {
  failures.push('scripts/prepare-hosted-env.cjs must create a full ignored hosted launch env from the template without printing values.');
}
if (!hostedDatabaseDoctor.includes('.env.hosted.local') || !hostedDatabaseDoctor.includes('DATABASE_URL shape') || !hostedDatabaseDoctor.includes('No database secret values were printed')) {
  failures.push('scripts/validate-hosted-database-env.cjs must validate hosted database env without printing values.');
}
if (!packageJson.includes('"hosted:db:receipt"') || !packageJson.includes('scripts/run-hosted-database-receipt.ts') || !readIfExists('scripts/run-hosted-database-receipt.ts').includes('claimbot.hosted-database-smoke-receipt.v1') || !readIfExists('scripts/export-hosted-database-packet.ts').includes('hosted-database-smoke-receipt.json')) {
  failures.push('package.json, scripts/run-hosted-database-receipt.ts, and scripts/export-hosted-database-packet.ts must expose a non-secret hosted database smoke receipt for schema/source import proof.');
}
if (!hostedEnvRunner.includes('.env.hosted.local') || !hostedEnvRunner.includes('.env.launch.local') || !hostedEnvRunner.includes('spawnSync') || !hostedEnvRunner.includes('expandPowerShellEnvRefs')) {
  failures.push('scripts/run-with-hosted-env.cjs must load hosted DB env and launch smoke secrets into child process checks.');
}
if (!hostedEnvPusher.includes('.env.hosted.local') || !hostedEnvPusher.includes('.env.launch.local') || !hostedEnvPusher.includes('--check') || !hostedEnvPusher.includes('--bootstrap') || !hostedEnvPusher.includes('bootstrapMode') || !hostedEnvPusher.includes('finalLaunchRequiredKeys') || !hostedEnvPusher.includes('Bootstrap mode only proves prerequisite hosted runtime env') || !hostedEnvPusher.includes('CLAIMBOT_LEGAL_REVIEW_ACK') || !hostedEnvPusher.includes('CLAIMBOT_BILLING_PLUS_MONTHLY_URL') || !hostedEnvPusher.includes('CLAIMBOT_WORKER_RUNTIME') || !hostedEnvPusher.includes('CLAIMBOT_WORKER_RUNTIME_RECEIPT') || !hostedEnvPusher.includes('must be exactly "verified"') || !hostedEnvPusher.includes('--secret') || !hostedEnvPusher.includes('No secret values were printed')) {
  failures.push('scripts/push-hosted-env.cjs must doctor/push launch-critical hosted env and generated secrets to Netlify without printing values.');
}
if (!hostedDatabasePusher.includes('.env.hosted.local') || !hostedDatabasePusher.includes('DATABASE_AUTH_TOKEN') || !hostedDatabasePusher.includes('--secret') || !hostedDatabasePusher.includes('No database secret values were printed')) {
  failures.push('scripts/push-hosted-database.cjs must push hosted database env to Netlify without printing values.');
}

const validateSchemaScript = readIfExists('scripts/validate-database-schema.ts');
if (!validateSchemaScript.includes('getDatabaseSchemaReadiness') || !validateSchemaScript.includes('[validate-database-schema] failed')) {
  failures.push('scripts/validate-database-schema.ts must fail hosted promotion when schema readiness probes fail.');
}

const validateSourceScript = readIfExists('scripts/validate-source-catalog.ts');
if (!validateSourceScript.includes('getSourceCatalogReadiness') || !validateSourceScript.includes('--strict-quality') || !validateSourceScript.includes('source import digest') || !validateSourceScript.includes('[validate-source-catalog] failed')) {
  failures.push('scripts/validate-source-catalog.ts must fail public-discovery promotion when source catalog readiness fails, with strict source quality and source import digest visibility available.');
}

const sourceCatalogTransfer = readIfExists('src/lib/source-catalog-transfer.ts');
if (!sourceCatalogTransfer.includes('SOURCE_CATALOG_BUNDLE_FORMAT') || !sourceCatalogTransfer.includes('SOURCE_CATALOG_IMPORTED') || !sourceCatalogTransfer.includes('canonicalKey') || !sourceCatalogTransfer.includes('sourceCatalogDigestPath') || !sourceCatalogTransfer.includes('digest mismatch') || !sourceCatalogTransfer.includes('sha256Digest: result.sha256Digest')) {
  failures.push('src/lib/source-catalog-transfer.ts must support audited source catalog export/import by canonicalKey with digest receipt verification and import audit lineage.');
}

const validateLegalScript = readIfExists('scripts/validate-legal-readiness.cjs');
if (!validateLegalScript.includes('ClaimBot does not provide legal advice') || !validateLegalScript.includes('No payout percentage') || !validateLegalScript.includes('automatic category authorization is disabled')) {
  failures.push('scripts/validate-legal-readiness.cjs must protect legal advice, paid full automation, and manual authorization boundaries.');
}

const previewPromotionGate = readIfExists('scripts/preview-promotion-gate.cjs');
if (!previewPromotionGate.includes('--check-env-only') || !previewPromotionGate.includes('CLAIMBOT_LEGAL_REVIEW_ACK') || !previewPromotionGate.includes('SMOKE_BASE_URL') || !previewPromotionGate.includes('validate:legal') || !previewPromotionGate.includes('source:import:dry') || !previewPromotionGate.includes('validate:source:strict') || !previewPromotionGate.includes('smoke:auth') || !previewPromotionGate.includes('smoke:features')) {
  failures.push('scripts/preview-promotion-gate.cjs must gate deployed previews on hosted env, legal readiness, source transfer dry-run, strict source quality, auth smoke, and feature smoke.');
}
if (!previewPromotionGate.includes('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH must stay true')) {
  failures.push('scripts/preview-promotion-gate.cjs must keep settlement discovery enabled for client preview promotion.');
}
if (
  !previewPromotionGate.includes("'enrich:source',\r\n      'source:export',\r\n      'validate:source:strict',\r\n      'source:import:dry'")
  && !previewPromotionGate.includes("'enrich:source',\n      'source:export',\n      'validate:source:strict',\n      'source:import:dry'")
) {
  failures.push('scripts/preview-promotion-gate.cjs must export the enriched source catalog before strict source readiness and source:import:dry in the deployed preview gate.');
}

const healthRoute = readIfExists('src/app/api/health/route.ts');
if (!healthRoute.includes('getDatabaseSchemaReadiness') || !healthRoute.includes('identitySubject') || !healthRoute.includes('billingLedger')) {
  failures.push('src/app/api/health/route.ts must include schema readiness probes without exposing tenant data.');
}

const smokeWebApp = readIfExists('scripts/smoke-webapp.cjs');
if (!smokeWebApp.includes('Production promotion receipt') || !smokeWebApp.includes('data/preview-promotion-receipt.json') || !smokeWebApp.includes('npm run production:check-receipt')) {
  failures.push('scripts/smoke-webapp.cjs must assert the visible /launch production promotion receipt panel.');
}
if (!smokeWebApp.includes('SMOKE_STRICT_CACHE_HEADERS') || !smokeWebApp.includes('no-store, must-revalidate') || !smokeWebApp.includes('isLocalhostTarget')) {
  failures.push('scripts/smoke-webapp.cjs must distinguish Next dev cache headers from strict hosted cache-header assertions.');
}
if (!smokeWebApp.includes('customerCopyGuardedPaths') || !smokeWebApp.includes("'/authorizations'") || !smokeWebApp.includes('forbiddenCustomerCopyText') || !smokeWebApp.includes('forbiddenCustomerHtmlText') || !smokeWebApp.includes('page.content()') || !smokeWebApp.includes('customer page exposes internal copy') || !smokeWebApp.includes('customer page serializes internal copy') || !smokeWebApp.includes("'npm run'") || !smokeWebApp.includes("'operator'") || !smokeWebApp.includes("'/api/audit'") || !smokeWebApp.includes("'CLAIMBOT_'") || !smokeWebApp.includes("'DATABASE_URL'") || !smokeWebApp.includes("'Codex can'") || !smokeWebApp.includes("'executionBoundary'") || !smokeWebApp.includes("'execution boundary'") || !smokeWebApp.includes("'operator-owned'") || !smokeWebApp.includes("'business-owned'") || !smokeWebApp.includes("'deployment-owned'") || !smokeWebApp.includes("'business gate'") || !smokeWebApp.includes("'deployment gate'") || !smokeWebApp.includes("'Hosted data gate'") || !smokeWebApp.includes("'Paid entitlement gate'") || !smokeWebApp.includes("'External infrastructure setup'") || !smokeWebApp.includes("'Netlify'") || !smokeWebApp.includes("'auth token'") || !smokeWebApp.includes("'billing secret'") || !smokeWebApp.includes("'webhook secret'") || !smokeWebApp.includes("'setup locks'") || !smokeWebApp.includes("'Setup boundary'") || !smokeWebApp.includes("'Support setup pending'") || !smokeWebApp.includes("'setup items left'") || !smokeWebApp.includes("'setup-backed'") || !smokeWebApp.includes("'active blockers'") || !smokeWebApp.includes("'blockers remain'") || !smokeWebApp.includes("'Customer access: blocked'") || !smokeWebApp.includes("'No external setup blocker'") || !smokeWebApp.includes("'Hands-off paid filing still blocked'") || !smokeWebApp.includes("'business setup still'") || !smokeWebApp.includes("'operator-proof-note'") || !smokeWebApp.includes("'contact-operator-drawer'") || !smokeWebApp.includes("'profile-advanced-drawer'") || !smokeWebApp.includes("'legal-review-not-recorded'") || !smokeWebApp.includes("'worker-runtime-not-verified'") || !smokeWebApp.includes("'Operator account settings'") || !smokeWebApp.includes("'Netlify Identity proof'") || !smokeWebApp.includes("'netlify-identity-proof'") || !smokeWebApp.includes("'data/worker-runtime-packet.md'") || !smokeWebApp.includes("'data/billing-activation-packet.md'") || !smokeWebApp.includes("'data/preview-promotion-packet.md'")) {
  failures.push('scripts/smoke-webapp.cjs must reject internal/operator command copy in visible text and serialized HTML on normal customer-facing routes.');
}
if (!smokeWebApp.includes('customerVisibleCopyGuard') || !smokeWebApp.includes('customerSerializedCopyGuard') || !smokeWebApp.includes('customerLaunchTerminologyGuard') || !smokeWebApp.includes('discoverSettlementDetailPages') || !smokeWebApp.includes('discoverClaimDetailPages') || !smokeWebApp.includes("route.customerVisibleCopyGuard") || !smokeWebApp.includes("route.customerSerializedCopyGuard") || !smokeWebApp.includes("route.customerLaunchTerminologyGuard") || !smokeWebApp.includes("'client preview checklist'") || !smokeWebApp.includes("'customer preview'") || !smokeWebApp.includes("'customer invites'") || !smokeWebApp.includes("'sharing a preview'") || !smokeWebApp.includes("'preview clear'") || !smokeWebApp.includes("'Customer scope'") || smokeWebApp.includes("'Client scope'") || !smokeWebApp.includes("'Protected final-check run'") || smokeWebApp.includes("'Protected Session'") || !smokeWebApp.includes("'History Active'") || smokeWebApp.includes("'Audit Active'")) {
  failures.push('scripts/smoke-webapp.cjs must enforce customer-safe copy on dynamic settlement and claim detail pages without preview/client/audit-console language.');
}
if (!smokeHostedAuth.includes('identitySubject') || !smokeHostedAuth.includes('billingLedger') || !smokeHostedAuth.includes('schema checks to be ok')) {
  failures.push('scripts/smoke-hosted-auth.cjs must assert health schema readiness during hosted auth smoke tests.');
}
if (!smokeHostedAuth.includes('/api/audit/support-packet') || !smokeHostedAuth.includes('databaseSchema') || !smokeHostedAuth.includes('billing-event-ledger')) {
  failures.push('scripts/smoke-hosted-auth.cjs must verify authenticated support-packet schema launch evidence.');
}
if (!smokeHostedAuth.includes('sourceCatalog') || !smokeHostedAuth.includes('formCoveragePercent') || !smokeHostedAuth.includes('deadlineCoveragePercent') || !smokeHostedAuth.includes('textEncodingReady') || !smokeHostedAuth.includes('mojibakeCount') || !smokeHostedAuth.includes('claim-form coverage')) {
  failures.push('scripts/smoke-hosted-auth.cjs must verify authenticated support-packet source catalog, source quality, and text encoding launch evidence.');
}
if (!smokeHostedAuth.includes('netlifyPreview') || !smokeHostedAuth.includes('netlify-site-link') || !smokeHostedAuth.includes('smoke-base-url')) {
  failures.push('scripts/smoke-hosted-auth.cjs must verify authenticated support-packet Netlify preview promotion evidence.');
}
if (!smokeHostedAuth.includes('previewPromotionReceipt') || !smokeHostedAuth.includes('preview-promotion-receipt') || !smokeHostedAuth.includes('receipt-command-coverage')) {
  failures.push('scripts/smoke-hosted-auth.cjs must verify authenticated support-packet preview promotion receipt evidence.');
}
if (!smokeHostedAuth.includes('netlifyProjectSetupReceipt') || !smokeHostedAuth.includes('identityReady')) {
  failures.push('scripts/smoke-hosted-auth.cjs must verify authenticated support-packet Netlify project setup and Identity receipt evidence.');
}
if (!smokeHostedAuth.includes('/api/audit/external-activation-workbook') || !smokeHostedAuth.includes('anonymous activation workbook export') || !smokeHostedAuth.includes('claimbot.external-activation-workbook.v1') || !smokeHostedAuth.includes('workbookOnly') || !smokeHostedAuth.includes('externalActivationWorkbook')) {
  failures.push('scripts/smoke-hosted-auth.cjs must verify authenticated and anonymous external activation workbook export behavior.');
}
if (!smokeHostedAuth.includes('/api/audit/client-preview-checklist') || !smokeHostedAuth.includes('anonymous client preview checklist export') || !smokeHostedAuth.includes('claimbot.client-preview-checklist.v1') || !smokeHostedAuth.includes('clientPreviewChecklist') || !smokeHostedAuth.includes('commandQueue') || !smokeHostedAuth.includes('localNow') || !smokeHostedAuth.includes('externalRequired') || !smokeHostedAuth.includes('kimi-visual-system') || !smokeHostedAuth.includes('hosted-deployment-preview')) {
  failures.push('scripts/smoke-hosted-auth.cjs must verify authenticated and anonymous client preview checklist export behavior.');
}
if (!smokeHostedAuth.includes('/api/audit/launch-handoff') || !smokeHostedAuth.includes('anonymous launch handoff export') || !smokeHostedAuth.includes('claimbot.launch-handoff-report.v1') || !smokeHostedAuth.includes('handoffOnly') || !smokeHostedAuth.includes('launchActionPlan') || !smokeHostedAuth.includes('operatorCommandQueue') || !smokeHostedAuth.includes('expected Netlify launch doctor hosted export path in packet stack')) {
  failures.push('scripts/smoke-hosted-auth.cjs must verify authenticated and anonymous launch handoff export behavior.');
}
if (!smokeHostedAuth.includes('/api/audit/netlify-launch-doctor') || !smokeHostedAuth.includes('anonymous Netlify launch doctor export') || !smokeHostedAuth.includes('claimbot.netlify-launch-doctor-export.v1') || !smokeHostedAuth.includes('claimbot.netlify-launch-doctor.v1') || !smokeHostedAuth.includes('supportNetlifyLaunchDoctorExport')) {
  failures.push('scripts/smoke-hosted-auth.cjs must verify authenticated and anonymous Netlify launch doctor export behavior and support-packet embedding.');
}
if (!smokeHostedAuth.includes('deployed preview must prove the hosted source catalog is imported') || !smokeHostedAuth.includes('sourceQualityReady') || !smokeHostedAuth.includes('claimFormCoverageReady') || !smokeHostedAuth.includes('clean text-encoding readiness')) {
  failures.push('scripts/smoke-hosted-auth.cjs must fail deployed previews whose hosted database lacks imported source-catalog and clean text readiness.');
}
if (!smokeHostedAuth.includes('importSmokeSourceCatalog') || !smokeHostedAuth.includes('data/source-catalog-export.json')) {
  failures.push('scripts/smoke-hosted-auth.cjs must import the source catalog bundle into its isolated local hosted-auth smoke database.');
}

if (!smokeFeatureFlags.includes('health schema readiness') || !smokeFeatureFlags.includes('identitySubject') || !smokeFeatureFlags.includes('billingLedger')) {
  failures.push('scripts/smoke-feature-flags.cjs must wait for health schema readiness before running feature-gate checks.');
}
if (!smokeFeatureFlags.includes('migrateSmokeDatabase') || !smokeFeatureFlags.includes('feature-smoke.db') || !smokeFeatureFlags.includes('cleanupSmokeTmpDir')) {
  failures.push('scripts/smoke-feature-flags.cjs must migrate and clean up an isolated local feature-smoke database.');
}
if (!smokeFeatureFlags.includes('Deployed feature-flag smoke requires CLAIMBOT_SESSION_SECRET') || !smokeFeatureFlags.includes('signedSessionCookie') || !smokeFeatureFlags.includes('extraHTTPHeaders: authHeaders()')) {
  failures.push('scripts/smoke-feature-flags.cjs must authenticate deployed preview feature-flag checks with a signed app session.');
}
if (!smokeFeatureFlags.includes('readProfileBootstrapFeatureState') || !smokeFeatureFlags.includes('Settlement search is enabled on this target') || !smokeFeatureFlags.includes('feature flag posture checks passed')) {
  failures.push('scripts/smoke-feature-flags.cjs must adapt deployed preview checks to the active settlement and breach feature posture.');
}

const launchReadiness = readIfExists('src/lib/launch-readiness.ts');
const netlifyCliReadiness = readIfExists('src/lib/netlify-cli-readiness.ts');
const ignoredOperatorEnv = readIfExists('src/lib/ignored-operator-env.ts');
if (!ignoredOperatorEnv.includes('loadIgnoredOperatorEnvForReadiness') || !ignoredOperatorEnv.includes('.env.hosted.local') || !ignoredOperatorEnv.includes('.env.launch.local') || !ignoredOperatorEnv.includes('process.env[key] = value')) {
  failures.push('src/lib/ignored-operator-env.ts must load non-placeholder ignored hosted/launch env values for server-side readiness without printing values.');
}
if (!launchReadiness.includes('loadIgnoredOperatorEnvForReadiness') || !launchReadiness.includes('ignoredOperatorEnvLoaded') || !launchReadiness.includes('ignoredOperatorEnvAvailable')) {
  failures.push('src/lib/launch-readiness.ts must load ignored hosted/launch env files before deriving hosted launch readiness.');
}
if (!launchReadiness.includes('getDatabaseSchemaReadiness') || !launchReadiness.includes('databaseSchemaReady')) {
  failures.push('src/lib/launch-readiness.ts must include database schema readiness in hosted launch blockers.');
}
if (!launchReadiness.includes('CLAIMBOT_LEGAL_REVIEW_ACK')) {
  failures.push('src/lib/launch-readiness.ts must pass legal/compliance review acknowledgment into hosted readiness.');
}
if (!launchReadiness.includes('getSourceCatalogReadiness') || !launchReadiness.includes('sourceQualityRequired: true') || !launchReadiness.includes('clientPreviewReady')) {
  failures.push('src/lib/launch-readiness.ts must include strict source catalog readiness in client-preview launch blockers.');
}
if (!launchReadiness.includes('netlifyPreviewBlockers') || !launchReadiness.includes('netlifyPreviewWarnings') || !launchReadiness.includes('&& netlifyPreviewReadiness.ok')) {
  failures.push('src/lib/launch-readiness.ts must count deployed Netlify preview readiness in launch blockers and client-preview readiness.');
}
if (!launchReadiness.includes('evaluateNetlifyCliReadiness') || !launchReadiness.includes('netlifyCliReadiness') || !netlifyCliReadiness.includes("key: 'netlify-auth'") || !netlifyCliReadiness.includes("runNetlify(['status'])")) {
  failures.push('src/lib/launch-readiness.ts must expose Netlify CLI authentication readiness to the live launch UI and generated client-preview checklist.');
}
if (!launchReadiness.includes('evaluatePreviewPromotionReceipt') || !launchReadiness.includes('previewPromotionReceiptBlockers')) {
  failures.push('src/lib/launch-readiness.ts must merge preview promotion receipt readiness into production launch blockers.');
}
if (!launchReadiness.includes('evaluatePwaReadiness') || !launchReadiness.includes('pwaReadiness') || !launchReadiness.includes('&& pwaReadiness.ok')) {
  failures.push('src/lib/launch-readiness.ts must count PWA install/offline readiness in launch blockers and client-preview readiness.');
}

const hostedReadiness = readIfExists('src/lib/hosted-readiness.ts');
if (!hostedReadiness.includes('legalReviewAck') || !hostedReadiness.includes('legal-review') || !hostedReadiness.includes('CLAIMBOT_LEGAL_REVIEW_ACK')) {
  failures.push('src/lib/hosted-readiness.ts must gate hosted launch on legal/compliance review acknowledgment.');
}
if (!hostedReadiness.includes('settlementSearchFeatureEnabled') || !hostedReadiness.includes('settlement-search-feature') || !hostedReadiness.includes('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH must stay enabled')) {
  failures.push('src/lib/hosted-readiness.ts must fail hosted launch when settlement discovery is disabled.');
}

const supportPacket = readIfExists('src/lib/audit/support-packet.ts');
if (!supportPacket.includes('launchEvidence') || !supportPacket.includes('maskedEnvironment')) {
  failures.push('src/lib/audit/support-packet.ts must include masked launch evidence in support exports.');
}
if (!supportPacket.includes('evaluatePwaReadiness') || !supportPacket.includes('pwaReadiness')) {
  failures.push('src/lib/audit/support-packet.ts must include PWA install/offline readiness in support-packet launch evidence.');
}
if (!supportPacket.includes('databaseSchema') || !supportPacket.includes('getDatabaseSchemaReadiness') || !supportPacket.includes('npm run db:migrate')) {
  failures.push('src/lib/audit/support-packet.ts must include database schema readiness evidence and migration remediation in support exports.');
}
if (!supportPacket.includes('sourceCatalog') || !supportPacket.includes('getSourceCatalogReadiness') || !supportPacket.includes('formCoveragePercent') || !supportPacket.includes('deadlineCoveragePercent') || !supportPacket.includes('textEncodingReady') || !supportPacket.includes('mojibakeCount') || !supportPacket.includes('latestSourceImportDigest')) {
  failures.push('src/lib/audit/support-packet.ts must include source catalog, claim-form coverage, source quality, text encoding, and source import digest readiness in support exports.');
}
if (!supportPacket.includes('evaluateNetlifyPreviewReadiness') || !supportPacket.includes('netlifyPreview')) {
  failures.push('src/lib/audit/support-packet.ts must include Netlify preview promotion readiness in launch evidence.');
}
if (!supportPacket.includes('evaluateNetlifyCliReadiness') || !supportPacket.includes('netlifyCliReadiness') || !supportPacket.includes('localTooling') || !supportPacket.includes('netlifyCli: netlifyCliReadiness')) {
  failures.push('src/lib/audit/support-packet.ts must include Netlify CLI/auth readiness in support-packet launch evidence and critical path.');
}
if (!supportPacket.includes('readLocalVerificationPacket') || !supportPacket.includes('localVerificationReceipt') || !supportPacket.includes('localVerificationPacket: localVerificationReceipt')) {
  failures.push('src/lib/audit/support-packet.ts must include the parsed local verification receipt under support-packet local tooling evidence.');
}
if (!supportPacket.includes('evaluateNetlifyProjectSetupReceipt') || !supportPacket.includes('netlifyProjectSetupReceipt') || !supportPacket.includes('identityReady')) {
  failures.push('src/lib/audit/support-packet.ts must include Netlify project setup and Identity receipt readiness in launch evidence.');
}
if (!supportPacket.includes('relativeEvidencePath') || !supportPacket.includes('path.relative(root, filePath)') || !supportPacket.includes('previewPromotionReceiptReadiness.receiptPath')) {
  failures.push('src/lib/audit/support-packet.ts must expose receipt paths as repo-relative evidence paths, not absolute server paths.');
}
if (!supportPacket.includes('evaluatePreviewPromotionReceipt') || !supportPacket.includes('previewPromotionReceipt')) {
  failures.push('src/lib/audit/support-packet.ts must include preview promotion receipt readiness in launch evidence.');
}
if (!supportPacket.includes('matcherRunReceipt') || !supportPacket.includes('getMatcherReceiptCriticalPathBlockers') || !supportPacket.includes('MATCHER_RUN_COMPLETED') || !supportPacket.includes('settlementsProcessed') || !supportPacket.includes('verdictsChanged')) {
  failures.push('src/lib/audit/support-packet.ts must include the latest redacted matcher-run receipt and missing-receipt critical-path blocker in launch evidence.');
}
if (!supportPacket.includes('getLaunchCriticalPath') || !supportPacket.includes('launchCriticalPath')) {
  failures.push('src/lib/audit/support-packet.ts must include ordered launch critical-path evidence in support exports.');
}
if (!smokeHostedAuth.includes('launchCriticalPath') || !smokeHostedAuth.includes('Netlify Identity proof') || !smokeHostedAuth.includes('Preview promotion receipt') || !smokeHostedAuth.includes('matcherRunReceipt')) {
  failures.push('scripts/smoke-hosted-auth.cjs must verify authenticated support-packet launch critical-path evidence.');
}
if (!smokeHostedAuth.includes('localVerificationPacket') || !smokeHostedAuth.includes('localVerificationReceiptReady') || !smokeHostedAuth.includes('does not prove Netlify account setup') || !smokeHostedAuth.includes('data/local-verification-packet.md')) {
  failures.push('scripts/smoke-hosted-auth.cjs must verify authenticated support-packet local verification evidence.');
}
if (!smokeHostedAuth.includes('hasParsedLocalVerificationReceipt') || !smokeHostedAuth.includes('activationWorkbookLocalTooling?.localVerificationPacket') || !smokeHostedAuth.includes('clientPreviewLocalTooling?.localVerificationPacket') || !smokeHostedAuth.includes('launchHandoffLocalTooling?.localVerificationPacket')) {
  failures.push('scripts/smoke-hosted-auth.cjs must verify parsed local verification receipts across activation workbook, client preview checklist, and launch handoff exports.');
}
if (!supportPacket.includes('planGate') || !supportPacket.includes('5 guarded filings per month')) {
  failures.push('src/lib/audit/support-packet.ts must include paid plan-gate evidence in support exports.');
}
if (!supportPacket.includes('billing') || !supportPacket.includes('getBillingReadiness')) {
  failures.push('src/lib/audit/support-packet.ts must include billing checkout readiness in launch evidence.');
}
if (!supportPacket.includes('automationControls') || !supportPacket.includes('SETUP_SHADOW_REVIEW_ACK') || !supportPacket.includes('QUEUE_TRUST_LOCK_ACK') || !supportPacket.includes('BILLING_CHECKOUT_STARTED') || !supportPacket.includes('billing_events.event_id')) {
  failures.push('src/lib/audit/support-packet.ts must include setup, queue trust-lock, file-action, and billing idempotency evidence in launch exports.');
}
if (!supportPacket.includes("workerJobType: 'file_claim'") || !supportPacket.includes("jobEnqueueEventType: 'JOB_ENQUEUED'") || !supportPacket.includes("jobPayloadAutomationMode: 'full_guarded'") || !supportPacket.includes("resultFields: ['jobsEnqueued', 'jobsReused']") || !supportPacket.includes('existingQueuedClaimsRearmed: true')) {
  failures.push('src/lib/audit/support-packet.ts must export worker-job receipt fields for paid full automation queue controls.');
}
if (!supportPacket.includes('appendsStableUserReference') || !supportPacket.includes('client_reference_id') || !supportPacket.includes('claimbot_user_<id>')) {
  failures.push('src/lib/audit/support-packet.ts must prove billing checkout handoffs append stable user references for processor callbacks.');
}
if (!supportPacket.includes('getBillingCheckoutBlockReason') || !supportPacket.includes('paidCheckoutReady') || !supportPacket.includes('requiredPaidCheckoutReady') || !supportPacket.includes('checkoutBlockReasons') || !supportPacket.includes('legal-review-not-recorded')) {
  failures.push('src/lib/audit/support-packet.ts must distinguish processor billing readiness from paid checkout readiness and preserve legal-review checkout locks.');
}
if (!supportPacket.includes('CLAIMBOT_LEGAL_REVIEW_ACK')) {
  failures.push('src/lib/audit/support-packet.ts must include legal/compliance review acknowledgment in launch evidence.');
}
if (!supportPacket.includes('launchPacketStack') || !supportPacket.includes('localVerificationPacket') || !supportPacket.includes('data/local-verification-packet.md') || !supportPacket.includes('externalActivationWorkbook') || !supportPacket.includes('clientPreviewChecklist') || !supportPacket.includes('launchHandoffReport') || !supportPacket.includes('netlifyLaunchDoctor') || !supportPacket.includes('netlifyLaunchDoctorExport') || !supportPacket.includes('hostedExportPaths') || !supportPacket.includes('/api/audit/external-activation-workbook') || !supportPacket.includes('/api/audit/client-preview-checklist') || !supportPacket.includes('/api/audit/launch-handoff') || !supportPacket.includes('/api/audit/netlify-launch-doctor')) {
  failures.push('src/lib/audit/support-packet.ts must include launch packet stack, Netlify launch doctor, external activation workbook, client preview checklist, and launch handoff evidence in support exports.');
}
if (!supportPacket.includes('buildFullAutomationLaunchBlockers') || !supportPacket.includes('fullAutomationLaunchBlockers') || !supportPacket.includes('Paid full automation remains locked until this list is empty')) {
  failures.push('src/lib/audit/support-packet.ts must include the paid full-automation launch blocker matrix in support exports.');
}
if (!supportPacket.includes('buildLaunchActionPlan') || !supportPacket.includes('buildLaunchCommandQueue') || !supportPacket.includes('summarizeLaunchActionPlan') || !supportPacket.includes('execution boundaries') || !supportPacket.includes('launchActionPlan')) {
  failures.push('src/lib/audit/support-packet.ts must include the launch action plan with execution boundaries in support exports.');
}
if (!supportPacket.includes('buildOwnerHandoffBriefs') || !supportPacket.includes('ownerHandoffBriefs') || !supportPacket.includes('launchActionCommandQueue') || !supportPacket.includes('safeLocalCommands') || !supportPacket.includes('externalInputCommands')) {
  failures.push('src/lib/audit/support-packet.ts must include owner handoff briefs in support exports so operators can group blocked launch work by owner.');
}
const packetsPage = readIfExists('src/app/packets/page.tsx');
const packetCenterBrowser = readIfExists('src/app/packets/PacketCenterBrowser.tsx');
if (!packetsPage.includes('buildLaunchEvidence') || !packetsPage.includes('readLatestMatcherRunReceipt') || !packetsPage.includes('Support packet evidence') || !packetsPage.includes('Matcher refresh receipt') || !packetsPage.includes('MATCHER_RUN_COMPLETED') || !packetsPage.includes('launchCriticalPath') || !packetsPage.includes('/api/audit/support-packet') || !packetsPage.includes('/api/audit/external-activation-workbook') || !packetsPage.includes('/api/audit/client-preview-checklist') || !packetsPage.includes('/api/audit/launch-handoff') || !packetsPage.includes('/api/audit/netlify-launch-doctor')) {
  failures.push('src/app/packets/page.tsx must surface support-packet launch critical-path and matcher-run receipt evidence with export access.');
}
if (!packetsPage.includes('supportPacketActionPlan') || !packetsPage.includes('Client preview action plan') || !packetsPage.includes('Blocked workstreams are exportable') || !packetsPage.includes('Execution boundary:') || !packetsPage.includes('Required inputs:') || !packetsPage.includes('step.requiredInputs') || !packetsPage.includes('step.commands[0]') || !packetsPage.includes('support-action-plan-grid')) {
  failures.push('src/app/packets/page.tsx must render the support-packet launch action plan with execution boundaries and required external inputs.');
}
if (!packetsPage.includes('setupAutomationControls') || !packetsPage.includes('Terms check audited') || !packetsPage.includes('User consent receipt') || !packetsPage.includes('termsEventType')) {
  failures.push('src/app/packets/page.tsx must surface the support-packet user Terms acknowledgement gate alongside packet evidence.');
}
if (!packetsPage.includes('Paid checkout receipt') || !packetsPage.includes('paidCheckoutReady') || !packetsPage.includes('paymentProcessorReady') || !packetsPage.includes('checkoutBlockReasons') || !packetsPage.includes('expectedBlockReasonWhenLegalReviewMissing')) {
  failures.push('src/app/packets/page.tsx must visibly separate processor billing readiness from paid checkout readiness in support-packet evidence.');
}
if (!packetsPage.includes('<PacketCenterBrowser rows={packetRows} />') || !packetsPage.includes('readinessTone: readiness.tone') || !packetsPage.includes('artifactCount: artifacts')) {
  failures.push('src/app/packets/page.tsx must feed real packet readiness, artifact, authorization, and audit evidence into the interactive packet browser.');
}
if (!packetsPage.includes('schema.jobs') || !packetsPage.includes("eq(schema.jobs.type, 'file_claim')") || !packetsPage.includes('latestWorkerJobByClaimId') || !packetsPage.includes('activeWorkerJobCount') || !packetsPage.includes('Automation runs')) {
  failures.push('src/app/packets/page.tsx must surface real file_claim worker job lifecycle evidence across claim packets.');
}
if (!packetCenterBrowser.includes('Paid automation run receipt') || !packetCenterBrowser.includes('Automation run error') || !packetCenterBrowser.includes('workerJobStatus') || !packetCenterBrowser.includes('workerJobCadence')) {
  failures.push('src/app/packets/PacketCenterBrowser.tsx must render worker-job lifecycle receipts for packet review.');
}
if (!packetsPage.includes('buildFullAutomationLaunchBlockers') || !packetsPage.includes('Paid full automation blockers') || !packetsPage.includes('These packets still lock hands-off paid filing') || !packetsPage.includes('Packet proof clears paid automation') || !packetsPage.includes('blocker.proofBoundary')) {
  failures.push('src/app/packets/page.tsx must show packet-level paid full-automation blockers and proof boundaries before the packet browser.');
}
if (!packetsPage.includes('Packet preparation runway') || !packetsPage.includes('Documentation Checklist') || !packetsPage.includes('Review Your Claim Packet') || !packetsPage.includes('Ready for Final Approval') || !packetsPage.includes('read-only runway') || !packetsPage.includes('proofReviewCount') || !packetsPage.includes('formReadyCount') || !packetsPage.includes('authorizationActiveCount')) {
  failures.push('src/app/packets/page.tsx must preserve the Kimi claim-packet runway with real proof, form, authorization, and approval-boundary counts.');
}
if (!packetCenterBrowser.includes('Find a claim packet to review') || !packetCenterBrowser.includes('ClaimBot keeps proof and permission') || !packetCenterBrowser.includes('Download packet record') || !packetCenterBrowser.includes('status-filter-tabs') || !packetCenterBrowser.includes('aria-expanded={isExpanded}')) {
  failures.push('src/app/packets/PacketCenterBrowser.tsx must render customer-ready, searchable, filterable, expandable Kimi-style packet cards without changing proof gates.');
}
const trustPage = readIfExists('src/app/trust/page.tsx');
const trustComplianceBrowser = readIfExists('src/app/trust/TrustComplianceBrowser.tsx');
if (!trustPage.includes('buildLaunchEvidence') || !trustPage.includes('readLatestMatcherRunReceipt') || !trustPage.includes('Support readiness evidence') || !trustPage.includes('Match refresh status') || !trustPage.includes('recent match refresh can be checked by support') || !trustPage.includes('Support can see the important status') || !trustPage.includes('launchCriticalPath') || !trustPage.includes('/packets')) {
  failures.push('src/app/trust/page.tsx must surface support-packet launch critical-path and matcher-run receipt evidence while routing raw exports to Packet Center.');
}
if (!trustPage.includes('buildClientPreviewChecklist') || !trustPage.includes('Customer access readiness') || !trustPage.includes('/packets') || !trustPage.includes('/launch') || !trustPage.includes('Product readiness') || !trustPage.includes('Setup checklist') || !trustPage.includes('Next setup item') || !trustPage.includes('nextExternalProof') || !trustPage.includes('Next setup trust boundary') || !trustPage.includes('blockedClientPreviewActionRows') || !trustPage.includes('Customer access setup plan') || !trustPage.includes('Remaining setup is traceable') || !trustPage.includes('clientPreviewChecklist.launchActionPlan.summary.blockedSteps') || !trustPage.includes('Setup details stay in Launch and Packet Center') || !trustPage.includes('executionBoundary') || !trustPage.includes('clientSafeLaunchAction') || !trustPage.includes('clientSafeLaunchLabel') || !trustPage.includes('clientSafeLaunchLabel(nextExternalProof)') || !trustPage.includes('clientSafeRequiredInputSummary') || !trustPage.includes('clientSafeProofArtifactSummary')) {
  failures.push('src/app/trust/page.tsx must surface the client-preview checklist evidence and next external proof execution boundaries while routing raw commands and exports to Launch/Packet Center.');
}
if (!trustPage.includes('paidAutomationBlockers') || !trustPage.includes('Paid automation readiness') || !trustPage.includes('Hands-off paid filing still needs setup') || !trustPage.includes('Pro can only run eligible no-proof claims hands-off') || !trustPage.includes('clientPreviewChecklist.fullAutomationLaunchBlockers')) {
  failures.push('src/app/trust/page.tsx must surface paid full-automation launch blockers from the client-preview checklist.');
}
if (!trustPage.includes('setupAutomationControls') || !trustPage.includes('User consent status') || !trustPage.includes('Terms acknowledgement') || !trustPage.includes('termsEventType')) {
  failures.push('src/app/trust/page.tsx must surface the support-packet user Terms acknowledgement gate in the Trust Center.');
}
if (!trustPage.includes('Paid checkout status') || !trustPage.includes('paidCheckoutReady') || !trustPage.includes('paymentProcessorReady') || !trustPage.includes('checkoutBlockReasons') || !trustPage.includes('expectedBlockReasonWhenLegalReviewMissing') || !trustPage.includes('clientSafeBillingBlockReason')) {
  failures.push('src/app/trust/page.tsx must surface the paid-checkout legal-review lock from support-packet launch evidence with customer-safe reason labels.');
}
if (!trustPage.includes('Installed app stays safe') || !trustPage.includes('offline shell does not cache claim records')) {
  failures.push('src/app/trust/page.tsx must surface PWA install/offline safety evidence in the Trust Center.');
}
if (!trustPage.includes('<TrustComplianceBrowser') || !trustComplianceBrowser.includes('Safety basics') || !trustComplianceBrowser.includes('The simple version') || !trustComplianceBrowser.includes('Recent account activity') || !trustComplianceBrowser.includes('Support can use this history')) {
  failures.push('src/app/trust must expose a real-data Kimi-style trust/safety section with collapsed read-only audit evidence.');
}

const billingCheckout = readIfExists('src/lib/billing/checkout.ts');
if (!billingCheckout.includes('CLAIMBOT_BILLING_PLUS_MONTHLY_URL') || !billingCheckout.includes('CLAIMBOT_BILLING_PRO_MONTHLY_URL') || !billingCheckout.includes('CLAIMBOT_BILLING_SYNC_SECRET')) {
  failures.push('src/lib/billing/checkout.ts must define Plus, Pro, and signed entitlement-sync billing env keys.');
}
if (!billingCheckout.includes('getBillingCheckoutRedirectUrl') || !billingCheckout.includes('clientReferenceId') || !billingCheckout.includes('claimbotUserId')) {
  failures.push('src/lib/billing/checkout.ts must append stable ClaimBot user references to processor checkout redirects.');
}
if (!billingCheckout.includes('legal-review-not-recorded') || !billingCheckout.includes('CLAIMBOT_LEGAL_REVIEW_ACK') || !billingCheckout.includes("!== 'reviewed'")) {
  failures.push('src/lib/billing/checkout.ts must block paid checkout until legal/compliance review is recorded.');
}

const billingCheckoutRoute = readIfExists('src/app/api/billing/checkout/route.ts');
if (!billingCheckoutRoute.includes('NextResponse.redirect') || !billingCheckoutRoute.includes('checkout-not-configured')) {
  failures.push('src/app/api/billing/checkout/route.ts must redirect configured paid CTAs and fall back safely when billing is missing.');
}
if (!billingCheckoutRoute.includes('currentUserId') || !billingCheckoutRoute.includes('BILLING_CHECKOUT_STARTED') || !billingCheckoutRoute.includes('writeAudit')) {
  failures.push('src/app/api/billing/checkout/route.ts must require a current user and audit checkout handoffs before redirecting to a processor.');
}
if (!billingCheckoutRoute.includes('getBillingCheckoutRedirectUrl') || !billingCheckoutRoute.includes('claimbotUserReferencePresent')) {
  failures.push('src/app/api/billing/checkout/route.ts must hand processor checkout a stable ClaimBot account reference before redirecting.');
}
const pricingPage = readIfExists('src/app/pricing/page.tsx');
const pricingPlanCards = readIfExists('src/app/pricing/PricingPlanCards.tsx');
const pricingFaqBrowser = readIfExists('src/app/pricing/PricingFaqBrowser.tsx');
const contactPage = readIfExists('src/app/contact/page.tsx');
const helpPage = readIfExists('src/app/help/page.tsx');
if (!pricingPage.includes('getUserSubscription') || !pricingPage.includes('Current plan entitlement') || !pricingPage.includes('Automation entitlement is locked') || !pricingPage.includes('Database entitlement') || !pricingPage.includes('5 included filings per month')) {
  failures.push('src/app/pricing/page.tsx must render the current backend subscription entitlement state before implying paid automation is available.');
}
if (!pricingPage.includes('Free matching. Paid full automation.') || !pricingPage.includes('Full Automation Lane') || !pricingPage.includes('not semi-automated') || !pricingPage.includes('fully automated filing runs') || !pricingPage.includes('Fully automated guarded run') || !pricingPage.includes('Hands-off claim filing')) {
  failures.push('src/app/pricing/page.tsx must explain Pro as full guarded automation for eligible no-proof claims, not semi-automated review prep.');
}
if (!pricingPage.includes('buildClientPreviewChecklist') || !pricingPage.includes('paidAutomationBlockers') || !pricingPage.includes('Paid full automation blockers') || !pricingPage.includes('Pro stays locked until account readiness clears') || !pricingPage.includes('hosted data, business setup, billing, legal, and customer-access readiness blockers clear') || !pricingPage.includes('Account readiness is tracked in Launch and Packet Center') || !pricingPage.includes('Open billing readiness status') || !pricingPage.includes('/packets') || !pricingPage.includes('clientSafeLaunchLabel') || pricingPage.includes('Export client preview checklist')) {
  failures.push('src/app/pricing/page.tsx must tie Pro pricing to account-scoped launch blockers while routing users to app proof pages instead of raw exports.');
}
if (!pricingPage.includes('clientSafeBillingReasonParam') || !pricingPage.includes('Contact billing') || !pricingPage.includes('Checkout setup pending')) {
  failures.push('src/app/pricing/page.tsx must route unconfigured paid CTAs to billing support with customer-safe reason slugs instead of implying checkout is live.');
}
if (!pricingPage.includes("blockReasonKind === 'legal-review'") || !pricingPage.includes('legal review must be recorded before payment')) {
  failures.push('src/app/pricing/page.tsx must explain the legal-review paid-checkout lock before users pay without serializing raw reason codes.');
}
if (!pricingPage.includes("blockReasonKind === 'automation-worker'") || !pricingPage.includes('verified end-to-end automation readiness')) {
  failures.push('src/app/pricing/page.tsx must block Pro automation checkout copy until worker runtime readiness is verified without serializing raw reason codes.');
}
if (!pricingPage.includes('paidCheckoutReady') || !pricingPage.includes('paidCheckoutBlockReasons') || !pricingPage.includes('Paid checkout remains locked') || !pricingPage.includes('clientSafeBillingBlockReason')) {
  failures.push('src/app/pricing/page.tsx must render paid checkout readiness separately from processor billing readiness with customer-safe reason labels.');
}
if (!pricingPage.includes('billingActivationReceipt') || !pricingPage.includes('Billing Activation Receipt') || !pricingPage.includes('stable account reference') || !pricingPage.includes('Processor event IDs are tracked') || !pricingPage.includes('billingActivationRequiredInputs') || !pricingPage.includes('Setup steps and readiness') || !pricingPage.includes('Processor-hosted Plus checkout URL') || !pricingPage.includes('/launch#billing-handoff') || pricingPage.includes('billingActivationCommands') || pricingPage.includes('<CliCommandRows')) {
  failures.push('src/app/pricing/page.tsx must render a billing activation receipt covering checkout links, stable user references, signed callbacks, and idempotency readiness.');
}
if (!pricingPage.includes('plus_yearly') || !pricingPage.includes('pro_yearly') || !pricingPage.includes('<PricingPlanCards plans={planCards} />')) {
  failures.push('src/app/pricing/page.tsx must expose annual Plus and Pro checkout handoffs through the Kimi pricing plan switcher.');
}
if (!pricingPlanCards.includes("useState<BillingCycle>('yearly')") || !pricingPlanCards.includes('Plan switcher') || !pricingPlanCards.includes('Choose monthly flexibility or annual savings') || !pricingPlanCards.includes('Compare the same Free, Plus, and Pro features')) {
  failures.push('src/app/pricing/PricingPlanCards.tsx must render the Kimi-style annual/monthly billing-cycle switcher.');
}
if (!pricingPage.includes('<PricingFaqBrowser faqs={pricingFaqs} />') || !pricingFaqBrowser.includes('Pricing FAQ') || !pricingFaqBrowser.includes('Common questions before paying for automation') || !pricingFaqBrowser.includes('FAQ is read-only') || !pricingFaqBrowser.includes('queues claims, or enables live filing')) {
  failures.push('src/app/pricing must expose a searchable Kimi-style pricing FAQ browser without mutating checkout, subscription, queue, or filing state.');
}
if (!contactPage.includes('Checkout setup is pending') || !contactPage.includes('signed billing sync') || !contactPage.includes('active entitlement') || !contactPage.includes("billingReasonKind === 'legal-review'") || !contactPage.includes("billingReasonKind === 'automation-worker'") || !contactPage.includes('CLAIMBOT_WORKER_RUNTIME_RECEIPT') || !contactPage.includes('clientSafeBillingBlockReason')) {
  failures.push('src/app/contact/page.tsx must explain billing handoff context with customer-safe reason labels when pricing sends users there.');
}
if (!contactPage.includes('buildClientPreviewChecklist') || !contactPage.includes('nextExternalProof') || !contactPage.includes('Product requirements') || !contactPage.includes('launch packets') || !contactPage.includes('Next setup item:') || !contactPage.includes('clientSafeLaunchLabel(nextExternalProof)') || !contactPage.includes('nextExternalProof?.requiredInputs')) {
  failures.push('src/app/contact/page.tsx must tie operator contact activation to the account-scoped client-preview checklist and next external proof inputs.');
}
const supportCommandBrowser = readIfExists('src/app/contact/SupportCommandBrowser.tsx');
if (!contactPage.includes('<SupportCommandBrowser rows={supportCommandRows} supportHref={mailto ?? supportHref} />') || !contactPage.includes('supportCommandRows') || !supportCommandBrowser.includes('Find the right support path') || !supportCommandBrowser.includes('All support items') || !supportCommandBrowser.includes('This browser is read-only') || !supportCommandBrowser.includes('Browser filters never edit profile facts')) {
  failures.push('src/app/contact must expose a real-state read-only Kimi-style support command browser without editing account, claim, privacy, billing, or audit state.');
}
const helpCommandBrowser = readIfExists('src/app/help/HelpCommandBrowser.tsx');
if (!helpPage.includes('<HelpCommandBrowser rows={helpCommandRows} />') || !helpPage.includes('helpCommandRows') || !helpCommandBrowser.includes('Search safe next steps') || !helpCommandBrowser.includes('All help items') || !helpCommandBrowser.includes('This browser is read-only') || !helpCommandBrowser.includes('Browser filters never edit profile facts')) {
  failures.push('src/app/help must expose a real-state read-only Kimi-style help command browser without editing intake, queue, authorization, billing, or audit state.');
}
if (!helpPage.includes('buildClientPreviewChecklist') || !helpPage.includes('nextExternalProof') || !helpPage.includes('Support readiness') || !helpPage.includes('Support should use the next setup item') || !helpPage.includes('same account-scoped setup checklist') || !helpPage.includes('/packets') || !helpPage.includes('/contact') || !helpPage.includes('clientSafeLaunchAction') || !helpPage.includes('clientSafeLaunchLabel') || !helpPage.includes('clientSafeRequiredInputSummary') || !helpPage.includes('clientSafeProofArtifactSummary') || !helpCommandBrowser.includes("label: 'Launch'") || helpPage.includes('Export client preview checklist')) {
  failures.push('src/app/help must route support guidance through the account-scoped client-preview checklist and app proof pages instead of raw exports.');
}

const billingSync = readIfExists('src/lib/billing/entitlement-sync.ts');
if (!billingSync.includes('timingSafeEqual') || !billingSync.includes('BILLING_ENTITLEMENT_SYNCED')) {
  failures.push('src/lib/billing/entitlement-sync.ts must verify signed billing sync requests and audit entitlement updates.');
}
if (!billingSync.includes('schema.billingEvents') || !billingSync.includes('billing event id is required') || !billingSync.includes('duplicate')) {
  failures.push('src/lib/billing/entitlement-sync.ts must use billing event IDs as an idempotency ledger for processor callback retries.');
}
if (!billingSync.includes('claimbotUserId') || !billingSync.includes('clientReferenceId') || !billingSync.includes('linkedBy')) {
  failures.push('src/lib/billing/entitlement-sync.ts must accept processor user metadata and audit how the entitlement was linked.');
}
if (!billingSync.includes('emailConflictPresent') || !billingSync.includes('emailUpdateApplied')) {
  failures.push('src/lib/billing/entitlement-sync.ts must skip email updates when processor email belongs to another account.');
}

const dbSchema = readIfExists('src/db/schema.ts');
if (!dbSchema.includes('billing_events') || !dbSchema.includes('uniq_billing_event_id')) {
  failures.push('src/db/schema.ts must define a unique billing_events ledger for signed entitlement-sync idempotency.');
}
if (!dbSchema.includes('BILLING_CHECKOUT_STARTED')) {
  failures.push('src/db/schema.ts must include BILLING_CHECKOUT_STARTED so paid checkout handoffs are auditable.');
}
if (!dbSchema.includes('PRIVACY_EXPORT_CREATED')) {
  failures.push('src/db/schema.ts must include PRIVACY_EXPORT_CREATED so account data exports are auditable.');
}
if (!dbSchema.includes('PRIVACY_REQUEST_CREATED')) {
  failures.push('src/db/schema.ts must include PRIVACY_REQUEST_CREATED so privacy requests are auditable.');
}
if (!dbSchema.includes('external_subject') || !dbSchema.includes('uniq_users_external_subject')) {
  failures.push('src/db/schema.ts must store a unique hosted identity subject on users so email changes do not fork accounts.');
}

const currentUser = readIfExists('src/lib/auth/current-user.ts');
const dbSeed = readIfExists('src/db/seed.ts');
if (!currentUser.includes('ensureUserForIdentity') || !currentUser.includes('identity.subject')) {
  failures.push('src/lib/auth/current-user.ts must resolve hosted sessions through the stable identity subject, not email alone.');
}
if (!dbSeed.includes('ensureUserForIdentity') || !dbSeed.includes('fallbackEmailForIdentitySubject') || !dbSeed.includes('externalSubject')) {
  failures.push('src/db/seed.ts must link hosted identities by external subject while preserving email for billing handoffs.');
}

const billingSyncRoute = readIfExists('src/app/api/billing/entitlement-sync/route.ts');
if (!billingSyncRoute.includes('x-claimbot-billing-signature') || !billingSyncRoute.includes('billing sync secret is not configured')) {
  failures.push('src/app/api/billing/entitlement-sync/route.ts must require signed server-to-server billing sync requests.');
}

const middleware = readIfExists('src/middleware.ts');
if (!middleware.includes("'/api/billing/entitlement-sync'")) {
  failures.push('src/middleware.ts must allow /api/billing/entitlement-sync through app-session auth so processor callbacks reach HMAC verification.');
}
if (!middleware.includes("'/api/billing/checkout'")) {
  failures.push('src/middleware.ts must allow /api/billing/checkout to reach its login redirect and audited checkout handoff logic.');
}
if (!middleware.includes('shouldSendNoStore') || !middleware.includes("'Cache-Control'") || !middleware.includes("'no-store'") || !middleware.includes("pathname.startsWith('/api/')")) {
  failures.push('src/middleware.ts must send Cache-Control: no-store for protected app/API surfaces while leaving static PWA shell assets cacheable.');
}

const authSessionRoute = readIfExists('src/app/api/auth/session/route.ts');
const identitySessionHelpers = readIfExists('src/lib/auth/identity-session.ts');
if (!authSessionRoute.includes('@lib/auth/identity-session') || !identitySessionHelpers.includes('identitySubjectForSession') || identitySessionHelpers.includes("|| identityUser?.email")) {
  failures.push('src/app/api/auth/session/route.ts must mint app sessions from stable Identity id/sub via src/lib/auth/identity-session.ts, not email fallback.');
}
if (!authSessionRoute.includes('ensureUserForIdentity') || !authSessionRoute.includes('AUTH_SESSION_CREATED') || !authSessionRoute.includes('AUTH_SESSION_ENDED') || !authSessionRoute.includes('writeAudit')) {
  failures.push('src/app/api/auth/session/route.ts must link hosted Identity users and audit app-session creation/sign-out.');
}

if (!smokeHostedAuth.includes('/api/auth/session') || !smokeHostedAuth.includes('fake Identity bearer must not mint an app session')) {
  failures.push('scripts/smoke-hosted-auth.cjs must prove fake Identity bearer tokens cannot mint signed app sessions.');
}
if (!smokeHostedAuth.includes('/.netlify/identity/user') || !smokeHostedAuth.includes('deployed Netlify Identity endpoint probe') || !smokeHostedAuth.includes('deployed Netlify Identity endpoint must require auth')) {
  failures.push('scripts/smoke-hosted-auth.cjs must prove deployed previews expose the Netlify Identity endpoint before promotion.');
}
if (!smokeHostedAuth.includes('anonymous checkout should redirect to login') || !smokeHostedAuth.includes('processor redirect missing clientReferenceId')) {
  failures.push('scripts/smoke-hosted-auth.cjs must prove checkout handoffs preserve login redirects and processor user references.');
}
if (!smokeHostedAuth.includes('deployed smoke requires CLAIMBOT_BILLING_SYNC_SECRET') || !smokeHostedAuth.includes('deployed preview must prove legal/compliance review acknowledgment') || !smokeHostedAuth.includes('deployed preview must prove paid billing gates are ready')) {
  failures.push('scripts/smoke-hosted-auth.cjs must require deployed preview billing sync and legal review launch evidence.');
}

const privacyPolicy = readIfExists('src/app/privacy-policy/page.tsx');
if (!privacyPolicy.includes('Retention and export policy') || !privacyPolicy.includes('Deletion requests') || !privacyPolicy.includes('/privacy-export')) {
  failures.push('src/app/privacy-policy/page.tsx must publish retention, export, and deletion request boundaries.');
}
const legalPolicyBrowser = readIfExists('src/app/LegalPolicyBrowser.tsx');
if (!privacyPolicy.includes('<LegalPolicyBrowser') || !privacyPolicy.includes('Search privacy boundaries before support or data requests') || !legalPolicyBrowser.includes('All policy items') || !legalPolicyBrowser.includes('Browser filters never submit claims') || !legalPolicyBrowser.includes('This browser is read-only')) {
  failures.push('src/app/privacy-policy/page.tsx must expose a read-only Kimi-style policy browser for privacy boundaries without mutating account, claim, or filing state.');
}

const privacyExportRoute = readIfExists('src/app/api/privacy/export/route.ts');
const privacyExportHandoffRoute = readIfExists('src/app/privacy-export/route.ts');
const privacyExportBuilder = readIfExists('src/lib/privacy/export.ts');
const privacyRequestRoute = readIfExists('src/app/api/privacy/request/route.ts');
const privacyRequestBuilder = readIfExists('src/lib/privacy/request.ts');
if (!privacyExportRoute.includes('buildPrivacyExport') || !privacyExportRoute.includes('PRIVACY_EXPORT_CREATED') || !privacyExportRoute.includes('Cache-Control')) {
  failures.push('src/app/api/privacy/export/route.ts must provide an authenticated, no-store, audited account data export.');
}
if (!privacyExportHandoffRoute.includes('/api/privacy/export') || !privacyExportHandoffRoute.includes('NextResponse.redirect') || !privacyExportHandoffRoute.includes('303')) {
  failures.push('src/app/privacy-export/route.ts must provide a protected privacy export handoff instead of linking anonymous public users directly to raw API JSON.');
}
if (!privacyExportBuilder.includes('claimbot.privacy-export.v1') || !privacyExportBuilder.includes('paymentMethodsExcluded') || !privacyExportBuilder.includes('privacyRequestBoundary') || !privacyExportBuilder.includes('sha256Digest')) {
  failures.push('src/lib/privacy/export.ts must build a digest-backed privacy export without raw payment method payloads.');
}
if (!smokeHostedAuth.includes('/privacy-export') || !smokeHostedAuth.includes('anonymous privacy export handoff') || !smokeHostedAuth.includes('signed privacy export handoff') || !smokeHostedAuth.includes('/api/privacy/export') || !smokeHostedAuth.includes('signed app session should export privacy JSON')) {
  failures.push('scripts/smoke-hosted-auth.cjs must verify privacy exports use the protected handoff, require auth, and work with a signed app session.');
}
if (!privacyRequestRoute.includes('recordPrivacyRequest') || !privacyRequestRoute.includes('privacyRequest') || !privacyRequestRoute.includes('no destructive deletion')) {
  failures.push('src/app/api/privacy/request/route.ts must record privacy requests without destructive automatic deletion.');
}
if (!privacyRequestBuilder.includes('PRIVACY_REQUEST_CREATED') || !privacyRequestBuilder.includes('contactEmailPresent') || !privacyRequestBuilder.includes('no destructive deletion')) {
  failures.push('src/lib/privacy/request.ts must audit privacy request intake and preserve deletion boundaries.');
}
if (!smokeHostedAuth.includes('/api/privacy/request') || !smokeHostedAuth.includes('signed app session should record privacy request')) {
  failures.push('scripts/smoke-hosted-auth.cjs must verify privacy request intake requires auth and works with a signed app session.');
}

const termsPage = readIfExists('src/app/terms/page.tsx');
if (!termsPage.includes('Data retention and exports') || !termsPage.includes('correction, export, or deletion')) {
  failures.push('src/app/terms/page.tsx must include business retention and export responsibilities.');
}
if (!termsPage.includes('<LegalPolicyBrowser') || !termsPage.includes('Search terms boundaries before claim or filing decisions') || !legalPolicyBrowser.includes('Product boundaries') || !legalPolicyBrowser.includes('Read-only policy context')) {
  failures.push('src/app/terms/page.tsx must expose a read-only Kimi-style policy browser for terms, safety gates, and business duties.');
}

const claimFileRoute = readIfExists('src/app/api/claims/[id]/file/route.ts');
if (!claimFileRoute.includes('currentUserId') || !claimFileRoute.includes('eq(schema.claims.userId, userId)')) {
  failures.push('src/app/api/claims/[id]/file/route.ts must verify current-user claim ownership before running the filer.');
}
if (!claimFileRoute.includes('isClaimRunnableStatus') || !claimFileRoute.includes('claim is not runnable')) {
  failures.push('src/app/api/claims/[id]/file/route.ts must reject failed, aborted, prepared, or submitted claims before invoking the filer.');
}

const claimStreamRoute = readIfExists('src/app/api/claims/[id]/stream/route.ts');
if (!claimStreamRoute.includes('currentUserId') || !claimStreamRoute.includes('eq(schema.claims.userId, userId)')) {
  failures.push('src/app/api/claims/[id]/stream/route.ts must verify current-user claim ownership before streaming progress.');
}

const serverActions = readIfExists('src/app/actions.ts');
if (!serverActions.includes('queueClaim(matchId, userId)')) {
  failures.push('src/app/actions.ts must pass current user ownership into queueClaimFromMatch.');
}
if (!serverActions.includes('eq(schema.claims.userId, userId)') || !serverActions.includes('ensureFileClaimJobForClaim')) {
  failures.push('src/app/actions.ts must verify current-user claim ownership before runFileClaim arms a file_claim worker job.');
}
if (!serverActions.includes('isClaimRunnableStatus(claimRows[0].status)')) {
  failures.push('src/app/actions.ts must reject non-runnable claim statuses before runFileClaim invokes the filer.');
}

const requestBoundary = readIfExists('src/lib/claim-filer/request-boundary.ts');
if (!requestBoundary.includes('SETUP_SHADOW_REVIEW_ACK')) {
  failures.push('src/lib/claim-filer/request-boundary.ts must define a setup shadow-review acknowledgement constant.');
}
if (!requestBoundary.includes('TERMS_BOUNDARY_ACK')) {
  failures.push('src/lib/claim-filer/request-boundary.ts must define a Terms boundary acknowledgement constant for setup automation.');
}
if (!requestBoundary.includes('QUEUE_TRUST_LOCK_ACK')) {
  failures.push('src/lib/claim-filer/request-boundary.ts must define a shared queue trust-lock acknowledgement constant.');
}
if (!requestBoundary.includes('CLAIM_RUNNABLE_STATUSES') || !requestBoundary.includes('isClaimRunnableStatus')) {
  failures.push('src/lib/claim-filer/request-boundary.ts must define the shared runnable claim status gate.');
}

const setupCompleteRoute = readIfExists('src/app/api/setup/complete/route.ts');
if (!setupCompleteRoute.includes('SETUP_SHADOW_REVIEW_ACK') || !setupCompleteRoute.includes('setup shadow-review acknowledgement required')) {
  failures.push('src/app/api/setup/complete/route.ts must require explicit setup shadow-review acknowledgement before starting automation.');
}
if (!setupCompleteRoute.includes('SETUP_SHADOW_REVIEW_STARTED') || !setupCompleteRoute.includes('shadow-mode review only')) {
  failures.push('src/app/api/setup/complete/route.ts must audit consented setup shadow-review launch before starting automation.');
}

const setupWizard = readIfExists('src/app/setup/SetupWizard.tsx');
if (!setupWizard.includes('SETUP_SHADOW_REVIEW_ACK') || !setupWizard.includes('setupShadowReviewAck')) {
  failures.push('src/app/setup/SetupWizard.tsx must send the setup shadow-review acknowledgement to the server.');
}
if (!setupWizard.includes('TERMS_BOUNDARY_ACK') || !setupWizard.includes('termsBoundaryAck')) {
  failures.push('src/app/setup/SetupWizard.tsx must send the Terms boundary acknowledgement to the server before setup automation starts.');
}

const setupProfileRoute = readIfExists('src/app/api/setup/profile/route.ts');
if (!setupProfileRoute.includes('PROFILE_UPDATED') || !setupProfileRoute.includes('profileFactsDigest')) {
  failures.push('src/app/api/setup/profile/route.ts must audit profile intake changes with redacted digests.');
}

const setupPurchaseRoute = readIfExists('src/app/api/setup/purchase/route.ts');
if (!setupPurchaseRoute.includes('PURCHASE_ADDED') || !setupPurchaseRoute.includes('merchantDigest')) {
  failures.push('src/app/api/setup/purchase/route.ts must audit purchase evidence intake with redacted digests.');
}

const setupBreachRoute = readIfExists('src/app/api/setup/breach/route.ts');
if (!setupBreachRoute.includes('BREACH_ADDED') || !setupBreachRoute.includes('emailDigest')) {
  failures.push('src/app/api/setup/breach/route.ts must audit breach evidence intake with redacted digests.');
}

const autoPipeline = readIfExists('src/lib/auto-pipeline.ts');
if (!autoPipeline.includes('hasUserStartedSetupShadowReview') || !autoPipeline.includes('setup_incomplete')) {
  failures.push('src/lib/auto-pipeline.ts must refresh matches but block automatic queueing until the current user has a setup shadow-review acknowledgement audit event.');
}

const setupState = readIfExists('src/lib/setup-state.ts');
if (!setupState.includes('SETUP_SHADOW_REVIEW_STARTED') || !setupState.includes('schema.auditLog.userId')) {
  failures.push('src/lib/setup-state.ts must prove setup completion from the current user scoped shadow-review audit event.');
}

const dashboardPage = readIfExists('src/app/page.tsx');
if (!dashboardPage.includes('hasUserStartedSetupShadowReview(userId)')) {
  failures.push('src/app/page.tsx must use user-scoped setup shadow-review state instead of the global setup_completed setting.');
}
if (!dashboardPage.includes('recentAuditEvents') || !dashboardPage.includes('Activity history') || !dashboardPage.includes('schema.auditLog') || !dashboardPage.includes('account history')) {
  failures.push('src/app/page.tsx must surface real-data Kimi-style dashboard activity history from the current user audit log.');
}
if (!dashboardPage.includes('schema.jobs') || !dashboardPage.includes("eq(schema.jobs.type, 'file_claim')") || !dashboardPage.includes('Full automation status') || !dashboardPage.includes('activeWorkerJobCount') || !dashboardPage.includes('automatic claim worker polling') || !dashboardPage.includes('Worker job failures')) {
  failures.push('src/app/page.tsx must surface paid full-automation file_claim worker state on the Kimi dashboard command center.');
}
if (!dashboardPage.includes('buildClientPreviewChecklist') || !dashboardPage.includes('clientPreviewChecklist.summary.clientPreviewReady') || !dashboardPage.includes('Customer access') || !dashboardPage.includes('launchPacketReadyCount') || !dashboardPage.includes('/launch')) {
  failures.push('src/app/page.tsx must surface account-scoped client-preview readiness in the simplified Kimi dashboard primary command stack.');
}
if (!dashboardPage.includes('dashboard-detail-drawer') || !dashboardPage.includes('More account details') || !dashboardPage.includes('Account readiness, safety controls, and detailed records stay in this collapsed drawer.') || dashboardPage.includes('CLIENT READINESS RUNWAY')) {
  failures.push('src/app/page.tsx must keep the simplified dashboard first screen and move dense readiness/launch/safety material into the More account details drawer.');
}
const hostedReadinessSource = readIfExists('src/lib/hosted-readiness.ts');
if (!hostedReadinessSource.includes('automation-worker-runtime') || !hostedReadinessSource.includes('CLAIMBOT_WORKER_RUNTIME') || !hostedReadinessSource.includes('file_claim jobs') || !hostedReadinessSource.includes('scheduled-worker')) {
  failures.push('src/lib/hosted-readiness.ts must block hosted launch until a verified automation worker runtime can process paid file_claim jobs.');
}
if (!readIfExists('package.json').includes('"worker:once"') || !readIfExists('package.json').includes('"worker:file-claim:receipt"') || !readIfExists('package.json').includes('"worker:file-claim:seed"') || !readIfExists('package.json').includes('"worker:github:doctor"') || !readIfExists('scripts/github-worker-doctor.cjs').includes('ClaimBot GitHub worker doctor') || !readIfExists('scripts/github-worker-doctor.cjs').includes('No secret values are printed') || !readIfExists('scripts/github-worker-doctor.cjs').includes('SMOKE_BASE_URL') || !readIfExists('worker/run-once.ts').includes('runDueJobs') || !readIfExists('worker/smoke-receipt.ts').includes('claimbot.worker-smoke-receipt.v1') || !readIfExists('worker/smoke-receipt.ts').includes('launchProofUsable') || !readIfExists('scripts/run-local-worker-file-claim-receipt.ts').includes('claimbot.local-worker-file-claim-smoke-receipt.v1') || !readIfExists('scripts/seed-worker-file-claim-smoke.ts').includes('claimbot.worker-file-claim-smoke-seed.v1') || !readIfExists('scripts/seed-worker-file-claim-smoke.ts').includes('CLAIMBOT_WORKER_SMOKE_SEED') || !readIfExists('src/app/smoke/claim-form/page.tsx').includes('ClaimBot Paid Automation Smoke Claim Form') || !readIfExists('src/middleware.ts').includes('/smoke/claim-form') || !readIfExists('package.json').includes('"worker:packet"') || !readIfExists('scripts/export-worker-runtime-packet.ts').includes('claimbot.worker-runtime-packet.v1') || !readIfExists('scripts/export-worker-runtime-packet.ts').includes('workerSmokeReceipt') || !readIfExists('scripts/export-worker-runtime-packet.ts').includes('localFileClaimReceipt') || !readIfExists('scripts/export-worker-runtime-packet.ts').includes('workerFileClaimSeed') || !readIfExists('scripts/export-worker-runtime-packet.ts').includes('githubActionsRequirements') || !readIfExists('scripts/export-worker-runtime-packet.ts').includes('githubActionsSetup') || !readIfExists('scripts/export-worker-runtime-packet.ts').includes('npm run worker:github:doctor') || !readIfExists('scripts/export-worker-runtime-packet.ts').includes('seedHostedFileClaim') || !readIfExists('scripts/export-worker-runtime-packet.ts').includes('hostedWorkerSmoke') || !readIfExists('scripts/export-worker-runtime-packet.ts').includes('gh variable set SMOKE_BASE_URL') || !readIfExists('scripts/export-worker-runtime-packet.ts').includes('claimbot-worker-file-claim-smoke-seed') || !readIfExists('scripts/export-worker-runtime-packet.ts').includes('launchProofUsable=true') || !readIfExists('src/lib/launch-action-plan.ts').includes('npm run worker:github:doctor') || !readIfExists('src/lib/launch-action-plan.ts').includes('gh variable set SMOKE_BASE_URL') || !readIfExists('.github/workflows/claimbot-worker.yml').includes('claimbot-worker-smoke-receipt') || !readIfExists('.github/workflows/claimbot-worker.yml').includes('seed_smoke_job') || !readIfExists('.github/workflows/claimbot-worker.yml').includes('SMOKE_BASE_URL is required when seed_smoke_job=true') || !readIfExists('.github/workflows/claimbot-worker.yml').includes('SMOKE_BASE_URL must be an HTTPS deployed preview URL')) {
  failures.push('package.json, worker/run-once.ts, smoke seed/form files, scripts/export-worker-runtime-packet.ts, and .github/workflows/claimbot-worker.yml must expose one-shot worker execution plus a deployable scheduler, seedable file_claim smoke, saved smoke receipts, and non-secret worker runtime proof packet.');
}

const runMatcher = readIfExists('src/lib/matcher/run-matcher.ts');
if (!dbSchema.includes('MATCHER_RUN_COMPLETED') || !runMatcher.includes('MATCHER_RUN_COMPLETED') || !runMatcher.includes('settlementsProcessed') || !runMatcher.includes('verdictsChanged')) {
  failures.push('src/lib/matcher/run-matcher.ts must write a MATCHER_RUN_COMPLETED audit receipt for every matcher refresh, even when no verdicts change.');
}

const fileAllButton = readIfExists('src/app/FileAllButton.tsx');
if (!fileAllButton.includes('QUEUE_TRUST_LOCK_ACK') || !fileAllButton.includes('queueTrustLock')) {
  failures.push('src/app/FileAllButton.tsx must send the queue trust-lock acknowledgement after the visible bulk-queue consent checkbox.');
}
if (!fileAllButton.includes('skippedNoForm') || !fileAllButton.includes('Missing claim form') || !fileAllButton.includes('Bulk automation skipped check summary')) {
  failures.push('src/app/FileAllButton.tsx must explain every bulk automation skipped check, including missing claim forms, after the bulk action.');
}
if (!fileAllButton.includes('fully automated guarded filing') || !fileAllButton.includes('fully automated for eligible no-proof claims') || !fileAllButton.includes('Run fully automated filing') || !fileAllButton.includes('Manual stops remain only')) {
  failures.push('src/app/FileAllButton.tsx must present paid bulk action as full guarded automation while preserving manual hard stops.');
}
if (!fileAllButton.includes('jobsEnqueued') || !fileAllButton.includes('jobsReused') || !fileAllButton.includes('Worker job automation receipt') || !fileAllButton.includes('claim worker queue')) {
  failures.push('src/app/FileAllButton.tsx must show worker job creation/reuse receipts after paid full automation queue release.');
}
if (!fileAllButton.includes('claimbot.client-preview-checklist.v1') || !fileAllButton.includes('Bulk automation locked until setup is ready') || !fileAllButton.includes('Customer access bulk automation lock') || !fileAllButton.includes('/launch') || !fileAllButton.includes('/packets') || !fileAllButton.includes('Boundary:') || !fileAllButton.includes('Required inputs:') || !fileAllButton.includes('Setup records:') || !fileAllButton.includes('Setup details stay in Launch and Packet Center') || !fileAllButton.includes('Setup records stay in Launch and Packet Center')) {
  failures.push('src/app/FileAllButton.tsx must explain the account-scoped client-preview checklist lock with app proof links, required inputs, and next external proof execution boundaries when bulk automation returns 423.');
}

const fileAllRoute = readIfExists('src/app/api/claims/file-all/route.ts');
const clientPreviewLock = readIfExists('src/lib/claim-filer/client-preview-lock.ts');
if (!fileAllRoute.includes('QUEUE_TRUST_LOCK_ACK') || !fileAllRoute.includes('queue trust lock acknowledgement required')) {
  failures.push('src/app/api/claims/file-all/route.ts must require queue trust-lock acknowledgement before bulk automation.');
}
if (!fileAllRoute.includes("automationMode: 'full_guarded'") || !fileAllRoute.includes('paid command is fully automated after this point') || !fileAllRoute.includes('worker continues') || !fileAllRoute.includes('jobsEnqueued: filed.jobsEnqueued') || !fileAllRoute.includes('jobsReused: filed.jobsReused') || !fileAllRoute.includes('Manual stops are hard blockers only')) {
  failures.push('src/app/api/claims/file-all/route.ts must return full guarded automation semantics for paid bulk automation.');
}
if (!fileAllRoute.includes('getClientPreviewAutomationLock') || !fileAllRoute.includes('clientPreviewLock.locked') || !fileAllRoute.includes('{ status: 423 }')) {
  failures.push('src/app/api/claims/file-all/route.ts must lock bulk automation behind the account-scoped client-preview checklist before matcher or tracking work runs.');
}
if (!clientPreviewLock.includes('buildClientPreviewChecklist') || !clientPreviewLock.includes('CLIENT_PREVIEW_CHECKLIST_REQUIRED') || !clientPreviewLock.includes('blockedRequirements') || !clientPreviewLock.includes('blockedPackets') || !clientPreviewLock.includes('claimbot.client-preview-checklist.v1')) {
  failures.push('src/lib/claim-filer/client-preview-lock.ts must build the shared account-scoped client-preview automation lock with blocked requirements and launch packet details.');
}
if (!fileAllRoute.includes('skippedNoForm: filed.skippedNoForm')) {
  failures.push('src/app/api/claims/file-all/route.ts must return skippedNoForm so the client can explain missing-form queue blockers.');
}

const filerSource = readIfExists('src/lib/claim-filer/filer.ts');
const actionsSource = readIfExists('src/app/actions.ts');
if (!claimFileRoute.includes('getClientPreviewAutomationLock') || !claimFileRoute.includes('clientPreviewLock.locked') || !claimFileRoute.includes('{ status: 423 }')) {
  failures.push('src/app/api/claims/[id]/file/route.ts must lock single-claim automation behind the account-scoped client-preview checklist before a worker job can be armed.');
}
if (!claimFileRoute.includes('ensureFileClaimJobForClaim') || !claimFileRoute.includes('automatic file-claim worker') || !claimFileRoute.includes("workerCadence: 'automatic_polling'") || !actionsSource.includes('ensureFileClaimJobForClaim')) {
  failures.push('src/app/api/claims/[id]/file/route.ts and src/app/actions.ts must arm audited file_claim worker jobs instead of running single-claim paid automation directly from the web request.');
}
if (!filerSource.includes('getClientPreviewAutomationLock') || !filerSource.includes("gate: 'client-preview-checklist'") || !filerSource.includes('client preview checklist required')) {
  failures.push('src/lib/claim-filer/filer.ts must lock single-claim queueing behind the account-scoped client-preview checklist before creating claim jobs.');
}
if (!filerSource.includes('ensureFileClaimJob') || !filerSource.includes("eventType: 'JOB_ENQUEUED'") || !filerSource.includes("automationMode: 'full_guarded'") || !filerSource.includes("source: 'existing-claim-rearmed'")) {
  failures.push('src/lib/claim-filer/filer.ts must ensure paid full automation has an active audited file_claim worker job, including rearming existing queued claims.');
}
if (!actionsSource.includes('getClientPreviewAutomationLock') || !actionsSource.includes("redirect('/launch')")) {
  failures.push('src/app/actions.ts must redirect manual filer server actions to launch proof when the client-preview checklist is blocked.');
}

if (!claimDetailPage.includes('isClaimRunnableStatus(claim.status)') || !claimDetailPage.includes('This packet is locked for review')) {
  failures.push('src/app/claims/[id]/page.tsx must not offer direct retry controls for failed, aborted, prepared, or submitted packets.');
}
if (!claimDetailPage.includes('getClientPreviewAutomationLock') || !claimDetailPage.includes('initialClientPreviewLock')) {
  failures.push('src/app/claims/[id]/page.tsx must preload the account-scoped client-preview filer lock before rendering LiveViewer controls.');
}
if (!claimDetailPage.includes('automationEntitlementActive={subscription.automationEnabled}') || !claimDetailPage.includes('subscriptionPlanLabel={subscriptionPlanLabel}')) {
  failures.push('src/app/claims/[id]/page.tsx must pass the paid automation entitlement into LiveViewer before a single-claim run control can appear.');
}

const claimLiveViewer = readIfExists('src/app/claims/[id]/LiveViewer.tsx');
if (!claimLiveViewer.includes('isClaimRunnableStatus(initialStatus)')) {
  failures.push('src/app/claims/[id]/LiveViewer.tsx must only start filer sessions for queued or preflight claims.');
}
if (!claimLiveViewer.includes('claimbot.client-preview-checklist.v1') || !claimLiveViewer.includes('Customer access filing lock') || !claimLiveViewer.includes('initialClientPreviewLock') || !claimLiveViewer.includes('/launch') || !claimLiveViewer.includes('/packets') || !claimLiveViewer.includes('blockedRequirements') || !claimLiveViewer.includes('blockedPackets') || !claimLiveViewer.includes('Setup details stay in Launch and Packet Center') || !claimLiveViewer.includes('eventSource.close()')) {
  failures.push('src/app/claims/[id]/LiveViewer.tsx must explain 423 client-preview filer locks, close the progress stream, and route users to app proof pages plus blocked requirements and packets.');
}
if (!claimLiveViewer.includes('automationEntitlementActive') || !claimLiveViewer.includes('Paid automation plan required') || !claimLiveViewer.includes('Arm full automation worker') || !claimLiveViewer.includes('Paid automation is fully automated after this point') || !claimLiveViewer.includes('Single-claim worker job automation receipt') || !claimLiveViewer.includes('Protected Session: full automation session')) {
  failures.push('src/app/claims/[id]/LiveViewer.tsx must present single-claim paid runs as full guarded automation while hiding the run control from unpaid users.');
}

for (const queueSurface of [
  'src/app/review/page.tsx',
  'src/app/settlements/page.tsx',
  'src/app/settlements/[id]/page.tsx',
]) {
  const source = readIfExists(queueSurface);
  if (source.includes('type="hidden" name="queueTrustLock"')) {
    failures.push(`${queueSurface} must use a visible required queueTrustLock checkbox, not a hidden trust-lock input.`);
  }
  if (!source.includes('QUEUE_TRUST_LOCK_ACK')) {
    failures.push(`${queueSurface} must use the shared queue trust-lock acknowledgement constant.`);
  }
}

const filer = readIfExists('src/lib/claim-filer/filer.ts');
if (!filer.includes('expectedUserId') || !filer.includes("return { error: 'match not found' };")) {
  failures.push('src/lib/claim-filer/filer.ts queueClaim must reject matches that do not belong to the expected user.');
}

const hostedEnvExample = readIfExists('.env.hosted.example');
const readme = readIfExists('README.md');
for (const requiredKey of ['DATABASE_URL', 'SCRAPER_USER_AGENT', 'CLAIMBOT_SUPPORT_EMAIL', 'CLAIMBOT_SESSION_SECRET']) {
  if (!hostedEnvExample.includes(`${requiredKey}=`)) {
    failures.push(`.env.hosted.example must include ${requiredKey}.`);
  }
}
for (const requiredKey of ['CLAIMBOT_BILLING_PLUS_MONTHLY_URL', 'CLAIMBOT_BILLING_PRO_MONTHLY_URL', 'CLAIMBOT_BILLING_SYNC_SECRET', 'CLAIMBOT_STRIPE_WEBHOOK_SECRET', 'CLAIMBOT_LEGAL_REVIEW_ACK']) {
  if (!hostedEnvExample.includes(`${requiredKey}=`)) {
    failures.push(`.env.hosted.example must include ${requiredKey}.`);
  }
}

const bootstrapAuditStamp = readIfExists('src/lib/bootstrap-audit-stamp.ts');
for (const requiredKey of ['CLAIMBOT_BILLING_PLUS_MONTHLY_URL', 'CLAIMBOT_BILLING_PRO_MONTHLY_URL', 'CLAIMBOT_BILLING_SYNC_SECRET', 'CLAIMBOT_STRIPE_WEBHOOK_SECRET', 'CLAIMBOT_LEGAL_REVIEW_ACK']) {
  if (!bootstrapAuditStamp.includes(requiredKey)) {
    failures.push(`src/lib/bootstrap-audit-stamp.ts must include ${requiredKey} in non-secret bootstrap readiness evidence.`);
  }
}
if (!bootstrapAuditStamp.includes('validHttpsUrl') || !bootstrapAuditStamp.includes("value === 'reviewed'")) {
  failures.push('src/lib/bootstrap-audit-stamp.ts must validate billing URLs and legal review acknowledgment, not just presence.');
}
if (!readme.includes('CLAIMBOT_LEGAL_REVIEW_ACK=') || !readme.includes('netlify env:set CLAIMBOT_LEGAL_REVIEW_ACK "reviewed"')) {
  failures.push('README.md must document the legal/compliance review acknowledgment in hosted setup commands.');
}

const deploymentSecurity = readIfExists('src/lib/deployment-security.ts');
if (!deploymentSecurity.includes("process.env.NETLIFY === 'true'") || !deploymentSecurity.includes("process.env.CLAIMBOT_ENFORCE_CSP === 'true'") || deploymentSecurity.includes('|| hasNetlifySecurityHeaders()')) {
  failures.push('src/lib/deployment-security.ts must only count netlify.toml CSP headers on Netlify, or require CLAIMBOT_ENFORCE_CSP=true on other hosts.');
}

const rootBlock = css.match(/:root\s*\{([\s\S]*?)\}/);
const tokens = {};
if (rootBlock) {
  for (const match of rootBlock[1].matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[match[1]] = match[2];
  }
}

function rgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

function channel(v) {
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

const contrastPairs = [
  ['text', 'bg'],
  ['text-secondary', 'bg'],
  ['muted', 'bg'],
  ['text', 'panel'],
  ['text-secondary', 'panel'],
  ['accent', 'bg'],
  ['warn', 'bg'],
  ['bad', 'bg'],
  ['blue', 'bg'],
];

for (const [fg, bg] of contrastPairs) {
  if (!tokens[fg] || !tokens[bg]) {
    failures.push(`Missing color token required for contrast check: --${tokens[fg] ? bg : fg}.`);
    continue;
  }
  const ratio = contrast(tokens[fg], tokens[bg]);
  if (ratio < 4.5) {
    failures.push(`--${fg} on --${bg} contrast is ${ratio.toFixed(2)}:1; expected at least 4.5:1.`);
  }
}

if (failures.length > 0) {
  console.error('[validate-ui-guardrails] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[validate-ui-guardrails] ok');
