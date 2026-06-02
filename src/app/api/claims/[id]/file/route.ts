// POST /api/claims/[id]/file
//
// Run the guarded single-claim automation worker on an existing claim. The
// claim must already be in a runnable queue state and every downstream gate
// still rechecks plan, preview, proof, authorization, matcher, and mode.

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@db/client';
import { currentUserId } from '@lib/auth/current-user';
import { getUserSubscription } from '@lib/billing/entitlements';
import { ensureFileClaimJobForClaim } from '@lib/claim-filer/filer';
import { getClientPreviewAutomationLock } from '@lib/claim-filer/client-preview-lock';
import {
  CLAIM_RUNNABLE_STATUSES,
  FILE_BOUNDARY_ACK,
  hasBoundaryAck,
  isClaimRunnableStatus,
  readJsonBoundaryAck,
} from '@lib/claim-filer/request-boundary';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const boundaryAck = await readJsonBoundaryAck(req, 'fileBoundaryAck');
  if (!hasBoundaryAck(boundaryAck, FILE_BOUNDARY_ACK)) {
    return NextResponse.json(
      {
        error: 'single-claim automation boundary acknowledgement required',
        requiredAck: FILE_BOUNDARY_ACK,
        detail: 'Running single-claim full guarded automation requires an explicit boundary acknowledgement.',
      },
      { status: 400 },
    );
  }

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const userId = await currentUserId();
  const claimRows = await db
    .select({ id: schema.claims.id, status: schema.claims.status })
    .from(schema.claims)
    .where(and(eq(schema.claims.id, id), eq(schema.claims.userId, userId)))
    .limit(1);
  if (!claimRows[0]) {
    return NextResponse.json({ error: 'claim not found' }, { status: 404 });
  }
  if (!isClaimRunnableStatus(claimRows[0].status)) {
    return NextResponse.json(
      {
        error: 'claim is not runnable',
        status: claimRows[0].status,
        runnableStatuses: CLAIM_RUNNABLE_STATUSES,
        detail: 'Only tracked or final-check claims can start the filer. Review failed, aborted, prepared, or submitted packets before creating a new run.',
      },
      { status: 409 },
    );
  }

  const clientPreviewLock = await getClientPreviewAutomationLock(userId);
  if (clientPreviewLock.locked) {
    return NextResponse.json(
      {
        ...clientPreviewLock.payload,
        detail: 'Running this claim waits until account readiness, paid access, legal review, sign-in, matching, and published-site checks are complete.',
      },
      { status: 423 },
    );
  }

  const subscription = await getUserSubscription(userId);
  if (!subscription.automationEnabled) {
    return NextResponse.json(
      {
        error: 'automation plan required',
        detail: `${subscription.plan}/${subscription.status} can inspect this claim, but active Pro or Founding access is required before paid full automation can arm a worker job.`,
      },
      { status: 402 },
    );
  }

  const result = await ensureFileClaimJobForClaim({
    userId,
    claimId: id,
    source: 'single-claim-run',
  });
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({
    ...result,
    automationMode: 'full_guarded',
    workerCadence: 'automatic_polling',
    detail: result.jobReused
      ? 'Single-claim full guarded automation is already armed. The automatic file-claim worker will continue processing without another manual start.'
      : 'Single-claim full guarded automation is armed. The automatic file-claim worker will run final checks, fill the claim form, capture evidence, and stop at filing-mode gates.',
  });
}
