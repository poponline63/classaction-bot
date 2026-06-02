import { describe, expect, it, vi } from 'vitest';
import { runAutoPipeline } from '../../src/lib/auto-pipeline';

function deps(setupCompleted: boolean, eligible = 1) {
  return {
    match: vi.fn(async () => ({
      settlementsProcessed: 3,
      matchesInserted: eligible,
      matchesUpdated: 0,
      verdictsChanged: 0,
      verdictCounts: { ELIGIBLE: eligible },
      errors: [],
    })),
    queue: vi.fn(async () => ({
      eligible,
      alreadyClaimed: 0,
      queued: 1,
      skippedProof: 0,
      skippedNoForm: 0,
      skippedNoAuth: 0,
      skippedNoPlan: 0,
      jobsEnqueued: eligible > 0 ? 1 : 0,
      jobsReused: 0,
      errors: [],
    })),
    hasSetupShadowReview: vi.fn(async () => setupCompleted),
    log: { log: vi.fn(), error: vi.fn() },
  };
}

describe('runAutoPipeline', () => {
  it('refreshes matches but does not queue before setup shadow-review acknowledgement', async () => {
    const testDeps = deps(false);

    const result = await runAutoPipeline(1, testDeps);

    expect(testDeps.match).toHaveBeenCalledWith(1);
    expect(testDeps.queue).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      setupComplete: false,
      eligible: 1,
      queued: 0,
      skippedQueueReason: 'setup_incomplete',
    });
  });

  it('queues after setup completion has been acknowledged', async () => {
    const testDeps = deps(true);

    const result = await runAutoPipeline(1, testDeps);

    expect(testDeps.match).toHaveBeenCalledWith(1);
    expect(testDeps.queue).toHaveBeenCalledWith(1);
    expect(result).toMatchObject({
      setupComplete: true,
      eligible: 1,
      queued: 1,
      skippedQueueReason: null,
    });
  });

  it('does not check setup completion when there are no eligible matches', async () => {
    const testDeps = deps(true, 0);

    const result = await runAutoPipeline(1, testDeps);

    expect(testDeps.match).toHaveBeenCalledWith(1);
    expect(testDeps.hasSetupShadowReview).not.toHaveBeenCalled();
    expect(testDeps.queue).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      eligible: 0,
      queued: 0,
      skippedQueueReason: 'no_eligible',
    });
  });
});
