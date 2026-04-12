import { NextResponse } from 'next/server';
import { db, schema } from '@db/client';
import type { SettlementCategory } from '@db/schema';
import { SETTLEMENT_CATEGORIES } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { currentUserId } from '@lib/auth/current-user';

export async function POST(req: Request) {
  const userId = await currentUserId();
  const fd = await req.formData();
  const category = fd.get('category') as SettlementCategory;
  const enabled = fd.get('enabled') === 'on';
  const attestationText = (fd.get('attestationText') as string).trim();

  if (!SETTLEMENT_CATEGORIES.includes(category)) return NextResponse.json({ error: 'bad category' }, { status: 400 });
  if (enabled && !attestationText) return NextResponse.json({ error: 'attestation required' }, { status: 400 });

  const existing = await db.select().from(schema.classAuthorizations)
    .where(and(eq(schema.classAuthorizations.userId, userId), eq(schema.classAuthorizations.category, category))).limit(1);

  const now = new Date();
  if (existing[0]) {
    await db.update(schema.classAuthorizations).set({
      enabled, attestationText: attestationText || existing[0].attestationText,
      authorizedAt: enabled ? now : existing[0].authorizedAt,
      revokedAt: enabled ? null : now,
    }).where(eq(schema.classAuthorizations.id, existing[0].id));
  } else {
    await db.insert(schema.classAuthorizations).values({
      userId, category, enabled, attestationText, attestationVersion: 1,
      authorizedAt: enabled ? now : null, revokedAt: null,
    });
  }
  return NextResponse.json({ ok: true });
}
