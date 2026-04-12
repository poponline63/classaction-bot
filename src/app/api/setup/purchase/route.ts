import { NextResponse } from 'next/server';
import { db, schema } from '@db/client';
import type { SettlementCategory } from '@db/schema';
import { SETTLEMENT_CATEGORIES } from '@db/schema';
import { currentUserId } from '@lib/auth/current-user';
import { normalizeDefendant } from '@lib/scraper/normalize';

export async function POST(req: Request) {
  const userId = await currentUserId();
  const fd = await req.formData();
  const merchant = (fd.get('merchant') as string).trim();
  const productName = ((fd.get('productName') as string) || '').trim() || null;
  const category = fd.get('category') as SettlementCategory;
  const purchaseDate = fd.get('purchaseDate') as string;
  const amount = Number(fd.get('amount') ?? 0) || null;

  if (!merchant || !purchaseDate) return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  if (!SETTLEMENT_CATEGORIES.includes(category)) return NextResponse.json({ error: 'bad category' }, { status: 400 });

  await db.insert(schema.purchases).values({
    userId, merchant, merchantNormalized: normalizeDefendant(merchant), productName, category, purchaseDate: new Date(purchaseDate), amount, source: 'manual',
  });
  return NextResponse.json({ ok: true });
}
