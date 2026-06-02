'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardCheck, FileCheck2, Gauge, LockKeyhole, SearchCheck, ShieldCheck, Target, UserRound } from 'lucide-react';
import type { ClientFeatureFlag } from '@lib/features';

const mobileNavItems = [
  { href: '/', label: 'Home', icon: Gauge, match: (pathname: string) => pathname === '/' },
  {
    href: '/settlements',
    label: 'Find',
    icon: SearchCheck,
    featureKey: 'settlement-search',
    match: (pathname: string) => pathname.startsWith('/settlements') || pathname.startsWith('/eligibility'),
  },
  {
    href: '/review',
    label: 'Review',
    icon: ClipboardCheck,
    statusLabel: 'Proof-required review',
    match: (pathname: string) => pathname.startsWith('/review') || pathname.startsWith('/permissions'),
  },
  { href: '/claims', label: 'Claims', icon: FileCheck2, match: (pathname: string) => pathname.startsWith('/claims') || pathname.startsWith('/status') },
  { href: '/goal', label: 'Plan', icon: Target, match: (pathname: string) => pathname.startsWith('/goal') },
  {
    href: '/onboarding',
    label: 'Start',
    icon: UserRound,
    statusLabel: 'Profile and onboarding',
    match: (pathname: string) => ['/profile', '/onboarding', '/setup', '/purchases', '/breaches'].some((prefix) => pathname.startsWith(prefix)),
  },
];

function featureEnabled(featureFlags: ClientFeatureFlag[], key?: string) {
  if (!key) return true;
  return featureFlags.find((flag) => flag.key === key)?.enabled ?? false;
}

export default function MobileBottomNav({ featureFlags }: { featureFlags: ClientFeatureFlag[] }) {
  const pathname = usePathname();
  const visibleItems = mobileNavItems.filter((item) => {
    if ('featureKey' in item && item.featureKey) return featureEnabled(featureFlags, item.featureKey);
    return true;
  });
  const pulse = () => {
    navigator.vibrate?.(10);
  };

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      <div className="mobile-nav-safety-dock" aria-label="Mobile safety dock">
        <span>
          <ShieldCheck aria-hidden="true" size={13} />
          Guarded filing
        </span>
        <span>
          <LockKeyhole aria-hidden="true" size={13} />
          Permission required
        </span>
        <span>Proof stops</span>
      </div>
      {visibleItems.map(({ href, label, icon: Icon, statusLabel, match }) => {
        const active = match(pathname);

        return (
          <Link
            key={href}
            href={href}
            className={active ? 'active' : undefined}
            aria-current={active ? 'page' : undefined}
            onClick={pulse}
          >
            <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
            <span>{label}</span>
            {statusLabel && <span className="mobile-nav-status-dot" aria-label={statusLabel} title={statusLabel} />}
          </Link>
        );
      })}
    </nav>
  );
}
