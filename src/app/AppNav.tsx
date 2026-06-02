'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CircleHelp,
  ClipboardCheck,
  Gauge,
  FileCheck2,
  ListChecks,
  Lock,
  SearchCheck,
  Settings,
  ShieldCheck,
  Target,
  UserRound,
} from 'lucide-react';
import type { ClientFeatureFlag } from '@lib/features';
import AuthStatus from './AuthStatus';
import InstallAppButton from './InstallAppButton';

const primaryNavItems = [
  { href: '/', label: 'Dashboard', icon: Gauge },
  { href: '/onboarding', label: 'Start Here', icon: ClipboardCheck },
  { href: '/goal', label: 'Goal', icon: Target },
  { href: '/settlements', label: 'Settlements', icon: SearchCheck, featureKey: 'settlement-search' },
  { href: '/profile', label: 'Profile', icon: UserRound },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const workflowNavItems = [
  { href: '/review', label: 'Review', icon: ClipboardCheck },
  { href: '/claims', label: 'Claims', icon: FileCheck2 },
  { href: '/audit', label: 'History', icon: ListChecks },
];

const journeySteps = [
  {
    href: '/goal',
    label: 'Goal',
    detail: 'Start scope',
    match: (pathname: string) => pathname === '/' || pathname.startsWith('/goal'),
  },
  {
    href: '/setup',
    label: 'Start Here',
    detail: 'Facts only',
    match: (pathname: string) => ['/onboarding', '/setup', '/profile', '/purchases', '/breaches'].some((prefix) => pathname.startsWith(prefix)),
  },
  {
    href: '/settlements',
    label: 'Source',
    detail: 'Boundary check',
    featureKey: 'settlement-search',
    match: (pathname: string) => pathname.startsWith('/settlements'),
  },
  {
    href: '/review',
    label: 'Review',
    detail: 'Proof check',
    match: (pathname: string) => pathname.startsWith('/review') || pathname.startsWith('/permissions'),
  },
  {
    href: '/claims',
    label: 'Claims',
    detail: 'Tracking',
    match: (pathname: string) => pathname.startsWith('/claims'),
  },
  {
    href: '/audit',
    label: 'History',
    detail: 'Receipts',
    match: (pathname: string) => pathname.startsWith('/audit') || pathname.startsWith('/settings') || pathname.startsWith('/launch'),
  },
];

const legalItems = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/help', label: 'Help' },
  { href: '/contact', label: 'Contact' },
  { href: '/privacy-policy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];

function featureEnabled(featureFlags: ClientFeatureFlag[], key?: string) {
  if (!key) return true;
  return featureFlags.find((flag) => flag.key === key)?.enabled ?? false;
}

export default function AppNav({ featureFlags }: { featureFlags: ClientFeatureFlag[] }) {
  const pathname = usePathname();
  const legalActive = legalItems.some((item) => pathname.startsWith(item.href));
  const visibleJourneySteps = journeySteps.filter((item) => featureEnabled(featureFlags, item.featureKey));
  const activeJourney = visibleJourneySteps.find((item) => item.match(pathname)) ?? visibleJourneySteps[0]!;

  return (
    <header className="site-header">
      <div className="app-chrome">
        <Link href="/" className="brand" aria-label="ClaimBot dashboard">
          <span className="brand-mark">C</span>
          <span>
            ClaimBot
            <small>Settlement claim workspace</small>
          </span>
        </Link>
        <div className="nav-cluster">
          <nav className="primary-nav" aria-label="Primary navigation">
            {primaryNavItems.filter((item) => featureEnabled(featureFlags, item.featureKey)).map(({ href, label, icon: Icon }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={active ? 'active' : undefined} title={label} aria-label={label}>
                  <Icon aria-hidden="true" size={16} strokeWidth={2.2} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <nav className="workflow-nav" aria-label="Workflow navigation">
            {workflowNavItems.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={active ? 'active' : undefined} title={label} aria-label={label}>
                  <Icon aria-hidden="true" size={14} strokeWidth={2.2} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="header-utilities">
          <div className="safety-pill">
            <ShieldCheck aria-hidden="true" size={15} />
            Shadow default
          </div>
          <InstallAppButton />
          <details className={`legal-menu${legalActive ? ' active' : ''}`}>
            <summary aria-label="Open legal and support links">
              <CircleHelp aria-hidden="true" size={15} />
              <span>Legal & Support</span>
            </summary>
            <nav aria-label="Legal and support links">
              {legalItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={pathname.startsWith(item.href) ? 'active' : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </details>
          <AuthStatus />
        </div>
      </div>
      <div className="safety-workflow-ribbon" aria-label="Safety workflow ribbon">
        <div className="safety-workflow-inner">
          <div className="safety-rail" aria-label="Safety rail">
            <span className="rail-badge shadow">
              <ShieldCheck aria-hidden="true" size={13} />
              Shadowed
            </span>
            <span className="rail-badge">
              <Lock aria-hidden="true" size={13} />
              Permission lock
            </span>
            <span className="rail-badge">Proof manual</span>
            <Link className="rail-badge link" href="/audit">Account history</Link>
          </div>
          <nav className="workflow-stepper" aria-label="Safety workflow">
            {workflowNavItems.map(({ href, label }, index) => {
              const active = pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={active ? 'active' : undefined}>
                  <span>{index + 1}</span>
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <div className="journey-micro-rail" aria-label="Journey Micro-Rail">
        <div className="journey-micro-rail-current">
          <strong>Journey Micro-Rail</strong>
          <span>{activeJourney.label}: {activeJourney.detail}</span>
        </div>
        <nav className="journey-micro-rail-steps" aria-label="Claim workspace journey">
          {visibleJourneySteps.map((step, index) => {
            const active = step.match(pathname);
            return (
              <Link key={step.href} href={step.href} className={active ? 'active' : undefined}>
                <span>{index + 1}</span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="journey-micro-rail-safety" aria-label="Journey safety defaults">
          <span>Shadow-safe</span>
          <span>Proof-linked</span>
          <span>History-ready</span>
        </div>
      </div>
    </header>
  );
}
