import { db, schema } from '@db/client';
import { desc, eq } from 'drizzle-orm';
import { isClientFeatureEnabled } from '@lib/features';

export type SourceCatalogReadinessItem = {
  key: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
};

export type SourceCatalogReadiness = {
  ok: boolean;
  requiredForClientPreview: boolean;
  sourceQualityRequired: boolean;
  settlementSearchEnabled: boolean;
  totalSettlements: number;
  linkedClaimForms: number;
  deadlineCount: number;
  knownAdministratorCount: number;
  categorizedCount: number;
  cleanTextCount: number;
  mojibakeCount: number;
  sourceProviderCount: number;
  formCoveragePercent: number;
  deadlineCoveragePercent: number;
  knownAdministratorPercent: number;
  categorizedPercent: number;
  sourceCatalogReady: boolean;
  claimFormCoverageReady: boolean;
  deadlineCoverageReady: boolean;
  administratorCoverageReady: boolean;
  categorizationReady: boolean;
  textEncodingReady: boolean;
  sourceQualityReady: boolean;
  lastScraperAuditAt: string | null;
  lastScraperAuditEventType: string | null;
  latestSourceImportAt?: string | null;
  latestSourceImportDigest?: string | null;
  latestSourceImportExportedAt?: string | null;
  latestSourceImportRecordCount?: number | null;
  failureCount: number;
  warningCount: number;
  items: SourceCatalogReadinessItem[];
};

export type SourceCatalogReadinessOptions = {
  settlementSearchEnabled?: boolean;
  sourceQualityRequired?: boolean;
};

const MIN_DEADLINE_COVERAGE_PERCENT = 40;
const MIN_ADMINISTRATOR_COVERAGE_PERCENT = 25;
const MIN_CATEGORIZED_PERCENT = 50;
const MOJIBAKE_RE = /(?:\u00e2\u20ac|\u00c2\u00ae|\u00e2\u201e|\u00c3)/;

function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function payloadObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function payloadString(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === 'string' ? payload[key] : null;
}

function payloadNumber(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === 'number' && Number.isFinite(payload[key]) ? payload[key] : null;
}

