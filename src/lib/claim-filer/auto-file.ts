// Auto-file engine: after every matcher run, scan for new ELIGIBLE matches
// that haven't been claimed yet, and auto-queue them.
//
// This is the "hands-off" mode. The user sets up their profile once and
// the bot files everything it can, automatically, forever.

import { db, schema } from '@db/client';
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { queueClaim } from './filer';
import { writeAudit } from '@lib/audit';

export interface AutoFileResult {
  eligible: number;
  alreadyClaimed: number;
  queued: number;
  skippedProof: number;
  skippedNoForm: number;
  skippedNoAuth: number;
  errors: string[];
}

export async function autoFileEligible(userId: number): Promise<AutoFileResult> {
  const result: AutoFileResult = {
    eligible: 0,
    alreadyClaimed: 0,
    queued: 0,
    skippedProof: 0,
    skippedNoForm: 0,
    skippedNoAuth: 0,
    errors: [],
  };

  // Find all ELIGIBLE matches for this user
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

  // Get existing claims so we don't double-queue
  const existingClaims = await db
    .select({ matchId: schema.claims.matchId })
    .from(schema.claims)
    .where(eq(schema.claims.userId, userId));
  const claimedMatchIds = new Set(existingClaims.map(c => c.matchId));

  for (const { match, settlement } of eligibleMatches) {
    // Already claimed?
    if (claimedMatchIds.has(match.id)) {
      result.alreadyClaimed++;
      continue;
    }

    // Proof required? Skip for now (MVP)
    if (settlement.proofRequired) {
      result.skippedProof++;
      continue;
    }

    // No claim form URL? Can't file
    if (!settlement.claimFormUrl) {
      result.skippedNoForm++;
      continue;
    }

    // Try to queue
    try {
      const queueResult = await queueClaim(match.id);
      if ('claimId' in queueResult) {
        result.queued++;
      } else {
        // queueClaim returns { error } for things like missing auth
        if (queueResult.error.includes('authorization')) {
          result.skippedNoAuth++;
        } else {
          result.errors.push(`match #${match.id}: ${queueResult.error}`);
        }
      }
    } catch (err) {
      result.errors.push(`match #${match.id}: ${(err as Error).message}`);
    }
  }

  if (result.queued > 0) {
    console.log(`[auto-file] queued ${result.queued} new claims for user ${userId}`);
  }

  return result;
}
