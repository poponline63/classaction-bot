'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Installability is useful, but the app must still work if registration fails.
    });
  }, []);

  return null;
}
