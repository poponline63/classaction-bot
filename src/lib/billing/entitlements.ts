import { db, schema, SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES } from '@db/client';
import type { SubscriptionPlan, SubscriptionStatus } from '@db/client';
import { eq } from 'drizzle-orm';

const AUTOMATION_PLANS = new Set<SubscriptionPlan>(['pro', 'founding']);
const ACTIVE_STATUSES = new Set<SubscriptionStatus>(['active', 'trialing']);

export type SubscriptionSource = 'database' | 'local-dev-override';

export type UserSubscription = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  automationEnabled: boolean;
  source: SubscriptionSource;
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

  return {
    plan,
    status,
    automationEnabled: hasAutomationEntitlement(plan, status),
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

  return {
    plan,
    status,
    automationEnabled: hasAutomationEntitlement(plan, status),
    source: 'database',
  };
}
