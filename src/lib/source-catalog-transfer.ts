import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '@db/client';
import {
  ADMINISTRATORS,
  CAPTCHA_TYPES,
  SETTLEMENT_CATEGORIES,
  SETTLEMENT_SOURCES,
  SETTLEMENT_STATUSES,
  type Administrator,
  type CaptchaType,
  type SettlementCategory,
  type SettlementSource,
  type SettlementStatus,
} from '@db/schema';
import { ensureSingleUser } from '@db/seed';
import { writeAudit } from '@lib/audit';
import { cleanScrapedJson, cleanScrapedText } from '@lib/scraper/normalize';

export const SOURCE_CATALOG_BUNDLE_FORMAT = 'claimbot.source-catalog.v1';

export type SourceCatalogBundleRecord = {
  canonicalKey: string;
  source: SettlementSource;
  sourceUrl: string;
  caseName: string;
  defendant: string;
  defendantAliases: string[];
  category: SettlementCategory;
  classDefinition: string;
  classPeriodStart: string | null;
  classPeriodEnd: string | null;
  deadline: string | null;
  proofRequired: boolean;
  payoutEstimate: string | null;
  payoutStructure: string | null;
  claimFormUrl: string | null;
  administrator: Administrator;
  captchaType: CaptchaType;
  formSchemaJson: unknown;
  status: SettlementStatus;
  rawJson: unknown;
  discoveredAt: string | null;
  updatedAt: string | null;
};

export type SourceCatalogBundle = {
  format: typeof SOURCE_CATALOG_BUNDLE_FORMAT;
  exportedAt: string;
  recordCount: number;
  records: SourceCatalogBundleRecord[];
  sha256Digest?: string;
};

export type SourceCatalogImportResult = {
  checked: number;
  inserted: number;
  updated: number;
  skipped: number;
  dryRun: boolean;
  sha256Digest: string | null;
};

export function sourceCatalogDigestPath(inputPath: string) {
  return `${path.resolve(inputPath)}.sha256`;
}

export function sourceCatalogContentDigest(content: string) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function sourceCatalogFileDigest(inputPath: string) {
  return sourceCatalogContentDigest(fs.readFileSync(path.resolve(inputPath), 'utf8'));
}

