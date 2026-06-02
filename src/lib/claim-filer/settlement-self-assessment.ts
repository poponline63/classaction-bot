export type SelfAssessmentStatus = 'pass' | 'warn' | 'fail';

export type SelfAssessmentItem = {
  key: string;
  title: string;
  prompt: string;
  status: SelfAssessmentStatus;
  detail: string;
};

export type SettlementSelfAssessmentInput = {
  classDefinition: string;
  classPeriodStart?: Date | null;
  classPeriodEnd?: Date | null;
  deadline?: Date | null;
  proofRequired?: boolean | null;
  claimFormUrl?: string | null;
  matchVerdict?: string | null;
  matchConfidence?: number | null;
  authorizationActive?: boolean;
  automationEntitlementActive?: boolean;
};

function shortDate(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : null;
}

function shortText(value: string, max = 180) {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}...` : compact;
}

export function buildSettlementSelfAssessment(input: SettlementSelfAssessmentInput): SelfAssessmentItem[] {
  const today = new Date();
  const deadlinePassed = Boolean(input.deadline && input.deadline.getTime() < today.getTime());
  const hasClassPeriod = Boolean(input.classPeriodStart || input.classPeriodEnd);
  const matchEligible = input.matchVerdict === 'ELIGIBLE';
  const matchNeedsReview = input.matchVerdict === 'NEEDS_REVIEW' || !input.matchVerdict;

  return [
    {
      key: 'class-definition',
      title: 'Read the official class definition',
      prompt: 'Does the user personally fit the source settlement class language?',
      status: 'warn',
      detail: shortText(input.classDefinition),
    },
    {
      key: 'saved-facts',
      title: 'Compare saved facts to the class period',
      prompt: 'Do profile, purchase, subscription, address, or breach facts line up with the stated period?',
      status: matchEligible ? 'pass' : matchNeedsReview ? 'warn' : 'fail',
      detail: hasClassPeriod
        ? `Stored period: ${shortDate(input.classPeriodStart) ?? 'not listed'} to ${shortDate(input.classPeriodEnd) ?? 'not listed'}. Matcher verdict: ${input.matchVerdict ?? 'none'}${typeof input.matchConfidence === 'number' ? ` (${input.matchConfidence.toFixed(2)})` : ''}.`
        : `No exact class period is stored. Use the source language and matcher evidence before queueing. Matcher verdict: ${input.matchVerdict ?? 'none'}.`,
    },
    {
      key: 'proof',
      title: 'Check proof and document requirements',
      prompt: 'Will the administrator require receipts, screenshots, IDs, or other manual evidence?',
      status: input.proofRequired ? 'warn' : 'pass',
      detail: input.proofRequired
        ? 'Proof is required, so the claim should stay in manual review until documents are handled.'
        : 'No proof requirement is stored, but the external form still remains authoritative.',
    },
    {
      key: 'deadline-form',
      title: 'Confirm deadline and form availability',
      prompt: 'Is the claim still open, and is there an official claim form to inspect?',
      status: deadlinePassed || !input.claimFormUrl ? 'fail' : 'pass',
      detail: deadlinePassed
        ? `The stored deadline passed on ${shortDate(input.deadline)}.`
        : input.claimFormUrl
          ? `Claim form is linked${input.deadline ? ` and deadline is ${shortDate(input.deadline)}` : '; no deadline is stored'}.`
          : 'No claim form URL is stored yet.',
    },
    {
      key: 'automation-plan',
      title: 'Confirm paid automation access',
      prompt: 'Does the user have active Pro or Founding access before this enters full guarded automation?',
      status: input.automationEntitlementActive ? 'pass' : 'warn',
      detail: input.automationEntitlementActive
        ? 'Active Pro or Founding access is present; proof, authorization, form, launch, and preflight gates still apply.'
        : 'Free and Plus can review settlement context, but full guarded automation requires active Pro or Founding access.',
    },
    {
      key: 'authorization',
      title: 'Confirm category authorization',
      prompt: 'Has the user enabled this category only when the attestation is true for them?',
      status: input.authorizationActive ? 'pass' : 'warn',
      detail: input.authorizationActive
        ? 'A category authorization is active and will be checked again during preflight.'
        : 'Category authorization is missing or inactive, so this claim cannot become review-ready for shadow-mode preflight.',
    },
  ];
}
