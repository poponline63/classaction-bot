import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { loadIgnoredOperatorEnvForReadiness } from '../src/lib/ignored-operator-env';
import { evaluateNetlifyPreviewReadiness } from '../src/lib/netlify-preview-readiness';
import { evaluatePreviewPromotionReceipt } from '../src/lib/preview-promotion-receipt';
import { previewSmokeCommands, hostedOperatorNotes } from '../src/lib/hosted-remediation';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'preview-promotion-packet.json');
const markdownPath = path.join(outputDir, 'preview-promotion-packet.md');

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

function itemRows(items: Array<{
  key: string;
  label: string;
  status: string;
  detail: string;
  action?: string;
  serverObservable?: boolean;
}>) {
  return items.map((item) => ({
    key: item.key,
    label: item.label,
    status: item.status,
    detail: item.detail,
    action: item.action ?? null,
    serverObservable: item.serverObservable ?? false,
  }));
}

function statusLine(status: string) {
  return status.toUpperCase();
}

async function main() {
  const generatedAt = new Date().toISOString();
  const ignoredOperatorEnv = loadIgnoredOperatorEnvForReadiness();
  const previewReadiness = evaluateNetlifyPreviewReadiness({ strict: true });
  const receiptReadiness = evaluatePreviewPromotionReceipt();
  const sourceFiles = [
    'src/lib/netlify-preview-readiness.ts',
    'src/lib/preview-promotion-receipt.ts',
    'scripts/validate-netlify-preflight.cjs',
    'scripts/preview-promotion-gate.cjs',
    'scripts/validate-preview-promotion-receipt.cjs',
    'scripts/smoke-webapp.cjs',
    'scripts/smoke-hosted-auth.cjs',
    'scripts/smoke-feature-flags.cjs',
    'netlify.toml',
  ];
  const previewItems = itemRows(previewReadiness.items);
  const receiptItems = itemRows(receiptReadiness.items);
  const packet = {
    format: 'claimbot.preview-promotion-packet.v1',
    generatedAt,
    note: 'Non-secret preview promotion packet. This packet intentionally omits site IDs, session secrets, billing secrets, database credentials, checkout URLs, tokens, and raw user data.',
    approvalBoundary: {
      packetIsPreviewPromotionApproval: false,
      previewPromotionReady: previewReadiness.ok && receiptReadiness.ok,
      readyRequires: [
        'Confirmed ClaimBot Netlify site target',
        'HTTPS deployed preview URL assigned to SMOKE_BASE_URL',
        'SMOKE_BASE_URL matching NETLIFY_SITE_SLUG or dashboard-derived slug',
        'Preview smoke secrets supplied only in the operator terminal',
        'Fresh data/preview-promotion-receipt.json written by npm run preview:gate',
        'npm run production:check-receipt passing before production deploy',
      ],
    },
    ignoredOperatorEnv,
    netlifyPreviewReadiness: {
      ok: previewReadiness.ok,
      strict: previewReadiness.strict,
      failureCount: previewReadiness.failureCount,
      warningCount: previewReadiness.warningCount,
      buildConfigReady: previewReadiness.buildConfigReady,
      promotionScriptsReady: previewReadiness.promotionScriptsReady,
      siteLinked: previewReadiness.siteLinked,
      siteLinkSource: previewReadiness.siteLinkSource,
      netlifySiteSlugPresent: Boolean(previewReadiness.netlifySiteSlug),
      smokeBaseUrlConfigured: previewReadiness.smokeBaseUrlConfigured,
      smokeBaseUrlHttps: previewReadiness.smokeBaseUrlHttps,
      smokeBaseUrlMatchesSite: previewReadiness.smokeBaseUrlMatchesSite,
      sessionSmokeSecretConfigured: previewReadiness.sessionSmokeSecretConfigured,
      billingSmokeSecretConfigured: previewReadiness.billingSmokeSecretConfigured,
      items: previewItems,
    },
    previewPromotionReceipt: {
      ok: receiptReadiness.ok,
      receiptPath: path.relative(process.cwd(), receiptReadiness.receiptPath),
      exists: receiptReadiness.exists,
      formatOk: receiptReadiness.formatOk,
      modeOk: receiptReadiness.modeOk,
      fresh: receiptReadiness.fresh,
      ageHours: receiptReadiness.ageHours,
      maxAgeHours: receiptReadiness.maxAgeHours,
      smokeBaseUrlPresent: Boolean(receiptReadiness.smokeBaseUrl),
      netlifySiteSlugPresent: Boolean(receiptReadiness.netlifySiteSlug),
      sourceCatalogDigestPresent: Boolean(receiptReadiness.sourceCatalogDigest),
      createdAt: receiptReadiness.createdAt,
      failureCount: receiptReadiness.failureCount,
      warningCount: receiptReadiness.warningCount,
      items: receiptItems,
    },
    commands: {
      prepareTarget: [
        'npm run preview:packet',
        'netlify deploy',
        '$env:NETLIFY_SITE_SLUG="YOUR_CONFIRMED_CLAIMBOT_SITE_SLUG"',
        '$env:SMOKE_BASE_URL="https://your-preview.netlify.app"',
        'npm run validate:netlify:strict',
      ],
      smokeAndPromote: [
        'npm run preview:gate',
        'npm run production:check-receipt',
      ],
      deployedPreviewSmokeInputs: previewSmokeCommands,
    },
    sourceEvidence: sourceFiles.map(fileEvidence),
    operatorNotes: hostedOperatorNotes.filter((note) => (
      note.toLowerCase().includes('preview')
      || note.toLowerCase().includes('netlify')
      || note.toLowerCase().includes('smoke')
      || note.toLowerCase().includes('production')
      || note.toLowerCase().includes('receipt')
    )),
  };

  const markdown = [
    '# ClaimBot Preview Promotion Packet',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This is a non-secret preview promotion packet. This packet is not production approval, and it does not print site IDs, session secrets, billing secrets, database credentials, or checkout URLs.',
    '',
    '## Current Gate',
    '',
    `Preview promotion ready: ${packet.approvalBoundary.previewPromotionReady ? 'yes' : 'no'}`,
    `Netlify preview failures: ${previewReadiness.failureCount}`,
    `Netlify preview warnings: ${previewReadiness.warningCount}`,
    `Promotion receipt failures: ${receiptReadiness.failureCount}`,
    `Promotion receipt warnings: ${receiptReadiness.warningCount}`,
    `Site linked: ${previewReadiness.siteLinked ? 'yes' : 'no'} (${previewReadiness.siteLinkSource})`,
    `Site slug present: ${previewReadiness.netlifySiteSlug ? 'yes' : 'no'}`,
    `SMOKE_BASE_URL configured: ${previewReadiness.smokeBaseUrlConfigured ? 'yes' : 'no'}`,
    `SMOKE_BASE_URL HTTPS: ${previewReadiness.smokeBaseUrlHttps ? 'yes' : 'no'}`,
    `Preview receipt exists: ${receiptReadiness.exists ? 'yes' : 'no'}`,
    `Receipt fresh: ${receiptReadiness.fresh ? 'yes' : 'no'}`,
    `Ignored operator env loaded: ${ignoredOperatorEnv.loaded}/${ignoredOperatorEnv.available} available non-placeholder values`,
    '',
    '## Netlify Preview Readiness',
    '',
    ...previewItems.map((item) => `- ${statusLine(item.status)} ${item.label}: ${item.detail}${item.action ? ` Next: ${item.action}` : ''}`),
    '',
    '## Promotion Receipt Readiness',
    '',
    ...receiptItems.map((item) => `- ${statusLine(item.status)} ${item.label}: ${item.detail}${item.action ? ` Next: ${item.action}` : ''}`),
    '',
    '## Commands',
    '',
    'Prepare target:',
    '',
    ...packet.commands.prepareTarget.map((command) => `- \`${command}\``),
    '',
    'Smoke and promote:',
    '',
    ...packet.commands.smokeAndPromote.map((command) => `- \`${command}\``),
    '',
    '## Source Evidence',
    '',
    ...packet.sourceEvidence.map((item) => `- ${item.path}: ${item.exists ? `present, ${item.bytes} bytes` : 'missing'}`),
    '',
    '## Notes',
    '',
    '- Use a deployed HTTPS Netlify preview, not localhost, for production promotion.',
    '- Run npm run preview:gate as the authority command; do not replace it with ad hoc individual checks.',
    '- Keep data/preview-promotion-receipt.json and rerun npm run production:check-receipt before production deploy.',
    '- No secret values were printed.',
    '',
  ].join('\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[preview-promotion-packet] wrote non-secret preview promotion packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Preview promotion ready: ${packet.approvalBoundary.previewPromotionReady ? 'yes' : 'no'}`);
  console.log(`Preview failures: ${previewReadiness.failureCount}`);
  console.log(`Receipt failures: ${receiptReadiness.failureCount}`);
  console.log('No secret values were printed.');
}

main().catch((error) => {
  console.error('[preview-promotion-packet] failed');
  console.error(error);
  process.exit(1);
});
