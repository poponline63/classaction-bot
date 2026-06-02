import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getLaunchReadiness } from '../src/lib/launch-readiness';
import { hostedOperatorNotes, verificationCommands } from '../src/lib/hosted-remediation';
import { getLaunchCriticalPath, getLaunchExternalBlockerSummary } from '../src/lib/launch-handoff';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'legal-review-packet.json');
const markdownPath = path.join(outputDir, 'legal-review-packet.md');

type ReviewSurface = {
  key: string;
  label: string;
  reviewerQuestion: string;
  routes: string[];
  files: string[];
  evidence: string[];
};

const reviewSurfaces: ReviewSurface[] = [
  {
    key: 'terms',
    label: 'Terms and product boundary',
    reviewerQuestion: 'Do the terms clearly state that ClaimBot is software, not legal advice, a claim administrator, or a payout authority?',
    routes: ['/terms'],
    files: ['src/app/terms/page.tsx', 'LEGAL.md', 'README.md'],
    evidence: [
      'No legal advice or eligibility guarantee copy',
      'External administrators control deadlines, rules, proof requirements, and payout decisions',
      'Retention, export, correction, and deletion responsibilities are disclosed',
    ],
  },
  {
    key: 'privacy',
    label: 'Privacy, retention, and export requests',
    reviewerQuestion: 'Do privacy surfaces explain collected data, proof handling, retention, export, correction, and deletion request boundaries?',
    routes: ['/privacy-policy', '/privacy-export', '/contact'],
    files: [
      'src/app/privacy-policy/page.tsx',
      'src/app/privacy-export/route.ts',
      'src/app/api/privacy/export/route.ts',
      'src/app/api/privacy/request/route.ts',
      'src/lib/privacy/export.ts',
      'src/lib/privacy/request.ts',
    ],
    evidence: [
      'Authenticated privacy export route',
      'Audited privacy request intake',
      'No destructive automatic deletion from the request endpoint',
      'Payment method payloads excluded from privacy export',
    ],
  },
  {
    key: 'proof-review',
    label: 'Proof-required review flow',
    reviewerQuestion: 'Do proof-required matches stay in human review until the user stages the required receipts, breach notices, or other evidence?',
    routes: ['/review', '/claims', '/settlements'],
    files: [
      'src/app/review/page.tsx',
      'src/app/claims/[id]/page.tsx',
      'src/app/claims/[id]/LiveViewer.tsx',
      'src/lib/claim-filer/queue-readiness.ts',
      'src/lib/claim-filer/settlement-self-assessment.ts',
    ],
    evidence: [
      'Proof-required matches remain in review',
      'Queue controls require visible trust-lock acknowledgement',
      'Failed, aborted, prepared, or submitted packets do not expose direct retry controls',
    ],
  },
  {
    key: 'authorization',
    label: 'Authorization and attestation gates',
    reviewerQuestion: 'Are category authorizations explicit, revocable, audited, and unable to invent purchases or legal facts?',
    routes: ['/permissions', '/setup'],
    files: [
      'src/app/permissions/page.tsx',
      'src/app/setup/SetupWizard.tsx',
      'src/app/api/setup/auto-authorize/route.ts',
      'src/app/api/setup/complete/route.ts',
      'src/lib/claim-filer/request-boundary.ts',
      'src/lib/auto-pipeline.ts',
    ],
    evidence: [
      'Automatic category authorization endpoint is disabled',
      'Setup requires explicit shadow-review acknowledgement',
      'Auto pipeline blocks queueing until user-scoped setup consent exists',
      'Category authorization never permits fabricated purchase or eligibility facts',
    ],
  },
  {
    key: 'filing-posture',
    label: 'Shadow-mode filing posture',
    reviewerQuestion: 'Is first client launch constrained to shadow mode, with live filing disabled until a separate reviewed live-filing decision exists?',
    routes: ['/launch', '/status', '/settings'],
    files: [
      'src/lib/hosted-readiness.ts',
      'src/lib/claim-filer/filer.ts',
      'src/app/api/claims/[id]/file/route.ts',
      'src/app/api/claims/file-all/route.ts',
      'src/app/actions.ts',
    ],
    evidence: [
      'CLAIM_FILER_MODE must be shadow or explicitly reviewed live mode',
      'CLAIMBOT_FEATURE_LIVE_FILING must stay false for first client preview',
      'Claim ownership and runnable status are checked before filer execution',
    ],
  },
  {
    key: 'pricing-billing',
    label: 'Pricing, billing, and paid full automation',
    reviewerQuestion: 'Does pricing sell guarded software automation only, with no payout percentage, legal certainty, or automatic legal outcome promises?',
    routes: ['/pricing'],
    files: [
      'src/app/pricing/page.tsx',
      'src/app/api/billing/checkout/route.ts',
      'src/app/api/billing/entitlement-sync/route.ts',
      'src/lib/billing/checkout.ts',
      'src/middleware.ts',
    ],
    evidence: [
      'Processor-hosted checkout links are required for paid plans',
      'Signed entitlement sync is required before paid access is launch-ready',
      'Paid full automation is gated by authorization, proof status, entitlement, preflight, worker runtime, and audit receipts',
      'Processor callbacks are exempt from app-session auth but still require HMAC verification',
    ],
  },
  {
    key: 'trust-support',
    label: 'Trust, support, and public safety copy',
    reviewerQuestion: 'Do public trust and support surfaces avoid eligibility guarantees and route users to support/privacy channels for corrections?',
    routes: ['/trust', '/help', '/contact', '/packets'],
    files: [
      'src/app/trust/page.tsx',
      'src/app/help/page.tsx',
      'src/app/contact/page.tsx',
      'src/app/packets/page.tsx',
      'src/app/api/audit/support-packet/route.ts',
      'src/lib/audit/support-packet.ts',
    ],
    evidence: [
      'Support packet exposes launch evidence without raw secrets',
      'Matcher receipt, source catalog, database schema, and Netlify preview evidence are auditable',
      'Support and scraper contacts reject placeholder values before showing as configured',
    ],
  },
  {
    key: 'deployment',
    label: 'Hosted deployment gates',
    reviewerQuestion: 'Does production promotion require hosted database, auth, CSP, support contact, scraper contact, billing, legal review, and deployed preview receipts?',
    routes: ['/launch', '/login'],
    files: [
      'src/lib/launch-readiness.ts',
      'src/lib/hosted-readiness.ts',
      'src/lib/netlify-preview-readiness.ts',
      'scripts/preview-promotion-gate.cjs',
      'scripts/export-launch-handoff.ts',
      'scripts/smoke-hosted-auth.cjs',
    ],
    evidence: [
      'Client preview readiness depends on hosted gates, source readiness, Netlify setup, and deployed preview evidence',
      'Preview promotion writes a receipt before production deploy',
      'Hosted smokes require legal and billing evidence on deployed previews',
    ],
  },
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

function markdownSurface(surface: ReviewSurface) {
  const fileRows = surface.files.map((file) => {
    const evidence = fileEvidence(file);
    return `- ${file}: ${evidence.exists ? `present, ${evidence.bytes} bytes` : 'missing'}`;
  });

  return [
    `### ${surface.label}`,
    '',
    `Reviewer question: ${surface.reviewerQuestion}`,
    '',
    `Routes: ${surface.routes.join(', ')}`,
    '',
    'Files:',
    ...fileRows,
    '',
    'Evidence to verify:',
    ...surface.evidence.map((item) => `- ${item}`),
    '',
  ];
}

async function main() {
  const generatedAt = new Date().toISOString();
  const launchReadiness = await getLaunchReadiness();
  const legalReadinessItem = launchReadiness.readiness.items.find((item) => item.key === 'legal-review') ?? null;
  const legalBlockers = launchReadiness.blockers.filter((item) => item.key === 'legal-review');
  const legalWarnings = launchReadiness.warnings.filter((item) => item.key === 'legal-review');
  const criticalPath = getLaunchCriticalPath(launchReadiness.blockers, {
    netlifyIdentityReady: launchReadiness.netlifyProjectSetupReceiptReadiness.identityReady,
  });
  const externalBlockerSummary = getLaunchExternalBlockerSummary(launchReadiness.blockers);
  const legalSurfaceFiles = reviewSurfaces.flatMap((surface) => surface.files);
  const uniqueFiles = [...new Set(legalSurfaceFiles)];
  const missingFiles = uniqueFiles.map(fileEvidence).filter((item) => !item.exists);
  const requiredReviewerActions = [
    'Run npm run validate:legal and confirm it passes.',
    'Review this packet plus the listed routes in a deployed preview, not only local source files.',
    'Confirm proof-required, authorization, billing, privacy, and filing boundaries are acceptable for client preview.',
    'Only after review is complete, set CLAIMBOT_LEGAL_REVIEW_ACK=reviewed in production and deploy-preview environments.',
    'Rerun npm run launch:handoff and npm run preview:gate after the legal acknowledgment and other external blockers are configured.',
  ];

  const packet = {
    format: 'claimbot.legal-review-packet.v1',
    generatedAt,
    note: 'Non-secret legal/compliance review packet. This packet intentionally omits API keys, session secrets, database URLs, tokens, billing secrets, checkout URLs, and raw user data.',
    approvalBoundary: {
      currentLegalAckRecorded: legalReadinessItem?.status === 'pass',
      legalAckEnvName: 'CLAIMBOT_LEGAL_REVIEW_ACK',
      requiredValueAfterReview: 'reviewed',
      packetIsApproval: false,
    },
    currentReadiness: {
      legalStatus: legalReadinessItem?.status ?? 'unknown',
      legalDetail: legalReadinessItem?.detail ?? 'Legal readiness item was not found.',
      legalAction: legalReadinessItem?.action ?? 'Review legal surfaces, then record the acknowledgment.',
      blockerCount: launchReadiness.blockers.length,
      warningCount: launchReadiness.warnings.length,
      clientPreviewReady: launchReadiness.clientPreviewReady,
      filingMode: launchReadiness.mode,
      liveFilingFeatureEnabled: launchReadiness.liveFilingFeatureEnabled,
      legalBlockers,
      legalWarnings,
      externalBlockerSummary,
      criticalPath,
    },
    surfaces: reviewSurfaces.map((surface) => ({
      ...surface,
      files: surface.files.map(fileEvidence),
    })),
    missingFiles,
    commands: {
      legalReview: [
        'npm run legal:packet',
        'npm run validate:legal',
        'npm run launch:handoff',
      ],
      afterApproval: [
        'netlify env:set CLAIMBOT_LEGAL_REVIEW_ACK "reviewed" --context production deploy-preview',
        'npm run hosted:env:doctor',
        'npm run preview:gate',
        'npm run production:check-receipt',
      ],
      verificationCommands,
    },
    requiredReviewerActions,
    operatorNotes: hostedOperatorNotes.filter((note) => (
      note.includes('legal')
      || note.includes('proof')
      || note.includes('authorization')
      || note.includes('billing')
      || note.includes('support')
      || note.includes('preview')
    )),
  };

  const markdown = [
    '# ClaimBot Legal Review Packet',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This is a non-secret review packet. This packet is not approval, and it does not set `CLAIMBOT_LEGAL_REVIEW_ACK`.',
    '',
    '## Current Gate',
    '',
    `Legal ACK recorded: ${packet.approvalBoundary.currentLegalAckRecorded ? 'yes' : 'no'}`,
    `Legal readiness: ${packet.currentReadiness.legalStatus}`,
    `Detail: ${packet.currentReadiness.legalDetail}`,
    `Next action: ${packet.currentReadiness.legalAction}`,
    `Client preview ready: ${packet.currentReadiness.clientPreviewReady ? 'yes' : 'no'}`,
    `Filing mode: ${packet.currentReadiness.filingMode}`,
    `Live filing feature enabled: ${packet.currentReadiness.liveFilingFeatureEnabled ? 'yes' : 'no'}`,
    `Launch blockers: ${packet.currentReadiness.blockerCount}`,
    `Launch warnings: ${packet.currentReadiness.warningCount}`,
    '',
    '## Required Reviewer Actions',
    '',
    ...requiredReviewerActions.map((item) => `- ${item}`),
    '',
    '## Review Surfaces',
    '',
    ...reviewSurfaces.flatMap(markdownSurface),
    '## Missing Files',
    '',
    ...(missingFiles.length === 0
      ? ['- None']
      : missingFiles.map((item) => `- ${item.path}`)),
    '',
    '## Commands',
    '',
    'Before approval:',
    '',
    '- `npm run legal:packet`',
    '- `npm run validate:legal`',
    '- `npm run launch:handoff`',
    '',
    'After approval:',
    '',
    '- `netlify env:set CLAIMBOT_LEGAL_REVIEW_ACK "reviewed" --context production deploy-preview`',
    '- `npm run hosted:env:doctor`',
    '- `npm run preview:gate`',
    '- `npm run production:check-receipt`',
    '',
    '## Notes',
    '',
    '- Keep live filing disabled until a separate live-filing review is complete.',
    '- Keep proof-required claims in review unless proof is staged and authorization checks pass.',
    '- Do not treat this packet as legal advice or as a substitute for attorney/operator review.',
    '- No secrets or raw user data are written to this packet.',
    '',
  ].join('\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[legal-review-packet] wrote non-secret review packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Legal readiness: ${packet.currentReadiness.legalStatus}`);
  console.log(`Missing files: ${missingFiles.length}`);
  console.log('No secret values were printed.');
}

main().catch((error) => {
  console.error('[legal-review-packet] failed');
  console.error(error);
  process.exit(1);
});
