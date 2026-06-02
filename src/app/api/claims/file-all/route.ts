import { NextResponse } from 'next/server';
import { currentUserId } from '@lib/auth/current-user';
import { runMatcher } from '@lib/matcher/run-matcher';
import { queueEligibleClaims } from '@lib/claim-filer/claim-queue';
import { getClientPreviewAutomationLock } from '@lib/claim-filer/client-preview-lock';
import {
  QUEUE_BOUNDARY_ACK,
  QUEUE_TRUST_LOCK_ACK,
  hasBoundaryAck,
} from '@lib/claim-filer/request-boundary';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let payload: Record<string, unknown> = {};
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    try {
      payload = await req.json() as Record<string, unknown>;
    } catch {
      payload = {};
    }
  }

  const boundaryAck = req.headers.get('x-claimbot-boundary-ack')
    ?? (typeof payload.queueBoundaryAck === 'string' ? payload.queueBoundaryAck : null);
  if (!hasBoundaryAck(boundaryAck, QUEUE_BOUNDARY_ACK)) {
    return NextResponse.json(
      {
        error: 'queue boundary acknowledgement required',
        requiredAck: QUEUE_BOUNDARY_ACK,
        detail: 'Full automation releases automation-ready no-proof claims into audited worker filing jobs that continue without per-claim user steps.',
      },
      { status: 400 },
    );
  }

  const trustLock = req.headers.get('x-claimbot-trust-lock')
    ?? (typeof payload.queueTrustLock === 'string' ? payload.queueTrustLock : null);
  if (trustLock !== QUEUE_TRUST_LOCK_ACK) {
    return NextResponse.json(
      {
        error: 'queue trust lock acknowledgement required',
        requiredAck: QUEUE_TRUST_LOCK_ACK,
        detail: 'Full automation can run multiple claim jobs end to end, so the user must confirm proof-required claims stay manual and final checks still apply.',
      },
      { status: 400 },
    );
  }

  const userId = await currentUserId();
  const clientPreviewLock = await getClientPreviewAutomationLock(userId);
  if (clientPreviewLock.locked) {
    return NextResponse.json(
      {
        ...clientPreviewLock.payload,
        detail: 'Bulk automation waits until account readiness, paid access, legal review, sign-in, matching, and published-site checks are complete.',
      },
      { status: 423 },
    );
  }

  const match = await runMatcher(userId);
  const filed = await queueEligibleClaims(userId);

  return NextResponse.json({
    matched: match.verdictCounts.ELIGIBLE ?? 0,
    queued: filed.queued,
    jobsEnqueued: filed.jobsEnqueued,
    jobsReused: filed.jobsReused,
    alreadyClaimed: filed.alreadyClaimed,
    skippedProof: filed.skippedProof,
    skippedNoForm: filed.skippedNoForm,
    skippedNoAuth: filed.skippedNoAuth,
    skippedNoPlan: filed.skippedNoPlan,
    errors: filed.errors,
    automationMode: 'full_guarded',
    workerCadence: 'ClaimBot created or reused filing jobs for eligible no-proof claims; the paid command is fully automated after this point, and the worker continues through final checks, form fill, evidence capture, and live submission only when live filing is explicitly enabled.',
    boundary: 'Manual stops are hard blockers only: proof, missing permission, missing forms, client-preview launch locks, final-check failures, legal/compliance review, or disabled live filing.',
  });
}
