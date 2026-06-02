import { NextResponse, type NextRequest } from 'next/server';
import { ensureUserForIdentity } from '@db/seed';
import { writeAudit } from '@lib/audit';
import { createSignedSession, SESSION_COOKIE_NAME, verifySignedSession } from '@lib/auth/session';
import {
  identityDisplayNameForSession,
  identityEmailForSession,
  identitySubjectForSession,
  type IdentityUserResponse,
} from '@lib/auth/identity-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' || process.env.NETLIFY === 'true',
  };
}

async function fetchIdentityUser(request: NextRequest, token: string) {
  const identityUrl = new URL('/.netlify/identity/user', request.url);
  const response = await fetch(identityUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!response.ok) return null;
  return response.json() as Promise<IdentityUserResponse>;
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'identity token required' }, { status: 401 });
  }

  const identityUser = await fetchIdentityUser(request, token);
  const subject = identitySubjectForSession(identityUser);
  if (!identityUser || !subject) {
    return NextResponse.json({ error: 'identity token rejected' }, { status: 401 });
  }

  const maxAge = 60 * 60 * 24 * 7;
  const email = identityEmailForSession(identityUser);
  const displayName = identityDisplayNameForSession(identityUser);
  const userId = await ensureUserForIdentity(subject, email, displayName);
  const signedSession = await createSignedSession({ sub: subject, email }, maxAge);
  await writeAudit({
    userId,
    eventType: 'AUTH_SESSION_CREATED',
    entityType: 'user',
    entityId: userId,
    actor: 'user',
    payload: {
      subjectPresent: true,
      emailPresent: Boolean(email),
      displayNamePresent: Boolean(displayName),
      source: 'netlify-identity',
      ttlSeconds: maxAge,
      cookieName: SESSION_COOKIE_NAME,
      note: 'Hosted Identity token was verified before minting the ClaimBot app session.',
    },
  });

  const response = NextResponse.json({ ok: true, email: email ?? null });
  response.cookies.set(SESSION_COOKIE_NAME, signedSession, sessionCookieOptions(maxAge));
  return response;
}

export async function DELETE(request: NextRequest) {
  let audited = false;
  const session = await verifySignedSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (session) {
    try {
      const userId = await ensureUserForIdentity(session.sub, session.email, session.email ?? 'Identity user');
      await writeAudit({
        userId,
        eventType: 'AUTH_SESSION_ENDED',
        entityType: 'user',
        entityId: userId,
        actor: 'user',
        payload: {
          subjectPresent: true,
          emailPresent: Boolean(session.email),
          source: 'netlify-identity',
          cookieName: SESSION_COOKIE_NAME,
          note: 'ClaimBot app session was explicitly ended by the signed-in user.',
        },
      });
      audited = true;
    } catch {
      audited = false;
    }
  }

  const response = NextResponse.json({ ok: true, audited });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    ...sessionCookieOptions(0),
    expires: new Date(0),
  });
  return response;
}
