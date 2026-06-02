import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getDatabaseSchemaReadiness } from '../src/lib/database-schema-readiness';
import { loadIgnoredOperatorEnvForReadiness } from '../src/lib/ignored-operator-env';
import { getSourceCatalogReadiness } from '../src/lib/source-catalog-readiness';
import { sourceCatalogFileDigest } from '../src/lib/source-catalog-transfer';
import { hostedDatabaseSetupCommands, hostedOperatorNotes } from '../src/lib/hosted-remediation';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'hosted-database-packet.json');
const markdownPath = path.join(outputDir, 'hosted-database-packet.md');
const hostedEnvPath = path.join(process.cwd(), '.env.hosted.local');
const sourceCatalogPath = path.join(process.cwd(), 'data', 'source-catalog-export.json');
const sourceCatalogDigestPath = `${sourceCatalogPath}.sha256`;
const hostedDatabaseReceiptPath = path.join(process.cwd(), 'data', 'hosted-database-smoke-receipt.json');

function parseEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return {};
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (key) values[key] = value;
  }
  return values;
}

function hasTemplatePlaceholder(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() || '';
  if (!normalized) return false;
  return (
    normalized.includes('your_')
    || normalized.includes('your-')
    || normalized.includes('paste_')
    || normalized.includes('paste-')
    || normalized.includes('yourdomain.com')
    || normalized === 'example'
    || normalized === 'placeholder'
  );
}

function hasValue(value: string | undefined) {
  return Boolean(value?.trim()) && !hasTemplatePlaceholder(value);
}

function visibleDatabaseUrlShape(value: string | undefined) {
  const databaseUrl = value?.trim() ?? '';
  if (!hasValue(databaseUrl)) return 'missing';
  if (databaseUrl.startsWith('libsql://')) return 'libsql://...';
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) return 'postgres://...';
  if (databaseUrl.startsWith('mysql://')) return 'mysql://...';
  if (databaseUrl.startsWith('sqlite://')) return 'sqlite://...';
  if (databaseUrl.startsWith('file:')) return 'file:...';
  return `${databaseUrl.split(':')[0] || 'unknown'}:...`;
}

function hostedDatabaseStagingStatus() {
  const env = {
    ...parseEnvFile(hostedEnvPath),
    ...process.env,
  };
  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  const databaseAuthToken = (env.DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || '').trim();
  const issues: string[] = [];

  if (!hasValue(databaseUrl) || databaseUrl.includes('YOUR_DATABASE')) {
    issues.push('DATABASE_URL is missing or still placeholder-only.');
  } else if (databaseUrl.startsWith('file:')) {
    issues.push('DATABASE_URL points at local file storage; hosted deploys require external persistent storage.');
  }

  if (databaseUrl.startsWith('libsql://') && !hasValue(databaseAuthToken)) {
    issues.push('DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN is required for libSQL/Turso hosted databases.');
  }

  return {
    ok: issues.length === 0,
    envFileExists: fs.existsSync(hostedEnvPath),
    envFilePath: '.env.hosted.local',
    databaseUrlShape: visibleDatabaseUrlShape(databaseUrl),
    databaseAuthTokenPresent: hasValue(databaseAuthToken),
    issues,
    note: 'Redacted hosted database staging check only; no database URLs, tokens, or secret values are written to this packet.',
  };
}

