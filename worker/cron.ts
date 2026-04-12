// Cron schedules — the daily pipeline:
//   03:15 → scrape new settlements
//   04:00 → match against user profile → auto-file eligible claims
//   04:30 → refresh HIBP breaches
//
// The key insight: the user never has to click anything. The pipeline
// discovers → matches → files automatically every night.

import cron from 'node-cron';
import { runIngest } from '@lib/scraper/ingest';
import { runMatcher } from '@lib/matcher/run-matcher';
import { autoFileEligible } from '@lib/claim-filer/auto-file';
import { refreshHibp } from '@lib/hibp/refresh';
import { ensureSingleUser } from '@db/seed';
import { getSettingOrEnv } from '@lib/settings';
import { notifyDailySummary } from '@lib/notifier/discord';

export function startCron() {
  // 03:15 daily — scrape ingest
  cron.schedule('15 3 * * *', async () => {
    console.log('[cron] scrape ingest starting');
    try {
      const r = await runIngest();
      console.log(
        `[cron] scrape done: scraped=${r.scraped} inserted=${r.inserted} updated=${r.updated} errors=${r.errors.length}`,
      );
      // Notify via Discord
      notifyDailySummary(r).catch(() => undefined);
    } catch (err) {
      console.error('[cron] scrape failed:', (err as Error).message);
    }
  });

  // 04:00 daily — run matcher then auto-file all eligible claims
  cron.schedule('0 4 * * *', async () => {
    console.log('[cron] matcher + auto-file starting');
    try {
      const userId = await ensureSingleUser();

      // Step 1: run matcher
      const r = await runMatcher(userId);
      console.log(
        `[cron] matcher done: processed=${r.settlementsProcessed} eligible=${r.verdictCounts.ELIGIBLE ?? 0} changed=${r.verdictsChanged}`,
      );

      // Step 2: auto-file everything eligible
      const af = await autoFileEligible(userId);
      console.log(
        `[cron] auto-file done: eligible=${af.eligible} queued=${af.queued} already=${af.alreadyClaimed} skipped_proof=${af.skippedProof} skipped_no_auth=${af.skippedNoAuth}`,
      );
    } catch (err) {
      console.error('[cron] matcher/auto-file failed:', (err as Error).message);
    }
  });

  // 04:30 daily — refresh HIBP
  cron.schedule('30 4 * * *', async () => {
    const hibpKey = await getSettingOrEnv('hibp_api_key', 'HIBP_API_KEY');
    if (!hibpKey) return;
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

  console.log('[cron] daily pipeline registered: scrape 3:15am → match+file 4:00am → HIBP 4:30am');
}
