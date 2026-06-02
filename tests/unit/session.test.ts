import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSignedSession, verifySignedSession } from '../../src/lib/auth/session';

const ORIGINAL_SECRET = process.env.CLAIMBOT_SESSION_SECRET;
const TEST_SECRET = 'unit-test-session-secret-at-least-32-characters';

function decodePayload(token: string) {
  const [payloadPart] = token.split('.');
  return JSON.parse(Buffer.from(payloadPart!, 'base64url').toString('utf8'));
}

function encodePayload(payload: unknown) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

describe('signed app sessions', () => {
  beforeEach(() => {
    process.env.CLAIMBOT_SESSION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.CLAIMBOT_SESSION_SECRET;
    } else {
      process.env.CLAIMBOT_SESSION_SECRET = ORIGINAL_SECRET;
    }
  });

  it('creates and verifies a signed session payload', async () => {
    const token = await createSignedSession({ sub: 'identity-123', email: 'client@example.com' }, 60);
    const session = await verifySignedSession(token);

    expect(session).toMatchObject({
      sub: 'identity-123',
      email: 'client@example.com',
    });
    expect(session?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects tampered payloads', async () => {
    const token = await createSignedSession({ sub: 'identity-123', email: 'client@example.com' }, 60);
    const [payloadPart, signaturePart] = token.split('.');
    const payload = decodePayload(token);
    const tampered = `${encodePayload({ ...payload, email: 'other@example.com' })}.${signaturePart}`;

    expect(payloadPart).not.toEqual(tampered.split('.')[0]);
    await expect(verifySignedSession(tampered)).resolves.toBeNull();
  });

  it('rejects tampered signatures', async () => {
    const token = await createSignedSession({ sub: 'identity-123' }, 60);
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;

    await expect(verifySignedSession(tampered)).resolves.toBeNull();
  });

  it('rejects expired sessions', async () => {
    const token = await createSignedSession({ sub: 'identity-123' }, -1);

    await expect(verifySignedSession(token)).resolves.toBeNull();
  });

  it('requires a strong signing secret', async () => {
    process.env.CLAIMBOT_SESSION_SECRET = 'short';

    await expect(createSignedSession({ sub: 'identity-123' })).rejects.toThrow(
      'CLAIMBOT_SESSION_SECRET must be at least 32 characters.',
    );
    await expect(verifySignedSession('anything')).resolves.toBeNull();
  });
});
