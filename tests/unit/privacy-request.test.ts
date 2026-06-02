import { describe, expect, it } from 'vitest';
import { normalizePrivacyRequest } from '../../src/lib/privacy/request';

describe('privacy request intake', () => {
  it('normalizes supported request types and contact email', () => {
    const request = normalizePrivacyRequest({
      requestType: ' DeLeTiOn ',
      contactEmail: ' CLIENT@EXAMPLE.COM ',
      message: 'Please remove profile facts that are no longer needed.',
    });

    expect(request).toMatchObject({
      requestType: 'deletion',
      contactEmail: 'client@example.com',
      valid: true,
    });
    expect(request.message).toBe('Please remove profile facts that are no longer needed.');
  });

  it('falls back to other for unsupported request types', () => {
    const request = normalizePrivacyRequest({
      requestType: 'erase-everything-now',
      message: 'Please route this request through the privacy process.',
    });

    expect(request.requestType).toBe('other');
    expect(request.valid).toBe(true);
  });

  it('rejects too-short request details', () => {
    const request = normalizePrivacyRequest({
      requestType: 'correction',
      message: 'fix',
    });

    expect(request.valid).toBe(false);
  });

  it('does not accept malformed contact email as a contact channel', () => {
    const request = normalizePrivacyRequest({
      requestType: 'export',
      contactEmail: 'not-an-email',
      message: 'Please send my account export through the supported process.',
    });

    expect(request.contactEmail).toBeNull();
    expect(request.valid).toBe(true);
  });
});
