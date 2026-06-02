import { describe, expect, it } from 'vitest';
import { buildAuthorizationPreview } from '../../src/lib/claim-filer/authorization-preview';

describe('buildAuthorizationPreview', () => {
  it('shows active authorization text with version', () => {
    const preview = buildAuthorizationPreview({
      category: 'CONSUMER_PRODUCT_PURCHASE',
      enabled: true,
      revokedAt: null,
      attestationText: 'I certify under penalty of perjury that my saved facts support this category.',
      attestationVersion: 3,
    });

    expect(preview.status).toBe('active');
    expect(preview.tone).toBe('pass');
    expect(preview.label).toContain('v3');
    expect(preview.attestationPreview).toContain('penalty of perjury');
  });

  it('warns when authorization is missing', () => {
    const preview = buildAuthorizationPreview(null);

    expect(preview.status).toBe('missing');
    expect(preview.tone).toBe('warn');
    expect(preview.attestationPreview).toBeNull();
  });

  it('fails revoked authorizations even when text exists', () => {
    const preview = buildAuthorizationPreview({
      category: 'SUBSCRIPTION_SERVICE',
      enabled: true,
      revokedAt: new Date('2026-05-25T00:00:00.000Z'),
      attestationText: 'Old subscription attestation.',
      attestationVersion: 1,
    });

    expect(preview.status).toBe('revoked');
    expect(preview.tone).toBe('fail');
    expect(preview.attestationPreview).toBe('Old subscription attestation.');
  });
});
