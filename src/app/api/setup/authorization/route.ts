import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db, schema } from '@db/client';
import type { SettlementCategory } from '@db/schema';
import { SETTLEMENT_CATEGORIES } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { currentUserId } from '@lib/auth/current-user';
import { writeAudit } from '@lib/audit';
import { isSettlementCategoryEnabled } from '@lib/features';

export async function POST(req: Request) {
  const userId = await currentUserId();
  const fd = await req.formData();
  const category = fd.get('category') as SettlementCategory;
  const enabled = fd.get('enabled') === 'on';
  const manualConsent = fd.get('manualConsent') === 'on';
  const attestationText = (fd.get('attestationText') as string).trim();

  if (!SETTLEMENT_CATEGORIES.includes(category)) return NextResponse.json({ error: 'bad category' }, { status: 400 });
  if (!isSettlementCategoryEnabled(category)) {
    return NextResponse.json({ error: 'category is disabled for this client deployment' }, { status: 403 });
  }
  if (enabled && !attestationText) return NextResponse.json({ error: 'attestation required' }, { status: 400 });
  if (enabled && !manualConsent) {
    return NextResponse.json({ error: 'manual attestation confirmation required' }, { status: 400 });
  }

  const existing = await db.select().from(schema.classAuthorizations)
    .where(and(eq(schema.classAuthorizations.userId, userId), eq(schema.classAuthorizations.category, category))).limit(1);

  const now = new Date();
  const attestationDigest = attestationText
    ? createHash('sha256').update(attestationText).digest('hex')
    : null;
  if (existing[0]) {
    const prior = existing[0];
    const wasEnabled = prior.enabled && !prior.revokedAt;
    const attestationChanged = Boolean(attestationText && attestationText !== prior.attestationText);
    if (!enabled && !wasEnabled) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    await db.update(schema.classAuthorizations).set({
      enabled,
      attestationText: attestationText || prior.attestationText,
      authorizedAt: enabled ? now : prior.authorizedAt,
      revokedAt: enabled ? null : now,
      attestationVersion: attestationChanged ? prior.attestationVersion + 1 : prior.attestationVersion,
    }).where(eq(schema.classAuthorizations.id, prior.id));
    await writeAudit({
      userId,
      eventType: enabled ? 'AUTHORIZATION_GRANTED' : 'AUTHORIZATION_REVOKED',
      entityType: 'authorization',
      entityId: prior.id,
      payload: {
        category,
        attestationVersion: attestationChanged ? prior.attestationVersion + 1 : prior.attestationVersion,
        attestationDigest,
        manualConsent,
        priorEnabled: wasEnabled,
      },
      actor: 'user',
    });
  } else if (!enabled) {
    return NextResponse.json({ ok: true, skipped: true });
  } else {
    const inserted = await db.insert(schema.classAuthorizations).values({
      userId, category, enabled, attestationText, attestationVersion: 1,
      authorizedAt: enabled ? now : null, revokedAt: null,
    }).returning();
    await writeAudit({
      userId,
      eventType: enabled ? 'AUTHORIZATION_GRANTED' : 'AUTHORIZATION_REVOKED',
      entityType: 'authorization',
      entityId: inserted[0]!.id,
      payload: { category, attestationVersion: 1, attestationDigest, manualConsent },
      actor: 'user',
    });
  }
  return NextResponse.json({ ok: true });
}
