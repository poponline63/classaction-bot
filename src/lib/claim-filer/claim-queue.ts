import { db, schema } from '@db/client';
import { and, eq } from 'drizzle-orm';
import { queueClaim } from './filer';

export interface ClaimQueueResult {
  eligible: number;
  alreadyClaimed: number;
  queued: number;
  skippedProof: number;
  skippedNoForm: number;
  skippedNoAuth: number;
  skippedNoPlan: number;
  jobsEnqueued: number;
  jobsReused: number;
  errors: string[];
}

export async function queueEligibleClaims(userId: number): Promise<ClaimQueueResult> {
  const result: ClaimQueueResult = {
    eligible: 0,
    alreadyClaimed: 0,
    queued: 0,
    skippedProof: 0,
    skippedNoForm: 0,
    skippedNoAuth: 0,
    skippedNoPlan: 0,
    jobsEnqueued: 0,
    jobsReused: 0,
    errors: [],
  };

  const eligibleMatches = await db
    .select({
      match: schema.matches,
      settlement: schema.settlements,
    })
    .from(schema.matches)
    .innerJoin(schema.settlements, eq(schema.matches.settlementId, schema.settlements.id))
    .where(
      and(
        eq(schema.matches.userId, userId),
        eq(schema.matches.verdict, 'ELIGIBLE'),
      ),
    );

  result.eligible = eligibleMatches.length;

  const existingClaims = await db
    .select({ matchId: schema.claims.matchId })
    .from(schema.claims)
    .where(eq(schema.claims.userId, userId));
  const claimedMatchIds = new Set(existingClaims.map((claim) => claim.matchId));

  for (const { match, settlement } of eligibleMatches) {
    if (claimedMatchIds.has(match.id)) {
      result.alreadyClaimed++;
      continue;
    }

    if (settlement.proofRequired) {
      result.skippedProof++;
      continue;
    }

    if (!settlement.claimFormUrl) {
      result.skippedNoForm++;
      continue;
    }

    try {
      const queueResult = await queueClaim(match.id, userId);
      if ('claimId' in queueResult) {
        result.queued++;
        if (queueResult.jobId != null && queueResult.jobReused) {
          result.jobsReused++;
        } else if (queueResult.jobId != null) {
          result.jobsEnqueued++;
        }
      } else if (queueResult.error.includes('authorization')) {
        result.skippedNoAuth++;
      } else if (
        queueResult.error.includes('automation plan')
        || queueResult.error.includes('monthly claim limit')
      ) {
        result.skippedNoPlan++;
      } else {
        result.errors.push(`match #${match.id}: ${queueResult.error}`);
      }
    } catch (err) {
      result.errors.push(`match #${match.id}: ${(err as Error).message}`);
    }
  }

  if (result.queued > 0) {
    console.log(`[claim-queue] queued ${result.queued} new claims for user ${userId}`);
  }

  return result;
}
