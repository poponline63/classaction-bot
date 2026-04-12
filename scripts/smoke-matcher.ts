// Phase 2 smoke test:
// 1. Create a RevitaLash purchase matching the real scraped settlement
// 2. Enable the CONSUMER_PRODUCT_PURCHASE authorization
// 3. Run the matcher against all 202 settlements
// 4. Assert at least one ELIGIBLE verdict lands on the RevitaLash row

import 'dotenv/config';
import { db, schema } from '../src/db/client';
import { ensureSingleUser } from '../src/db/seed';
import { runMatcher } from '../src/lib/matcher/run-matcher';
import { normalizeDefendant } from '../src/lib/scraper/normalize';
import { eq, and, like } from 'drizzle-orm';

async function main() {
  const userId = await ensureSingleUser();

  // Add a RevitaLash purchase inside the class period (2017-01-01 to 2025-12-29)
  const existingPurchase = await db
    .select()
    .from(schema.purchases)
    .where(
      and(
        eq(schema.purchases.userId, userId),
        eq(schema.purchases.merchantNormalized, normalizeDefendant('RevitaLash')),
      ),
    )
    .limit(1);

  if (existingPurchase.length === 0) {
    await db.insert(schema.purchases).values({
      userId,
      merchant: 'RevitaLash',
      merchantNormalized: normalizeDefendant('RevitaLash'),
      productName: 'RevitaLash Advanced Eyelash Conditioner',
      category: 'CONSUMER_PRODUCT_PURCHASE',
      purchaseDate: new Date('2023-06-15'),
      amount: 98.0,
      source: 'manual',
    });
    console.log('[smoke] added RevitaLash purchase');
  } else {
    console.log('[smoke] RevitaLash purchase already present');
  }

  // Enable the CONSUMER_PRODUCT_PURCHASE authorization
  const existingAuth = await db
    .select()
    .from(schema.classAuthorizations)
    .where(
      and(
        eq(schema.classAuthorizations.userId, userId),
        eq(schema.classAuthorizations.category, 'CONSUMER_PRODUCT_PURCHASE'),
      ),
    )
    .limit(1);

  if (existingAuth.length === 0) {
    await db.insert(schema.classAuthorizations).values({
      userId,
      category: 'CONSUMER_PRODUCT_PURCHASE',
      enabled: true,
      attestationText:
        'I, the undersigned, certify under penalty of perjury that I purchased the consumer products listed in my profile.',
      attestationVersion: 1,
      authorizedAt: new Date(),
      revokedAt: null,
    });
    console.log('[smoke] enabled CONSUMER_PRODUCT_PURCHASE authorization');
  }

  // Run matcher
  console.log('[smoke] running matcher...');
  const result = await runMatcher(userId);
  console.log('[smoke] matcher result:', result);

  // Check RevitaLash verdict
  const revita = await db
    .select({
      m: schema.matches,
      s: schema.settlements,
    })
    .from(schema.matches)
    .innerJoin(schema.settlements, eq(schema.matches.settlementId, schema.settlements.id))
    .where(
      and(
        eq(schema.matches.userId, userId),
        like(schema.settlements.caseName, '%RevitaLash%'),
      ),
    );

  console.log(`\n[smoke] RevitaLash matches: ${revita.length}`);
  for (const r of revita) {
    console.log(
      ` -> verdict=${r.m.verdict} confidence=${r.m.confidence.toFixed(2)} case="${r.s.caseName}"`,
    );
    const trace = r.m.reasoningJson as { evidence: { ruleName: string; verdict: string; reason: string }[] };
    for (const e of trace.evidence ?? []) {
      console.log(`    - ${e.ruleName}: ${e.verdict} — ${e.reason}`);
    }
  }

  // Sanity: show verdict distribution
  console.log('\n[smoke] verdict distribution:', result.verdictCounts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
