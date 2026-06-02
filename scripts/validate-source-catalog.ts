import 'dotenv/config';
import { getSourceCatalogReadiness } from '../src/lib/source-catalog-readiness';

async function main() {
  const json = process.argv.includes('--json');
  const strictQuality = process.argv.includes('--strict-quality')
    || process.env.CLAIMBOT_SOURCE_QUALITY_STRICT === 'true';
  const readiness = await getSourceCatalogReadiness({
    sourceQualityRequired: strictQuality,
  });

  if (json) {
    console.log(JSON.stringify(readiness, null, 2));
  } else {
    console.log('[validate-source-catalog] source catalog readiness');
    console.log(`  settlement search: ${readiness.settlementSearchEnabled ? 'enabled' : 'disabled'}`);
    console.log(`  source quality: ${readiness.sourceQualityRequired ? 'strict' : 'advisory'}`);
    console.log(`  total settlements: ${readiness.totalSettlements}`);
    console.log(`  linked claim forms: ${readiness.linkedClaimForms}`);
    console.log(`  form coverage: ${readiness.formCoveragePercent}%`);
    console.log(`  deadline coverage: ${readiness.deadlineCoveragePercent}%`);
    console.log(`  known administrator coverage: ${readiness.knownAdministratorPercent}%`);
    console.log(`  category coverage: ${readiness.categorizedPercent}%`);
    console.log(`  source providers: ${readiness.sourceProviderCount}`);
    console.log(`  last scraper audit: ${readiness.lastScraperAuditEventType ?? 'none'}`);
    console.log(`  source import digest: ${readiness.latestSourceImportDigest ? `${readiness.latestSourceImportDigest.slice(0, 12)}...` : 'none'}`);
    for (const item of readiness.items) {
      console.log(`  - ${item.status.toUpperCase()} ${item.label}: ${item.detail}`);
    }
  }

  if (!readiness.ok) {
    console.error('[validate-source-catalog] failed: public-discovery client previews need source records, claim-form coverage, and strict source quality when --strict-quality is enabled. Run npm run scrape:once and npm run enrich:source before promotion.');
    process.exit(1);
  }

  console.log('[validate-source-catalog] ok');
}

main().catch((error) => {
  console.error('[validate-source-catalog] failed');
  console.error(error);
  process.exit(1);
});