export async function getSourceCatalogReadiness(
  options: SourceCatalogReadinessOptions = {},
): Promise<SourceCatalogReadiness> {
  const settlementSearchEnabled = options.settlementSearchEnabled
    ?? isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');
  const requiredForClientPreview = settlementSearchEnabled;
  const sourceQualityRequired = options.sourceQualityRequired ?? false;
  const settlementRows = await db.select({
    source: schema.settlements.source,
    caseName: schema.settlements.caseName,
    defendant: schema.settlements.defendant,
    classDefinition: schema.settlements.classDefinition,
    payoutEstimate: schema.settlements.payoutEstimate,
    claimFormUrl: schema.settlements.claimFormUrl,
    deadline: schema.settlements.deadline,
    administrator: schema.settlements.administrator,
    category: schema.settlements.category,
  }).from(schema.settlements);
  const totalSettlements = settlementRows.length;
  const linkedClaimForms = settlementRows.filter((row) => row.claimFormUrl?.trim()).length;
  const deadlineCount = settlementRows.filter((row) => row.deadline).length;
  const knownAdministratorCount = settlementRows.filter((row) => row.administrator !== 'unknown').length;
  const categorizedCount = settlementRows.filter((row) => row.category !== 'UNKNOWN').length;
  const mojibakeCount = settlementRows.filter((row) => (
    MOJIBAKE_RE.test([
      row.claimFormUrl,
      row.caseName,
      row.defendant,
      row.classDefinition,
      row.payoutEstimate,
      row.source,
      row.administrator,
      row.category,
    ].join(' '))
  )).length;
  const sourceProviderCount = new Set(settlementRows.map((row) => row.source)).size;
  const lastScraperEvent = (await db
    .select({
      eventType: schema.auditLog.eventType,
      occurredAt: schema.auditLog.occurredAt,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.actor, 'scraper'))
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(1))[0];
  const latestSourceImportEvent = (await db
    .select({
      occurredAt: schema.auditLog.occurredAt,
      payloadJson: schema.auditLog.payloadJson,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.eventType, 'SOURCE_CATALOG_IMPORTED'))
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(1))[0];
  const latestSourceImportPayload = payloadObject(latestSourceImportEvent?.payloadJson);
  const latestSourceImportDigest = payloadString(latestSourceImportPayload, 'sha256Digest');
  const latestSourceImportExportedAt = payloadString(latestSourceImportPayload, 'exportedAt');
  const latestSourceImportRecordCount = payloadNumber(latestSourceImportPayload, 'checked');
  const formCoveragePercent = percent(linkedClaimForms, totalSettlements);
  const deadlineCoveragePercent = percent(deadlineCount, totalSettlements);
  const knownAdministratorPercent = percent(knownAdministratorCount, totalSettlements);
  const categorizedPercent = percent(categorizedCount, totalSettlements);
  const sourceCatalogReady = totalSettlements > 0;
  const claimFormCoverageReady = formCoveragePercent > 0;
  const deadlineCoverageReady = deadlineCoveragePercent >= MIN_DEADLINE_COVERAGE_PERCENT;
  const administratorCoverageReady = knownAdministratorPercent >= MIN_ADMINISTRATOR_COVERAGE_PERCENT;
  const categorizationReady = categorizedPercent >= MIN_CATEGORIZED_PERCENT;
  const textEncodingReady = mojibakeCount === 0;
  const sourceQualityReady = deadlineCoverageReady && administratorCoverageReady && categorizationReady && textEncodingReady;
  const qualityStatus = (ready: boolean): SourceCatalogReadinessItem['status'] => {
    if (ready) return 'pass';
    if (!sourceCatalogReady) return 'warn';
    return sourceQualityRequired ? 'fail' : 'warn';
  };
  const items: SourceCatalogReadinessItem[] = [
    {
      key: 'source-catalog',
      label: 'Source catalog',
      status: !requiredForClientPreview ? 'warn' : sourceCatalogReady ? 'pass' : 'fail',
      detail: !requiredForClientPreview
        ? 'Public settlement discovery is disabled for this deployment; source catalog evidence is informational.'
        : sourceCatalogReady
          ? `${totalSettlements} settlement source record${totalSettlements === 1 ? '' : 's'} available for matching review.`
          : 'No settlement source records are loaded for public discovery preview.',
    },
    {
      key: 'claim-form-coverage',
      label: 'Claim form coverage',
      status: !requiredForClientPreview ? 'warn' : claimFormCoverageReady ? 'pass' : 'fail',
      detail: !requiredForClientPreview
        ? 'Public claim-form coverage is informational while settlement discovery is disabled.'
        : claimFormCoverageReady
          ? `${formCoveragePercent}% of indexed settlement records include claim-form links.`
          : 'No indexed settlement records include claim-form links yet.',
    },
    {
      key: 'source-providers',
      label: 'Source providers',
      status: sourceProviderCount > 0 ? 'pass' : 'warn',
      detail: sourceProviderCount > 0
        ? `${sourceProviderCount} source provider${sourceProviderCount === 1 ? '' : 's'} represented in the catalog.`
        : 'No source providers are represented in the local catalog yet.',
    },
    {
      key: 'text-encoding',
      label: 'Source text encoding',
      status: textEncodingReady ? 'pass' : sourceQualityRequired ? 'fail' : 'warn',
      detail: textEncodingReady
        ? 'Indexed source text is free of known UTF-8 mojibake markers.'
        : `${mojibakeCount} indexed settlement record${mojibakeCount === 1 ? '' : 's'} include mojibake markers; re-import the cleaned source catalog before client preview.`,
    },
    {
      key: 'deadline-coverage',
      label: 'Deadline coverage',
      status: qualityStatus(deadlineCoverageReady),
      detail: deadlineCoverageReady
        ? `${deadlineCoveragePercent}% of indexed settlement records include deadlines.`
        : `${deadlineCoveragePercent}% deadline coverage is below the ${MIN_DEADLINE_COVERAGE_PERCENT}% client-preview quality target; treat matching output as incomplete until source enrichment improves.`,
    },
    {
      key: 'administrator-coverage',
      label: 'Administrator coverage',
      status: qualityStatus(administratorCoverageReady),
      detail: administratorCoverageReady
        ? `${knownAdministratorPercent}% of indexed settlement records identify a known administrator.`
        : `${knownAdministratorPercent}% administrator coverage is below the ${MIN_ADMINISTRATOR_COVERAGE_PERCENT}% client-preview quality target; review claim-form destinations before broad client use.`,
    },
    {
      key: 'category-coverage',
      label: 'Category coverage',
      status: qualityStatus(categorizationReady),
      detail: categorizationReady
        ? `${categorizedPercent}% of indexed settlement records are categorized for matching review.`
        : `${categorizedPercent}% category coverage is below the ${MIN_CATEGORIZED_PERCENT}% client-preview quality target; matcher output may be too generic.`,
    },
    {
      key: 'scraper-audit',
      label: 'Scraper audit',
      status: lastScraperEvent ? 'pass' : 'warn',
      detail: lastScraperEvent
        ? `Last scraper audit event was ${lastScraperEvent.eventType}.`
        : 'No scraper audit event is available for source freshness review.',
    },
    {
      key: 'source-import-receipt',
      label: 'Source import receipt',
      status: latestSourceImportDigest ? 'pass' : 'warn',
      detail: latestSourceImportDigest
        ? `Latest source import digest ${latestSourceImportDigest.slice(0, 12)}... is recorded for ${latestSourceImportRecordCount ?? 'unknown'} transferred record${latestSourceImportRecordCount === 1 ? '' : 's'}.`
        : 'No SOURCE_CATALOG_IMPORTED digest receipt is recorded yet; import the exported source catalog into the hosted database before client preview.',
    },
  ];
  const failureCount = items.filter((item) => item.status === 'fail').length;
  const warningCount = items.filter((item) => item.status === 'warn').length;

  return {
    ok: failureCount === 0,
    requiredForClientPreview,
    sourceQualityRequired,
    settlementSearchEnabled,
    totalSettlements,
    linkedClaimForms,
    deadlineCount,
    knownAdministratorCount,
    categorizedCount,
    cleanTextCount: totalSettlements - mojibakeCount,
    mojibakeCount,
    sourceProviderCount,
    formCoveragePercent,
    deadlineCoveragePercent,
    knownAdministratorPercent,
    categorizedPercent,
    sourceCatalogReady,
    claimFormCoverageReady,
    deadlineCoverageReady,
    administratorCoverageReady,
    categorizationReady,
    textEncodingReady,
    sourceQualityReady,
    lastScraperAuditAt: lastScraperEvent?.occurredAt?.toISOString() ?? null,
    lastScraperAuditEventType: lastScraperEvent?.eventType ?? null,
    latestSourceImportAt: latestSourceImportEvent?.occurredAt?.toISOString() ?? null,
    latestSourceImportDigest,
    latestSourceImportExportedAt,
    latestSourceImportRecordCount,
    failureCount,
    warningCount,
    items,
  };
}
