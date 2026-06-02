import { describe, expect, it } from 'vitest';
import {
  hasAutomationEntitlement,
  normalizeSubscriptionPlan,
  normalizeSubscriptionStatus,
} from '../../src/lib/billing/entitlements';

describe('billing entitlements', () => {
  it('normalizes unknown plan and status values to the free inactive default', () => {
    expect(normalizeSubscriptionPlan('enterprise')).toBe('free');
    expect(normalizeSubscriptionStatus('paused')).toBe('inactive');
  });

  it('unlocks automation only for active paid automation plans', () => {
    expect(hasAutomationEntitlement('pro', 'active')).toBe(true);
    expect(hasAutomationEntitlement('founding', 'trialing')).toBe(true);
    expect(hasAutomationEntitlement('plus', 'active')).toBe(false);
    expect(hasAutomationEntitlement('pro', 'past_due')).toBe(false);
    expect(hasAutomationEntitlement('free', 'active')).toBe(false);
  });
});
