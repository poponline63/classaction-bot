// Auto-pipeline: runs matcher + auto-file in the background after any
// profile change. Debounced so rapid edits (e.g., during setup wizard)
// don't spam the matcher.

import { runMatcher } from './matcher/run-matcher';
import { autoFileEligible } from './claim-filer/auto-file';

let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

export function triggerAutoPipeline(userId: number) {
  // Debounce: wait 3 seconds after the last change before running.
  // During setup, the user might add 5 purchases in a row — we only
  // want to run the matcher once after they're done.
  if (pendingTimeout) clearTimeout(pendingTimeout);
  pendingTimeout = setTimeout(async () => {
    pendingTimeout = null;
    try {
      console.log('[auto-pipeline] profile changed → running matcher + auto-file');
      const match = await runMatcher(userId);
      const eligible = match.verdictCounts.ELIGIBLE ?? 0;
      if (eligible > 0) {
        const filed = await autoFileEligible(userId);
        console.log(`[auto-pipeline] ${eligible} eligible, ${filed.queued} new claims queued`);
      } else {
        console.log(`[auto-pipeline] ${match.settlementsProcessed} checked, 0 eligible`);
      }
    } catch (err) {
      console.error('[auto-pipeline] error:', (err as Error).message);
    }
  }, 3000);
}
