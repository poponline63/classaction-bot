import { describe, expect, it } from 'vitest';
import { userIdentityForSession } from '../../src/lib/auth/current-user';

describe('userIdentityForSession', () => {
  it('keeps the stable hosted subject while normalizing the contact email', () => {
    const identity = userIdentityForSession({
      sub: 'identity-123',
      email: ' Client@Example.COM ',
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    expect(identity).toEqual({
      subject: 'identity-123',
      email: 'client@example.com',
      displayName: 'client@example.com',
      fallbackEmail: expect.stringMatching(/^identity\+[a-f0-9]{24}@claimbot\.local$/),
    });
  });

  it('falls back to a stable synthetic email when email is unavailable', () => {
    const identity = userIdentityForSession({
      sub: 'identity-123',
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    expect(identity).toEqual({
      subject: 'identity-123',
      email: null,
      displayName: 'Identity user',
      fallbackEmail: expect.stringMatching(/^identity\+[a-f0-9]{24}@claimbot\.local$/),
    });
  });
});
