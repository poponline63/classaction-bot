// run-matcher: load the user's profile + purchases + breaches + authorizations,
// then iterate every settlement and upsert a match row per (user, settlement).
//
// Called from:
//   - cron (04:00 daily after scrape)
//   - POST /api/matcher/run
//   - after profile edits (future: debounced)

import { db, schema } from '@db/client';
import { eq } from 'drizzle-orm';
import { runRules } from './verdict';
import type { MatcherContext } from './types';
import { writeAudit } from '@lib/audit';
import { isSettlementCategoryEnabled } from '@lib/features';

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

  const settlements = (await db.select().from(schema.settlements))
    .filter((settlement) => isSettlementCategoryEnabled(settlement.category));
  result.settlementsProcessed = settlements.length;

  // Load every existing match for this user in one query instead of one
  // SELECT per settlement; hosted deployments talk to a remote database where
  // per-row round trips make a full matcher pass too slow for request-time use.
  const existingRows = await db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.userId, userId));
  const existingBySettlementId = new Map(existingRows.map((row) => [row.settlementId, row]));

  type PendingInsert = {
    settlementId: number;
    verdict: string;
    confidence: number;
    values: typeof schema.matches.$inferInsert;
  };
  const pendingInserts: PendingInsert[] = [];

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
      const matchedFieldsJson = trace.evidence.map((e) => ({
        rule: e.ruleName,
        fields: e.fields,
      }));

      const prior = existingBySettlementId.get(settlement.id);
      result.verdictCounts[trace.verdict] =
        (result.verdictCounts[trace.verdict] ?? 0) + 1;

      if (!prior) {
        pendingInserts.push({
          settlementId: settlement.id,
          verdict: trace.verdict,
          confidence: trace.confidence,
          values: {
            userId,
            settlementId: settlement.id,
            verdict: trace.verdict,
            confidence: trace.confidence,
            reasoningJson: trace,
            matchedFieldsJson,
            requiredCategory: trace.requiredCategory,
          },
        });
      } else {
        const verdictChanged = prior.verdict !== trace.verdict;
        // Existing matches still count as refreshed, but only rows whose
        // outcome actually moved are written back.
        const unchanged =
          !verdictChanged
          && prior.confidence === trace.confidence
          && (prior.requiredCategory ?? null) === (trace.requiredCategory ?? null)
          && JSON.stringify(prior.reasoningJson) === JSON.stringify(trace);
        if (!unchanged) {
          await db
            .update(schema.matches)
            .set({
              verdict: trace.verdict,
              confidence: trace.confidence,
              reasoningJson: trace,
              matchedFieldsJson,
              requiredCategory: trace.requiredCategory,
              updatedAt: new Date(),
            })
            .where(eq(schema.matches.id, prior.id));
        }
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

  // Flush new matches in chunks so a first-time matcher pass over the whole
  // catalog costs a handful of statements instead of hundreds.
  const INSERT_CHUNK_SIZE = 40;
  for (let offset = 0; offset < pendingInserts.length; offset += INSERT_CHUNK_SIZE) {
    const chunk = pendingInserts.slice(offset, offset + INSERT_CHUNK_SIZE);
    try {
      const inserted = await db
        .insert(schema.matches)
        .values(chunk.map((item) => item.values))
        .returning({ id: schema.matches.id, settlementId: schema.matches.settlementId });
      result.matchesInserted += inserted.length;

      const bySettlementId = new Map(chunk.map((item) => [item.settlementId, item]));
      await db.insert(schema.auditLog).values(inserted.map((row) => {
        const source = bySettlementId.get(row.settlementId);
        return {
          userId,
          eventType: 'MATCH_PRODUCED' as const,
          entityType: 'match' as const,
          entityId: row.id,
          payloadJson: {
            settlementId: row.settlementId,
            verdict: source?.verdict,
            confidence: source?.confidence,
          },
          actor: 'matcher' as const,
        };
      }));
    } catch (err) {
      result.errors.push(
        `match insert chunk @${offset}: ${(err as Error).message}`,
      );
    }
  }

  await writeAudit({
    userId,
    eventType: 'MATCHER_RUN_COMPLETED',
    entityType: 'user',
    entityId: userId,
    payload: {
      settlementsProcessed: result.settlementsProcessed,
      matchesInserted: result.matchesInserted,
      matchesUpdated: result.matchesUpdated,
      verdictCounts: result.verdictCounts,
      verdictsChanged: result.verdictsChanged,
      errorCount: result.errors.length,
    },
    actor: 'matcher',
  });

  return result;
}
