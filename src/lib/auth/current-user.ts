import { cookies } from 'next/headers';
import { ensureSingleUser, ensureUserForIdentity, fallbackEmailForIdentitySubject } from '@db/seed';
import { isHostedAuthRequired } from './hosted-gates';
import { SESSION_COOKIE_NAME, type SessionPayload, verifySignedSession } from './session';

export function userIdentityForSession(session: SessionPayload) {
  const subject = session.sub.trim();
  if (!subject) {
    throw new Error('Authenticated ClaimBot session is missing an identity subject.');
  }

  const normalizedEmail = session.email?.trim().toLowerCase();
  const email = normalizedEmail?.includes('@') ? normalizedEmail : null;
  if (email) {
    return {
      subject,
      email,
      displayName: email,
      fallbackEmail: fallbackEmailForIdentitySubject(subject),
    };
  }

  return {
    subject,
    email: null,
    displayName: 'Identity user',
    fallbackEmail: fallbackEmailForIdentitySubject(subject),
  };
}

export async function currentUserId(): Promise<number> {
  if (!isHostedAuthRequired()) {
    return ensureSingleUser();
  }

  const sessionCookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySignedSession(sessionCookie);
  if (!session) throw new Error('Authenticated ClaimBot session is required.');

  const identity = userIdentityForSession(session);
  return ensureUserForIdentity(identity.subject, identity.email, identity.displayName);
}
