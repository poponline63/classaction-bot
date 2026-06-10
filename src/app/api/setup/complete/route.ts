import { NextResponse } from 'next/server';
import { setSetting } from '@lib/settings';
import { currentUserId } from '@lib/auth/current-user';
import { getUserSubscription } from '@lib/billing/entitlements';
import { isClientFeatureEnabled } from '@lib/features';
import { runSetupPipeline } from '@lib/setup-pipeline';
import { runMatcher } from '@lib/matcher/run-matcher';
import { queueEligibleClaims } from '@lib/claim-filer/claim-queue';
import { writeAudit } from '@lib/audit';
import {
  SETUP_SHADOW_REVIEW_ACK,
  TERMS_BOUNDARY_ACK,
  hasBoundaryAck,
} from '@lib/claim-filer/request-boundary';

export const dynamic = 'force-dynamic';

async function readSetupCompletionPayload(req: Request) {
  const headerAck = req.headers.get('x-claimbot-boundary-ack');
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return {
      setupShadowReviewAck: headerAck,
      termsBoundaryAck: null,
    };
  }

  try {
    const body = await req.json() as Record<string, unknown>;
    return {
      setupShadowReviewAck: typeof body.setupShadowReviewAck === 'string'
        ? body.setupShadowReviewAck
        : headerAck,
      termsBoundaryAck: typeof body.termsBoundaryAck === 'string'
        ? body.termsBoundaryAck
        : null,
    };
  } catch {
    return {
      setupShadowReviewAck: headerAck,
      termsBoundaryAck: null,
    };
  }
}

export async function POST(req: Request) {
  const { setupShadowReviewAck, termsBoundaryAck } = await readSetupCompletionPayload(req);
  if (!hasBoundaryAck(setupShadowReviewAck, SETUP_SHADOW_REVIEW_ACK)) {
    return NextResponse.json(
      {
        error: 'setup shadow-review acknowledgement required',
        requiredAck: SETUP_SHADOW_REVIEW_ACK,
        detail: 'Setup completion can start discovery, matching, and safe queue preparation, so the user must acknowledge the shadow-review boundary.',
      },
      { status: 400 },
    );
  }
  if (!hasBoundaryAck(termsBoundaryAck, TERMS_BOUNDARY_ACK)) {
    return NextResponse.json(
      {
        error: 'terms boundary acknowledgement required',
        requiredAck: TERMS_BOUNDARY_ACK,
        detail: 'Setup completion starts automated review work, so the user must acknowledge the Terms boundary: no legal advice, no eligibility guarantee, proof-required claims stay manual, and paid automation stays gated.',
      },
      { status: 400 },
    );
  }

  await setSetting('setup_completed', 'true');

  const userId = await currentUserId();
  const subscription = await getUserSubscription(userId);
  const discoverySkipped = !isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');
  const breachImportEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT');
  const liveFilingEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_LIVE_FILING');

  await writeAudit({
    userId,
    eventType: 'USER_TERMS_ACKNOWLEDGED',
    entityType: 'system',
    entityId: userId,
    actor: 'user',
    payload: {
      requiredAck: TERMS_BOUNDARY_ACK,
      termsVersion: 'claimbot-terms-v1',
      userBoundary: 'The user acknowledged ClaimBot is not legal advice, does not guarantee eligibility or payment, proof-required claims stay manual, and paid automation remains guarded by permission, proof, plan, form, final checks, and filing-mode controls.',
      enforcedBefore: '/api/setup/complete',
    },
  });

  await writeAudit({
    userId,
    eventType: 'SETUP_SHADOW_REVIEW_STARTED',
    entityType: 'system',
    entityId: userId,
    actor: 'user',
    payload: {
      requiredAck: SETUP_SHADOW_REVIEW_ACK,
      termsBoundaryAck: TERMS_BOUNDARY_ACK,
      discoverySkipped,
      settlementSearchEnabled: !discoverySkipped,
      breachImportEnabled,
      liveFilingEnabled,
      automationStarted: ['matching', 'safe queue preparation (plan-checked)', ...(discoverySkipped ? [] : ['discovery'])],
      planGate: {
        plan: subscription.plan,
        status: subscription.status,
        automationEnabled: subscription.automationEnabled,
        boundary: 'Free and Plus can review matches; full guarded automation requires active Pro or Founding access.',
      },
      boundary: 'Setup completion starts shadow-mode review only; proof-required claims stay manual and plan, queue, and file gates remain enforced.',
    },
  });

  if (process.env.NETLIFY === 'true') {
    // Serverless functions freeze after the response returns, so the pipeline
    // must finish inside this request. Run the bounded matcher + safe queue
    // pass here; settlement discovery stays with the scheduled worker, which
    // refreshes the shared catalog for every user.
    try {
      const match = await runMatcher(userId);
      await queueEligibleClaims(userId);
      console.log(
        `[setup] hosted pipeline done: processed=${match.settlementsProcessed} eligible=${match.verdictCounts.ELIGIBLE ?? 0}`,
      );
    } catch (err) {
      console.error('[setup] hosted pipeline error:', (err as Error).message);
    }
  } else {
    void (async () => {
      try {
        await runSetupPipeline(userId);
      } catch (err) {
        console.error('[setup] pipeline error:', (err as Error).message);
      }
    })();
  }

  return NextResponse.json({
    ok: true,
    discoverySkipped,
    termsBoundaryAck: TERMS_BOUNDARY_ACK,
    planGate: {
      automationEnabled: subscription.automationEnabled,
      plan: subscription.plan,
      status: subscription.status,
    },
  });
}
