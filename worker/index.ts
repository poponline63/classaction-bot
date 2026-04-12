// Worker entrypoint — booted by PM2 as `classaction-worker`.
// Runs scheduled jobs (scrapers, matcher, filer) and polls the jobs table.

import 'dotenv/config';
import { startCron } from './cron';
import { startJobPoller } from './job-poller';
import { closeAll as closeBrowsers } from '../src/lib/claim-filer/browser-pool';

console.log('[worker] starting classaction-bot worker');
console.log('[worker] CLAIM_FILER_MODE =', process.env.CLAIM_FILER_MODE ?? 'shadow');

startCron();
startJobPoller();

async function gracefulShutdown(signal: string) {
  console.log(`[worker] ${signal} — shutting down`);
  try {
    await closeBrowsers();
  } catch (err) {
    console.error('[worker] error closing browsers:', (err as Error).message);
  }
  process.exit(0);
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

// Prevent unexpected exits from unhandled rejections
process.on('unhandledRejection', (reason) => {
  console.error('[worker] unhandled rejection:', reason);
});
