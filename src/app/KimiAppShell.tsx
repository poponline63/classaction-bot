'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  ClipboardCheck,
  CreditCard,
  FileSearch,
  FileCheck2,
  FileText,
  Gavel,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  Mail,
  Menu,
  Rocket,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Target,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getUser, onAuthChange } from '@netlify/identity';
import type { ClientFeatureFlag } from '@lib/features';
import AuthStatus from './AuthStatus';
import InstallAppButton from './InstallAppButton';
import { canUseNetlifyIdentity } from './identity-env';
import MobileBottomNav from './MobileBottomNav';
import PwaConnectionStatus from './PwaConnectionStatus';
import AppFooter from './AppFooter';

type FilingMode = 'shadow' | 'live';
type IdentityUser = {
  email?: string;
  name?: string;
} | null;

const navGroups = [
  {
    label: 'Tasks',
    items: [
      { label: 'Home', href: '/', icon: LayoutDashboard },
      { label: 'Start Here', href: '/onboarding', icon: ClipboardCheck },
      { label: 'Profile', href: '/profile', icon: UserRound },
      { label: 'Review', href: '/review', icon: Gavel },
      { label: 'Claims', href: '/claims', icon: FileCheck2 },
      { label: 'Status', href: '/status', icon: Clock },
    ],
  },
  {
    label: 'Find',
    items: [
      { label: 'Find Claims', href: '/settlements', icon: Search, featureKey: 'settlement-search' },
      { label: 'Eligibility', href: '/eligibility', icon: FileSearch },
      { label: 'Pricing', href: '/pricing', icon: CreditCard },
      { label: 'Help', href: '/help', icon: HelpCircle },
      { label: 'Contact', href: '/contact', icon: Mail },
    ],
  },
  {
    label: 'More',
    advanced: true,
    items: [
      { label: 'Plan', href: '/goal', icon: Target },
      { label: 'Trust', href: '/trust', icon: ShieldCheck },
      { label: 'History', href: '/audit', icon: ListChecks },
      { label: 'Packets', href: '/packets', icon: FileText },
      { label: 'Settings', href: '/settings', icon: Settings },
      { label: 'Launch', href: '/launch', icon: Rocket },
    ],
  },
];

function featureEnabled(featureFlags: ClientFeatureFlag[], key?: string) {
  if (!key) return true;
  return featureFlags.find((flag) => flag.key === key)?.enabled ?? false;
}

function itemActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/onboarding') return pathname.startsWith('/onboarding') || pathname.startsWith('/setup');
  if (href === '/eligibility') return pathname.startsWith('/eligibility');
  if (href === '/claims') return pathname.startsWith('/claims');
  if (href === '/packets') return pathname.startsWith('/packets');
  if (href === '/status') return pathname.startsWith('/status');
  if (href === '/trust') return pathname.startsWith('/trust');
  if (href === '/help') return pathname.startsWith('/help');
  if (href === '/terms') return pathname.startsWith('/terms') || pathname.startsWith('/privacy-policy') || pathname.startsWith('/contact');
  return pathname.startsWith(href);
}

