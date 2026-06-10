export type QueueReadinessInput = {
  verdict?: string | null;
  proofRequired?: boolean | null;
  claimFormUrl?: string | null;
  hasActiveAuthorization?: boolean;
  hasAutomationEntitlement?: boolean;
  existingClaimId?: number | null;
};

export type QueueReadiness = {
  canQueue: boolean;
  status: 'ready' | 'queued' | 'review' | 'blocked';
  tone: 'green' | 'blue' | 'yellow' | 'red';
  label: string;
  detail: string;
};

export function evaluateQueueReadiness(input: QueueReadinessInput): QueueReadiness {
  if (input.existingClaimId) {
    return {
      canQueue: false,
      status: 'queued',
      tone: 'blue',
      label: 'Already tracked',
      detail: 'A claim already exists for this match. Review the claim record instead of creating another.',
    };
  }

  if (input.verdict !== 'ELIGIBLE') {
    return {
      canQueue: false,
      status: 'review',
      tone: 'yellow',
      label: 'Review first',
      detail: 'Only reviewed matches that pass claim checks can move into tracking.',
    };
  }

  if (input.proofRequired) {
    return {
      canQueue: false,
      status: 'review',
      tone: 'yellow',
      label: 'Proof required',
      detail: 'This settlement needs receipts, documents, or manual evidence before claim preparation.',
    };
  }

  if (!input.claimFormUrl) {
    return {
      canQueue: false,
      status: 'blocked',
      tone: 'red',
      label: 'No claim form',
      detail: 'No claim form URL is stored yet, so the filer cannot prepare this claim.',
    };
  }

  if (!input.hasActiveAuthorization) {
    return {
      canQueue: false,
      status: 'blocked',
      tone: 'yellow',
      label: 'Permission needed',
      detail: 'Enable the matching category permission before this claim can enter final checks.',
    };
  }

  if (input.hasAutomationEntitlement === false) {
    return {
      canQueue: false,
      status: 'blocked',
      tone: 'yellow',
      label: 'Automation plan needed',
      detail: 'The monthly filing allowance is used for this account; paid plans remove the cap.',
    };
  }

  return {
    canQueue: true,
    status: 'ready',
    tone: 'green',
    label: 'Ready for final checks',
    detail: 'Passing matcher verdict, permission, no proof requirement, and linked to a claim form.',
  };
}
