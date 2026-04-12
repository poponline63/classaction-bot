import { NextResponse } from 'next/server';
import { setSetting } from '@lib/settings';
import { runIngest } from '@lib/scraper/ingest';
import { runMatcher } from '@lib/matcher/run-matcher';
import { currentUserId } from '@lib/auth/current-user';

export const dynamic = 'force-dynamic';

export async function POST() {
  await setSetting('setup_completed', 'true');

  // Fire-and-forget: run the first scrape + matcher in the background.
  // The user sees "Scraping started!" immediately while this runs.
  const userId = await currentUserId();
  runIngest()
    .then(() => runMatcher(userId))
    .catch((err) => console.error('[setup] background ingest failed:', (err as Error).message));

  return NextResponse.json({ ok: true });
}
