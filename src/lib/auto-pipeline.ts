import { runMatcher } from './matcher/run-matcher';
import { queueEligibleClaims } from './claim-filer/claim-queue';
import { hasUserStartedSetupShadowReview } from './setup-state';

let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

type AutoPipelineDeps = {
  match: typeof runMatcher;
  queue: typeof queueEligibleClaims;
  hasSetupShadowReview: (userId: number) => Promise<boolean>;
  log: Pick<Console, 'log' | 'error'>;
};

export type AutoPipelineResult = {
  setupComplete: boolean;
  eligible: number;
  queued: number;
  skippedNoPlan: number;
  skippedQueueReason: 'setup_incomplete' | 'no_eligible' | null;
};

const defaultDeps: AutoPipelineDeps = {
  match: runMatcher,
  queue: queueEligibleClaims,
  hasSetupShadowReview: hasUserStartedSetupShadowReview,
  log: console,
};

export async function runAutoPipeline(userId: number, deps: AutoPipelineDeps = defaultDeps): Promise<AutoPipelineResult> {
  deps.log.log('[auto-pipeline] profile changed -> running matcher');
  const match = await deps.match(userId);
  const eligible = match.verdictCounts.ELIGIBLE ?? 0;

  if (eligible === 0) {
    deps.log.log(`[auto-pipeline] ${match.settlementsProcessed} checked, 0 review-ready`);
    return {
      setupComplete: false,
      eligible,
      queued: 0,
      skippedNoPlan: 0,
      skippedQueueReason: 'no_eligible',
    };
  }

  const setupComplete = await deps.hasSetupShadowReview(userId);
  if (!setupComplete) {
    deps.log.log(
      `[auto-pipeline] ${eligible} review-ready, 0 queued because setup shadow-review acknowledgement is not complete`,
    );
    return {
      setupComplete: false,
      eligible,
      queued: 0,
      skippedNoPlan: 0,
      skippedQueueReason: 'setup_incomplete',
    };
  }

  const filed = await deps.queue(userId);
  deps.log.log(
    `[auto-pipeline] ${eligible} review-ready, ${filed.queued} new claims queued, ${filed.skippedNoPlan} plan-gated`,
  );
  return {
    setupComplete: true,
    eligible,
    queued: filed.queued,
    skippedNoPlan: filed.skippedNoPlan,
    skippedQueueReason: null,
  };
}

export function triggerAutoPipeline(userId: number) {
  if (pendingTimeout) clearTimeout(pendingTimeout);
  pendingTimeout = setTimeout(async () => {
    pendingTimeout = null;
    try {
      await runAutoPipeline(userId);
    } catch (err) {
      console.error('[auto-pipeline] error:', (err as Error).message);
    }
  }, 3000);
}
