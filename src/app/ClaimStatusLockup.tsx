'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CheckCircle2, Clock3, FileCheck2, LockKeyhole, ShieldCheck } from 'lucide-react';
import type { ClientFeatureFlag } from '@lib/features';
import { isMarketingPath } from '@lib/marketing-routes';

type LockupTone = 'building' | 'needs' | 'review' | 'locked' | 'packaged';

type LockupState = {
  tone: LockupTone;
  badge: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  secondary?: boolean;
};

const stateByRoute: Array<{ match: (pathname: string) => boolean; state: LockupState }> = [
  {
    match: (pathname) => pathname.startsWith('/setup') || pathname.startsWith('/profile') || pathname.startsWith('/purchases') || pathname.startsWith('/breaches'),
    state: {
      tone: 'needs',
      badge: 'Setup in progress',
      title: 'Add your facts',
      detail: 'Profile facts and evidence stay editable until you are ready for review.',
      href: '/setup',
      cta: 'Continue setup',
    },
  },
  {
    match: (pathname) => pathname.startsWith('/settlements'),
    state: {
      tone: 'review',
      badge: 'Sources need review',
      title: 'Check claim sources',
      detail: 'Review source records before any match can move toward the queue.',
      href: '/settlements',
      cta: 'Inspect sources',
    },
  },
  {
    match: (pathname) => pathname.startsWith('/review') || pathname.startsWith('/permissions'),
    state: {
      tone: 'review',
      badge: 'Ready for review',
      title: 'Review matches',
      detail: 'Matches wait here until proof, permission, and category facts are checked.',
      href: '/review',
      cta: 'Review matches',
    },
  },
  {
    match: (pathname) => pathname.startsWith('/claims'),
    state: {
      tone: 'packaged',
      badge: 'Claims visible',
      title: 'Track claim progress',
      detail: 'Tracked claims keep receipts and safeguards before any external form step.',
      href: '/claims',
      cta: 'Open claims',
    },
  },
  {
    match: (pathname) => pathname.startsWith('/audit'),
    state: {
      tone: 'locked',
      badge: 'Account history ready',
      title: 'Review account history',
      detail: 'Review timestamps, user choices, and safety events before sharing account access.',
      href: '/audit',
      cta: 'Review history',
      secondary: true,
    },
  },
  {
    match: (pathname) => pathname.startsWith('/launch') || pathname.startsWith('/settings'),
    state: {
      tone: 'locked',
      badge: 'Account checks visible',
      title: 'Account access still guarded',
      detail: 'Sign-in, access, and support checks must pass before sharing account access.',
      href: '/launch',
      cta: 'Account status',
      secondary: true,
    },
  },
  {
    match: (pathname) => pathname.startsWith('/goal') || pathname === '/',
    state: {
      tone: 'building',
      badge: 'Workspace active',
      title: 'Follow the claim path',
      detail: 'Start with facts, review matches, then track claim progress.',
      href: '/goal',
      cta: 'View plan',
    },
  },
];

function featureEnabled(featureFlags: ClientFeatureFlag[], key: string) {
  return featureFlags.find((flag) => flag.key === key)?.enabled ?? false;
}

function getState(pathname: string, settlementSearchEnabled: boolean): LockupState {
  const routeState = stateByRoute.find((item) => item.match(pathname))?.state;
  if (routeState) {
    if (!settlementSearchEnabled && routeState.href === '/settlements') {
      return {
        ...routeState,
        href: '/review',
        cta: 'Review matches',
      };
    }
    return routeState;
  }

  return {
    tone: 'building',
    badge: 'Workspace active',
    title: 'Simple claim path',
    detail: 'Add facts, review matches, then track approved claims.',
    href: '/',
    cta: 'Go home',
  };
}

export default function ClaimStatusLockup({
  featureFlags,
  hostedEnvIncomplete,
}: {
  featureFlags: ClientFeatureFlag[];
  hostedEnvIncomplete?: boolean;
}) {
  const pathname = usePathname();
  // The public marketing homepage carries no workspace status chrome.
  if (isMarketingPath(pathname)) return null;
  const state = getState(pathname, featureEnabled(featureFlags, 'settlement-search'));
  const Icon = state.tone === 'locked'
    ? LockKeyhole
    : state.tone === 'packaged'
      ? FileCheck2
      : state.tone === 'review'
        ? CheckCircle2
        : Clock3;

  return (
    <aside className={`claim-status-lockup ${state.tone}`} aria-label="Claim status">
      <div className="claim-status-lockup-main">
        <span className="claim-status-lockup-icon" aria-hidden="true">
          <Icon size={16} strokeWidth={2.3} />
        </span>
        <div>
          <span className="claim-status-lockup-kicker">CLAIM STATUS</span>
          <span className="claim-status-lockup-label">{state.badge}</span>
          <strong>{state.title}</strong>
          <p>{state.detail}</p>
        </div>
      </div>
      <div className="claim-status-lockup-actions">
        <Link href={state.href} className={`claim-status-lockup-cta${state.secondary ? ' secondary' : ''}`}>
          {state.cta}
        </Link>
        <span className="claim-status-lockup-heartbeat">
          <ShieldCheck aria-hidden="true" size={13} strokeWidth={2.2} />
          Review mode active
        </span>
        {hostedEnvIncomplete && (
          <span className="claim-status-lockup-config-lock">
            <LockKeyhole aria-hidden="true" size={13} strokeWidth={2.2} />
            Account checks pending
          </span>
        )}
        <span className="claim-status-lockup-boundary">Review stays on.</span>
      </div>
    </aside>
  );
}
