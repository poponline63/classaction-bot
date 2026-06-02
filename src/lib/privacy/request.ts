import { writeAudit } from '@lib/audit';

export const PRIVACY_REQUEST_TYPES = ['export', 'correction', 'deletion', 'restriction', 'other'] as const;
export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];

export type PrivacyRequestInput = {
  requestType: unknown;
  message: unknown;
  contactEmail?: unknown;
};

function cleanString(value: unknown, maxLength: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function normalizePrivacyRequest(input: PrivacyRequestInput) {
  const rawType = cleanString(input.requestType, 32).toLowerCase();
  const requestType: PrivacyRequestType = PRIVACY_REQUEST_TYPES.includes(rawType as PrivacyRequestType)
    ? rawType as PrivacyRequestType
    : 'other';
  const message = cleanString(input.message, 1200);
  const contactEmail = cleanString(input.contactEmail, 160).toLowerCase();

  return {
    requestType,
    message,
    contactEmail: contactEmail.includes('@') ? contactEmail : null,
    valid: message.length >= 12,
  };
}

export async function recordPrivacyRequest(userId: number, input: PrivacyRequestInput) {
  const request = normalizePrivacyRequest(input);
  if (!request.valid) {
    return {
      ok: false as const,
      error: 'Privacy request details must be at least 12 characters.',
      request,
    };
  }

  await writeAudit({
    userId,
    eventType: 'PRIVACY_REQUEST_CREATED',
    entityType: 'user',
    entityId: userId,
    actor: 'user',
    payload: {
      requestType: request.requestType,
      contactEmailPresent: Boolean(request.contactEmail),
      messagePreview: request.message.slice(0, 240),
      boundary: 'Request recorded for operator review; no destructive deletion is performed automatically.',
    },
  });

  return {
    ok: true as const,
    request,
  };
}
