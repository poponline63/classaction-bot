// POST /api/setup/auto-authorize
// Automatically enables authorizations for the given categories.
// Called by Auto Sign-Up and Quick Pick steps so users don't have to
// manually toggle each category.

import { NextResponse } from 'next/server';
import { db, schema } from '@db/client';
import type { SettlementCategory } from '@db/schema';
import { SETTLEMENT_CATEGORIES } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { currentUserId } from '@lib/auth/current-user';

const ATTESTATION_TEMPLATES: Record<string, string> = {
  CONSUMER_PRODUCT_PURCHASE: 'I certify under penalty of perjury that I purchased the listed products during the relevant class periods.',
  SUBSCRIPTION_SERVICE: 'I certify under penalty of perjury that I subscribed to the listed services during the relevant class periods.',
  DATA_BREACH: 'I certify under penalty of perjury that my personal information was exposed in the listed data breaches.',
  ROBOCALL_TCPA: 'I certify under penalty of perjury that I received unsolicited calls or texts at the listed phone numbers.',
  DECEPTIVE_ADVERTISING: 'I certify under penalty of perjury that I purchased the listed products in reliance on the advertising at issue.',
  AUTO_DEFECT: 'I certify under penalty of perjury that I owned or leased the listed vehicles during the relevant periods.',
  EMPLOYMENT: 'I certify under penalty of perjury that I was employed by the listed employers during the relevant periods.',
};

export async function POST(req: Request) {
  const userId = await currentUserId();
  const body = await req.json() as { categories: string[] };
  const categories = (body.categories ?? []).filter((c: string) =>
    SETTLEMENT_CATEGORIES.includes(c as SettlementCategory),
  );

  const now = new Date();
  let enabled = 0;

  for (const cat of categories) {
    const existing = await db
      .select()
      .from(schema.classAuthorizations)
      .where(
        and(
          eq(schema.classAuthorizations.userId, userId),
          eq(schema.classAuthorizations.category, cat as SettlementCategory),
        ),
      )
      .limit(1);

    if (existing[0]) {
      // Already exists — make sure it's enabled
      if (!existing[0].enabled || existing[0].revokedAt) {
        await db
          .update(schema.classAuthorizations)
          .set({ enabled: true, authorizedAt: now, revokedAt: null })
          .where(eq(schema.classAuthorizations.id, existing[0].id));
        enabled++;
      }
    } else {
      await db.insert(schema.classAuthorizations).values({
        userId,
        category: cat as SettlementCategory,
        enabled: true,
        attestationText: ATTESTATION_TEMPLATES[cat] ?? `I certify under penalty of perjury for ${cat}.`,
        attestationVersion: 1,
        authorizedAt: now,
        revokedAt: null,
      });
      enabled++;
    }
  }

  return NextResponse.json({ ok: true, enabled });
}
