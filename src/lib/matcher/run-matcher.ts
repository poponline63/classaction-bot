// run-matcher: load the user's profile + purchases + breaches + authorizations,
// then iterate every settlement and upsert a match row per (user, settlement).
//
// Called from:
//   - cron (04:00 daily after scrape)
//   - POST /api/matcher/run
//   - after profile edits (future: debounced)

import { db, schema } from '@db/client';
import { eq, and } from 'drizzle-orm';
import { runRules } from './verdict';
import type { MatcherContext } from './types';
import { writeAudit } from '@lib/audit';

export interface MatcherResult {
  settlementsProcessed: number;
  matchesInserted: number;
  matchesUpdated: number;
  verdictCounts: Record<string, number>;
  verdictsChanged: number;
  errors: string[];
}

export async function runMatcher(userId: number): Promise<MatcherResult> {
  const result: MatcherResult = {
    settlementsProcessed: 0,
    matchesInserted: 0,
    matchesUpdated: 0,
    verdictCounts: { ELIGIBLE: 0, INELIGIBLE: 0, NEEDS_REVIEW: 0 },
    verdictsChanged: 0,
    errors: [],
  };

  // Load the user's static data once
  const profileRows = await db
    .select()
    .from(schema.profile)
    .where(eq(schema.profile.userId, userId))
    .limit(1);
  const profile = profileRows[0] ?? null;

  const purchases = await db
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.userId, userId));

  const breaches = await db
    .select()
    .from(schema.dataBreachExposure)
    .where(eq(schema.dataBreachExposure.userId, userId));

  const authorizations = await db
    .select()
    .from(schema.classAuthorizations)
    .where(eq(schema.classAuthorizations.userId, userId));

  const settlements = await db.select().from(schema.settlements);
  result.settlementsProcessed = settlements.length;

  for (const settlement of settlements) {
    try {
      const ctx: MatcherContext = {
        userId,
        settlement,
        profile,
        purchases,
        breaches,
        authorizations,
      };

      const trace = runRules(ctx);

      const existing = await db
        .select()
        .from(schema.matches)
        .where(
          and(
            eq(schema.matches.userId, userId),
            eq(schema.matches.settlementId, settlement.id),
          ),
        )
        .limit(1);

      const prior = existing[0];
      result.verdictCounts[trace.verdict] =
        (result.verdictCounts[trace.verdict] ?? 0) + 1;

      if (!prior) {
        const inserted = await db
          .insert(schema.matches)
          .values({
            userId,
            settlementId: settlement.id,
            verdict: trace.verdict,
            confidence: trace.confidence,
            reasoningJson: trace,
            matchedFieldsJson: trace.evidence.map((e) => ({
              rule: e.ruleName,
              fields: e.fields,
            })),
            requiredCategory: trace.requiredCategory,
          })
          .returning();
        result.matchesInserted++;
        await writeAudit({
          userId,
          eventType: 'MATCH_PRODUCED',
          entityType: 'match',
          entityId: inserted[0]!.id,
          payload: { settlementId: settlement.id, verdict: trace.verdict, confidence: trace.confidence },
          actor: 'matcher',
        });
      } else {
        const verdictChanged = prior.verdict !== trace.verdict;
        await db
          .update(schema.matches)
          .set({
            verdict: trace.verdict,
            confidence: trace.confidence,
            reasoningJson: trace,
            matchedFieldsJson: trace.evidence.map((e) => ({
              rule: e.ruleName,
              fields: e.fields,
            })),
            requiredCategory: trace.requiredCategory,
            updatedAt: new Date(),
          })
          .where(eq(schema.matches.id, prior.id));
        result.matchesUpdated++;
        if (verdictChanged) {
          result.verdictsChanged++;
          await writeAudit({
            userId,
            eventType: 'MATCH_VERDICT_CHANGED',
            entityType: 'match',
            entityId: prior.id,
            payload: {
              settlementId: settlement.id,
              from: prior.verdict,
              to: trace.verdict,
            },
            actor: 'matcher',
          });
        }
      }
    } catch (err) {
      result.errors.push(
        `settlement #${settlement.id}: ${(err as Error).message}`,
      );
    }
  }

  return result;
}
