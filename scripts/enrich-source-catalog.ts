import 'dotenv/config';
import { enrichOfficialSettlementSites } from '../src/lib/scraper/official-site-enrichment';

function readNumberFlag(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  if (!arg) return fallback;
  const value = Number(arg.slice(prefix.length));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find((item) => item.startsWith('--limit='));
  const limit = limitArg ? readNumberFlag('limit', Number.POSITIVE_INFINITY) : undefined;
  const concurrency = readNumberFlag('concurrency', 4);
  const timeoutMs = readNumberFlag('timeout-ms', 12_000);

  console.log('[enrich-source-catalog] enriching official settlement sites');
  const result = await enrichOfficialSettlementSites({
    concurrency,
    dryRun,
    limit,
    timeoutMs,
  });
  console.log(JSON.stringify(result, null, 2));

  if (result.errors.length > 0) {
    console.warn(`[enrich-source-catalog] completed with ${result.errors.length} fetch/parsing warning${result.errors.length === 1 ? '' : 's'}`);
  }
  console.log('[enrich-source-catalog] ok');
}

main().catch((error) => {
  console.error('[enrich-source-catalog] failed');
  console.error(error);
  process.exit(1);
});
