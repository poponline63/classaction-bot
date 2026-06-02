export type AuthorizationPreviewInput = {
  category: string;
  enabled?: boolean | null;
  revokedAt?: Date | null;
  attestationText?: string | null;
  attestationVersion?: number | null;
};

export type AuthorizationPreview = {
  status: 'active' | 'missing' | 'revoked' | 'disabled';
  tone: 'pass' | 'warn' | 'fail';
  label: string;
  detail: string;
  attestationPreview: string | null;
};

function categoryLabel(category: string) {
  return category.toLowerCase().replace(/_/g, ' ');
}

function previewText(text: string | null | undefined, max = 220) {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

export function buildAuthorizationPreview(input: AuthorizationPreviewInput | null | undefined): AuthorizationPreview {
  if (!input) {
    return {
      status: 'missing',
      tone: 'warn',
      label: 'Authorization missing',
      detail: 'Enable the matching category before this settlement can become review-ready for shadow-mode preflight.',
      attestationPreview: null,
    };
  }

  if (input.revokedAt) {
    return {
      status: 'revoked',
      tone: 'fail',
      label: 'Authorization revoked',
      detail: `The ${categoryLabel(input.category)} attestation was revoked and cannot unlock queueing.`,
      attestationPreview: previewText(input.attestationText),
    };
  }

  if (!input.enabled) {
    return {
      status: 'disabled',
      tone: 'warn',
      label: 'Authorization disabled',
      detail: `The ${categoryLabel(input.category)} category is stored but currently disabled.`,
      attestationPreview: previewText(input.attestationText),
    };
  }

  return {
    status: 'active',
    tone: 'pass',
    label: `Authorization active v${input.attestationVersion ?? 1}`,
    detail: `Queueing uses this verbatim ${categoryLabel(input.category)} attestation and rechecks it during preflight.`,
    attestationPreview: previewText(input.attestationText),
  };
}
