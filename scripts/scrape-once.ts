// Manual one-shot scraper run. Use during development:
//   pnpm scrape:once
import 'dotenv/config';
import { runIngest } from '../src/lib/scraper/ingest';

async function main() {
  const strict = process.argv.includes('--strict') || process.env.CLAIMBOT_SCRAPE_STRICT === 'true';
  console.log('[scrape-once] running ingest');
  const r = await runIngest();
  console.log('[scrape-once] result:', r);

  if (r.scraped === 0) {
    console.error('[scrape-once] no source records were scraped; catalog loading failed.');
    process.exit(1);
  }

  if (r.errors.length > 0) {
    const mode = strict ? 'strict failure' : 'partial success';
    console.warn(`[scrape-once] ${mode}: ${r.errors.length} source error${r.errors.length === 1 ? '' : 's'} recorded.`);
    if (strict) process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[scrape-once] fatal:', err);
  process.exit(1);
});
