export type ClaimSafetyConsoleTone = 'pass' | 'warn' | 'fail';

export type ClaimSafetyConsoleInput = {
  filingMode: 'shadow' | 'live';
  automationEntitlementActive: boolean;
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
  authorizationActive: boolean;
  authorizedAt?: Date | null;
  proofRequired: boolean;
  claimFormUrl?: string | null;
  matcherVerdict: string;
  matcherConfidence: number;
  capturedArtifacts: number;
  totalArtifacts: number;
  auditEventCount: number;
};

export type ClaimSafetyConsoleItem = {
  key: string;
  label: string;
  value: string;
  tone: ClaimSafetyConsoleTone;
  detail: string;
};

export function formatSafetyConsoleDate(date: Date | null | undefined) {
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not recorded';
}

export function buildClaimSafetyConsole(input: ClaimSafetyConsoleInput): ClaimSafetyConsoleItem[] {
  const gateReady =
    input.automationEntitlementActive
    && input.authorizationActive
    && !input.proofRequired
    && Boolean(input.claimFormUrl)
    && input.matcherVerdict === 'ELIGIBLE';
  const artifactRatio = `${input.capturedArtifacts}/${input.totalArtifacts}`;
  const planLabel = input.subscriptionPlan
    ? input.subscriptionPlan.charAt(0).toUpperCase() + input.subscriptionPlan.slice(1)
    : 'Unknown';
  const statusLabel = input.subscriptionStatus ?? 'unknown';

  return [
    {
      key: 'run-mode',
      label: 'Run mode',
      value: input.filingMode === 'live' ? 'Live' : 'Shadow',
      tone: input.filingMode === 'live' ? 'warn' : 'pass',
      detail: input.filingMode === 'live'
        ? 'Live filing may submit after all gates pass.'
        : 'Shadow mode prepares forms and captures evidence without submission.',
    },
    {
      key: 'plan-gate',
      label: 'Plan gate',
      value: input.automationEntitlementActive ? 'Unlocked' : 'Locked',
      tone: input.automationEntitlementActive ? 'pass' : 'warn',
      detail: input.automationEntitlementActive
        ? `${planLabel}/${statusLabel} can run full guarded automation after all claim checks pass.`
        : `${planLabel}/${statusLabel} can review claim context, but final checks require active Pro or Founding access.`,
    },
    {
      key: 'operator-lock',
      label: 'Permission lock',
      value: input.authorizationActive ? 'Allowed' : 'Blocked',
      tone: input.authorizationActive ? 'pass' : 'fail',
      detail: input.authorizationActive
        ? `Category permission is active. Allowed ${formatSafetyConsoleDate(input.authorizedAt)}.`
        : 'This category is not active; final checks must stop before form work.',
    },
    {
      key: 'gate-status',
      label: 'Gate status',
      value: gateReady ? 'Ready' : 'Review',
      tone: gateReady ? 'pass' : 'warn',
      detail: gateReady
        ? `Eligibility, plan, permission, proof, and form gates are aligned at ${input.matcherConfidence.toFixed(2)} confidence.`
        : 'At least one eligibility, plan, proof, permission, or form gate still needs review.',
    },
    {
      key: 'evidence-seal',
      label: 'Evidence seal',
      value: artifactRatio,
      tone: input.capturedArtifacts > 0 ? 'pass' : 'warn',
      detail: input.capturedArtifacts > 0
        ? `${artifactRatio} artifacts captured. Audit export includes events and a SHA-256 digest.`
        : `No artifacts captured yet. ${input.auditEventCount} audit event${input.auditEventCount === 1 ? '' : 's'} available for review.`,
    },
  ];
}
