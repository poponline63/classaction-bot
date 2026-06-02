'use client';

import { useEffect, useState } from 'react';
import { getUser, logout, onAuthChange } from '@netlify/identity';
import { LogIn, LogOut } from 'lucide-react';
import Link from 'next/link';
import { canUseNetlifyIdentity } from './identity-env';

type IdentityUser = {
  email?: string;
  name?: string;
} | null;

export default function AuthStatus() {
  const [user, setUser] = useState<IdentityUser>(null);
  const [identityAvailable, setIdentityAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    async function load() {
      if (!canUseNetlifyIdentity()) {
        setIdentityAvailable(false);
        return;
      }
      try {
        const current = await getUser();
        if (!active) return;
        setIdentityAvailable(true);
        setUser(current as IdentityUser);
        unsubscribe = onAuthChange((_event, nextUser) => {
          setUser(nextUser as IdentityUser);
        });
      } catch {
        if (active) setIdentityAvailable(false);
      }
    }

    void load();
    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  if (!identityAvailable) return null;

  if (!user) {
    return (
      <Link href="/login" className="auth-chip">
        <LogIn aria-hidden="true" size={14} />
        Sign in
      </Link>
    );
  }

  const label = user.name || user.email || 'Signed in';

  return (
    <button
      className="auth-chip"
      type="button"
      onClick={async () => {
        await fetch('/api/auth/session', { method: 'DELETE' });
        await logout();
        setUser(null);
        window.location.href = '/login';
      }}
      title={label}
    >
      <LogOut aria-hidden="true" size={14} />
      Sign out
    </button>
  );
}
