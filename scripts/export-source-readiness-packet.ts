import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getSourceCatalogReadiness } from '../src/lib/source-catalog-readiness';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'source-readiness-packet.json');
const markdownPath = path.join(outputDir, 'source-readiness-packet.md');

const sourceEvidenceFiles = [
  'data/source-catalog-export.json',
  'data/source-catalog-export.json.sha256',
  'src/lib/source-catalog-readiness.ts',
  'src/lib/source-catalog-transfer.ts',
  'src/lib/scraper/classaction-org.ts',
  'src/lib/scraper/official-site-enrichment.ts',
  'src/lib/matcher/run-matcher.ts',
  'scripts/validate-source-catalog.ts',
  'scripts/export-source-catalog.ts',
  'scripts/import-source-catalog.ts',
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

function readDigest() {
  const digestPath = path.join(process.cwd(), 'data/source-catalog-export.json.sha256');
  if (!fs.existsSync(digestPath)) return null;
  const [digest, filename] = fs.readFileSync(digestPath, 'utf8').trim().split(/\s+/);
  if (!digest) return null;
  return {
    sha256Digest: digest,
    filename: filename ?? 'source-catalog-export.json',
  };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const readiness = await getSourceCatalogReadiness({
    sourceQualityRequired: true,
  });
  const exportDigest = readDigest();
  const packet = {
    format: 'claimbot.source-readiness-packet.v1',
    generatedAt,
    note: 'Non-secret source readiness packet. This packet records settlement source coverage, transfer digest evidence, and matcher input readiness without writing user profile facts, purchases, breaches, claim records, secrets, tokens, or raw scraped pages.',
    readiness: {
      ready: readiness.ok,
      requiredForClientPreview: readiness.requiredForClientPreview,
      strictQuality: readiness.sourceQualityRequired,
      settlementSearchEnabled: readiness.settlementSearchEnabled,
      totalSettlements: readiness.totalSettlements,
      sourceProviderCount: readiness.sourceProviderCount,
      linkedClaimForms: readiness.linkedClaimForms,
      formCoveragePercent: readiness.formCoveragePercent,
      deadlineCoveragePercent: readiness.deadlineCoveragePercent,
      knownAdministratorPercent: readiness.knownAdministratorPercent,
      categorizedPercent: readiness.categorizedPercent,
      mojibakeCount: readiness.mojibakeCount,
      latestSourceImportDigest: readiness.latestSourceImportDigest,
      latestSourceImportRecordCount: readiness.latestSourceImportRecordCount,
      exportDigest,
      failureCount: readiness.failureCount,
      warningCount: readiness.warningCount,
      items: readiness.items,
      note: 'Source readiness proves the local/transfer catalog is usable for claim discovery and matching review. Hosted launch still requires the hosted database to import and validate the same catalog digest.',
    },
    sourceEvidence: sourceEvidenceFiles.map(fileEvidence),
    commands: [
      'npm run validate:source:strict',
      'npm run source:export',
      'npm run source:packet',
      'npm run matcher:receipt',
      '# For hosted DB bootstrap:',
      'npm run with:hosted-env -- npm run source:import:dry',
      'npm run with:hosted-env -- npm run source:import',
      'npm run launch:handoff',
    ],
  };

  const markdown = [
    '# ClaimBot Source Readiness Packet',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This is a non-secret source readiness packet. It records source coverage and transfer digest evidence without writing user profile facts, purchases, breaches, claim records, secrets, tokens, or raw scraped pages.',
    '',
    '## Current Gate',
    '',
    `Source readiness: ${readiness.ok ? 'ready' : 'blocked'}`,
    `Strict quality: ${readiness.sourceQualityRequired ? 'yes' : 'no'}`,
    `Settlement search enabled: ${readiness.settlementSearchEnabled ? 'yes' : 'no'}`,
    `Total settlements: ${readiness.totalSettlements}`,
    `Source providers: ${readiness.sourceProviderCount}`,
    `Claim-form coverage: ${readiness.formCoveragePercent}%`,
    `Deadline coverage: ${readiness.deadlineCoveragePercent}%`,
    `Administrator coverage: ${readiness.knownAdministratorPercent}%`,
    `Category coverage: ${readiness.categorizedPercent}%`,
    `Mojibake count: ${readiness.mojibakeCount}`,
    `Import digest: ${readiness.latestSourceImportDigest ?? 'not recorded'}`,
    `Export digest: ${exportDigest?.sha256Digest ?? 'not recorded'}`,
    `Boundary: ${packet.readiness.note}`,
    '',
    '## Readiness Items',
    '',
    ...readiness.items.map((item) => [
      `- ${item.label}: ${item.status}`,
      `  Detail: ${item.detail}`,
    ].join('\n')),
    '',
    '## Source Evidence',
    '',
    ...packet.sourceEvidence.map((item) => `- ${item.path}: ${item.exists ? `present, ${item.bytes} bytes` : 'missing'}`),
    '',
    '## Commands',
    '',
    ...packet.commands.map((command) => `- \`${command}\``),
    '',
  ].join('\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[source-readiness-packet] wrote non-secret source packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Source readiness: ${readiness.ok ? 'ready' : 'blocked'}`);
  console.log(`Settlements: ${readiness.totalSettlements}`);
  console.log(`Claim-form coverage: ${readiness.formCoveragePercent}%`);
}

main().catch((error) => {
  console.error('[source-readiness-packet] failed');
  console.error(error);
  process.exit(1);
});
