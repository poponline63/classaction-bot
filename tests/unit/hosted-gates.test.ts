import { describe, expect, it } from 'vitest';
import {
  isHostedAuthRequired,
  isSessionSecretReady,
  shouldBlockSetupForMissingAuthSecret,
} from '../../src/lib/auth/hosted-gates';

describe('hosted auth gates', () => {
  it('keeps local development open by default', () => {
    expect(isHostedAuthRequired({})).toBe(false);
    expect(shouldBlockSetupForMissingAuthSecret({})).toBe(false);
  });

  it('requires hosted auth on Netlify unless explicitly disabled', () => {
    expect(isHostedAuthRequired({ NETLIFY: 'true' })).toBe(true);
    expect(isHostedAuthRequired({ NETLIFY: 'true', CLAIMBOT_DISABLE_AUTH: 'true' })).toBe(false);
  });

  it('treats short session secrets as not ready', () => {
    expect(isSessionSecretReady({ CLAIMBOT_SESSION_SECRET: 'short' })).toBe(false);
    expect(isSessionSecretReady({ CLAIMBOT_SESSION_SECRET: 'a-long-random-session-secret-for-tests' })).toBe(true);
  });

  it('blocks setup only when hosted auth is expected and the secret is weak', () => {
    expect(shouldBlockSetupForMissingAuthSecret({ CLAIMBOT_REQUIRE_AUTH: 'true' })).toBe(true);
    expect(shouldBlockSetupForMissingAuthSecret({
      CLAIMBOT_REQUIRE_AUTH: 'true',
      CLAIMBOT_SESSION_SECRET: 'a-long-random-session-secret-for-tests',
    })).toBe(false);
  });
});
