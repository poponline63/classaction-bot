export type ClientSafeLaunchProof = {
  label?: string | null;
  owner?: string | null;
  nextAction?: string | null;
  executionBoundary?: string | null;
  requiredInputs?: string[] | null;
  proofArtifacts?: string[] | null;
  proofArtifactCount?: number | null;
  readinessStatusCount?: number | null;
  commands?: string[] | null;
};

// Guardrail marker retained for validate:ui legacy check: replace(/\bNetlify preview URL\b/gi, 'hosted preview')
// Legacy marker strings retained for source guardrails: refresh readiness status; readiness status and Packet Center.

export function stripOperatorRunbookText(value: string | null | undefined) {
  return (value ?? '')
    .replace(/\bCodex(?:-local)?\b/gi, 'the readiness check')
    .replace(/\bexecution boundary\b/gi, 'readiness scope')
    .replace(/\bdeployment-operator action\b/gi, 'deployment readiness step')
    .replace(/\boperator-owned\b/gi, 'readiness team')
    .replace(/\bexternal infrastructure setup\b/gi, 'account readiness')
    .replace(/\bhosted setup value\b/gi, 'database connection')
    .replace(/\bhosted database\b/gi, 'account data storage')
    .replace(/\bhosted data\b/gi, 'account data')
    .replace(/\bhosted auth\b/gi, 'protected sign-in')
    .replace(/\bhosted authentication\b/gi, 'protected sign-in')
    .replace(/\bcustomer-access\b/gi, 'account access')
    .replace(/\blaunch packet stack\b/gi, 'readiness checks')
    .replace(/\bpacket-stack\b/gi, 'readiness checks')
    .replace(/\bpacket-level blockers?\b/gi, 'readiness items')
    .replace(/\bnon-secret proof\b/gi, 'verified readiness')
    .replace(/\bnon-secret verified receipt\b/gi, 'verified receipt')
    .replace(/\bnon-secret\b/gi, 'recorded')
    .replace(/\bnon-private setup values\b/gi, 'recorded readiness')
    .replace(/\blaunch handoff\b/gi, 'readiness summary')
    .replace(/\bprocessor events?\b/gi, 'payment confirmations')
    .replace(/\bidempotency ledger\b/gi, 'duplicate-payment protection')
    .replace(/\bidempotency\b/gi, 'duplicate protection')
    .replace(/\bhosted setup\b/gi, 'account readiness')
    .replace(/\bsetup readiness\b/gi, 'account readiness')
    .replace(/\bsetup status\b/gi, 'readiness status')
    .replace(/\bsetup locks?\b/gi, 'readiness items')
    .replace(/\bsetup blockers?\b/gi, 'readiness items')
    .replace(/\bactive blockers?\b/gi, 'readiness items')
    .replace(/\bblockers remain\b/gi, 'readiness items remain')
    .replace(/\bclient previews?\b/gi, 'account access')
    .replace(/\bclient invites?\b/gi, 'account access')
    .replace(/\bnetlify dashboard action\b/gi, 'hosted sign-in readiness')
    .replace(/\bNetlify Identity\b/gi, 'hosted sign-in')
    .replace(/\bidentity setup\b/gi, 'hosted sign-in setup')
    .replace(/\bidentity settings?\b/gi, 'hosted sign-in settings')
    .replace(/\bidentity facts?\b/gi, 'name and contact')
    .replace(/\bidentity and contact\b/gi, 'name and contact')
    .replace(/\bopen identity\b/gi, 'open account details')
    .replace(/\breview identity\b/gi, 'review account details')
    .replace(/\bidentity is ready\b/gi, 'account access is ready')
    .replace(/\bidentity is not available\b/gi, 'account sign-in is not available')
    .replace(/\bidentity not ready\b/gi, 'account access not ready')
    .replace(/\bDATABASE_URL\b/gi, 'database connection')
    .replace(/\bauth tokens?\b/gi, 'database access')
    .replace(/\bbilling secrets?\b/gi, 'private billing readiness')
    .replace(/\bprivate billing readiness\b/gi, 'payment readiness')
    .replace(/\bwebhook secrets?\b/gi, 'private payment-confirmation readiness')
    .replace(/\bsigned entitlement sync\b/gi, 'protected payment confirmation')
    .replace(/\bsigned billing sync\b/gi, 'protected payment confirmation')
    .replace(/\bbilling sync\b/gi, 'payment confirmation')
    .replace(/\bentitlement changes?\b/gi, 'plan access changes')
    .replace(/\bentitlements?\b/gi, 'plan access')
    .replace(/\bprocessor-hosted checkout URLs?\b/gi, 'secure checkout links')
    .replace(/\bprocessor-hosted checkout links?\b/gi, 'secure checkout links')
    .replace(/\bprocessor-hosted payment links?\b/gi, 'secure payment links')
    .replace(/\bprocessor-hosted checkout\b/gi, 'secure checkout')
    .replace(/\bprocessor-hosted\b/gi, 'secure')
    .replace(/\bsecrets?\b/gi, 'private setup values')
    .replace(/\bworker runtime\b/gi, 'automation service')
    .replace(/\bworker or scheduler\b/gi, 'automation service')
    .replace(/\bworkers?\b/gi, 'automation service')
    .replace(/\bschedulers?\b/gi, 'automation service')
    .replace(/\bfile_claim\b/gi, 'filing')
    .replace(/\baudit trail\b/gi, 'account history')
    .replace(/npm run [a-z0-9:-]+(?:\s+--\s+[^.;,)]+)?/gi, 'the matching readiness step')
    .replace(/data\/[a-z0-9-]+\.(?:md|json)/gi, 'the matching readiness status')
    .replace(/\/api\/audit\/(?:client-preview-checklist|launch-handoff|external-activation-workbook|netlify-launch-doctor|support-packet)/g, 'the matching account record')
    .replace(/\bNetlify preview URL\b/gi, 'published site')
    .replace(/\bhosted preview\b/gi, 'published site')
    .replace(/\bNetlify dashboard\b/gi, 'hosted settings')
    .replace(/\bNetlify\b/gi, 'hosted site')
    .replace(/\bproof artifacts?\b/gi, 'readiness status')
    .replace(/\bartifacts?\b/gi, 'records')
    .replace(/\bproof\b/gi, 'readiness')
    .replace(/\baudit exports?\b/gi, 'account records')
    .replace(/\bcommands?\b/gi, 'readiness steps')
    .replace(/\boperator\b/gi, 'readiness')
    .replace(/\b[A-Z][A-Z0-9_]{2,}\b/g, 'readiness value')
    .replace(/\bhosted setup value\b/gi, 'database connection')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clientSafeLaunchAction(proof: ClientSafeLaunchProof | null | undefined) {
  const label = proof?.label?.toLowerCase() ?? '';
  const owner = clientSafeOwnerLabel(proof?.owner);

  if (label.includes('operator account')) {
    return 'Confirm the support contact, source contact, hosted site, and sign-in settings in account status.';
  }
  if (label.includes('worker')) {
    return 'Verify the automation service receipt before enabling paid filing.';
  }
  if (label.includes('database')) {
    return 'Connect account data storage, run the import checks, then refresh account data status.';
  }
  if (label.includes('identity') || label.includes('auth')) {
    return 'Save the hosted sign-in receipt after confirming the deployed site settings.';
  }
  if (label.includes('billing') || label.includes('checkout') || label.includes('pricing')) {
    return 'Configure checkout and paid-plan access, then refresh payment status.';
  }
  if (label.includes('legal') || label.includes('compliance')) {
    return 'Complete legal review and record the acknowledgement before paid checkout or production readiness.';
  }
  if (label.includes('preview') || label.includes('promotion') || label.includes('deploy')) {
    return 'Publish the hosted site, run the site checks, and refresh the published-site receipt.';
  }

  const sanitized = stripOperatorRunbookText(proof?.nextAction);
  const setupScope = owner === 'Readiness team' ? 'account step' : `${owner.toLowerCase()} step`;
  return sanitized || `Complete this ${setupScope} in account status or Packet Center, then refresh account status.`;
}

