import cron from 'node-cron';
import { runIngest } from '@lib/scraper/ingest';
import { runMatcher } from '@lib/matcher/run-matcher';
import { queueEligibleClaims } from '@lib/claim-filer/claim-queue';
import { refreshHibp } from '@lib/hibp/refresh';
import { ensureSingleUser } from '@db/seed';
import { getSettingOrEnv } from '@lib/settings';
import { notifyDailySummary } from '@lib/notifier/discord';

export function startCron() {
  cron.schedule('15 3 * * *', async () => {
    console.log('[cron] scrape ingest starting');
    try {
      const result = await runIngest();
      console.log(
        `[cron] scrape done: scraped=${result.scraped} inserted=${result.inserted} updated=${result.updated} errors=${result.errors.length}`,
      );
      notifyDailySummary(result).catch(() => undefined);
    } catch (err) {
      console.error('[cron] scrape failed:', (err as Error).message);
    }
  });

  cron.schedule('0 4 * * *', async () => {
    console.log('[cron] matcher + claim queue starting');
    try {
      const userId = await ensureSingleUser();

      const match = await runMatcher(userId);
      console.log(
        `[cron] matcher done: processed=${match.settlementsProcessed} eligible=${match.verdictCounts.ELIGIBLE ?? 0} changed=${match.verdictsChanged}`,
      );

      const queued = await queueEligibleClaims(userId);
      console.log(
        `[cron] queue done: eligible=${queued.eligible} queued=${queued.queued} already=${queued.alreadyClaimed} skipped_proof=${queued.skippedProof} skipped_no_auth=${queued.skippedNoAuth} skipped_no_plan=${queued.skippedNoPlan}`,
      );
    } catch (err) {
      console.error('[cron] matcher/queue failed:', (err as Error).message);
    }
  });

  cron.schedule('30 4 * * *', async () => {
    const hibpKey = await getSettingOrEnv('hibp_api_key', 'HIBP_API_KEY');
    if (!hibpKey) return;
    console.log('[cron] hibp refresh starting');
    try {
      const userId = await ensureSingleUser();
      const result = await refreshHibp(userId);
      console.log(
        `[cron] hibp done: emails=${result.emailsChecked} found=${result.breachesFound} inserted=${result.inserted}`,
      );
    } catch (err) {
      console.error('[cron] hibp failed:', (err as Error).message);
    }
  });

  console.log('[cron] daily pipeline registered: scrape 3:15am -> match+queue 4:00am -> HIBP 4:30am');
}
