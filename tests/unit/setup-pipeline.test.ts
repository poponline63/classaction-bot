import { describe, expect, it, vi } from 'vitest';
import { runSetupPipeline } from '../../src/lib/setup-pipeline';

function deps() {
  return {
    ingest: vi.fn(async () => ({ scraped: 4, inserted: 2, updated: 1, errors: [] })),
    match: vi.fn(async () => ({
      settlementsProcessed: 4,
      matchesInserted: 2,
      matchesUpdated: 0,
      verdictsChanged: 0,
      verdictCounts: { ELIGIBLE: 2 },
      errors: [],
    })),
    queue: vi.fn(async () => ({
      eligible: 2,
      queued: 1,
      alreadyClaimed: 0,
      skippedProof: 0,
      skippedNoForm: 0,
      skippedNoAuth: 0,
      skippedNoPlan: 0,
      jobsEnqueued: 1,
      jobsReused: 0,
      errors: [],
    })),
    log: { log: vi.fn() },
  };
}

describe('runSetupPipeline', () => {
  it('runs discovery before matching when settlement search is enabled', async () => {
    const testDeps = deps();

    const result = await runSetupPipeline(
      1,
      { CLAIMBOT_FEATURE_SETTLEMENT_SEARCH: 'true' },
      testDeps,
    );

    expect(testDeps.ingest).toHaveBeenCalledOnce();
    expect(testDeps.match).toHaveBeenCalledWith(1);
    expect(testDeps.queue).toHaveBeenCalledWith(1);
    expect(result).toMatchObject({
      discoverySkipped: false,
      scraped: 4,
      inserted: 2,
      matched: 2,
      queued: 1,
    });
  });

  it('skips discovery when settlement search is disabled but still matches and queues', async () => {
    const testDeps = deps();

    const result = await runSetupPipeline(
      1,
      { CLAIMBOT_FEATURE_SETTLEMENT_SEARCH: 'false' },
      testDeps,
    );

    expect(testDeps.ingest).not.toHaveBeenCalled();
    expect(testDeps.match).toHaveBeenCalledWith(1);
    expect(testDeps.queue).toHaveBeenCalledWith(1);
    expect(result).toMatchObject({
      discoverySkipped: true,
      scraped: 0,
      inserted: 0,
      matched: 2,
      queued: 1,
    });
  });
});
