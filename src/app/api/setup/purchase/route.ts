import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db, schema } from '@db/client';
import type { SettlementCategory } from '@db/schema';
import { SETTLEMENT_CATEGORIES } from '@db/schema';
import { currentUserId } from '@lib/auth/current-user';
import { normalizeDefendant } from '@lib/scraper/normalize';
import { triggerAutoPipeline } from '@lib/auto-pipeline';
import { isSettlementCategoryEnabled } from '@lib/features';
import { writeAudit } from '@lib/audit';

function digest(value: string) {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export async function POST(req: Request) {
  const userId = await currentUserId();
  const fd = await req.formData();
  const merchant = (fd.get('merchant') as string).trim();
  const productName = ((fd.get('productName') as string) || '').trim() || null;
  const category = fd.get('category') as SettlementCategory;
  const purchaseDate = fd.get('purchaseDate') as string;
  const amountRaw = String(fd.get('amount') ?? '').trim();
  const amount = amountRaw ? Number(amountRaw) : null;
  const receiptPath = String(fd.get('receiptPath') ?? '').trim() || null;

  if (!merchant || !purchaseDate) return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  if (!SETTLEMENT_CATEGORIES.includes(category)) return NextResponse.json({ error: 'bad category' }, { status: 400 });
  if (!isSettlementCategoryEnabled(category)) {
    return NextResponse.json({ error: 'category is disabled for this client deployment' }, { status: 403 });
  }
  if (Number.isNaN(Date.parse(purchaseDate))) return NextResponse.json({ error: 'purchase date is invalid' }, { status: 400 });
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    return NextResponse.json({ error: 'amount must be zero or greater' }, { status: 400 });
  }
  if (receiptPath && receiptPath.length > 500) {
    return NextResponse.json({ error: 'receipt reference is too long' }, { status: 400 });
  }

  const inserted = await db.insert(schema.purchases).values({
    userId, merchant, merchantNormalized: normalizeDefendant(merchant), productName, category, purchaseDate: new Date(purchaseDate), amount, receiptPath, source: 'manual',
  }).returning({ id: schema.purchases.id });
  await writeAudit({
    userId,
    eventType: 'PURCHASE_ADDED',
    entityType: 'purchase',
    entityId: inserted[0]!.id,
    actor: 'user',
    payload: {
      category,
      merchantDigest: digest(merchant),
      productPresent: Boolean(productName),
      purchaseDate,
      amountPresent: amount != null,
      receiptReferencePresent: Boolean(receiptPath),
      source: 'manual',
      note: 'Purchase intake audit stores category, dates, presence flags, and digests only; raw merchant/product facts remain in purchases.',
    },
  });
  triggerAutoPipeline(userId);
  return NextResponse.json({ ok: true });
}
