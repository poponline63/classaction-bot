// Manual one-shot scraper run. Use during development:
//   pnpm scrape:once
import 'dotenv/config';
import { runIngest } from '../src/lib/scraper/ingest';

async function main() {
  console.log('[scrape-once] running ingest');
  const r = await runIngest();
  console.log('[scrape-once] result:', r);
  process.exit(r.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[scrape-once] fatal:', err);
  process.exit(1);
});
