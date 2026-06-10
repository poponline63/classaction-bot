import { db, schema, SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES } from '@db/client';
import type { SubscriptionPlan, SubscriptionStatus } from '@db/client';
import { and, count, eq, gte, ne } from 'drizzle-orm';

const AUTOMATION_PLANS = new Set<SubscriptionPlan>(['plus', 'pro', 'founding']);
const ACTIVE_STATUSES = new Set<SubscriptionStatus>(['active', 'trialing']);

// Free accounts get a small monthly allowance of guarded filings; any active
// paid plan removes the cap. Proof, permission, claim-form, and shadow-mode
// gates still apply to every claim regardless of plan.
export const FREE_MONTHLY_CLAIM_LIMIT = 5;

export type SubscriptionSource = 'database' | 'local-dev-override';

export type UserSubscription = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  automationEnabled: boolean;
  monthlyClaimLimit: number | null;
  source: SubscriptionSource;
};

export type ClaimAllowance = {
  unlimited: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  allowed: boolean;
};

export function normalizeSubscriptionPlan(value: unknown): SubscriptionPlan {
  return SUBSCRIPTION_PLANS.includes(value as SubscriptionPlan)
    ? (value as SubscriptionPlan)
    : 'free';
}

export function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
  return SUBSCRIPTION_STATUSES.includes(value as SubscriptionStatus)
    ? (value as SubscriptionStatus)
    : 'inactive';
}

export function hasAutomationEntitlement(
  plan: SubscriptionPlan,
  status: SubscriptionStatus,
): boolean {
  return AUTOMATION_PLANS.has(plan) && ACTIVE_STATUSES.has(status);
}

function monthlyClaimLimitFor(automationEnabled: boolean): number | null {
  return automationEnabled ? null : FREE_MONTHLY_CLAIM_LIMIT;
}

function localDevOverride(): UserSubscription | null {
  if (process.env.NETLIFY === 'true' || process.env.CLAIMBOT_REQUIRE_AUTH === 'true') {
    return null;
  }

  const rawPlan = process.env.CLAIMBOT_DEV_SUBSCRIPTION_PLAN;
  if (!rawPlan) return null;

  const plan = normalizeSubscriptionPlan(rawPlan);
  const status = normalizeSubscriptionStatus(
    process.env.CLAIMBOT_DEV_SUBSCRIPTION_STATUS ?? (plan === 'free' ? 'inactive' : 'active'),
  );
  const automationEnabled = hasAutomationEntitlement(plan, status);

  return {
    plan,
    status,
    automationEnabled,
    monthlyClaimLimit: monthlyClaimLimitFor(automationEnabled),
    source: 'local-dev-override',
  };
}

export async function getUserSubscription(userId: number): Promise<UserSubscription> {
  const override = localDevOverride();
  if (override) return override;

  const rows = await db
    .select({
      plan: schema.users.subscriptionPlan,
      status: schema.users.subscriptionStatus,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  const plan = normalizeSubscriptionPlan(rows[0]?.plan);
  const status = normalizeSubscriptionStatus(rows[0]?.status);
  const automationEnabled = hasAutomationEntitlement(plan, status);

  return {
    plan,
    status,
    automationEnabled,
    monthlyClaimLimit: monthlyClaimLimitFor(automationEnabled),
    source: 'database',
  };
}

function startOfCurrentUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// How many guarded filings the user may still start this calendar month.
// Paid plans are uncapped. Pass excludeClaimId when re-checking an
// already-queued claim (preflight, worker arming) so the claim being
// processed does not count against its own allowance.
export async function getMonthlyClaimAllowance(
  userId: number,
  options: { subscription?: UserSubscription; excludeClaimId?: number } = {},
): Promise<ClaimAllowance> {
  const subscription = options.subscription ?? await getUserSubscription(userId);
  if (subscription.automationEnabled) {
    return { unlimited: true, limit: null, used: 0, remaining: null, allowed: true };
  }

  const limit = subscription.monthlyClaimLimit ?? FREE_MONTHLY_CLAIM_LIMIT;
  const conditions = [
    eq(schema.claims.userId, userId),
    gte(schema.claims.queuedAt, startOfCurrentUtcMonth()),
  ];
  if (options.excludeClaimId != null) {
    conditions.push(ne(schema.claims.id, options.excludeClaimId));
  }

  const rows = await db
    .select({ n: count() })
    .from(schema.claims)
    .where(and(...conditions));
  const used = rows[0]?.n ?? 0;
  const remaining = Math.max(0, limit - used);

  return {
    unlimited: false,
    limit,
    used,
    remaining,
    allowed: remaining > 0,
  };
}
