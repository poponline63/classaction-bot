// Cron schedules. node-cron fires in the worker's local timezone (TZ env).
//
// Active schedules:
//   03:15 daily → scrape ingest
//
// Phase 2+ will add:
//   04:00 daily → run matcher
//   */15 * * * * → HIBP refresh (throttled)
//   09:00 daily → daily summary email

import cron from 'node-cron';
import { runIngest } from '@lib/scraper/ingest';
import { runMatcher } from '@lib/matcher/run-matcher';
import { refreshHibp } from '@lib/hibp/refresh';
import { ensureSingleUser } from '@db/seed';

export function startCron() {
  // 03:15 daily — scrape ingest
  cron.schedule('15 3 * * *', async () => {
    console.log('[cron] scrape ingest starting');
    try {
      const r = await runIngest();
      console.log(
        `[cron] scrape done: scraped=${r.scraped} inserted=${r.inserted} updated=${r.updated} errors=${r.errors.length}`,
      );
    } catch (err) {
      console.error('[cron] scrape failed:', (err as Error).message);
    }
  });

  // 04:00 daily — run matcher against fresh settlements
  cron.schedule('0 4 * * *', async () => {
    console.log('[cron] matcher starting');
    try {
      const userId = await ensureSingleUser();
      const r = await runMatcher(userId);
      console.log(
        `[cron] matcher done: processed=${r.settlementsProcessed} inserted=${r.matchesInserted} updated=${r.matchesUpdated} changed=${r.verdictsChanged}`,
      );
    } catch (err) {
      console.error('[cron] matcher failed:', (err as Error).message);
    }
  });

  // 04:30 daily — refresh HIBP (only fires if HIBP_API_KEY is set)
  cron.schedule('30 4 * * *', async () => {
    if (!process.env.HIBP_API_KEY) return;
    console.log('[cron] hibp refresh starting');
    try {
      const userId = await ensureSingleUser();
      const r = await refreshHibp(userId);
      console.log(
        `[cron] hibp done: emails=${r.emailsChecked} found=${r.breachesFound} inserted=${r.inserted}`,
      );
    } catch (err) {
      console.error('[cron] hibp failed:', (err as Error).message);
    }
  });

  console.log('[cron] schedules registered');
}
