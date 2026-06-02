export type IdentityUserResponse = {
  id?: string;
  sub?: string;
  email?: string;
  user_metadata?: { full_name?: string };
} | null;

export function identitySubjectForSession(identityUser: IdentityUserResponse) {
  const subject = identityUser?.id?.trim() || identityUser?.sub?.trim() || '';
  return subject || null;
}

export function identityEmailForSession(identityUser: IdentityUserResponse) {
  const email = identityUser?.email?.trim().toLowerCase() ?? '';
  return email.includes('@') ? email : undefined;
}

export function identityDisplayNameForSession(identityUser: IdentityUserResponse) {
  const fullName = identityUser?.user_metadata?.full_name?.trim();
  return fullName || identityEmailForSession(identityUser) || 'Identity user';
}
