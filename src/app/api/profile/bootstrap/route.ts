import { NextResponse } from 'next/server';
import { and, desc, eq, ne } from 'drizzle-orm';
import { db, schema } from '@db/client';
import { currentUserId } from '@lib/auth/current-user';
import { getAllSettings } from '@lib/settings';
import { isClientFeatureEnabled, isSettlementCategoryEnabled } from '@lib/features';

export const dynamic = 'force-dynamic';

function toDateInput(d: Date | null | undefined) {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const userId = await currentUserId();
  const breachImportEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT');
  const liveFilingEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_LIVE_FILING');
  const settlementSearchEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');
  const [profile] = await db
    .select()
    .from(schema.profile)
    .where(eq(schema.profile.userId, userId))
    .limit(1);
  const purchases = await db
    .select()
    .from(schema.purchases)
    .where(
      breachImportEnabled
        ? eq(schema.purchases.userId, userId)
        : and(eq(schema.purchases.userId, userId), ne(schema.purchases.category, 'DATA_BREACH')),
    )
    .orderBy(desc(schema.purchases.purchaseDate))
    .limit(20);
  const breaches = breachImportEnabled
    ? await db
      .select()
      .from(schema.dataBreachExposure)
      .where(eq(schema.dataBreachExposure.userId, userId))
      .orderBy(desc(schema.dataBreachExposure.createdAt))
      .limit(20)
    : [];
  const authorizations = await db
    .select()
    .from(schema.classAuthorizations)
    .where(eq(schema.classAuthorizations.userId, userId));
  const settings = await getAllSettings();
  const address = profile?.addressesJson?.[0];

  return NextResponse.json({
    profile: {
      legalName: profile?.legalName ?? '',
      dateOfBirth: toDateInput(profile?.dateOfBirth),
      emails: profile?.emailsJson?.join(', ') ?? '',
      phones: profile?.phonesJson?.join(', ') ?? '',
      street: address?.street ?? '',
      city: address?.city ?? '',
      state: address?.state ?? '',
      zip: address?.zip ?? '',
    },
    purchases: purchases.map((purchase) => ({
      id: purchase.id,
      label: `${purchase.merchant}${purchase.productName ? ` - ${purchase.productName}` : ''}`,
      date: toDateInput(purchase.purchaseDate),
      category: purchase.category,
      receiptPath: purchase.receiptPath,
    })),
    breaches: breaches.map((breach) => ({
      id: breach.id,
      label: `${breach.breachName} (${breach.email})`,
      date: toDateInput(breach.breachDate),
    })),
    authorizations: Object.fromEntries(
      authorizations
        .filter((auth) => isSettlementCategoryEnabled(auth.category))
        .map((auth) => [auth.category, auth.enabled && !auth.revokedAt]),
    ),
    settings: {
      discordWebhookConfigured: Boolean(settings.discord_webhook_url),
      hibpApiKeyConfigured: breachImportEnabled ? Boolean(settings.hibp_api_key) : false,
      claimFilerMode: settings.claim_filer_mode ?? 'shadow',
      claimFilerLiveAck: settings.claim_filer_live_ack === 'reviewed',
      claimFilerMaxPerDay: settings.claim_filer_max_per_day ?? '20',
    },
    features: {
      breachImportEnabled,
      liveFilingEnabled,
      settlementSearchEnabled,
    },
  });
}
