import { isClientFeatureEnabled } from '@lib/features';
import { shouldBlockSetupForMissingAuthSecret } from '@lib/auth/hosted-gates';
import { currentUserId } from '@lib/auth/current-user';
import { getUserSubscription } from '@lib/billing/entitlements';
import ProofGateBanner from '../ProofGateBanner';
import AuthGateBlock from './AuthGateBlock';
import SetupWizard from './SetupWizard';

export default async function SetupPage() {
  if (shouldBlockSetupForMissingAuthSecret()) {
    return <AuthGateBlock />;
  }
  const userId = await currentUserId();
  const subscription = await getUserSubscription(userId);

  return (
    <>
      <ProofGateBanner surface="setup" />
      <SetupWizard
        breachImportEnabled={isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT')}
        settlementSearchEnabled={isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH')}
        subscription={{
          automationEnabled: subscription.automationEnabled,
          plan: subscription.plan,
          status: subscription.status,
        }}
      />
    </>
  );
}
