// GET /api/settlements/search?q=keyword
// Returns settlements matching the search query for the suggestion dropdown.

import { NextResponse } from 'next/server';
import { db, schema } from '@db/client';
import { and, or, like, desc, ne } from 'drizzle-orm';
import { isClientFeatureEnabled, isSettlementCategoryEnabled } from '@lib/features';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH')) {
    return NextResponse.json({ error: 'settlement search is disabled' }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const pattern = `%${q}%`;
  const filters = [
    or(
      like(schema.settlements.caseName, pattern),
      like(schema.settlements.defendant, pattern),
      like(schema.settlements.classDefinition, pattern),
    ),
  ];
  if (!isSettlementCategoryEnabled('DATA_BREACH')) {
    filters.push(ne(schema.settlements.category, 'DATA_BREACH'));
  }

  const rows = await db
    .select({
      id: schema.settlements.id,
      caseName: schema.settlements.caseName,
      defendant: schema.settlements.defendant,
      category: schema.settlements.category,
      classDefinition: schema.settlements.classDefinition,
      payoutEstimate: schema.settlements.payoutEstimate,
      proofRequired: schema.settlements.proofRequired,
      claimFormUrl: schema.settlements.claimFormUrl,
      deadline: schema.settlements.deadline,
    })
    .from(schema.settlements)
    .where(and(...filters))
    .orderBy(desc(schema.settlements.discoveredAt))
    .limit(30);

  return NextResponse.json(rows);
}
