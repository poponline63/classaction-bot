export const SESSION_COOKIE_NAME = 'claimbot_session';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;

export type SessionPayload = {
  sub: string;
  email?: string;
  exp: number;
};

function sessionSecret() {
  return process.env.CLAIMBOT_SESSION_SECRET?.trim() ?? '';
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function textBytes(value: string) {
  return new TextEncoder().encode(value);
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    textBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, textBytes(value));
  return toBase64Url(new Uint8Array(signature));
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function createSignedSession(
  input: { sub: string; email?: string },
  ttlSeconds = DEFAULT_TTL_SECONDS,
) {
  const secret = sessionSecret();
  if (secret.length < 32) throw new Error('CLAIMBOT_SESSION_SECRET must be at least 32 characters.');

  const payload: SessionPayload = {
    sub: input.sub,
    email: input.email,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadPart = toBase64Url(textBytes(JSON.stringify(payload)));
  const signaturePart = await sign(payloadPart, secret);
  return `${payloadPart}.${signaturePart}`;
}

export async function verifySignedSession(value: string | undefined | null) {
  const secret = sessionSecret();
  if (!value || secret.length < 32) return null;

  const [payloadPart, signaturePart] = value.split('.');
  if (!payloadPart || !signaturePart) return null;

  const expected = await sign(payloadPart, secret);
  if (!constantTimeEqual(signaturePart, expected)) return null;

  try {
    const payloadText = new TextDecoder().decode(fromBase64Url(payloadPart));
    const payload = JSON.parse(payloadText) as Partial<SessionPayload>;
    if (!payload.sub || typeof payload.exp !== 'number') return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
