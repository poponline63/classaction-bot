import { currentUserId } from '@lib/auth/current-user';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import {
  clientSafeExecutionBoundary,
  clientSafeLaunchAction,
  clientSafeLaunchLabel,
  clientSafeRequiredInputLabel,
} from '@lib/client-safe-launch-copy';
import LoginPanel, { type ClientPreviewLoginGate } from './LoginPanel';
import MktBackground from '../_marketing/MktBackground';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const clientPreviewGate = await currentUserId()
    .then((userId) => buildClientPreviewChecklist(userId))
    .then((checklist): ClientPreviewLoginGate => ({
      clientPreviewReady: checklist.summary.clientPreviewReady,
      readyCount: checklist.summary.readyCount,
      totalCount: checklist.summary.totalCount,
      blockedCount: checklist.summary.blockedCount,
      launchPacketReadyCount: checklist.summary.launchPacketReadyCount,
      launchPacketTotalCount: checklist.summary.launchPacketTotalCount,
      nextStep: checklist.summary.nextStep
        ? {
            label: clientSafeLaunchLabel(checklist.summary.nextStep),
            owner: checklist.summary.nextStep.owner,
            nextAction: clientSafeLaunchAction(checklist.summary.nextStep),
            setupBoundary: clientSafeExecutionBoundary(checklist.summary.nextStep),
            requiredInputs: checklist.summary.nextStep.requiredInputs.slice(0, 4).map(clientSafeRequiredInputLabel),
            proofArtifactCount: checklist.summary.nextStep.proofArtifacts.length,
          }
        : null,
    }))
    .catch((): ClientPreviewLoginGate => ({
      clientPreviewReady: false,
      readyCount: 0,
      totalCount: 0,
      blockedCount: 1,
      launchPacketReadyCount: 0,
      launchPacketTotalCount: 0,
      nextStep: {
        label: 'Hosted auth session',
        owner: 'deployment',
        nextAction: 'Sign in through the deployed hosted app, then reopen the account access check.',
        setupBoundary: 'Account access needs a valid hosted app session when authentication is enforced.',
        requiredInputs: ['Signed hosted app session', 'Hosted account access enabled on the deployed ClaimBot site'],
        proofArtifactCount: 2,
      },
    }));

  return (
    <div className="mkt mkt-auth-page">
      <MktBackground />
      <LoginPanel clientPreviewGate={clientPreviewGate} />
    </div>
  );
}
