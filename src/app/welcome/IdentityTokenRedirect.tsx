'use client';

// Netlify Identity emails (confirmation, recovery, invite) link to the site
// root with the token in the URL hash. Anonymous visitors land here on the
// marketing page, which has no identity handling — forward them to /login,
// which verifies the token and signs them in.

import { useEffect } from 'react';

const TOKEN_KEYS = ['confirmation_token', 'recovery_token', 'invite_token', 'email_change_token'];

export default function IdentityTokenRedirect() {
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && TOKEN_KEYS.some((key) => hash.includes(key))) {
      window.location.replace(`/login${hash}`);
    }
  }, []);

  return null;
}
