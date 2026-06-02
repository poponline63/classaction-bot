import { describe, expect, it } from 'vitest';
import {
  identityDisplayNameForSession,
  identityEmailForSession,
  identitySubjectForSession,
} from '../../src/lib/auth/identity-session';

describe('Identity session bridge helpers', () => {
  it('uses the stable Identity id before sub', () => {
    expect(identitySubjectForSession({
      id: ' netlify-id ',
      sub: 'netlify-sub',
      email: 'client@example.com',
    })).toBe('netlify-id');
  });

  it('falls back to sub but never email for the hosted account subject', () => {
    expect(identitySubjectForSession({
      sub: ' netlify-sub ',
      email: 'client@example.com',
    })).toBe('netlify-sub');
    expect(identitySubjectForSession({
      email: 'client@example.com',
    })).toBeNull();
  });

  it('normalizes valid emails separately from the stable subject', () => {
    expect(identityEmailForSession({
      id: 'netlify-id',
      email: ' Client@Example.COM ',
    })).toBe('client@example.com');
    expect(identityEmailForSession({
      id: 'netlify-id',
      email: 'not-an-email',
    })).toBeUndefined();
  });

  it('uses Identity full name for audit display context without requiring it', () => {
    expect(identityDisplayNameForSession({
      id: 'netlify-id',
      email: 'client@example.com',
      user_metadata: { full_name: ' Client Person ' },
    })).toBe('Client Person');
    expect(identityDisplayNameForSession({
      id: 'netlify-id',
      email: 'client@example.com',
    })).toBe('client@example.com');
  });
});
