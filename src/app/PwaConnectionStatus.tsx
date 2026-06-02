'use client';

import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export default function PwaConnectionStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    function syncConnectionState() {
      setOnline(navigator.onLine);
    }

    syncConnectionState();
    window.addEventListener('online', syncConnectionState);
    window.addEventListener('offline', syncConnectionState);

    return () => {
      window.removeEventListener('online', syncConnectionState);
      window.removeEventListener('offline', syncConnectionState);
    };
  }, []);

  return (
    <div
      aria-label="PWA hosted connection status"
      aria-live="polite"
      className={`pwa-connection-status ${online ? 'online' : 'offline'}`}
    >
      {online ? <Wifi aria-hidden="true" size={15} /> : <WifiOff aria-hidden="true" size={15} />}
      <span>{online ? 'Hosted online' : 'Offline safety hold'}</span>
      <small>{online ? 'No claim data cached' : 'Reconnect before claim review'}</small>
    </div>
  );
}
