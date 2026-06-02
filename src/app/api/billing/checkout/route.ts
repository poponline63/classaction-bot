import { NextRequest, NextResponse } from 'next/server';
import {
  billingClientReferenceForUser,
  getBillingCheckoutBlockReason,
  getBillingCheckoutOption,
  getBillingCheckoutRedirectUrl,
  getBillingReadiness,
  isBillingPlanKey,
} from '@lib/billing/checkout';
import { currentUserId } from '@lib/auth/current-user';
import { writeAudit } from '@lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const plan = request.nextUrl.searchParams.get('plan');
  const fallback = new URL('/contact', request.url);
  fallback.searchParams.set('topic', 'billing');

  if (!isBillingPlanKey(plan)) {
    fallback.searchParams.set('reason', 'unknown-plan');
    return NextResponse.redirect(fallback);
  }

  const userId = await currentUserId().catch(() => null);
  if (!userId) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  fallback.searchParams.set('plan', plan);
  const checkout = getBillingCheckoutOption(plan);
  const billing = getBillingReadiness();
  const checkoutBlockReason = getBillingCheckoutBlockReason(plan);
  const checkoutUrl = checkoutBlockReason ? null : getBillingCheckoutRedirectUrl(checkout, userId);
  const clientReferenceId = billingClientReferenceForUser(userId);

  await writeAudit({
    userId,
    eventType: 'BILLING_CHECKOUT_STARTED',
    entityType: 'user',
    entityId: userId,
    actor: 'user',
    payload: {
      plan,
      tier: checkout.tier,
      envKey: checkout.envKey,
      configured: checkout.configured,
      requiredForPaidLaunch: checkout.requiredForPaidLaunch,
      processorHostedRedirect: Boolean(checkoutUrl),
      checkoutBlockReason,
      signedEntitlementSyncReady: billing.syncSecretConfigured,
      paidAutomationWorkerVerified: billing.paidAutomationWorkerVerified,
      clientReferenceId,
      claimbotUserReferencePresent: true,
      note: 'User entered processor-hosted checkout handoff; payment does not bypass authorization, proof, launch, or audit gates.',
    },
  });

  if (!checkoutUrl) {
    fallback.searchParams.set('reason', checkoutBlockReason ?? 'checkout-not-configured');
    return NextResponse.redirect(fallback);
  }

  return NextResponse.redirect(checkoutUrl);
}
