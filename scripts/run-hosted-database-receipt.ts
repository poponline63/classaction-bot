import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getDatabaseSchemaReadiness } from '../src/lib/database-schema-readiness';
import {
  readSourceCatalogBundle,
  importSourceCatalogBundle,
} from '../src/lib/source-catalog-transfer';

const outputDir = path.join(process.cwd(), 'data');
const outputPath = path.join(outputDir, 'hosted-database-smoke-receipt.json');
const sourceCatalogPath = path.join(outputDir, 'source-catalog-export.json');

function databaseKind() {
  const raw = process.env.DATABASE_URL?.trim() ?? '';
  if (raw.startsWith('libsql://')) return 'libsql';
  if (raw.startsWith('postgres://') || raw.startsWith('postgresql://')) return 'postgres';
  if (raw.startsWith('file:')) return 'local-file';
  if (raw.length > 0) return 'configured';
  return 'missing';
}

function externalDatabaseConfigured() {
  return ['libsql', 'postgres', 'configured'].includes(databaseKind());
}

async function runSourceImportDryRun() {
  if (!fs.existsSync(sourceCatalogPath)) {
    return {
      ok: false,
      error: 'data/source-catalog-export.json is missing',
      result: null,
    };
  }

  try {
    const bundle = readSourceCatalogBundle(sourceCatalogPath);
    const result = await importSourceCatalogBundle(bundle, { dryRun: true });
    return {
      ok: true,
      error: null,
      result,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'source import dry-run failed',
      result: null,
    };
  }
}

async function main() {
  const generatedAt = new Date().toISOString();
  const schema = await getDatabaseSchemaReadiness();
  const sourceImportDryRunReceipt = await runSourceImportDryRun();
  const dbKind = databaseKind();
  const ok = schema.ok && sourceImportDryRunReceipt.ok;
  const receipt = {
    format: 'claimbot.hosted-database-smoke-receipt.v1',
    generatedAt,
    status: ok ? 'pass' : 'fail',
    database: {
      kind: dbKind,
      externalDatabaseConfigured: externalDatabaseConfigured(),
      authTokenPresent: Boolean(process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN),
    },
    schema: {
      ok: schema.ok,
      failures: schema.failures.map((item) => item.label),
      probes: schema.items.map((item) => ({
        key: item.key,
        label: item.label,
        status: item.status,
      })),
    },
    sourceImportDryRun: sourceImportDryRunReceipt,
    approvalBoundary: {
      nonSecretReceipt: true,
      doesNotPrintDatabaseUrl: true,
      doesNotPrintDatabaseToken: true,
      dryRunOnly: true,
      doesNotApproveHostedDatabaseByItself: true,
      nextProof: 'Run this receipt with DATABASE_URL and database auth pointed at hosted storage, then run hosted migrations/imports and regenerate the hosted database packet.',
    },
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log('[hosted-database-receipt] wrote non-secret hosted database smoke receipt');
  console.log(`JSON: ${path.relative(process.cwd(), outputPath)}`);
  console.log(`Status: ${receipt.status}`);
  console.log('No database secret values were printed.');

  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[hosted-database-receipt] failed');
  console.error(error);
  process.exit(1);
});
