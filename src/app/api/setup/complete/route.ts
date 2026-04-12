import { NextResponse } from 'next/server';
import { setSetting } from '@lib/settings';
import { runIngest } from '@lib/scraper/ingest';
import { runMatcher } from '@lib/matcher/run-matcher';
import { autoFileEligible } from '@lib/claim-filer/auto-file';
import { currentUserId } from '@lib/auth/current-user';

export const dynamic = 'force-dynamic';

export async function POST() {
  await setSetting('setup_completed', 'true');

  // Full pipeline: scrape → match → auto-file
  // Runs in the background so the user sees "done" immediately.
  const userId = await currentUserId();
  (async () => {
    try {
      console.log('[setup] running full pipeline: scrape → match → auto-file');
      const scrape = await runIngest();
      console.log(`[setup] scraped ${scrape.scraped} settlements (${scrape.inserted} new)`);

      const match = await runMatcher(userId);
      console.log(`[setup] matched: ${match.verdictCounts.ELIGIBLE ?? 0} eligible`);

      const filed = await autoFileEligible(userId);
      console.log(`[setup] auto-filed: ${filed.queued} claims queued`);
    } catch (err) {
      console.error('[setup] pipeline error:', (err as Error).message);
    }
  })();

  return NextResponse.json({ ok: true });
}