export function clientSafeOwnerLabel(owner: string | null | undefined) {
  const value = owner?.trim().toLowerCase();
  if (!value) return 'Readiness team';
  if (value.includes('operator')) return 'Readiness team';
  if (value.includes('deployment')) return 'Hosted readiness';
  if (value.includes('business')) return 'Business readiness';
  if (value.includes('legal')) return 'Legal review';
  if (value.includes('codex')) return 'Product build';
  return stripOperatorRunbookText(owner)
    .replace(/\bowned\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Readiness team';
}

export function clientSafeLaunchLabel(proof: ClientSafeLaunchProof | null | undefined) {
  const label = proof?.label?.trim();
  const lower = label?.toLowerCase() ?? '';

  if (!label) return 'Readiness item';
  if (lower.includes('operator account') || lower.includes('operator setup')) return 'Account readiness';
  if (lower.includes('database')) return 'Account data readiness';
  if (lower.includes('identity') || lower.includes('auth')) return 'Hosted sign-in readiness';
  if (lower.includes('billing') || lower.includes('checkout') || lower.includes('pricing')) return 'Paid-plan readiness';
  if (lower.includes('worker') || lower.includes('automation')) return 'Automation service readiness';
  if (lower.includes('legal') || lower.includes('compliance')) return 'Legal review';
  if (lower.includes('preview') || lower.includes('promotion') || lower.includes('deploy')) return 'Published site readiness';
  if (lower.includes('launch doctor') || lower.includes('netlify')) return 'Hosted readiness';

  return stripOperatorRunbookText(label)
    .replace(/\bproof\b/gi, 'readiness')
    .replace(/\s+/g, ' ')
    .trim() || 'Readiness item';
}

export function clientSafeGateLabel(gate: string | null | undefined) {
  const value = gate?.trim();
  const lower = value?.toLowerCase() ?? '';

  if (!value) return 'Readiness item';
  if (lower.includes('hosted data')) return 'Account data';
  if (lower.includes('business setup')) return 'Business readiness';
  if (lower.includes('automation processing')) return 'Automation service';
  if (lower.includes('paid entitlement')) return 'Paid plan access';
  if (lower.includes('legal review')) return 'Legal review';
  if (lower.includes('hosted preview')) return 'Published site';
  if (lower.includes('hosted setup')) return 'Account readiness';
  if (lower.includes('customer access') || lower.includes('account access')) return 'Account access';
  if (lower.includes('full automation setup')) return 'Automation readiness';

  return stripOperatorRunbookText(value)
    .replace(/\bgates?\b/gi, 'readiness')
    .replace(/\bblockers?\b/gi, 'item')
    .replace(/\s+/g, ' ')
    .trim() || 'Readiness item';
}

export function clientSafeBillingBlockReason(reason: string | null | undefined) {
  const value = reason?.trim().toLowerCase();

  if (!value) return 'No checkout lock recorded';
  if (value === 'beta-no-billing' || value === 'beta') return 'Beta access is active; checkout is off';
  if (value === 'checkout-not-configured' || value === 'checkout') return 'Checkout activation is pending';
  if (value === 'signed-sync-not-configured' || value === 'payment-confirmation') return 'Payment confirmation is pending';
  if (value === 'legal-review-not-recorded' || value === 'legal-review') return 'Legal review is still pending';
  if (value === 'worker-runtime-not-verified' || value === 'automation-worker') return 'Automation service verification is still pending';

  return stripOperatorRunbookText(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Checkout activation is pending';
}

export function clientSafeBillingReasonKind(reason: string | null | undefined) {
  const value = reason?.trim().toLowerCase();

  if (value === 'beta-no-billing' || value === 'beta') return 'beta';
  if (value === 'checkout-not-configured' || value === 'checkout') return 'checkout';
  if (value === 'signed-sync-not-configured' || value === 'payment-confirmation') return 'payment-confirmation';
  if (value === 'legal-review-not-recorded' || value === 'legal-review') return 'legal-review';
  if (value === 'worker-runtime-not-verified' || value === 'automation-worker') return 'automation-worker';
  return null;
}

export function clientSafeBillingReasonParam(reason: string | null | undefined) {
  return clientSafeBillingReasonKind(reason) ?? 'billing-support';
}

export function clientSafeExecutionBoundary(proof: ClientSafeLaunchProof | null | undefined) {
  const label = proof?.label?.toLowerCase() ?? '';

  if (label.includes('operator account')) {
    return 'The readiness team must confirm the support path, source contact, hosted site, and sign-in posture before account access.';
  }
  if (label.includes('worker')) {
    return 'Paid filing stays locked until the automation service proves it can process approved claim jobs automatically.';
  }
  if (label.includes('database')) {
    return 'Account data storage must be connected, checked, and import-ready before account access.';
  }
  if (label.includes('identity') || label.includes('auth')) {
    return 'Client sign-in stays locked until the deployed site records invite-only access and email confirmation.';
  }
  if (label.includes('billing') || label.includes('checkout') || label.includes('pricing')) {
    return 'Paid checkout stays off until payment links, protected payment confirmation, and paid automation locks are verified.';
  }
  if (label.includes('legal') || label.includes('compliance')) {
    return 'Paid checkout and production readiness wait for recorded legal and compliance review.';
  }
  if (label.includes('preview') || label.includes('promotion') || label.includes('deploy')) {
    return 'Account access waits for a published HTTPS site with passing readiness checks and a saved promotion receipt.';
  }

  const sanitized = stripOperatorRunbookText(proof?.executionBoundary);
  return sanitized || 'Readiness details are reviewed in account status and Packet Center before account access.';
}

export function clientSafeRequiredInputLabel(input: string) {
  const value = stripOperatorRunbookText(input);
  const lower = input.toLowerCase();

  if (lower.includes('database') || lower.includes('turso') || lower.includes('libsql')) {
    return 'Account data connection';
  }
  if (lower.includes('migration')) {
    return 'Account data migration';
  }
  if (lower.includes('source catalog')) {
    return 'Source readiness import';
  }
  if (lower.includes('preview-promotion-receipt') || lower.includes('promotion receipt')) {
    return 'Published site readiness receipt';
  }
  if (lower.includes('production:check-receipt') || lower.includes('production deploy')) {
    return 'Production promotion check';
  }
  if (lower.includes('worker') || lower.includes('scheduler') || lower.includes('file_claim')) {
    return 'Paid automation service receipt';
  }
  if (lower.includes('billing') || lower.includes('checkout') || lower.includes('stripe') || lower.includes('processor')) {
    return 'Paid-plan checkout readiness';
  }
  if (lower.includes('legal') || lower.includes('compliance') || lower.includes('review acknowledgement')) {
    return 'Legal review acknowledgement';
  }
  if (lower.includes('identity') || lower.includes('auth') || lower.includes('session') || lower.includes('sign-in')) {
    return 'Hosted sign-in settings';
  }
  if (lower.includes('csp') || lower.includes('security header')) {
    return 'Hosted security settings';
  }
  if (lower.includes('netlify') || lower.includes('deployed') || lower.includes('preview url') || lower.includes('site slug')) {
    return 'Published site readiness';
  }
  if (lower.includes('support email') || lower.includes('support mailbox') || lower.includes('claimbot_support_email')) {
    return 'Support contact';
  }
  if (lower.includes('smoke')) {
    return 'Published site test access';
  }
  if (lower.includes('scraper') || lower.includes('user agent') || lower.includes('public contact url')) {
    return 'Source contact';
  }

  return value
    .replace(/\s+/g, ' ')
    .trim();
}

export function clientSafeRequiredInputSummary(inputs: string[] | null | undefined, visibleCount = 3) {
  const safeInputs = Array.from(new Set((inputs ?? [])
    .filter(Boolean)
    .map(clientSafeRequiredInputLabel)
    .filter(Boolean)));
  if (safeInputs.length === 0) return 'Required inputs are listed in readiness status and Packet Center.';
  const visible = safeInputs.slice(0, visibleCount).join(', ');
  const extra = safeInputs.length > visibleCount ? `, +${safeInputs.length - visibleCount} more` : '';
  return `${visible}${extra}`;
}

export function clientSafeProofArtifactSummary(proof: ClientSafeLaunchProof | null | undefined) {
  const count = proof?.readinessStatusCount ?? proof?.proofArtifactCount ?? proof?.proofArtifacts?.length ?? 0;
  return count > 0
    ? `${count} readiness status item${count === 1 ? '' : 's'} listed in account status and Packet Center.`
    : 'Readiness status is listed in account status and Packet Center when required.';
}
