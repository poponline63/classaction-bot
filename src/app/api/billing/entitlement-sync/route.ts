import { NextRequest, NextResponse } from 'next/server';
import {
  billingSyncSecret,
  stripeWebhookSecret,
  syncBillingEntitlement,
  verifyBillingSyncSignature,
  verifyStripeWebhookSignature,
} from '@lib/billing/entitlement-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = billingSyncSecret();
  const stripeSecret = stripeWebhookSecret();
  if (secret.length < 32 && stripeSecret.length < 32) {
    return NextResponse.json({
      error: 'billing sync secret is not configured; set CLAIMBOT_BILLING_SYNC_SECRET or CLAIMBOT_STRIPE_WEBHOOK_SECRET',
    }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get('x-claimbot-billing-signature');
  const stripeSignature = request.headers.get('stripe-signature');
  const signedByClaimBot = verifyBillingSyncSignature(body, signature, secret);
  const signedByStripe = verifyStripeWebhookSignature(body, stripeSignature, stripeSecret);
  if (!signedByClaimBot && !signedByStripe) {
    return NextResponse.json({ error: 'billing signature rejected' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'valid JSON body required' }, { status: 400 });
  }

  const result = await syncBillingEntitlement(payload as Record<string, unknown>);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    userId: result.userId,
    plan: result.plan,
    status: result.status,
    eventId: result.eventId,
    duplicate: result.duplicate,
  });
}