function initialsFor(label: string) {
  const parts = label
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return 'CB';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

export default function KimiAppShell({
  children,
  filingMode,
  featureFlags,
}: {
  children: React.ReactNode;
  filingMode: FilingMode;
  featureFlags: ClientFeatureFlag[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [identityAvailable, setIdentityAvailable] = useState(false);
  const [identityUser, setIdentityUser] = useState<IdentityUser>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleGroups = navGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      const featureKey = 'featureKey' in item && typeof item.featureKey === 'string'
        ? item.featureKey
        : undefined;
      return featureEnabled(featureFlags, featureKey);
    }),
  })).filter((group) => group.items.length > 0);
  const visibleItems = visibleGroups.flatMap((group) => group.items);
  const activeLabel = visibleItems.find((item) => itemActive(pathname, item.href))?.label ?? 'ClaimBot';
  const accountLabel = identityUser?.name || identityUser?.email || (identityAvailable ? 'Guest workspace' : 'Local workspace');
  const accountMeta = identityUser
    ? 'Signed hosted account'
    : identityAvailable
      ? 'Sign in to continue'
      : filingMode === 'live'
        ? 'Live review mode'
        : 'Shadow workspace';
  const modeLabel = filingMode === 'live' ? 'Live Mode Reviewed' : 'Shadow Mode Active';

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    async function loadIdentity() {
      if (!canUseNetlifyIdentity()) {
        setIdentityAvailable(false);
        setIdentityUser(null);
        return;
      }

      try {
        const current = await getUser();
        if (!active) return;
        setIdentityAvailable(true);
        setIdentityUser(current as IdentityUser);
        unsubscribe = onAuthChange((_event, nextUser) => {
          setIdentityUser(nextUser as IdentityUser);
        });
      } catch {
        if (!active) return;
        setIdentityAvailable(false);
        setIdentityUser(null);
      }
    }

    void loadIdentity();
    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // The public marketing homepage renders its own chrome; skip the workspace
  // shell entirely. (Placed after every hook so hook order stays stable.)
  if (pathname.startsWith('/welcome')) {
    return <>{children}</>;
  }

  return (
    <div className="kimi-shell">
      {mobileOpen && (
        <button
          aria-label="Close navigation overlay"
          className="kimi-mobile-scrim"
          type="button"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`kimi-sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
        <div className="kimi-sidebar-header">
          <Link href="/" className="kimi-brand" aria-label="ClaimBot dashboard" onClick={() => setMobileOpen(false)}>
            <Shield aria-hidden="true" size={20} />
            {!collapsed && (
              <span>
                ClaimBot
                <small>Settlement workspace</small>
              </span>
            )}
          </Link>
          <button
            className="kimi-icon-button desktop-only"
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
          <button
            className="kimi-icon-button mobile-only"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        <nav className="kimi-nav" aria-label="Primary navigation">
          {visibleGroups.map((group) => {
            const links = group.items.map(({ label, href, icon: Icon }) => {
              const active = itemActive(pathname, href);
              return (
                <Link
                  key={`${href}-${label}`}
                  href={href}
                  className={active ? 'active' : undefined}
                  title={collapsed ? label : undefined}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon aria-hidden="true" size={18} strokeWidth={2.1} />
                  {!collapsed && <span>{label}</span>}
                </Link>
              );
            });

            if (group.advanced && !collapsed) {
              const groupActive = group.items.some((item) => itemActive(pathname, item.href));
              return (
                <details className="kimi-nav-disclosure" key={group.label} open={groupActive}>
                  <summary>
                    <span className="kimi-nav-section-title">{group.label}</span>
                    <ChevronRight aria-hidden="true" size={14} />
                  </summary>
                  <div className="kimi-nav-group">{links}</div>
                </details>
              );
            }

            return (
              <div className="kimi-nav-group" key={group.label}>
                {!collapsed && <span className="kimi-nav-section-title">{group.label}</span>}
                {links}
              </div>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="kimi-sidebar-footer">
            <div className="kimi-account-dot">{initialsFor(accountLabel)}</div>
            <div>
              <strong>{accountLabel}</strong>
              <span>{accountMeta}</span>
            </div>
          </div>
        )}
      </aside>

      <div className="kimi-workspace">
        <header className="kimi-topbar">
          <div className="kimi-topbar-title">
            <button
              className="kimi-icon-button mobile-only"
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={17} />
            </button>
            <div className="kimi-topbar-page-label">{activeLabel}</div>
          </div>
          <div className="kimi-topbar-actions">
            <div className={`kimi-shadow-pill ${filingMode === 'live' ? 'live' : 'shadow'}`}>
              <span aria-hidden="true" />
              {modeLabel}
            </div>
            <div className="kimi-topbar-trust-rail" aria-label="Workspace trust boundaries">
              <span>Permission required</span>
              <span>Proof manual</span>
              <Link href="/audit">Account history</Link>
            </div>
            <PwaConnectionStatus />
            <InstallAppButton />
            <Link className="kimi-icon-button" href="/audit" aria-label="Open account history">
              <ListChecks size={16} />
            </Link>
            <AuthStatus />
          </div>
        </header>
        <main className="kimi-main">{children}</main>
        <AppFooter />
      </div>
      <MobileBottomNav featureFlags={featureFlags} />
    </div>
  );
}