function verifySourceCatalogDigestSidecar(inputPath: string, content: string) {
  const digestPath = sourceCatalogDigestPath(inputPath);
  if (!fs.existsSync(digestPath)) return null;

  const expected = fs.readFileSync(digestPath, 'utf8').trim().split(/\s+/)[0] ?? '';
  const actual = sourceCatalogContentDigest(content);
  if (!/^[a-f0-9]{64}$/i.test(expected)) {
    throw new Error(`Source catalog digest sidecar is invalid: ${digestPath}`);
  }
  if (expected.toLowerCase() !== actual) {
    throw new Error(`Source catalog digest mismatch for ${path.resolve(inputPath)}. Re-export the source catalog before hosted import.`);
  }
  return actual;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function assertEnum<T extends string>(values: readonly T[], value: unknown, label: string): T {
  if (typeof value === 'string' && values.includes(value as T)) return value as T;
  throw new Error(`Invalid ${label}: ${String(value)}`);
}

function assertString(value: unknown, label: string) {
  if (typeof value === 'string' && value.trim()) return value;
  throw new Error(`Invalid ${label}: ${String(value)}`);
}

function normalizeRecord(input: SourceCatalogBundleRecord): SourceCatalogBundleRecord {
  return {
    canonicalKey: assertString(input.canonicalKey, 'canonicalKey'),
    source: assertEnum(SETTLEMENT_SOURCES, input.source, 'source'),
    sourceUrl: assertString(input.sourceUrl, 'sourceUrl'),
    caseName: cleanScrapedText(assertString(input.caseName, 'caseName')),
    defendant: cleanScrapedText(assertString(input.defendant, 'defendant')),
    defendantAliases: Array.isArray(input.defendantAliases)
      ? input.defendantAliases
        .filter((value): value is string => typeof value === 'string')
        .map(cleanScrapedText)
      : [],
    category: assertEnum(SETTLEMENT_CATEGORIES, input.category, 'category'),
    classDefinition: cleanScrapedText(assertString(input.classDefinition, 'classDefinition')),
    classPeriodStart: input.classPeriodStart ?? null,
    classPeriodEnd: input.classPeriodEnd ?? null,
    deadline: input.deadline ?? null,
    proofRequired: Boolean(input.proofRequired),
    payoutEstimate: input.payoutEstimate ? cleanScrapedText(input.payoutEstimate) : null,
    payoutStructure: input.payoutStructure ? cleanScrapedText(input.payoutStructure) : null,
    claimFormUrl: input.claimFormUrl ?? null,
    administrator: assertEnum(ADMINISTRATORS, input.administrator, 'administrator'),
    captchaType: assertEnum(CAPTCHA_TYPES, input.captchaType, 'captchaType'),
    formSchemaJson: cleanScrapedJson(input.formSchemaJson ?? null),
    status: assertEnum(SETTLEMENT_STATUSES, input.status, 'status'),
    rawJson: cleanScrapedJson(input.rawJson ?? null),
    discoveredAt: input.discoveredAt ?? null,
    updatedAt: input.updatedAt ?? null,
  };
}

export async function buildSourceCatalogBundle(): Promise<SourceCatalogBundle> {
  const rows = await db.select().from(schema.settlements);
  const records = rows.map((row): SourceCatalogBundleRecord => ({
    canonicalKey: row.canonicalKey,
    source: row.source,
    sourceUrl: row.sourceUrl,
    caseName: cleanScrapedText(row.caseName),
    defendant: cleanScrapedText(row.defendant),
    defendantAliases: (row.defendantAliases ?? []).map(cleanScrapedText),
    category: row.category,
    classDefinition: cleanScrapedText(row.classDefinition),
    classPeriodStart: iso(row.classPeriodStart),
    classPeriodEnd: iso(row.classPeriodEnd),
    deadline: iso(row.deadline),
    proofRequired: row.proofRequired,
    payoutEstimate: row.payoutEstimate ? cleanScrapedText(row.payoutEstimate) : null,
    payoutStructure: row.payoutStructure ? cleanScrapedText(row.payoutStructure) : null,
    claimFormUrl: row.claimFormUrl,
    administrator: row.administrator,
    captchaType: row.captchaType,
    formSchemaJson: cleanScrapedJson(row.formSchemaJson ?? null),
    status: row.status,
    rawJson: cleanScrapedJson(row.rawJson ?? null),
    discoveredAt: iso(row.discoveredAt),
    updatedAt: iso(row.updatedAt),
  }));

  return {
    format: SOURCE_CATALOG_BUNDLE_FORMAT,
    exportedAt: new Date().toISOString(),
    recordCount: records.length,
    records,
  };
}

export async function writeSourceCatalogBundle(outputPath: string) {
  const bundle = await buildSourceCatalogBundle();
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const content = `${JSON.stringify(bundle, null, 2)}\n`;
  const sha256Digest = sourceCatalogContentDigest(content);
  const digestPath = sourceCatalogDigestPath(resolved);
  fs.writeFileSync(resolved, content, 'utf8');
  fs.writeFileSync(digestPath, `${sha256Digest}  ${path.basename(resolved)}\n`, 'utf8');
  return { bundle: { ...bundle, sha256Digest }, outputPath: resolved, digestPath, sha256Digest };
}

export function readSourceCatalogBundle(inputPath: string): SourceCatalogBundle {
  const resolved = path.resolve(inputPath);
  const content = fs.readFileSync(resolved, 'utf8');
  verifySourceCatalogDigestSidecar(resolved, content);
  const sha256Digest = sourceCatalogContentDigest(content);
  const parsed = JSON.parse(content) as SourceCatalogBundle;
  if (parsed.format !== SOURCE_CATALOG_BUNDLE_FORMAT) {
    throw new Error(`Unsupported source catalog bundle format: ${String(parsed.format)}`);
  }
  if (!Array.isArray(parsed.records)) {
    throw new Error('Source catalog bundle records must be an array.');
  }
  const records = parsed.records.map(normalizeRecord);
  return {
    format: SOURCE_CATALOG_BUNDLE_FORMAT,
    exportedAt: parsed.exportedAt,
    recordCount: records.length,
    records,
    sha256Digest,
  };
}

export async function importSourceCatalogBundle(
  bundle: SourceCatalogBundle,
  options: { dryRun?: boolean } = {},
): Promise<SourceCatalogImportResult> {
  const dryRun = options.dryRun ?? false;
  const result: SourceCatalogImportResult = {
    checked: bundle.records.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    dryRun,
    sha256Digest: bundle.sha256Digest ?? null,
  };

  for (const rawRecord of bundle.records) {
    const record = normalizeRecord(rawRecord);
    const existing = (await db
      .select()
      .from(schema.settlements)
      .where(eq(schema.settlements.canonicalKey, record.canonicalKey))
      .limit(1))[0];

    const values = {
      canonicalKey: record.canonicalKey,
      source: record.source,
      sourceUrl: record.sourceUrl,
      caseName: record.caseName,
      defendant: record.defendant,
      defendantAliases: record.defendantAliases,
      category: record.category,
      classDefinition: record.classDefinition,
      classPeriodStart: parseDate(record.classPeriodStart),
      classPeriodEnd: parseDate(record.classPeriodEnd),
      deadline: parseDate(record.deadline),
      proofRequired: record.proofRequired,
      payoutEstimate: record.payoutEstimate,
      payoutStructure: record.payoutStructure,
      claimFormUrl: record.claimFormUrl,
      administrator: record.administrator,
      captchaType: record.captchaType,
      formSchemaJson: record.formSchemaJson,
      rawJson: record.rawJson,
      status: record.status,
      discoveredAt: parseDate(record.discoveredAt) ?? new Date(),
      updatedAt: parseDate(record.updatedAt) ?? new Date(),
    };

    if (existing) {
      result.updated++;
      if (!dryRun) {
        await db.update(schema.settlements).set({
          source: values.source,
          sourceUrl: values.sourceUrl,
          caseName: values.caseName,
          defendant: values.defendant,
          defendantAliases: values.defendantAliases,
          category: values.category,
          classDefinition: values.classDefinition,
          classPeriodStart: values.classPeriodStart,
          classPeriodEnd: values.classPeriodEnd,
          deadline: values.deadline,
          proofRequired: values.proofRequired,
          payoutEstimate: values.payoutEstimate,
          payoutStructure: values.payoutStructure,
          claimFormUrl: values.claimFormUrl,
          administrator: values.administrator,
          captchaType: values.captchaType,
          formSchemaJson: values.formSchemaJson,
          rawJson: values.rawJson,
          status: values.status,
          updatedAt: new Date(),
        }).where(eq(schema.settlements.id, existing.id));
      }
    } else {
      result.inserted++;
      if (!dryRun) {
        await db.insert(schema.settlements).values(values);
      }
    }
  }

  if (!dryRun) {
    const userId = await ensureSingleUser();
    await writeAudit({
      userId,
      eventType: 'SOURCE_CATALOG_IMPORTED',
      entityType: 'system',
      entityId: 0,
      actor: 'system',
      payload: {
        checked: result.checked,
        inserted: result.inserted,
        updated: result.updated,
        bundleFormat: bundle.format,
        exportedAt: bundle.exportedAt,
        sha256Digest: result.sha256Digest,
      },
    });
  }

  return result;
}
