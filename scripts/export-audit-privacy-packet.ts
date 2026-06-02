import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'audit-privacy-packet.json');
const markdownPath = path.join(outputDir, 'audit-privacy-packet.md');

const sourceEvidenceFiles = [
  'src/lib/audit/claim-export.ts',
  'src/lib/audit/support-packet.ts',
  'src/lib/privacy/export.ts',
  'src/lib/privacy/request.ts',
  'src/app/api/claims/[id]/audit-export/route.ts',
  'src/app/api/audit/support-packet/route.ts',
  'src/app/api/privacy/export/route.ts',
  'src/app/api/privacy/request/route.ts',
  'src/app/trust/page.tsx',
  'tests/unit/privacy-request.test.ts',
  'tests/unit/claim-audit-export.test.ts',
  'tests/integration/claim-audit-export.test.ts',
];

type Assertion = {
  key: string;
  label: string;
  file: string;
  passed: boolean;
  evidence: string;
};

function readFile(relativePath: string) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  return fs.readFileSync(absolutePath, 'utf8');
}

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

function includesAll(relativePath: string, needles: string[]) {
  const content = readFile(relativePath);
  return Boolean(content && needles.every((needle) => content.includes(needle)));
}

function assertion(key: string, label: string, file: string, needles: string[], evidence: string): Assertion {
  return {
    key,
    label,
    file,
    passed: includesAll(file, needles),
    evidence,
  };
}

function testExists(relativePath: string, evidence: string): Assertion {
  return {
    key: relativePath.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(),
    label: `${relativePath} exists`,
    file: relativePath,
    passed: fs.existsSync(path.join(process.cwd(), relativePath)),
    evidence,
  };
}

function main() {
  const generatedAt = new Date().toISOString();
  const assertions: Assertion[] = [
    assertion(
      'claim-audit-export-boundary',
      'Claim audit export records safety boundary, audit events, and digest evidence.',
      'src/lib/audit/claim-export.ts',
      ['claimbot.claim-audit-export.v1', 'safetyBoundary', 'auditEvents', 'digest', 'sha256Digest'],
      'Claim-level export carries a versioned payload, safety boundary, audit timeline, and tamper-evident digest.',
    ),
    assertion(
      'privacy-export-boundary',
      'Privacy export excludes payment methods and records request/audit boundaries.',
      'src/lib/privacy/export.ts',
      ['claimbot.privacy-export.v1', 'paymentMethodsExcluded', 'privacyRequestBoundary', 'auditCheckpoint', 'digest'],
      'Account privacy export keeps payment methods out, records an audit checkpoint, and includes a digest.',
    ),
    assertion(
      'privacy-export-route',
      'Privacy export route audits downloads and sends a no-store JSON attachment.',
      'src/app/api/privacy/export/route.ts',
      ['PRIVACY_EXPORT_CREATED', 'Content-Disposition', 'Cache-Control', 'no-store'],
      'Authenticated privacy export route records an audit event and prevents browser/proxy caching.',
    ),
    assertion(
      'privacy-request-boundary',
      'Privacy request intake is audited and does not automatically destroy records.',
      'src/lib/privacy/request.ts',
      ['PRIVACY_REQUEST_CREATED', 'no destructive deletion is performed automatically'],
      'Privacy requests are recorded for operator handling instead of silently deleting claim, billing, or audit evidence.',
    ),
    assertion(
      'privacy-request-route-boundary',
      'Privacy request route exposes the no-destruction boundary to clients.',
      'src/app/api/privacy/request/route.ts',
      ['recordPrivacyRequest', 'no destructive deletion is performed automatically'],
      'Request endpoint uses the shared privacy request recorder and returns the safety boundary.',
    ),
    assertion(
      'support-packet-export-boundary',
      'Support packet route produces authenticated no-store audit evidence.',
      'src/app/api/audit/support-packet/route.ts',
      ['buildAuditSupportPacket', 'Content-Disposition', 'Cache-Control', 'no-store'],
      'Support packet downloads are built server-side and sent as no-store attachments.',
    ),
    assertion(
      'claim-audit-route-boundary',
      'Claim audit route returns per-claim audit exports without caching.',
      'src/app/api/claims/[id]/audit-export/route.ts',
      ['buildClaimAuditExport', 'claim not found', 'Content-Disposition', 'Cache-Control', 'no-store'],
      'Claim audit endpoint validates ownership/not-found handling and sends a no-store attachment.',
    ),
    assertion(
      'trust-copy-boundary',
      'Trust page explains privacy exports, audited requests, and no-store handling.',
      'src/app/trust/page.tsx',
      ['Privacy exports and privacy requests are authenticated, audited, and no-store', 'Deletion requests are recorded for operator handling'],
      'Client-facing trust copy matches the non-destructive privacy request implementation.',
    ),
    testExists(
      'tests/unit/privacy-request.test.ts',
      'Unit coverage exists for privacy request normalization and recording.',
    ),
    testExists(
      'tests/unit/claim-audit-export.test.ts',
      'Unit coverage exists for claim audit export boundaries.',
    ),
    testExists(
      'tests/integration/claim-audit-export.test.ts',
      'Integration coverage exists for claim audit export ownership and not-found behavior.',
    ),
  ];

  const failureCount = assertions.filter((item) => !item.passed).length;
  const ready = failureCount === 0;
  const packet = {
    format: 'claimbot.audit-privacy-packet.v1',
    generatedAt,
    note: 'Non-secret audit and privacy packet. This records source-level readiness only; it does not include user profiles, claims, purchases, breaches, claim forms, export payloads, API responses, secrets, tokens, database URLs, or payment details.',
    readiness: {
      ready,
      failureCount,
      requiredForClientPreview: true,
      boundary: 'ClaimBot must preserve auditable proof chains, authenticated export paths, no-store privacy/support downloads, and manual operator handling for privacy deletion requests before client launch.',
    },
    assertions,
    sourceEvidence: sourceEvidenceFiles.map(fileEvidence),
    commands: [
      'npm run audit:privacy:packet',
      'npx vitest run tests/unit/privacy-request.test.ts tests/unit/claim-audit-export.test.ts tests/integration/claim-audit-export.test.ts',
      'npm run validate:ui',
      'npm run validate:legal',
      'npm run launch:handoff',
    ],
  };

  const markdown = [
    '# ClaimBot Audit and Privacy Packet',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This is a non-secret audit/privacy readiness packet. It records source-level evidence only and excludes user profiles, claims, purchases, breaches, claim forms, export payloads, API responses, secrets, tokens, database URLs, and payment details.',
    '',
    '## Current Gate',
    '',
    `Audit/privacy ready: ${ready ? 'yes' : 'no'}`,
    `Failures: ${failureCount}`,
    `Required for client preview: ${packet.readiness.requiredForClientPreview ? 'yes' : 'no'}`,
    `Boundary: ${packet.readiness.boundary}`,
    '',
    '## Assertions',
    '',
    ...assertions.map((item) => [
      `- ${item.label}: ${item.passed ? 'pass' : 'fail'}`,
      `  File: ${item.file}`,
      `  Evidence: ${item.evidence}`,
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

  console.log('[audit-privacy-packet] wrote non-secret audit/privacy packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Audit/privacy ready: ${ready ? 'ready' : 'blocked'}`);
  console.log(`Failures: ${failureCount}`);
  console.log('No user data, claim data, API responses, or secret values were printed.');

  if (!ready) process.exit(1);
}

main();
