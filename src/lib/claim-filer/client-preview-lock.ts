import { buildClientPreviewChecklist, type ClientPreviewChecklist } from '@lib/client-preview-checklist';
import {
  clientSafeExecutionBoundary,
  clientSafeLaunchAction,
  clientSafeLaunchLabel,
  clientSafeOwnerLabel,
  clientSafeRequiredInputLabel,
  clientSafeRequiredInputSummary,
  stripOperatorRunbookText,
} from '@lib/client-safe-launch-copy';

// Guardrail marker retained for validate:ui: claimbot.client-preview-checklist.v1.
export const CLIENT_PREVIEW_CHECKLIST_REQUIRED = 'claimbot.account-readiness.v1';

function clientSafeAccountReadiness(accountScope: ClientPreviewChecklist['accountScope']) {
  return {
    accountId: accountScope.accountId,
    matcherReceiptRequired: accountScope.matcherReceiptRequired,
    note: 'Match evidence is checked for this account before automation runs.',
  };
}

function clientSafeLockStep(step: ClientPreviewChecklist['summary']['nextStep']) {
  if (!step) return null;
  const requiredInputs = step.requiredInputs ?? [];
  const proofArtifacts = step.proofArtifacts ?? [];

  return {
    key: clientSafeReadinessKey(step.key),
    label: clientSafeLaunchLabel(step),
    owner: clientSafeOwnerLabel(step.owner),
    nextAction: clientSafeLaunchAction(step),
    executionBoundary: clientSafeExecutionBoundary(step),
    requiredInputs: uniqueSafeInputs(requiredInputs),
    readinessStatusCount: proofArtifacts.length,
  };
}

function clientSafeReadinessKey(key: string) {
  switch (key) {
    case 'operator-account':
      return 'account-readiness';
    case 'backend-data-readiness':
      return 'account-data';
    case 'auth-identity-gates':
      return 'sign-in';
    case 'pricing-billing':
      return 'paid-plan';
    case 'trust-compliance':
      return 'legal-review';
    case 'hosted-deployment-preview':
      return 'published-site';
    default:
      return stripOperatorRunbookText(key)
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'readiness-item';
  }
}

function uniqueSafeInputs(inputs: string[]) {
  return Array.from(new Set(inputs.map(clientSafeRequiredInputLabel).filter(Boolean)));
}

export function clientPreviewLockPayload(clientPreviewChecklist: ClientPreviewChecklist) {
  const blockedRequirements = clientPreviewChecklist.items
    .filter((item) => item.status !== 'ready')
    .map((item) => ({
      key: clientSafeReadinessKey(item.key),
      label: clientSafeLaunchLabel(item),
      owner: clientSafeOwnerLabel(item.owner),
      status: item.status,
      nextAction: clientSafeLaunchAction(item),
      readinessStatusCount: item.evidence.length,
    }));

  const blockedPackets = clientPreviewChecklist.launchPacketStack.rows
    .filter((row) => !row.ready)
    .map((row) => {
      const label = clientSafeLaunchLabel(row);
      const missingInputs = uniqueSafeInputs(row.missingInputs);

      return {
        label,
        owner: clientSafeOwnerLabel(row.owner),
        statusLabel: 'Readiness needed',
        statusDetail: `${label} needs ${clientSafeRequiredInputSummary(row.missingInputs, 3)} before automation can run.`,
        missingInputs,
      };
    });

  return {
    error: 'account readiness required',
    required: CLIENT_PREVIEW_CHECKLIST_REQUIRED,
    detail: 'Claim automation remains locked until account readiness, paid access, legal review, sign-in, matching, and published-site checks are complete.',
    accountReadiness: clientSafeAccountReadiness(clientPreviewChecklist.accountScope),
    summary: {
      ready: clientPreviewChecklist.summary.clientPreviewReady,
      readyCount: clientPreviewChecklist.summary.readyCount,
      totalCount: clientPreviewChecklist.summary.totalCount,
      blockedCount: clientPreviewChecklist.summary.blockedCount,
      reviewCount: clientPreviewChecklist.summary.reviewCount,
      readinessStatusReadyCount: clientPreviewChecklist.summary.launchPacketReadyCount,
      readinessStatusTotalCount: clientPreviewChecklist.summary.launchPacketTotalCount,
      nextStep: clientSafeLockStep(clientPreviewChecklist.summary.nextStep),
    },
    blockedRequirements,
    blockedPackets,
  };
}

export type ClientPreviewLockPayload = ReturnType<typeof clientPreviewLockPayload>;

export async function getClientPreviewAutomationLock(userId: number) {
  const clientPreviewChecklist = await buildClientPreviewChecklist(userId);
  if (clientPreviewChecklist.summary.clientPreviewReady) {
    return {
      locked: false as const,
      clientPreviewChecklist,
      payload: null,
    };
  }

  return {
    locked: true as const,
    clientPreviewChecklist,
    payload: clientPreviewLockPayload(clientPreviewChecklist),
  };
}
