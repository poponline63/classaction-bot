import { describe, expect, it } from 'vitest';
import {
  getClientFeatureFlags,
  getPublicClientFeatureFlags,
  isClientFeatureEnabled,
  isSettlementCategoryEnabled,
} from '../../src/lib/features';

describe('client feature flags', () => {
  it('defaults client-safe surfaces on and live filing controls off', () => {
    const flags = getClientFeatureFlags({});
    const byKey = new Map(flags.map((flag) => [flag.key, flag.enabled]));

    expect(byKey.get('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH')).toBe(true);
    expect(byKey.get('CLAIMBOT_FEATURE_BREACH_IMPORT')).toBe(true);
    expect(byKey.get('CLAIMBOT_FEATURE_LIVE_FILING')).toBe(false);
  });

  it('keeps env variable keys out of client-shell feature props', () => {
    const flags = getPublicClientFeatureFlags({});

    expect(flags.map((flag) => flag.key)).toEqual([
      'settlement-search',
      'breach-import',
      'live-filing',
    ]);
    expect(JSON.stringify(flags)).not.toContain('CLAIMBOT_');
  });

  it('uses explicit env values when provided', () => {
    const env = {
      CLAIMBOT_FEATURE_SETTLEMENT_SEARCH: 'false',
      CLAIMBOT_FEATURE_BREACH_IMPORT: 'false',
      CLAIMBOT_FEATURE_LIVE_FILING: 'true',
    };

    expect(isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH', env)).toBe(false);
    expect(isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT', env)).toBe(false);
    expect(isClientFeatureEnabled('CLAIMBOT_FEATURE_LIVE_FILING', env)).toBe(true);
  });

  it('disables data-breach category when breach import is disabled', () => {
    const env = { CLAIMBOT_FEATURE_BREACH_IMPORT: 'false' };

    expect(isSettlementCategoryEnabled('DATA_BREACH', env)).toBe(false);
    expect(isSettlementCategoryEnabled('CONSUMER_PRODUCT_PURCHASE', env)).toBe(true);
  });
});
