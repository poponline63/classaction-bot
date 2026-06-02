'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Download } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ready, setReady] = useState(true);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      setReady(true);
      return;
    }

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setReady(true);
    }

    function onAppInstalled() {
      setInstalled(true);
      setPromptEvent(null);
      setReady(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    setReady(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (!ready) return null;

  async function install() {
    if (!promptEvent) return;
    const event = promptEvent;
    setPromptEvent(null);
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome !== 'accepted') setPromptEvent(event);
  }

  const statusLabel = installed ? 'Installed app' : 'App ready';
  const statusCopy = installed
    ? 'Installed shell keeps claim data on the hosted app.'
    : 'Install appears when supported. Offline shell stores no claim data.';

  return (
    <div className="install-trust-card" aria-label="Secure account portal install status">
      {promptEvent ? (
        <button
          aria-label="Install ClaimBot as an app"
          className="install-button"
          title="Install ClaimBot"
          type="button"
          onClick={install}
        >
          <Download aria-hidden="true" size={15} />
          <span>Install app</span>
        </button>
      ) : (
        <div className={`install-status${installed ? ' installed' : ''}`} aria-label={statusLabel}>
          <CheckCircle2 aria-hidden="true" size={15} />
          <span>{statusLabel}</span>
        </div>
      )}
      <span className="install-trust-copy">{statusCopy}</span>
    </div>
  );
}