function fileEvidence(filePath: string, relativePath = path.relative(process.cwd(), filePath)) {
  if (!fs.existsSync(filePath)) {
    return {
      path: relativePath,
      exists: false,
      bytes: 0,
      modifiedAt: null,
    };
  }
  const stat = fs.statSync(filePath);
  return {
    path: relativePath,
    exists: true,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

function readJsonFile(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hostedDatabaseReceiptSummary() {
  const raw = readJsonFile(hostedDatabaseReceiptPath);
  if (!raw) {
    return {
      exists: false,
      status: 'missing',
      generatedAt: null,
      databaseKind: null,
      externalDatabaseConfigured: null,
      schemaOk: null,
      sourceDryRunOk: null,
      sourceDryRunChecked: null,
    };
  }
  const database = raw.database && typeof raw.database === 'object' ? raw.database as Record<string, unknown> : {};
  const schema = raw.schema && typeof raw.schema === 'object' ? raw.schema as Record<string, unknown> : {};
  const sourceDryRun = raw.sourceImportDryRun && typeof raw.sourceImportDryRun === 'object' ? raw.sourceImportDryRun as Record<string, unknown> : {};
  const sourceResult = sourceDryRun.result && typeof sourceDryRun.result === 'object' ? sourceDryRun.result as Record<string, unknown> : {};

  return {
    exists: true,
    status: typeof raw.status === 'string' ? raw.status : 'unknown',
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : null,
    databaseKind: typeof database.kind === 'string' ? database.kind : null,
    externalDatabaseConfigured: typeof database.externalDatabaseConfigured === 'boolean' ? database.externalDatabaseConfigured : null,
    schemaOk: typeof schema.ok === 'boolean' ? schema.ok : null,
    sourceDryRunOk: typeof sourceDryRun.ok === 'boolean' ? sourceDryRun.ok : null,
    sourceDryRunChecked: typeof sourceResult.checked === 'number' ? sourceResult.checked : null,
  };
}

function sourceCatalogExportReceipt() {
  const bundle = fileEvidence(sourceCatalogPath, 'data/source-catalog-export.json');
  const sidecar = fileEvidence(sourceCatalogDigestPath, 'data/source-catalog-export.json.sha256');
  let digest: string | null = null;
  let digestMatchesSidecar: boolean | null = null;
  let recordCount: number | null = null;
  let exportedAt: string | null = null;
  let format: string | null = null;
  const issues: string[] = [];

  if (!bundle.exists) {
    issues.push('data/source-catalog-export.json is missing.');
  } else {
    try {
      digest = sourceCatalogFileDigest(sourceCatalogPath);
      const parsed = JSON.parse(fs.readFileSync(sourceCatalogPath, 'utf8'));
      format = typeof parsed.format === 'string' ? parsed.format : null;
      exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null;
      recordCount = Array.isArray(parsed.records) ? parsed.records.length : null;
    } catch (error) {
      issues.push(error instanceof Error ? error.message : 'Source catalog export could not be parsed.');
    }
  }

  if (!sidecar.exists) {
    issues.push('data/source-catalog-export.json.sha256 is missing.');
  } else if (digest) {
    const expected = fs.readFileSync(sourceCatalogDigestPath, 'utf8').trim().split(/\s+/)[0] ?? '';
    digestMatchesSidecar = expected.toLowerCase() === digest.toLowerCase();
    if (!digestMatchesSidecar) {
      issues.push('Source catalog digest sidecar does not match the export file.');
    }
  }

  return {
    ok: issues.length === 0,
    bundle,
    sidecar,
    format,
    exportedAt,
    recordCount,
    sha256Digest: digest,
    digestMatchesSidecar,
    issues,
  };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const ignoredOperatorEnv = loadIgnoredOperatorEnvForReadiness();
  const hostedDatabase = hostedDatabaseStagingStatus();
  const databaseSchema = await getDatabaseSchemaReadiness();
  const sourceCatalog = await getSourceCatalogReadiness({ sourceQualityRequired: true });
  const sourceExport = sourceCatalogExportReceipt();
  const hostedDatabaseReceipt = hostedDatabaseReceiptSummary();
  const sourceFiles = [
    'src/db/client.ts',
    'src/db/schema.ts',
    'src/lib/database-schema-readiness.ts',
    'src/lib/source-catalog-transfer.ts',
    'src/lib/source-catalog-readiness.ts',
    'scripts/prepare-hosted-database.cjs',
    'scripts/validate-hosted-database-env.cjs',
    'scripts/run-hosted-database-receipt.ts',
    'data/hosted-database-smoke-receipt.json',
    'scripts/push-hosted-database.cjs',
    'scripts/import-source-catalog.ts',
    'scripts/export-source-catalog.ts',
  ];

  const packet = {
    format: 'claimbot.hosted-database-packet.v1',
    generatedAt,
    note: 'Non-secret hosted database activation packet. This packet intentionally omits database URLs, database tokens, API keys, session secrets, billing secrets, checkout URLs, and raw user data.',
    approvalBoundary: {
      packetIsHostedDatabaseActivation: false,
      hostedDatabaseReady: hostedDatabase.ok,
      readyRequires: [
        'Real hosted DATABASE_URL',
        'DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN when using libSQL/Turso',
        'Hosted migrations run with npm run with:hosted-env -- npm run db:migrate',
        'Schema probes passing against the hosted database',
        'Non-secret data/hosted-database-smoke-receipt.json proving schema probes and source import dry-run',
        'Source catalog export/import dry-run and import receipt',
      ],
    },
    ignoredOperatorEnv,
    hostedDatabase,
    databaseSchema: {
      ok: databaseSchema.ok,
      failureCount: databaseSchema.failures.length,
      items: databaseSchema.items,
    },
    hostedDatabaseReceipt,
    sourceCatalog: {
      ok: sourceCatalog.ok,
      sourceCatalogReady: sourceCatalog.sourceCatalogReady,
      sourceQualityReady: sourceCatalog.sourceQualityReady,
      totalSettlements: sourceCatalog.totalSettlements,
      sourceProviderCount: sourceCatalog.sourceProviderCount,
      formCoveragePercent: sourceCatalog.formCoveragePercent,
      deadlineCoveragePercent: sourceCatalog.deadlineCoveragePercent,
      knownAdministratorPercent: sourceCatalog.knownAdministratorPercent,
      categorizedPercent: sourceCatalog.categorizedPercent,
      textEncodingReady: sourceCatalog.textEncodingReady,
      mojibakeCount: sourceCatalog.mojibakeCount,
      latestSourceImportDigest: sourceCatalog.latestSourceImportDigest,
      latestSourceImportRecordCount: sourceCatalog.latestSourceImportRecordCount,
      items: sourceCatalog.items,
    },
    sourceCatalogExport: sourceExport,
    sourceEvidence: sourceFiles.map((file) => fileEvidence(path.join(process.cwd(), file), file)),
    commands: {
      prepare: [
        'npm run hosted:db:packet',
        'npm run hosted:db:receipt',
        'npm run hosted:db:prepare',
        'npm run hosted:db:doctor',
      ],
      migrateAndImport: [
        'npm run with:hosted-env -- npm run db:migrate',
        'npm run with:hosted-env -- npm run validate:schema',
        'npm run validate:source:strict',
        'npm run source:export',
        'npm run with:hosted-env -- npm run source:import:dry',
        'npm run with:hosted-env -- npm run source:import',
      ],
      pushAndVerify: [
        'npm run hosted:db:push',
        'npm run smoke:hosted:local',
        'npm run launch:handoff',
      ],
    },
    operatorNotes: hostedOperatorNotes.filter((note) => (
      note.toLowerCase().includes('database')
      || note.toLowerCase().includes('source catalog')
      || note.toLowerCase().includes('source-catalog')
      || note.toLowerCase().includes('schema')
      || note.toLowerCase().includes('preview')
    )),
  };

  const markdown = [
    '# ClaimBot Hosted Database Packet',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This is a non-secret hosted database activation packet. This packet is not proof that hosted storage is configured, and it does not print database URLs or tokens.',
    '',
    '## Current Gate',
    '',
    `Hosted database ready: ${hostedDatabase.ok ? 'yes' : 'no'}`,
    `Hosted env file: ${hostedDatabase.envFileExists ? hostedDatabase.envFilePath : 'missing'}`,
    `Database URL shape: ${hostedDatabase.databaseUrlShape}`,
    `Database auth token present: ${hostedDatabase.databaseAuthTokenPresent ? 'yes' : 'missing or not required'}`,
    `Schema probes passing: ${databaseSchema.ok ? 'yes' : 'no'}`,
    `Source catalog ready: ${sourceCatalog.sourceCatalogReady ? 'yes' : 'no'}`,
    `Source quality ready: ${sourceCatalog.sourceQualityReady ? 'yes' : 'no'}`,
    `Source export receipt ready: ${sourceExport.ok ? 'yes' : 'no'}`,
    `Hosted database smoke receipt: ${hostedDatabaseReceipt.exists ? hostedDatabaseReceipt.status : 'missing'}`,
    `Ignored operator env loaded: ${ignoredOperatorEnv.loaded}/${ignoredOperatorEnv.available} available non-placeholder values`,
    '',
    ...(hostedDatabase.issues.length > 0
      ? ['Hosted database issues:', '', ...hostedDatabase.issues.map((issue) => `- ${issue}`), '']
      : []),
    ...(sourceExport.issues.length > 0
      ? ['Source export issues:', '', ...sourceExport.issues.map((issue) => `- ${issue}`), '']
      : []),
    '## Schema Probes',
    '',
    ...databaseSchema.items.map((item) => `- ${item.status.toUpperCase()} ${item.label}: ${item.detail}`),
    '',
    '## Source Catalog',
    '',
    `- Total settlements: ${sourceCatalog.totalSettlements}`,
    `- Source providers: ${sourceCatalog.sourceProviderCount}`,
    `- Claim form coverage: ${sourceCatalog.formCoveragePercent}%`,
    `- Deadline coverage: ${sourceCatalog.deadlineCoveragePercent}%`,
    `- Administrator coverage: ${sourceCatalog.knownAdministratorPercent}%`,
    `- Category coverage: ${sourceCatalog.categorizedPercent}%`,
    `- Text encoding ready: ${sourceCatalog.textEncodingReady ? 'yes' : 'no'}`,
    `- Mojibake count: ${sourceCatalog.mojibakeCount}`,
    `- Latest hosted import digest: ${sourceCatalog.latestSourceImportDigest ? `${sourceCatalog.latestSourceImportDigest.slice(0, 12)}...` : 'none'}`,
    '',
    '## Source Export Receipt',
    '',
    `- Bundle: ${sourceExport.bundle.exists ? `${sourceExport.bundle.path}, ${sourceExport.bundle.bytes} bytes` : 'missing'}`,
    `- Digest sidecar: ${sourceExport.sidecar.exists ? sourceExport.sidecar.path : 'missing'}`,
    `- Format: ${sourceExport.format ?? 'unknown'}`,
    `- Exported at: ${sourceExport.exportedAt ?? 'unknown'}`,
    `- Record count: ${sourceExport.recordCount ?? 'unknown'}`,
    `- Digest matches sidecar: ${sourceExport.digestMatchesSidecar === null ? 'not checked' : sourceExport.digestMatchesSidecar ? 'yes' : 'no'}`,
    '',
    '## Hosted Database Smoke Receipt',
    '',
    hostedDatabaseReceipt.exists
      ? `- Status: ${hostedDatabaseReceipt.status}`
      : '- Status: missing',
    hostedDatabaseReceipt.generatedAt ? `- Generated: ${hostedDatabaseReceipt.generatedAt}` : '',
    hostedDatabaseReceipt.databaseKind ? `- Database kind: ${hostedDatabaseReceipt.databaseKind}` : '',
    hostedDatabaseReceipt.externalDatabaseConfigured !== null ? `- External database configured: ${hostedDatabaseReceipt.externalDatabaseConfigured ? 'yes' : 'no'}` : '',
    hostedDatabaseReceipt.schemaOk !== null ? `- Schema probes: ${hostedDatabaseReceipt.schemaOk ? 'pass' : 'fail'}` : '',
    hostedDatabaseReceipt.sourceDryRunOk !== null ? `- Source import dry-run: ${hostedDatabaseReceipt.sourceDryRunOk ? 'pass' : 'fail'}` : '',
    hostedDatabaseReceipt.sourceDryRunChecked !== null ? `- Source records checked: ${hostedDatabaseReceipt.sourceDryRunChecked}` : '',
    '',
    '## Commands',
    '',
    'Prepare:',
    '',
    ...packet.commands.prepare.map((command) => `- \`${command}\``),
    '',
    'Migrate and import:',
    '',
    ...packet.commands.migrateAndImport.map((command) => `- \`${command}\``),
    '',
    'Push and verify:',
    '',
    ...packet.commands.pushAndVerify.map((command) => `- \`${command}\``),
    '',
    '## Source Evidence',
    '',
    ...packet.sourceEvidence.map((item) => `- ${item.path}: ${item.exists ? `present, ${item.bytes} bytes` : 'missing'}`),
    '',
    '## Notes',
    '',
    '- Hosted client preview requires persistent external storage, not file: local storage.',
    '- Run migrations and source import against the hosted database before preview promotion.',
    '- Keep data/source-catalog-export.json and data/source-catalog-export.json.sha256 together.',
    '- No database secret values were printed.',
    '',
  ].join('\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[hosted-database-packet] wrote non-secret hosted database packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Hosted database ready: ${hostedDatabase.ok ? 'yes' : 'no'}`);
  console.log(`Schema probes passing: ${databaseSchema.ok ? 'yes' : 'no'}`);
  console.log(`Source export receipt ready: ${sourceExport.ok ? 'yes' : 'no'}`);
  console.log('No database secret values were printed.');
}

main().catch((error) => {
  console.error('[hosted-database-packet] failed');
  console.error(error);
  process.exit(1);
});
