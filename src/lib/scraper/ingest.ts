// Ingest orchestrator: runs scrapers, upserts by canonicalKey, writes audit
// entries, and returns a count of new + updated settlements.
//
// Called from:
//   - worker/cron.ts (03:15 daily)
//   - scripts/scrape-once.ts (manual dev invocation)
//   - POST /api/scraper/run (future admin endpoint)

import { db, schema } from '@db/client';
import { ensureSingleUser } from '@db/seed';
import { eq } from 'drizzle-orm';
import { scrapeClassActionOrg } from './classaction-org';
import { scrapeTopClassActions } from './top-class-actions';
import type { NormalizedSettlement } from './normalize';
import { writeAudit } from '@lib/audit';
import { notifyDailySummary } from '@lib/notifier/discord';

export interface IngestResult {
  scraped: number;
  inserted: number;
  updated: number;
  errors: string[];
}

export async function runIngest(): Promise<IngestResult> {
  const userId = await ensureSingleUser();
  const result: IngestResult = { scraped: 0, inserted: 0, updated: 0, errors: [] };

  await writeAudit({
    userId,
    eventType: 'SCRAPE_STARTED',
    entityType: 'system',
    entityId: 0,
    payload: { startedAt: new Date().toISOString() },
    actor: 'scraper',
  });

  let normalizedAll: NormalizedSettlement[] = [];
  try {
    const [coa, tca] = await Promise.allSettled([
      scrapeClassActionOrg(),
      scrapeTopClassActions(),
    ]);
    if (coa.status === 'fulfilled') normalizedAll = normalizedAll.concat(coa.value);
    else result.errors.push(`classaction.org: ${coa.reason}`);

    if (tca.status === 'fulfilled') normalizedAll = normalizedAll.concat(tca.value);
    else result.errors.push(`tca: ${tca.reason}`);
  } catch (err) {
    result.errors.push(`scrape fatal: ${(err as Error).message}`);
  }

  result.scraped = normalizedAll.length;

  for (const n of normalizedAll) {
    try {
      const existingRows = await db
        .select()
        .from(schema.settlements)
        .where(eq(schema.settlements.canonicalKey, n.canonicalKey))
        .limit(1);
      const existing = existingRows[0];

      if (!existing) {
        const insertedRows = await db
          .insert(schema.settlements)
          .values({
            canonicalKey: n.canonicalKey,
            source: n.source,
            sourceUrl: n.sourceUrl,
            caseName: n.caseName,
            defendant: n.defendant,
            defendantAliases: n.defendantAliases,
            category: n.category,
            classDefinition: n.classDefinition,
            classPeriodStart: n.classPeriodStart ?? null,
            classPeriodEnd: n.classPeriodEnd ?? null,
            deadline: n.deadline ?? null,
            proofRequired: n.proofRequired ?? false,
            payoutEstimate: n.payoutEstimate ?? null,
            payoutStructure: n.payoutStructure ?? null,
            claimFormUrl: n.claimFormUrl ?? null,
            administrator: n.administrator,
            captchaType: n.captchaType,
            rawJson: (n.raw ?? null) as unknown,
            status: 'DISCOVERED',
          })
          .returning();
        const inserted = insertedRows[0]!;
        result.inserted++;
        await writeAudit({
          userId,
          eventType: 'SETTLEMENT_DISCOVERED',
          entityType: 'settlement',
          entityId: inserted.id,
          payload: { canonicalKey: n.canonicalKey, caseName: n.caseName },
          actor: 'scraper',
        });
      } else {
        // Update mutable fields (deadline, claim form, payout) but never
        // touch canonicalKey, classDefinition, or discoveredAt.
        // Update mutable fields. Deadline intentionally replaces rather than
        // falling back — if the newer scrape no longer sees a deadline, the
        // old one is almost certainly wrong (see "Nuke bad deadlines" fix).
        await db
          .update(schema.settlements)
          .set({
            defendant: n.defendant,
            defendantAliases: n.defendantAliases,
            deadline: n.deadline ?? null,
            claimFormUrl: n.claimFormUrl ?? existing.claimFormUrl,
            payoutEstimate: n.payoutEstimate ?? existing.payoutEstimate,
            administrator:
              n.administrator !== 'unknown' ? n.administrator : existing.administrator,
            updatedAt: new Date(),
          })
          .where(eq(schema.settlements.id, existing.id));
        result.updated++;
        await writeAudit({
          userId,
          eventType: 'SETTLEMENT_UPDATED',
          entityType: 'settlement',
          entityId: existing.id,
          payload: { canonicalKey: n.canonicalKey },
          actor: 'scraper',
        });
      }
    } catch (err) {
      result.errors.push(`upsert ${n.canonicalKey}: ${(err as Error).message}`);
    }
  }

  await writeAudit({
    userId,
    eventType: 'SCRAPE_COMPLETED',
    entityType: 'system',
    entityId: 0,
    payload: result,
    actor: 'scraper',
  });

  // Notify Discord (fire-and-forget)
  notifyDailySummary(result).catch((e) =>
    console.error('[notifier] failed:', (e as Error).message),
  );

  return result;
}
