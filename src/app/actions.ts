// Server actions — invoked from form submissions on CRUD pages.
// Every mutation filters by userId and writes an audit entry where
// relevant. Running the matcher on profile edits is debounced via a
// simple inline call for MVP; Phase 5 moves this to a background job.

'use server';

import { db, schema } from '@db/client';
import { SETTLEMENT_CATEGORIES, type SettlementCategory } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUserId } from '@lib/auth/current-user';
import { normalizeDefendant } from '@lib/scraper/normalize';
import { writeAudit } from '@lib/audit';
import { runMatcher } from '@lib/matcher/run-matcher';
import { refreshHibp } from '@lib/hibp/refresh';
import { queueClaim, fileClaim } from '@lib/claim-filer/filer';

// -----------------------------------------------------------------------------
// Profile
// -----------------------------------------------------------------------------

export async function upsertProfile(formData: FormData) {
  const userId = await currentUserId();
  const legalName = (formData.get('legalName') as string | null)?.trim() || null;
  const dob = (formData.get('dateOfBirth') as string | null) || null;
  const emailsRaw = (formData.get('emails') as string | null) ?? '';
  const phonesRaw = (formData.get('phones') as string | null) ?? '';
  const addressesRaw = (formData.get('addressesJson') as string | null) ?? '[]';

  const emails = emailsRaw
    .split(/[\n,]/)
    .map((e) => e.trim())
    .filter(Boolean);
  const phones = phonesRaw
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);

  let addresses: unknown = [];
  try {
    addresses = JSON.parse(addressesRaw);
    if (!Array.isArray(addresses)) addresses = [];
  } catch {
    addresses = [];
  }

  const existing = await db
    .select()
    .from(schema.profile)
    .where(eq(schema.profile.userId, userId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(schema.profile)
      .set({
        legalName,
        dateOfBirth: dob ? new Date(dob) : null,
        emailsJson: emails,
        phonesJson: phones,
        // casting: Drizzle's json column typed as the addressesJson schema
        addressesJson: addresses as never,
        updatedAt: new Date(),
      })
      .where(eq(schema.profile.id, existing[0].id));
  } else {
    await db.insert(schema.profile).values({
      userId,
      legalName,
      dateOfBirth: dob ? new Date(dob) : null,
      emailsJson: emails,
      phonesJson: phones,
      addressesJson: addresses as never,
    });
  }

  revalidatePath('/profile');
}

// -----------------------------------------------------------------------------
// Purchases
// -----------------------------------------------------------------------------

export async function addPurchase(formData: FormData) {
  const userId = await currentUserId();
  const merchant = (formData.get('merchant') as string).trim();
  const productName = ((formData.get('productName') as string) || '').trim() || null;
  const category = formData.get('category') as SettlementCategory;
  const purchaseDate = formData.get('purchaseDate') as string;
  const amount = Number(formData.get('amount') ?? 0) || null;

  if (!merchant || !purchaseDate) return;
  if (!SETTLEMENT_CATEGORIES.includes(category)) return;

  await db.insert(schema.purchases).values({
    userId,
    merchant,
    merchantNormalized: normalizeDefendant(merchant),
    productName,
    category,
    purchaseDate: new Date(purchaseDate),
    amount,
    source: 'manual',
  });

  revalidatePath('/purchases');
}

export async function deletePurchase(formData: FormData) {
  const userId = await currentUserId();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  await db
    .delete(schema.purchases)
    .where(and(eq(schema.purchases.id, id), eq(schema.purchases.userId, userId)));
  revalidatePath('/purchases');
}

// -----------------------------------------------------------------------------
// Data breach exposure (manual entry + HIBP refresh)
// -----------------------------------------------------------------------------

export async function addBreach(formData: FormData) {
  const userId = await currentUserId();
  const breachName = (formData.get('breachName') as string).trim();
  const email = (formData.get('email') as string).trim();
  const breachDate = (formData.get('breachDate') as string | null) || null;
  if (!breachName || !email) return;

  await db
    .insert(schema.dataBreachExposure)
    .values({
      userId,
      breachName,
      email,
      breachDate: breachDate ? new Date(breachDate) : null,
      source: 'manual',
      dataClassesJson: [],
    })
    .onConflictDoNothing();

  revalidatePath('/breaches');
}

