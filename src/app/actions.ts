// Server actions - invoked from form submissions on CRUD pages.
// Every mutation filters by userId and writes an audit entry where
// relevant. Running the matcher on profile edits is debounced via a
// simple inline call; hosted worker queueing can take this over later.

'use server';

import { db, schema } from '@db/client';
import { SETTLEMENT_CATEGORIES, type SettlementCategory } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUserId } from '@lib/auth/current-user';
import { normalizeDefendant } from '@lib/scraper/normalize';
import { runMatcher } from '@lib/matcher/run-matcher';
import { refreshHibp } from '@lib/hibp/refresh';
import { ensureFileClaimJobForClaim, queueClaim } from '@lib/claim-filer/filer';
import { getClientPreviewAutomationLock } from '@lib/claim-filer/client-preview-lock';
import {
  FILE_BOUNDARY_ACK,
  QUEUE_BOUNDARY_ACK,
  QUEUE_TRUST_LOCK_ACK,
  hasBoundaryAck,
  isClaimRunnableStatus,
} from '@lib/claim-filer/request-boundary';
import { isClientFeatureEnabled, isSettlementCategoryEnabled } from '@lib/features';

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
  const receiptPath = ((formData.get('receiptPath') as string | null) || '').trim() || null;

  if (!merchant || !purchaseDate) return;
  if (!SETTLEMENT_CATEGORIES.includes(category)) return;
  if (!isSettlementCategoryEnabled(category)) return;

  await db.insert(schema.purchases).values({
    userId,
    merchant,
    merchantNormalized: normalizeDefendant(merchant),
    productName,
    category,
    purchaseDate: new Date(purchaseDate),
    amount,
    receiptPath,
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
  if (!isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT')) return;

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
  if (!isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT')) return;

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
  if (!isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT')) return;

  const userId = await currentUserId();
  await refreshHibp(userId);
  revalidatePath('/breaches');
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
// Claim filing
// -----------------------------------------------------------------------------

export async function queueClaimFromMatch(formData: FormData) {
  const userId = await currentUserId();
  const matchId = Number(formData.get('matchId'));
  if (!Number.isFinite(matchId)) return;
  if (!hasBoundaryAck(formData.get('queueBoundaryAck'), QUEUE_BOUNDARY_ACK)) return;
  if (formData.get('queueTrustLock') !== QUEUE_TRUST_LOCK_ACK) return;
  const result = await queueClaim(matchId, userId);
  revalidatePath('/review');
  revalidatePath('/claims');
  if ('claimId' in result) {
    redirect(`/claims/${result.claimId}`);
  }
}

export async function runFileClaim(formData: FormData) {
  const userId = await currentUserId();
  const claimId = Number(formData.get('claimId'));
  if (!Number.isFinite(claimId)) return;
  if (!hasBoundaryAck(formData.get('fileBoundaryAck'), FILE_BOUNDARY_ACK)) return;
  const claimRows = await db
    .select({ id: schema.claims.id, status: schema.claims.status })
    .from(schema.claims)
    .where(and(eq(schema.claims.id, claimId), eq(schema.claims.userId, userId)))
    .limit(1);
  if (!claimRows[0]) return;
  if (!isClaimRunnableStatus(claimRows[0].status)) return;
  const clientPreviewLock = await getClientPreviewAutomationLock(userId);
  if (clientPreviewLock.locked) {
    redirect('/launch');
  }
  await ensureFileClaimJobForClaim({
    userId,
    claimId,
    source: 'single-claim-run',
  });
  revalidatePath(`/claims/${claimId}`);
  revalidatePath('/claims');
}
