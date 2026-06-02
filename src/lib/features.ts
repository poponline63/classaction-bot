export type ClientFeatureFlag = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
};

export type PublicClientFeatureKey =
  | 'settlement-search'
  | 'breach-import'
  | 'live-filing';

export type ClientFeatureKey =
  | 'CLAIMBOT_FEATURE_SETTLEMENT_SEARCH'
  | 'CLAIMBOT_FEATURE_BREACH_IMPORT'
  | 'CLAIMBOT_FEATURE_LIVE_FILING';

type FeatureEnv = Record<string, string | undefined>;

function envEnabled(value: string | undefined, fallback = true) {
  if (value == null || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

export function getClientFeatureFlags(env: FeatureEnv = process.env): ClientFeatureFlag[] {
  return [
    {
      key: 'CLAIMBOT_FEATURE_SETTLEMENT_SEARCH',
      label: 'Settlement search',
      description: 'Let clients browse normalized settlement sources and open claim detail pages.',
      enabled: envEnabled(env.CLAIMBOT_FEATURE_SETTLEMENT_SEARCH),
    },
    {
      key: 'CLAIMBOT_FEATURE_BREACH_IMPORT',
      label: 'Data breach evidence',
      description: 'Show breach intake and matching surfaces for data-breach settlements.',
      enabled: envEnabled(env.CLAIMBOT_FEATURE_BREACH_IMPORT),
    },
    {
      key: 'CLAIMBOT_FEATURE_LIVE_FILING',
      label: 'Live filing controls',
      description: 'Expose live filing controls after the hosted readiness and legal review gates pass.',
      enabled: envEnabled(env.CLAIMBOT_FEATURE_LIVE_FILING, false),
    },
  ];
}

const publicFeatureKeys: Record<ClientFeatureKey, PublicClientFeatureKey> = {
  CLAIMBOT_FEATURE_SETTLEMENT_SEARCH: 'settlement-search',
  CLAIMBOT_FEATURE_BREACH_IMPORT: 'breach-import',
  CLAIMBOT_FEATURE_LIVE_FILING: 'live-filing',
};

export function getPublicClientFeatureFlags(env: FeatureEnv = process.env): ClientFeatureFlag[] {
  return getClientFeatureFlags(env).map((flag) => ({
    ...flag,
    key: publicFeatureKeys[flag.key as ClientFeatureKey],
  }));
}

export function isClientFeatureEnabled(
  key: ClientFeatureKey,
  env: FeatureEnv = process.env,
) {
  return getClientFeatureFlags(env).find((flag) => flag.key === key)?.enabled ?? false;
}

export function isSettlementCategoryEnabled(category: string, env: FeatureEnv = process.env) {
  if (category === 'DATA_BREACH') {
    return isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT', env);
  }
  return true;
}
