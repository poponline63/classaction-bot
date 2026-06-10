import './globals.css';
import type { Metadata, Viewport } from 'next';
import { effectiveFilingModeForBootstrap, getBootstrapAuditStamp } from '@lib/bootstrap-audit-stamp';
import { getPublicClientFeatureFlags } from '@lib/features';
import { currentMode } from '@lib/claim-filer/submit';
import ServiceWorkerRegister from './ServiceWorkerRegister';
import ClaimStatusLockup from './ClaimStatusLockup';
import KimiAppShell from './KimiAppShell';
import BootstrapAuditStamp from './BootstrapAuditStamp';

export const metadata: Metadata = {
  applicationName: 'ClaimBot',
  title: {
    default: 'ClaimBot - Settlement Claim Workspace',
    template: '%s - ClaimBot',
  },
  description: 'Review class action claim opportunities against saved facts, permissions, proof requirements, and shadow-mode safety checks.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ClaimBot',
  },
  openGraph: {
    title: 'ClaimBot - Settlement Claim Workspace',
    description: 'A hosted claim-review workspace for profile facts, permissions, proof checks, account history, and shadow-mode final checks.',
    type: 'website',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const featureFlags = getPublicClientFeatureFlags();
  const requestedFilingMode = await currentMode();
  const bootstrapStamp = getBootstrapAuditStamp({ filingMode: requestedFilingMode });
  const filingMode = effectiveFilingModeForBootstrap({ filingMode: requestedFilingMode });
  const hostedEnvIncomplete = bootstrapStamp.missingEnvKeys.length > 0;

  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        <KimiAppShell featureFlags={featureFlags} filingMode={filingMode}>
          <ClaimStatusLockup featureFlags={featureFlags} hostedEnvIncomplete={hostedEnvIncomplete} />
          <div className="container">{children}</div>
          <BootstrapAuditStamp filingMode={requestedFilingMode} />
        </KimiAppShell>
      </body>
    </html>
  );
}
