// GET /api/settlements/search?q=keyword
// Returns settlements matching the search query for the suggestion dropdown.

import { NextResponse } from 'next/server';
import { db, schema } from '@db/client';
import { or, like, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const pattern = `%${q}%`;
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
    .where(
      or(
        like(schema.settlements.caseName, pattern),
        like(schema.settlements.defendant, pattern),
        like(schema.settlements.classDefinition, pattern),
      ),
    )
    .orderBy(desc(schema.settlements.discoveredAt))
    .limit(30);

  return NextResponse.json(rows);
}
