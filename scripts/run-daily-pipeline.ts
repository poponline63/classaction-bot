// Multi-user daily automation pipeline for the hosted SaaS deployment.
//
// 1. Refresh the settlement catalog from public sources (scraper ingest).
// 2. Re-run the matcher for every registered user so possible matches stay fresh.
// 3. Queue eligible claims only for users who completed setup shadow-review;
//    queueEligibleClaims still enforces proof, claim-form, authorization, and
//    plan gates per match, and filing stays in CLAIM_FILER_MODE (shadow default).
//
// Run on a schedule (GitHub Actions) with hosted DATABASE_URL env:
//   npx tsx scripts/run-daily-pipeline.ts
// Skip the scrape step (matcher/queue only):
//   npx tsx scripts/run-daily-pipeline.ts --skip-scrape

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { db, schema } from '../src/db/client';
import { runIngest, type IngestResult } from '../src/lib/scraper/ingest';
import { runMatcher } from '../src/lib/matcher/run-matcher';
import { queueEligibleClaims } from '../src/lib/claim-filer/claim-queue';
import { hasUserStartedSetupShadowReview } from '../src/lib/setup-state';

type UserSummary = {
  userId: number;
  matcher: { processed: number; eligible: number; needsReview: number; changed: number };
  queue: { setupComplete: boolean; queued: number; skippedProof: number; skippedNoAuth: number; skippedNoPlan: number } | null;
  error?: string;
};

function receiptPath() {
  const configured = process.env.CLAIMBOT_DAILY_PIPELINE_RECEIPT_PATH || 'data/daily-pipeline-receipt.json';
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

async function main() {
  const skipScrape = process.argv.includes('--skip-scrape');
  const startedAt = new Date().toISOString();

  let ingest: IngestResult | null = null;
  let ingestError: string | null = null;
  if (!skipScrape) {
    console.log('[daily-pipeline] scrape ingest starting');
    try {
      ingest = await runIngest();
      console.log(
        `[daily-pipeline] scrape done: scraped=${ingest.scraped} inserted=${ingest.inserted} updated=${ingest.updated} errors=${ingest.errors.length}`,
      );
    } catch (err) {
      ingestError = (err as Error).message;
      console.error('[daily-pipeline] scrape failed:', ingestError);
    }
  }

  const users = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users);
  console.log(`[daily-pipeline] running matcher for ${users.length} user(s)`);

  const perUser: UserSummary[] = [];
  for (const user of users) {
    try {
      const match = await runMatcher(user.id);
      const summary: UserSummary = {
        userId: user.id,
        matcher: {
          processed: match.settlementsProcessed,
          eligible: match.verdictCounts.ELIGIBLE ?? 0,
          needsReview: match.verdictCounts.NEEDS_REVIEW ?? 0,
          changed: match.verdictsChanged,
        },
        queue: null,
      };

      const setupComplete = await hasUserStartedSetupShadowReview(user.id);
      if (setupComplete && summary.matcher.eligible > 0) {
        const queue = await queueEligibleClaims(user.id);
        summary.queue = {
          setupComplete,
          queued: queue.queued,
          skippedProof: queue.skippedProof,
          skippedNoAuth: queue.skippedNoAuth,
          skippedNoPlan: queue.skippedNoPlan,
        };
      } else {
        summary.queue = { setupComplete, queued: 0, skippedProof: 0, skippedNoAuth: 0, skippedNoPlan: 0 };
      }
      perUser.push(summary);
    } catch (err) {
      perUser.push({
        userId: user.id,
        matcher: { processed: 0, eligible: 0, needsReview: 0, changed: 0 },
        queue: null,
        error: (err as Error).message,
      });
      console.error(`[daily-pipeline] user ${user.id} failed:`, (err as Error).message);
    }
  }

  const totals = perUser.reduce(
    (acc, u) => {
      acc.eligible += u.matcher.eligible;
      acc.needsReview += u.matcher.needsReview;
      acc.queued += u.queue?.queued ?? 0;
      acc.errors += u.error ? 1 : 0;
      return acc;
    },
    { eligible: 0, needsReview: 0, queued: 0, errors: 0 },
  );

  const receipt = {
    format: 'claimbot.daily-pipeline-receipt.v1',
    startedAt,
    finishedAt: new Date().toISOString(),
    runtime: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions-scheduler' : 'local',
    filingMode: process.env.CLAIM_FILER_MODE ?? 'shadow',
    scrape: skipScrape ? { skipped: true } : ingestError ? { error: ingestError } : ingest,
    users: users.length,
    totals,
    perUser,
  };

  const target = receiptPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(
    `[daily-pipeline] done: users=${users.length} eligible=${totals.eligible} needsReview=${totals.needsReview} queued=${totals.queued} userErrors=${totals.errors}`,
  );
  console.log(`[daily-pipeline] receipt: ${path.relative(process.cwd(), target)}`);

  // Scrape failure alone should not fail the run when matching succeeded;
  // a user-level error count > 0 means something needs operator attention.
  if (totals.errors > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[daily-pipeline] fatal:', err);
    process.exit(1);
  });
