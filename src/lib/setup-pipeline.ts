import { queueEligibleClaims } from './claim-filer/claim-queue';
import { isClientFeatureEnabled } from './features';
import { runMatcher } from './matcher/run-matcher';
import { runIngest } from './scraper/ingest';

type FeatureEnv = Record<string, string | undefined>;

type SetupPipelineDeps = {
  ingest: typeof runIngest;
  match: typeof runMatcher;
  queue: typeof queueEligibleClaims;
  log: Pick<Console, 'log'>;
};

export type SetupPipelineResult = {
  discoverySkipped: boolean;
  scraped: number;
  inserted: number;
  matched: number;
  queued: number;
};

const defaultDeps: SetupPipelineDeps = {
  ingest: runIngest,
  match: runMatcher,
  queue: queueEligibleClaims,
  log: console,
};

export async function runSetupPipeline(
  userId: number,
  env: FeatureEnv = process.env,
  deps: SetupPipelineDeps = defaultDeps,
): Promise<SetupPipelineResult> {
  const settlementSearchEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH', env);
  let scraped = 0;
  let inserted = 0;

  if (settlementSearchEnabled) {
    deps.log.log('[setup] running full pipeline: scrape -> match -> queue');
    const scrape = await deps.ingest();
    scraped = scrape.scraped;
    inserted = scrape.inserted;
    deps.log.log(`[setup] scraped ${scraped} settlements (${inserted} new)`);
  } else {
    deps.log.log('[setup] settlement discovery disabled -> running match -> queue only');
  }

  const match = await deps.match(userId);
  const matched = match.verdictCounts.ELIGIBLE ?? 0;
  deps.log.log(`[setup] matched: ${matched} eligible`);

  const filed = await deps.queue(userId);
  deps.log.log(`[setup] queued: ${filed.queued} claims queued`);

  return {
    discoverySkipped: !settlementSearchEnabled,
    scraped,
    inserted,
    matched,
    queued: filed.queued,
  };
}