export async function deleteBreach(formData: FormData) {
  const userId = await currentUserId();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  await db
    .delete(schema.dataBreachExposure)
    .where(
      and(
        eq(schema.dataBreachExposure.id, id),
        eq(schema.dataBreachExposure.userId, userId),
      ),
    );
  revalidatePath('/breaches');
}

export async function runHibpRefresh() {
  const userId = await currentUserId();
  await refreshHibp(userId);
  revalidatePath('/breaches');
}

// -----------------------------------------------------------------------------
// Class authorizations (legally critical)
// -----------------------------------------------------------------------------
// The attestation text is captured VERBATIM from the form field so the
// user's explicit wording is preserved.

export async function saveAuthorization(formData: FormData) {
  const userId = await currentUserId();
  const category = formData.get('category') as SettlementCategory;
  const enabled = formData.get('enabled') === 'on';
  const attestationText = (formData.get('attestationText') as string).trim();

  if (!SETTLEMENT_CATEGORIES.includes(category)) return;
  if (enabled && !attestationText) {
    throw new Error(
      'An enabled authorization must include verbatim attestation text.',
    );
  }

  const existing = await db
    .select()
    .from(schema.classAuthorizations)
    .where(
      and(
        eq(schema.classAuthorizations.userId, userId),
        eq(schema.classAuthorizations.category, category),
      ),
    )
    .limit(1);

  const prior = existing[0];
  const now = new Date();

  if (prior) {
    const wasEnabled = prior.enabled && !prior.revokedAt;
    await db
      .update(schema.classAuthorizations)
      .set({
        enabled,
        attestationText: attestationText || prior.attestationText,
        authorizedAt: enabled ? now : prior.authorizedAt,
        revokedAt: enabled ? null : wasEnabled ? now : prior.revokedAt,
        attestationVersion:
          attestationText && attestationText !== prior.attestationText
            ? prior.attestationVersion + 1
            : prior.attestationVersion,
      })
      .where(eq(schema.classAuthorizations.id, prior.id));

    await writeAudit({
      userId,
      eventType: enabled ? 'AUTHORIZATION_GRANTED' : 'AUTHORIZATION_REVOKED',
      entityType: 'authorization',
      entityId: prior.id,
      payload: { category, attestationVersion: prior.attestationVersion, priorEnabled: wasEnabled },
      actor: 'user',
    });
  } else {
    const inserted = await db
      .insert(schema.classAuthorizations)
      .values({
        userId,
        category,
        enabled,
        attestationText,
        attestationVersion: 1,
        authorizedAt: enabled ? now : null,
        revokedAt: null,
      })
      .returning();

    await writeAudit({
      userId,
      eventType: enabled ? 'AUTHORIZATION_GRANTED' : 'AUTHORIZATION_REVOKED',
      entityType: 'authorization',
      entityId: inserted[0]!.id,
      payload: { category, attestationVersion: 1 },
      actor: 'user',
    });
  }

  revalidatePath('/authorizations');
}

// -----------------------------------------------------------------------------
// Matcher trigger (from Review page)
// -----------------------------------------------------------------------------

export async function triggerMatcher() {
  const userId = await currentUserId();
  await runMatcher(userId);
  revalidatePath('/review');
  redirect('/review');
}

// -----------------------------------------------------------------------------
// Claim filing (Phase 3)
// -----------------------------------------------------------------------------

export async function queueClaimFromMatch(formData: FormData) {
  const matchId = Number(formData.get('matchId'));
  if (!Number.isFinite(matchId)) return;
  const result = await queueClaim(matchId);
  revalidatePath('/review');
  revalidatePath('/claims');
  if ('claimId' in result) {
    redirect(`/claims/${result.claimId}`);
  }
}

export async function runFileClaim(formData: FormData) {
  const claimId = Number(formData.get('claimId'));
  if (!Number.isFinite(claimId)) return;
  await fileClaim(claimId);
  revalidatePath(`/claims/${claimId}`);
  revalidatePath('/claims');
}
