'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CircleHelp, DollarSign, ListChecks, LockKeyhole, Rocket, Search, Settings, ShieldCheck, Target } from 'lucide-react';
import { SETTLEMENT_CATEGORIES } from '@db/schema';

const BASE_TABS = [
  { key: 'info', label: 'My info' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'authorizations', label: 'Permissions' },
  { key: 'settings', label: 'Settings' },
] as const;

const FRIENDLY_CATEGORIES: Record<string, string> = {
  CONSUMER_PRODUCT_PURCHASE: 'Product purchases',
  SUBSCRIPTION_SERVICE: 'Subscription services',
  DATA_BREACH: 'Data breaches',
  ROBOCALL_TCPA: 'Unwanted calls or texts',
  DECEPTIVE_ADVERTISING: 'False advertising',
  AUTO_DEFECT: 'Vehicle issues',
  EMPLOYMENT: 'Employment',
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  CONSUMER_PRODUCT_PURCHASE: 'Products you bought during a settlement class period.',
  SUBSCRIPTION_SERVICE: 'Subscriptions, renewals, fees, or cancellation issues.',
  DATA_BREACH: 'Personal information exposed in a company data incident.',
  ROBOCALL_TCPA: 'Calls or texts that may match a TCPA settlement class.',
  DECEPTIVE_ADVERTISING: 'Purchases tied to challenged ads, labels, or claims.',
  AUTO_DEFECT: 'Vehicles owned or leased during a relevant defect period.',
  EMPLOYMENT: 'Work history that may match a wage, hour, or classification case.',
};

const ATTESTATION_TEMPLATES: Record<string, string> = {
  CONSUMER_PRODUCT_PURCHASE: 'I certify under penalty of perjury that I purchased the listed products during the relevant class periods.',
  SUBSCRIPTION_SERVICE: 'I certify under penalty of perjury that I subscribed to the listed services during the relevant class periods.',
  DATA_BREACH: 'I certify under penalty of perjury that my personal information was exposed in the listed data breaches.',
  ROBOCALL_TCPA: 'I certify under penalty of perjury that I received unsolicited calls or texts at the listed phone numbers.',
  DECEPTIVE_ADVERTISING: 'I certify under penalty of perjury that I purchased the listed products in reliance on the advertising at issue.',
  AUTO_DEFECT: 'I certify under penalty of perjury that I owned or leased the listed vehicles during the relevant periods.',
  EMPLOYMENT: 'I certify under penalty of perjury that I was employed by the listed employers during the relevant periods.',
};

type SaveFeedback = { type: 'success' | 'error'; text: string } | null;
type ProfileReadinessTone = 'pass' | 'warn';

type ProfileFactsBrowserRow = {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: ProfileReadinessTone;
  action: string;
  tab?: string;
  href?: string;
  searchText: string;
};

interface ProfileBootstrap {
  profile: {
    legalName: string;
    dateOfBirth: string;
    emails: string;
    phones: string;
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  purchases: Array<{ id: number; label: string; date: string; category: string; receiptPath: string | null }>;
  breaches: Array<{ id: number; label: string; date: string }>;
  authorizations: Record<string, boolean>;
  settings: {
    discordWebhookConfigured: boolean;
    hibpApiKeyConfigured: boolean;
    claimFilerMode: string;
    claimFilerLiveAck: boolean;
    claimFilerMaxPerDay: string;
  };
  features: {
    breachImportEnabled: boolean;
    liveFilingEnabled: boolean;
    settlementSearchEnabled: boolean;
  };
}

function enabledCategories(breachImportEnabled: boolean) {
  return SETTLEMENT_CATEGORIES.filter((category) => (
    category !== 'UNKNOWN' && (breachImportEnabled || category !== 'DATA_BREACH')
  ));
}

async function postForm(url: string, fd: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, { method: 'POST', body: fd });
    if (response.ok) return { ok: true };

    try {
      const json = await response.json();
      if (typeof json.error === 'string') return { ok: false, error: json.error };
    } catch {
      // Fall through to a generic message.
    }
    return { ok: false, error: 'Unable to save. Review the entered information and try again.' };
  } catch {
    return { ok: false, error: 'Unable to reach the local app server.' };
  }
}

function SaveNotice({ feedback }: { feedback: SaveFeedback }) {
  if (!feedback) return null;
  return (
    <div className={`notice ${feedback.type === 'error' ? 'warn' : ''}`}>
      {feedback.text}
    </div>
  );
}

function ProfileFactsBrowser({
  rows,
  onSelectTab,
}: {
  rows: ProfileFactsBrowserRow[];
  onSelectTab: (tab: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'ready' | 'attention'>('all');
  const [expanded, setExpanded] = useState<string | null>(rows[0]?.key ?? null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === 'ready' && row.tone !== 'pass') return false;
      if (filter === 'attention' && row.tone !== 'warn') return false;
      if (!normalizedQuery) return true;
      return row.searchText.toLowerCase().includes(normalizedQuery);
    });
  }, [filter, query, rows]);

  return (
    <section className="profile-facts-browser" aria-label="Interactive profile facts browser">
      <header className="profile-facts-browser-head">
        <div>
          <div className="eyebrow">Fact check</div>
          <h2>Review saved facts without changing them</h2>
          <p>
            Review name, contact, evidence, proof references, permissions, and filing posture before ClaimBot
            uses anything for matching.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="profile-facts-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search profile facts</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search profile..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Profile facts filter">
          {[
            { label: 'All', value: 'all' },
            { label: 'Ready', value: 'ready' },
            { label: 'Needs attention', value: 'attention' },
          ].map((item) => (
            <button
              className={filter === item.value ? 'active' : undefined}
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value as 'all' | 'ready' | 'attention')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="profile-facts-empty">
          <LockKeyhole aria-hidden="true" size={28} />
          <h3>No matching profile items</h3>
          <p>
            Try a different profile term or filter. This browser is read-only; it never changes
            profile facts, proof references, permissions, or filing posture.
          </p>
          <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="profile-facts-list">
          {filteredRows.map((row) => {
            const isExpanded = expanded === row.key;
            return (
              <article className={`profile-facts-card ${row.tone}`} key={row.key}>
                <button
                  className="profile-facts-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : row.key)}
                >
                  <div className="profile-facts-title">
                    <span className={`readiness-dot ${row.tone}`} aria-hidden="true" />
                    <div>
                      <h3>{row.label}</h3>
                      <p>{row.detail}</p>
                    </div>
                  </div>
                  <div className="profile-facts-status">
                    <span className={`tag ${row.tone === 'pass' ? 'good' : 'warn'}`}>{row.value}</span>
                  </div>
                  <div className="workflow-card-actions">
                    <span className="small muted">{row.action}</span>
                    <ArrowRight className={isExpanded ? 'expanded' : undefined} aria-hidden="true" size={18} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="profile-facts-expanded">
                    <p>{row.detail}</p>
                    {row.href ? (
                      <Link className="btn ghost sm" href={row.href}>{row.action}</Link>
                    ) : (
                      <button className="btn ghost sm" type="button" onClick={() => row.tab && onSelectTab(row.tab)}>
                        {row.action}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function ProfilePage() {
  const [tab, setTab] = useState('info');
  const [bootstrap, setBootstrap] = useState<ProfileBootstrap | null>(null);
  const [loadError, setLoadError] = useState('');
  const breachImportEnabled = bootstrap?.features.breachImportEnabled ?? true;
  const liveFilingEnabled = bootstrap?.features.liveFilingEnabled ?? false;
  const settlementSearchEnabled = bootstrap?.features.settlementSearchEnabled ?? true;
  const profile = bootstrap?.profile;
  const profileComplete = Boolean(profile?.legalName && (profile.emails || profile.phones));
  const purchaseCount = bootstrap?.purchases.length ?? 0;
  const breachCount = breachImportEnabled ? bootstrap?.breaches.length ?? 0 : 0;
  const evidenceCount = purchaseCount + breachCount;
  const proofReferenceCount = bootstrap?.purchases.filter((purchase) => purchase.receiptPath).length ?? 0;
  const authorizationCount = Object.values(bootstrap?.authorizations ?? {}).filter(Boolean).length;
  const filingMode = bootstrap?.settings.claimFilerMode ?? 'shadow';
  const missingGate =
    !profileComplete ? 'Profile facts needed' :
    evidenceCount === 0 ? 'Claim facts needed' :
    authorizationCount === 0 ? 'Permission needed' :
    proofReferenceCount === 0 ? 'Proof references optional' :
    'Ready for review';
  const profileCommandAction: { label: string; tab: string } | { label: string; href: string } =
    !profileComplete ? { label: 'Complete profile facts', tab: 'info' } :
    evidenceCount === 0 ? { label: 'Add evidence facts', tab: 'purchases' } :
    authorizationCount === 0 ? { label: 'Choose permissions', tab: 'authorizations' } :
    { label: 'Open match review', href: '/review' };
  const tabs = [
    BASE_TABS[0],
    BASE_TABS[1],
    ...(breachImportEnabled ? [{ key: 'breaches', label: 'Data breaches' }] : []),
    BASE_TABS[2],
    BASE_TABS[3],
  ];
  const profileFactsRows: ProfileFactsBrowserRow[] = [
    {
      key: 'identity',
      label: 'Name and contact',
      value: profileComplete ? 'Ready' : 'Needed',
      detail: profileComplete
        ? 'Legal name plus at least one contact method is available for matcher context.'
        : 'Legal name plus email or phone is required before matching and final checks can rely on this profile.',
      tone: profileComplete ? 'pass' : 'warn',
      action: 'Open name and contact',
      tab: 'info',
      searchText: 'name contact legal name email phone profile intake',
    },
    {
      key: 'evidence',
      label: 'Claim facts',
      value: `${evidenceCount} saved`,
      detail: evidenceCount > 0
        ? `${purchaseCount} purchase fact${purchaseCount === 1 ? '' : 's'}${breachImportEnabled ? ` and ${breachCount} breach fact${breachCount === 1 ? '' : 's'}` : ''} can support review.`
        : 'Add purchases, subscriptions, services, or enabled breach facts before matching can improve.',
      tone: evidenceCount > 0 ? 'pass' : 'warn',
      action: 'Open evidence facts',
      tab: 'purchases',
      searchText: 'evidence facts purchases subscriptions services breach proof profile',
    },
    {
      key: 'proof',
      label: 'Proof references',
      value: `${proofReferenceCount} staged`,
      detail: proofReferenceCount > 0
        ? 'Document notes are saved for manual review and never bypass proof-required checks.'
        : 'Proof references are optional here, but proof-required claims still stay manual until documents are reviewed.',
      tone: proofReferenceCount > 0 ? 'pass' : 'warn',
      action: 'Stage proof reference',
      tab: 'purchases',
      searchText: 'proof references documents manual review proof required',
    },
    {
      key: 'permission',
      label: 'Claim permissions',
      value: `${authorizationCount} active`,
      detail: authorizationCount > 0
        ? 'At least one category permission is active; review still rechecks the exact category.'
        : 'No category can move forward until the user deliberately allows it.',
      tone: authorizationCount > 0 ? 'pass' : 'warn',
      action: 'Manage permissions',
      tab: 'authorizations',
      searchText: 'permission category attestation consent final checks claims',
    },
    {
      key: 'mode',
      label: 'Filing posture',
      value: filingMode === 'live' ? 'Live review' : 'Shadow',
      detail: filingMode === 'live'
        ? 'Live mode is visible here, but filing remains guarded by feature flags, proof, permission, plan, and account-history checks.'
        : 'Shadow mode is active, so profile intake can improve review without submitting claims.',
      tone: filingMode === 'live' ? 'warn' : 'pass',
      action: 'Open settings',
      tab: 'settings',
      searchText: 'filing posture shadow live mode settings final checks',
    },
    {
      key: 'scope',
      label: 'Claim source scope',
      value: settlementSearchEnabled ? 'Discovery on' : 'Scoped review',
      detail: settlementSearchEnabled
        ? 'Public discovery can use saved facts, while proof and permission checks still govern claim tracking.'
        : 'Public settlement browsing is hidden; saved facts are used for imported or assigned opportunities.',
      tone: 'pass',
      action: settlementSearchEnabled ? 'Open discovery' : 'Review goal',
      href: settlementSearchEnabled ? '/settlements' : '/goal',
      searchText: 'deployment scope discovery scoped review feature flags settlements',
    },
  ];

  useEffect(() => {
    let cancelled = false;
    fetch('/api/profile/bootstrap')
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load saved profile data.');
        return response.json() as Promise<ProfileBootstrap>;
      })
      .then((data) => {
        if (!cancelled) setBootstrap(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Saved profile data could not be loaded. New entries can still be saved.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab === 'breaches' && !breachImportEnabled) setTab('purchases');
  }, [breachImportEnabled, tab]);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Your facts</div>
          <h1>Profile</h1>
          <p>
            Add your facts once, choose what ClaimBot may review, then check matches before anything can be filed.
          </p>
        </div>
      </div>

      {!bootstrap && !loadError && <div className="notice notice-spaced">Loading saved profile facts...</div>}
      {loadError && <div className="notice warn notice-spaced">{loadError}</div>}

      {!settlementSearchEnabled && (
        <section className="dashboard-section section-flush">
          <div className="notice warn notice-followup">
            <h3>Scoped profile mode</h3>
            <p>
              Public settlement browsing is hidden for this deployment. Add scoped-review evidence
              so imported or assigned opportunities can be checked against saved facts,
              permissions, proof rules, and shadow-mode filing posture.
            </p>
          </div>
        </section>
      )}

      <section className="profile-command-ribbon" aria-label="Profile snapshot">
        <div className="profile-command-kicker">Profile snapshot</div>
        <div className="profile-command-status">
          <span className={`profile-command-icon ${profileComplete && evidenceCount > 0 ? 'pass' : 'warn'}`} aria-hidden="true">
            <ShieldCheck size={20} />
          </span>
          <div>
            <small>Saved facts</small>
            <strong>{profileComplete ? `${evidenceCount} saved fact${evidenceCount === 1 ? '' : 's'}` : 'Profile not ready'}</strong>
            <p>
              {profileComplete
                ? 'Saved facts can support matching, but they are not filing permission.'
                : 'Legal name plus email or phone is required before ClaimBot can review matches.'}
            </p>
          </div>
        </div>
        <div className="profile-command-gates">
          <small>Next need</small>
          <strong>{missingGate}</strong>
          <div className="profile-command-gate-grid" aria-label="Profile command gate status">
            <span className={profileComplete ? 'pass' : 'warn'}>Facts</span>
            <span className={evidenceCount > 0 ? 'pass' : 'warn'}>Evidence</span>
            <span className={authorizationCount > 0 ? 'pass' : 'warn'}>Permission</span>
            <span className={filingMode === 'live' ? 'warn' : 'pass'}>{filingMode === 'live' ? 'Live review' : 'Shadow'}</span>
          </div>
        </div>
        <div className="profile-command-action">
          <small>Next action</small>
          {'href' in profileCommandAction ? (
            <Link className="btn sm" href={profileCommandAction.href}>
              {profileCommandAction.label}
              <ArrowRight aria-hidden="true" size={14} />
            </Link>
          ) : (
            <button className="btn sm" type="button" onClick={() => setTab(profileCommandAction.tab)}>
              {profileCommandAction.label}
              <ArrowRight aria-hidden="true" size={14} />
            </button>
          )}
          <span>No eligibility is fabricated, proof stays manual, and filing still requires explicit permission.</span>
        </div>
      </section>

      <ProfileNextStepPanel
        bootstrap={bootstrap}
        breachImportEnabled={breachImportEnabled}
        settlementSearchEnabled={settlementSearchEnabled}
        onSelectTab={setTab}
      />

      <div className="tabs profile-subnav" aria-label="Profile evidence sections">
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${t.key === tab ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <TabInfo
          initial={bootstrap?.profile}
          settlementSearchEnabled={settlementSearchEnabled}
        />
      )}
      {tab === 'purchases' && (
        <TabPurchases
          initial={bootstrap?.purchases ?? []}
          breachImportEnabled={breachImportEnabled}
          settlementSearchEnabled={settlementSearchEnabled}
        />
      )}
      {tab === 'breaches' && breachImportEnabled && <TabBreaches initial={bootstrap?.breaches ?? []} />}
      {tab === 'authorizations' && (
        <TabAuthorizations
          initial={bootstrap?.authorizations ?? {}}
          breachImportEnabled={breachImportEnabled}
        />
      )}
      {tab === 'settings' && (
        <TabSettings
          initial={bootstrap?.settings}
          breachImportEnabled={breachImportEnabled}
          liveFilingEnabled={liveFilingEnabled}
        />
      )}

      <details className="dashboard-detail-drawer profile-more-drawer">
        <summary>
          <strong>More profile details</strong>
          <span>Saved facts, proof notes, permissions, and account controls.</span>
        </summary>
        <ProfileFactsBrowser rows={profileFactsRows} onSelectTab={setTab} />
        <ProfileTrustLanyard
          bootstrap={bootstrap}
          breachImportEnabled={breachImportEnabled}
          onSelectTab={setTab}
        />
        <ProfileReadinessStrip
          bootstrap={bootstrap}
          breachImportEnabled={breachImportEnabled}
          settlementSearchEnabled={settlementSearchEnabled}
          onSelectTab={setTab}
        />
        <ProfileControlHub />
      </details>
    </>
  );
}

function ProfileTrustLanyard({
  bootstrap,
  breachImportEnabled,
  onSelectTab,
}: {
  bootstrap: ProfileBootstrap | null;
  breachImportEnabled: boolean;
  onSelectTab: (tab: string) => void;
}) {
  const profile = bootstrap?.profile;
  const profileFactCount = [
    profile?.legalName,
    profile?.dateOfBirth,
    profile?.emails,
    profile?.phones,
    profile?.street,
    profile?.city,
    profile?.state,
    profile?.zip,
  ].filter(Boolean).length;
  const purchaseCount = bootstrap?.purchases.length ?? 0;
  const breachCount = breachImportEnabled ? bootstrap?.breaches.length ?? 0 : 0;
  const proofReferenceCount = bootstrap?.purchases.filter((purchase) => purchase.receiptPath).length ?? 0;
  const authorizationCount = Object.values(bootstrap?.authorizations ?? {}).filter(Boolean).length;
  const usableFactCount = profileFactCount + purchaseCount + breachCount;
  const mode = bootstrap?.settings.claimFilerMode ?? 'shadow';

  const segments = [
    {
      label: 'Usable facts',
      value: `${usableFactCount}`,
      detail: 'Saved facts can be used for matching, but they are not proof by themselves.',
      state: usableFactCount > 0 ? 'active' : 'empty',
      action: 'Review facts',
      tab: 'info',
    },
    {
      label: 'Proof references',
      value: `${proofReferenceCount}`,
      detail: 'Documents, notices, or notes stay human-reviewed and never auto-promote a claim.',
      state: proofReferenceCount > 0 ? 'review' : 'empty',
      action: 'Stage proof',
      tab: 'purchases',
    },
    {
      label: 'Allowed categories',
      value: `${authorizationCount}`,
      detail: 'Category permissions are required before ClaimBot can prepare a claim.',
      state: authorizationCount > 0 ? 'locked' : 'empty',
      action: 'Manage permissions',
      tab: 'authorizations',
    },
  ];

  return (
    <section className="profile-trust-lanyard" aria-label="Profile evidence trust lanyard">
      <div className="profile-trust-lanyard-head">
        <div>
          <div className="eyebrow">Safety summary</div>
          <h2>Saved facts are not filing permission.</h2>
          <p>
            ClaimBot keeps usable facts, proof references, and explicit permission separate so
            matching can improve without fabricating eligibility or bypassing review.
          </p>
        </div>
        <span className={`mode-badge ${mode === 'live' ? 'live' : 'shadow'}`}>
          {mode === 'live' ? 'Live review posture' : 'Shadow preview'}
        </span>
      </div>
      <div className="profile-trust-lanyard-grid">
        {segments.map((segment) => (
          <button
            className={`profile-trust-lanyard-item ${segment.state}`}
            key={segment.label}
            type="button"
            onClick={() => onSelectTab(segment.tab)}
          >
            <span>{segment.label}</span>
            <strong>{segment.value}</strong>
            <small>{segment.detail}</small>
            <b>{segment.action}</b>
          </button>
        ))}
      </div>
      <p className="profile-trust-lanyard-note">
        Changing facts or permissions is reviewable. Proof-required claims still stay manual, and
        shadow mode remains the default.
      </p>
    </section>
  );
}

function ProfileControlHub() {
  const links = [
    {
      href: '/audit',
      label: 'Account history',
      detail: 'Review account activity and support records.',
      icon: ListChecks,
      tone: 'blue',
    },
    {
      href: '/settings',
      label: 'Settings',
      detail: 'Control shadow mode, permissions, daily caps, and safety limits.',
      icon: Settings,
      tone: 'green',
    },
    {
      href: '/launch',
      label: 'Account status',
      detail: 'Open deeper account access details when support asks.',
      icon: Rocket,
      tone: 'yellow',
    },
    {
      href: '/goal',
      label: 'How it works',
      detail: 'Review the safe automation path from matching to queue.',
      icon: Target,
      tone: 'blue',
    },
    {
      href: '/pricing',
      label: 'Pricing',
      detail: 'Compare free matching with paid full-automation tiers.',
      icon: DollarSign,
      tone: 'green',
    },
    {
      href: '/help',
      label: 'Help',
      detail: 'Find support paths, boundaries, and answers.',
      icon: CircleHelp,
      tone: 'yellow',
    },
  ];

  return (
    <section className="profile-control-hub" aria-label="Account and safety controls">
      <div className="profile-control-hub-head">
        <div>
          <div className="eyebrow">More links</div>
          <h2>Account and support</h2>
          <p>
            Manage saved records, permissions, support, and account safety.
          </p>
        </div>
        <span className="tag blue">Account controls</span>
      </div>
      <div className="profile-control-hub-grid">
        {links.map(({ href, label, detail, icon: Icon, tone }) => (
          <Link key={href} href={href} className={`profile-control-link ${tone}`}>
            <span className="profile-control-icon" aria-hidden="true">
              <Icon size={17} strokeWidth={2.2} />
            </span>
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ProfileNextStepPanel({
  bootstrap,
  breachImportEnabled,
  settlementSearchEnabled,
  onSelectTab,
}: {
  bootstrap: ProfileBootstrap | null;
  breachImportEnabled: boolean;
  settlementSearchEnabled: boolean;
  onSelectTab: (tab: string) => void;
}) {
  const profile = bootstrap?.profile;
  const profileComplete = Boolean(profile?.legalName && (profile.emails || profile.phones));
  const purchaseCount = bootstrap?.purchases.length ?? 0;
  const breachCount = bootstrap?.breaches.length ?? 0;
  const evidenceCount = purchaseCount + (breachImportEnabled ? breachCount : 0);
  const stagedProofCount = bootstrap?.purchases.filter((purchase) => purchase.receiptPath).length ?? 0;
  const authorizationCount = Object.values(bootstrap?.authorizations ?? {}).filter(Boolean).length;
  const mode = bootstrap?.settings.claimFilerMode ?? 'shadow';
  const evidenceLabel = settlementSearchEnabled ? 'matching evidence' : 'scoped-review evidence';

  const current =
    !profileComplete ? {
      gate: 1,
      title: 'Add your basic info',
      body: 'Add legal name plus an email or phone before ClaimBot reviews matches for this profile.',
      action: 'Add basic info',
      tab: 'info',
    } :
    evidenceCount === 0 ? {
      gate: 1,
      title: `Add ${evidenceLabel}`,
      body: 'Purchases, services, subscriptions, or breach exposure records give the matcher facts to compare against settlement classes.',
      action: breachImportEnabled ? 'Add evidence facts' : 'Add purchase facts',
      tab: 'purchases',
    } :
    authorizationCount === 0 ? {
      gate: 2,
      title: 'Choose claim permissions',
      body: 'ClaimBot cannot prepare a category unless you deliberately allow that category.',
      action: 'Choose permissions',
      tab: 'authorizations',
    } :
    stagedProofCount === 0 ? {
      gate: 3,
      title: 'Add proof notes if you have them',
      body: 'No-proof claims may continue after review, but documents, notices, and proof notes keep uncertain matches from being guessed.',
      action: 'Stage proof references',
      tab: 'purchases',
    } : {
      gate: 4,
      title: 'Ready for review',
      body: 'Saved facts, evidence references, and category permissions are available. Review still decides what can move forward.',
      action: 'Open match review',
      tab: 'review',
    };

  const gates = [
    { label: 'Intake', complete: profileComplete && evidenceCount > 0 },
    { label: 'Permission', complete: authorizationCount > 0 },
    { label: 'Proof', complete: stagedProofCount > 0 },
    { label: 'Review', complete: current.gate === 4 },
  ];

  return (
    <section className="profile-next-step-panel" aria-label="Profile next step">
      <div className="profile-next-step-main">
        <span className="profile-next-step-icon" aria-hidden="true">
          <LockKeyhole size={20} strokeWidth={2.2} />
        </span>
        <div>
          <div className="eyebrow">Next step</div>
          <h2>{current.title}</h2>
          <p>{current.body}</p>
        </div>
      </div>
      <div className="profile-next-step-gates" aria-label="Profile step progress">
        {gates.map((gate, index) => (
          <span
            className={`${gate.complete ? 'complete' : index + 1 === current.gate ? 'active' : 'locked'}`}
            key={gate.label}
          >
            {gate.complete ? <ShieldCheck size={14} aria-hidden="true" /> : index + 1}
            {gate.label}
          </span>
        ))}
      </div>
      <div className="profile-next-step-actions">
        {current.tab === 'review' ? (
          <Link className="btn" href="/review">{current.action}</Link>
        ) : (
          <button className="btn" type="button" onClick={() => onSelectTab(current.tab)}>
            {current.action}
          </button>
        )}
        <span className={`mode-badge ${mode === 'live' ? 'live' : 'shadow'}`}>
          {mode === 'live' ? 'Live review posture' : 'Shadow mode default'}
        </span>
      </div>
    </section>
  );
}

function ProfileReadinessStrip({
  bootstrap,
  breachImportEnabled,
  settlementSearchEnabled,
  onSelectTab,
}: {
  bootstrap: ProfileBootstrap | null;
  breachImportEnabled: boolean;
  settlementSearchEnabled: boolean;
  onSelectTab: (tab: string) => void;
}) {
  const profile = bootstrap?.profile;
  const profileComplete = Boolean(profile?.legalName && (profile.emails || profile.phones));
  const purchaseCount = bootstrap?.purchases.length ?? 0;
  const authorizationCount = Object.values(bootstrap?.authorizations ?? {}).filter(Boolean).length;
  const mode = bootstrap?.settings.claimFilerMode ?? 'shadow';

  return (
    <details className="profile-readiness-strip">
      <summary>
        <span>
          <strong>Profile details</strong>
          <small>Facts, evidence, permission, and {mode === 'live' ? 'live-review posture' : 'shadow posture'}.</small>
        </span>
        <span className="profile-strip-metrics" aria-label="Profile quick metrics">
          <b className={profileComplete ? 'pass' : 'warn'}>Facts {profileComplete ? 'ready' : 'needed'}</b>
          <b className={purchaseCount > 0 ? 'pass' : 'warn'}>{purchaseCount} evidence</b>
          <b className={authorizationCount > 0 ? 'pass' : 'warn'}>{authorizationCount} permissions</b>
          <b className={mode === 'live' ? 'warn' : 'pass'}>{mode === 'live' ? 'Live review' : 'Shadow'}</b>
        </span>
      </summary>
      <div className="profile-readiness-drawer">
        <FactsFirstCharter />
        <EvidenceExhibitIndex
          bootstrap={bootstrap}
          breachImportEnabled={breachImportEnabled}
          settlementSearchEnabled={settlementSearchEnabled}
          onSelectTab={onSelectTab}
        />
        <ProfileReadiness
          bootstrap={bootstrap}
          breachImportEnabled={breachImportEnabled}
          settlementSearchEnabled={settlementSearchEnabled}
          onSelectTab={onSelectTab}
        />
      </div>
    </details>
  );
}

function EvidenceExhibitIndex({
  bootstrap,
  breachImportEnabled,
  settlementSearchEnabled,
  onSelectTab,
}: {
  bootstrap: ProfileBootstrap | null;
  breachImportEnabled: boolean;
  settlementSearchEnabled: boolean;
  onSelectTab: (tab: string) => void;
}) {
  const profile = bootstrap?.profile;
  const profileComplete = Boolean(profile?.legalName && (profile.emails || profile.phones));
  const purchaseCount = bootstrap?.purchases.length ?? 0;
  const stagedProofCount = bootstrap?.purchases.filter((purchase) => purchase.receiptPath).length ?? 0;
  const breachCount = bootstrap?.breaches.length ?? 0;
  const authorizationCount = Object.values(bootstrap?.authorizations ?? {}).filter(Boolean).length;
  const mode = bootstrap?.settings.claimFilerMode ?? 'shadow';
  const exhibits = [
    {
      tab: 'info',
      code: 'E1',
      label: 'Profile facts',
      state: profileComplete ? 'sealed' : 'empty',
      detail: profileComplete ? 'Name and contact facts are tracked.' : 'Legal name plus email or phone still needed.',
    },
    {
      tab: 'purchases',
      code: 'E2',
      label: 'Purchase evidence',
      state: stagedProofCount > 0 ? 'review' : purchaseCount > 0 ? 'sealed' : 'empty',
      detail: purchaseCount > 0
        ? `${purchaseCount} purchase fact${purchaseCount === 1 ? '' : 's'} saved; ${stagedProofCount} proof reference${stagedProofCount === 1 ? '' : 's'} staged.`
        : 'No purchase or subscription facts saved yet.',
    },
    ...(breachImportEnabled ? [{
      tab: 'breaches',
      code: 'E3',
      label: 'Breach evidence',
      state: breachCount > 0 ? 'sealed' : 'empty',
      detail: breachCount > 0 ? `${breachCount} breach exposure record${breachCount === 1 ? '' : 's'} saved.` : 'No breach exposure records saved yet.',
    }] : []),
    {
      tab: 'authorizations',
      code: breachImportEnabled ? 'E4' : 'E3',
      label: 'Claim permissions',
      state: authorizationCount > 0 ? 'sealed' : 'empty',
      detail: authorizationCount > 0
        ? `${authorizationCount} category permission${authorizationCount === 1 ? '' : 's'} can support review.`
        : 'No category permission is active.',
    },
    {
      tab: 'settings',
      code: breachImportEnabled ? 'E5' : 'E4',
      label: 'Shadow filing posture',
      state: mode === 'live' ? 'review' : 'sealed',
      detail: mode === 'live' ? 'Live filing is enabled and should stay under review.' : 'Shadow mode keeps preparation and activity records first.',
    },
  ];

  return (
    <section className="exhibit-index" aria-label="Profile exhibit index">
      <div className="exhibit-index-head">
        <div>
          <div className="exhibit-index-kicker">Profile details</div>
          <h2>Saved fact summary</h2>
          <p>
            {settlementSearchEnabled
              ? 'Each item maps to facts ClaimBot can use for matching, permission checks, manual proof review, and filing posture. Empty items do not imply eligibility.'
              : 'Each item maps to facts ClaimBot can use for scoped claim review, permission checks, manual proof review, and filing posture. Empty items do not imply eligibility.'}
          </p>
        </div>
        <span className="tag blue">Read-only</span>
      </div>
      <div className="exhibit-index-grid">
        {exhibits.map((item) => (
          <button
            key={item.code}
            type="button"
            className={`exhibit-chip ${item.state}`}
            onClick={() => onSelectTab(item.tab)}
          >
            <span className="exhibit-code">{item.code}</span>
            <span className="exhibit-copy">
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function FactsFirstCharter() {
  const rows = [
    {
      label: 'Facts only',
      detail: 'ClaimBot stores the facts you enter and will not fabricate purchases, breaches, addresses, or eligibility.',
    },
    {
      label: 'Review-locked proof',
      detail: 'Claims that require documents, purchase records, or manual evidence stay in review until proof is handled.',
    },
    {
      label: 'Active permission',
      detail: 'Only categories you explicitly allow can move forward; disabled categories stay blocked.',
    },
    {
      label: 'Shadow mode default',
      detail: 'Filing starts as preparation with activity records unless live filing has been deliberately enabled.',
    },
  ];

  return (
    <section className="facts-charter" aria-label="Facts-first charter">
      <div className="facts-charter-head">
        <div>
          <div className="eyebrow">Facts-first charter</div>
          <h2>We start with a facts-only promise</h2>
        </div>
        <span className="tag good">Protective intake</span>
      </div>
      <div className="facts-charter-grid">
        {rows.map((row) => (
          <div className="facts-charter-item" key={row.label}>
            <span className="readiness-dot pass" aria-hidden="true" />
            <div>
              <strong>{row.label}</strong>
              <p>{row.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProfileReadiness({
  bootstrap,
  breachImportEnabled,
  settlementSearchEnabled,
  onSelectTab,
}: {
  bootstrap: ProfileBootstrap | null;
  breachImportEnabled: boolean;
  settlementSearchEnabled: boolean;
  onSelectTab: (tab: string) => void;
}) {
  const profile = bootstrap?.profile;
  const profileComplete = Boolean(profile?.legalName && (profile.emails || profile.phones));
  const purchaseCount = bootstrap?.purchases.length ?? 0;
  const stagedProofCount = bootstrap?.purchases.filter((purchase) => purchase.receiptPath).length ?? 0;
  const breachCount = bootstrap?.breaches.length ?? 0;
  const authorizationCount = Object.values(bootstrap?.authorizations ?? {}).filter(Boolean).length;
  const mode = bootstrap?.settings.claimFilerMode ?? 'shadow';
  const readinessItems = [
    {
      key: 'info',
      label: 'Profile facts',
      value: profileComplete ? 'Ready' : 'Needs basics',
      detail: profileComplete ? 'Legal name and contact facts are available.' : 'Add legal name plus email or phone.',
      status: profileComplete ? 'pass' : 'warn',
    },
    {
      key: 'purchases',
      label: 'Purchase evidence',
      value: `${purchaseCount}`,
      detail: purchaseCount > 0
        ? `${stagedProofCount} document reference${stagedProofCount === 1 ? '' : 's'} saved for manual proof review.`
        : 'Add brands, services, purchase dates, and optional proof references.',
      status: purchaseCount > 0 ? 'pass' : 'warn',
    },
    ...(breachImportEnabled ? [{
      key: 'breaches',
      label: 'Breach evidence',
      value: `${breachCount}`,
      detail: breachCount > 0 ? 'Breach exposure can support data incident matches.' : 'Optional for enabled breach settlements.',
      status: breachCount > 0 ? 'pass' : 'warn',
    }] : []),
    {
      key: 'authorizations',
      label: 'Permissions',
      value: `${authorizationCount}`,
      detail: authorizationCount > 0 ? 'Active permissions can support review.' : 'Enable categories only when facts are true.',
      status: authorizationCount > 0 ? 'pass' : 'warn',
    },
    {
      key: 'settings',
      label: 'Filing posture',
      value: mode === 'live' ? 'Live' : 'Shadow',
      detail: mode === 'live' ? 'Live filing is enabled for reviewed claims.' : 'Forms prepare without submitting by default.',
      status: mode === 'live' ? 'warn' : 'pass',
    },
  ];

  const nextStep =
    !profileComplete ? 'Complete profile facts' :
    purchaseCount === 0 && (!breachImportEnabled || breachCount === 0) ? (settlementSearchEnabled ? 'Add matching evidence' : 'Add scoped-review evidence') :
    authorizationCount === 0 ? 'Choose permissions' :
    'Review ready matches';

  return (
    <section className="profile-readiness" aria-label="Profile readiness summary">
      <div className="profile-readiness-head">
        <div>
          <div className="eyebrow">Intake progress</div>
          <h2>{nextStep}</h2>
          <p>
            {settlementSearchEnabled
              ? 'ClaimBot only uses saved facts, active category attestations, and the current filing posture when it decides whether a claim can move forward.'
              : 'ClaimBot only uses saved facts, active category attestations, scoped opportunity records, and the current filing posture when it decides whether a claim can move forward.'}
          </p>
        </div>
        <span className={`mode-badge ${mode === 'live' ? 'live' : 'shadow'}`}>
          {mode === 'live' ? 'Live mode' : 'Shadow mode'}
        </span>
      </div>
      <div className="profile-readiness-grid">
        {readinessItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`profile-readiness-card ${item.status}`}
            onClick={() => onSelectTab(item.key)}
          >
            <span className={`readiness-dot ${item.status}`} aria-hidden="true" />
            <span>
              <strong>{item.label}</strong>
              <b>{item.value}</b>
              <small>{item.detail}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TabInfo({
  initial,
  settlementSearchEnabled,
}: {
  initial?: ProfileBootstrap['profile'];
  settlementSearchEnabled: boolean;
}) {
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [emails, setEmails] = useState('');
  const [phones, setPhones] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState<SaveFeedback>(null);

  useEffect(() => {
    if (!initial) return;
    setName(initial.legalName);
    setDob(initial.dateOfBirth);
    setEmails(initial.emails);
    setPhones(initial.phones);
    setStreet(initial.street);
    setCity(initial.city);
    setState(initial.state);
    setZip(initial.zip);
  }, [initial]);

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    const fd = new FormData();
    fd.append('legalName', name);
    fd.append('dateOfBirth', dob);
    fd.append('emails', emails);
    fd.append('phones', phones);
    fd.append('addressesJson', JSON.stringify([{ street, city, state, zip, country: 'US' }].filter((a) => a.street)));
    const result = await postForm('/api/setup/profile', fd);
    setSaving(false);
    if (!result.ok) {
      setSaved(false);
      setFeedback({ type: 'error', text: result.error });
      return;
    }
    setFeedback({ type: 'success', text: 'Profile saved. Matching will refresh using these facts.' });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="card form">
      <div className="form-card-head">
        <h3>Personal information</h3>
        <p className="muted small">
          {settlementSearchEnabled
            ? 'Used for matching and for claim forms you allow.'
            : 'Used for scoped claim review and for claim forms you allow.'}
        </p>
      </div>
      <div>
        <label>Your full legal name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Q. Doe" />
        <div className="hint">Use the name that should appear on official claim forms.</div>
      </div>
      <div>
        <label>Date of birth</label>
        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        <div className="hint">
          {settlementSearchEnabled
            ? 'Some settlements use age or residency dates for eligibility.'
            : 'Some scoped opportunities use age or residency dates for eligibility.'}
        </div>
      </div>
      <div>
        <label>Email address(es)</label>
        <input type="text" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="jane@example.com" />
        <div className="hint">Separate multiple emails with commas for breach and contact matching.</div>
      </div>
      <div>
        <label>Phone number</label>
        <input type="tel" value={phones} onChange={(e) => setPhones(e.target.value)} placeholder="555-123-4567" />
      </div>
      <div>
        <h3>Mailing address</h3>
        <p className="muted small">
          {settlementSearchEnabled
            ? 'Used when a settlement requires a payment address.'
            : 'Used when a scoped claim opportunity requires a payment address.'}
        </p>
      </div>
      <input type="text" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123 Main Street" />
      <div className="field-grid">
        <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
        <div className="field-grid">
          <input type="text" value={state} onChange={(e) => setState(e.target.value)} placeholder="State" />
          <input type="text" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="Zip" />
        </div>
      </div>
      <button className="btn" type="button" onClick={save} disabled={saving}>
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save profile'}
      </button>
      <SaveNotice feedback={feedback} />
    </div>
  );
}

function TabPurchases({
  initial,
  breachImportEnabled,
  settlementSearchEnabled,
}: {
  initial: ProfileBootstrap['purchases'];
  breachImportEnabled: boolean;
  settlementSearchEnabled: boolean;
}) {
  const [merchant, setMerchant] = useState('');
  const [product, setProduct] = useState('');
  const [category, setCategory] = useState('CONSUMER_PRODUCT_PURCHASE');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptPath, setReceiptPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [purchases, setPurchases] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<SaveFeedback>(null);

  const cats = enabledCategories(breachImportEnabled);

  useEffect(() => {
    setPurchases(initial.map((purchase) => `${purchase.label}${purchase.date ? ` - ${purchase.date}` : ''}`));
  }, [initial]);

  const add = async () => {
    if (!merchant || !date) return;
    setSaving(true);
    setFeedback(null);
    const fd = new FormData();
    fd.append('merchant', merchant);
    fd.append('productName', product);
    fd.append('category', category);
    fd.append('purchaseDate', date);
    fd.append('amount', amount);
    fd.append('receiptPath', receiptPath);
    const result = await postForm('/api/setup/purchase', fd);
    setSaving(false);
    if (!result.ok) {
      setFeedback({ type: 'error', text: result.error });
      return;
    }
    setPurchases((prev) => [...prev, `${merchant} - ${date}${receiptPath ? ' - document note saved' : ''}`]);
    setFeedback({ type: 'success', text: 'Purchase added for settlement matching.' });
    setMerchant('');
    setProduct('');
    setDate('');
    setAmount('');
    setReceiptPath('');
  };

  return (
    <div className="card form">
      <div className="form-card-head">
        <h3>Purchases</h3>
        <p className="muted small">
          {settlementSearchEnabled
            ? 'Add brands, products, and dates that can support settlement matching.'
            : 'Add brands, products, and dates that can support scoped claim review.'}
        </p>
      </div>
      <div>
        <label>Company or brand name</label>
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Amazon, RevitaLash, Google Play" />
      </div>
      <div>
        <label>Product or service</label>
        <input type="text" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="What did you buy?" />
      </div>
      <div>
        <label>Purchase type</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {cats.map((c) => <option key={c} value={c}>{FRIENDLY_CATEGORIES[c] ?? c}</option>)}
        </select>
      </div>
      <div className="field-grid">
        <div>
          <label>Purchase date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label>Amount</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.01" placeholder="Optional" />
        </div>
      </div>
      <div>
        <label>Document note or secure link</label>
        <input
          type="text"
          value={receiptPath}
          onChange={(e) => setReceiptPath(e.target.value)}
          placeholder="Optional note, order number, or secure link"
        />
        <div className="hint">Used for manual proof review. It does not bypass proof-required claim checks.</div>
      </div>
      <button className="btn" type="button" onClick={add} disabled={saving}>
        {saving ? 'Adding...' : 'Add purchase'}
      </button>
      <SaveNotice feedback={feedback} />
      {purchases.length > 0 && (
        <div>
          <h3>Saved purchase facts</h3>
          <div className="status-row">
            {purchases.map((p, i) => <span key={i} className="tag green">{p}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function TabBreaches({ initial }: { initial: ProfileBootstrap['breaches'] }) {
  const [breach, setBreach] = useState('');
  const [email, setEmail] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<SaveFeedback>(null);

  useEffect(() => {
    setAdded(initial.map((breachFact) => `${breachFact.label}${breachFact.date ? ` - ${breachFact.date}` : ''}`));
  }, [initial]);

  const add = async () => {
    if (!breach || !email) return;
    setSaving(true);
    setFeedback(null);
    const fd = new FormData();
    fd.append('breachName', breach);
    fd.append('email', email);
    fd.append('breachDate', date);
    const result = await postForm('/api/setup/breach', fd);
    setSaving(false);
    if (!result.ok) {
      setFeedback({ type: 'error', text: result.error });
      return;
    }
    setAdded((prev) => [...prev, `${breach} (${email})`]);
    setFeedback({ type: 'success', text: 'Breach exposure added for matching.' });
    setBreach('');
    setEmail('');
    setDate('');
  };

  return (
    <div className="card form">
      <div className="form-card-head">
        <h3>Data breach exposure</h3>
        <p className="muted small">
          Record breach exposure that may support data breach settlement matching.
        </p>
      </div>
      <div>
        <label>Breach name</label>
        <input type="text" value={breach} onChange={(e) => setBreach(e.target.value)} placeholder="LinkedIn, Facebook, LastPass, Equifax" />
      </div>
      <div>
        <label>Exposed email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
      </div>
      <div>
        <label>Breach date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="hint">Optional. Add it when the breach notice or source includes a date.</div>
      </div>
      <button className="btn" type="button" onClick={add} disabled={saving}>
        {saving ? 'Adding...' : 'Add breach'}
      </button>
      <SaveNotice feedback={feedback} />
      {added.length > 0 && (
        <div>
          <h3>Saved breach facts</h3>
          <div className="status-row">
            {added.map((a, i) => <span key={i} className="tag yellow">{a}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function TabAuthorizations({
  initial,
  breachImportEnabled,
}: {
  initial: ProfileBootstrap['authorizations'];
  breachImportEnabled: boolean;
}) {
  const cats = enabledCategories(breachImportEnabled);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState<SaveFeedback>(null);

  useEffect(() => {
    setEnabled(initial);
  }, [initial]);

  const toggle = (cat: string) => setEnabled((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const saveAll = async () => {
    setSaving(true);
    setFeedback(null);
    let enabledCount = 0;
    let revokedCount = 0;
    for (const cat of cats) {
      const wasEnabled = Boolean(initial[cat]);
      const isEnabled = Boolean(enabled[cat]);
      if (!wasEnabled && !isEnabled) continue;

      const fd = new FormData();
      fd.append('category', cat);
      if (isEnabled) {
        fd.append('enabled', 'on');
        fd.append('manualConsent', 'on');
        fd.append('attestationText', ATTESTATION_TEMPLATES[cat] ?? '');
      }

      const result = await postForm('/api/setup/authorization', fd);
      if (!result.ok) {
        setSaving(false);
        setSaved(false);
        setFeedback({ type: 'error', text: result.error });
        return;
      }
      if (isEnabled) enabledCount++;
      if (wasEnabled && !isEnabled) revokedCount++;
    }
    setSaving(false);
    if (enabledCount === 0 && revokedCount === 0) {
      setSaved(false);
      setFeedback({ type: 'error', text: 'Choose at least one permission category or change an existing permission before saving.' });
      return;
    }
    const parts = [
      enabledCount > 0 ? `${enabledCount} enabled` : '',
      revokedCount > 0 ? `${revokedCount} revoked` : '',
    ].filter(Boolean);
    setFeedback({ type: 'success', text: `Permissions saved and audited: ${parts.join(', ')}.` });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="card form">
      <div className="form-card-head">
        <h3>Claim permissions</h3>
        <p className="muted small">
          Enable only categories where the stored profile facts are true and can support a claim.
          Unchecking a saved category revokes that permission and blocks new claim tracking.
        </p>
      </div>
      <div className="stack-list">
        {cats.map((cat) => (
          <label key={cat} className={`authorization-option ${enabled[cat] ? 'enabled' : ''}`}>
            <input type="checkbox" checked={!!enabled[cat]} onChange={() => toggle(cat)} />
            <span>
              <strong>{FRIENDLY_CATEGORIES[cat] ?? cat}</strong>
              <span className="muted small">{CATEGORY_DESCRIPTIONS[cat] ?? ''}</span>
              {enabled[cat] && (
                <span className="notice authorization-attestation">
                  {ATTESTATION_TEMPLATES[cat]}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
      <button className="btn" type="button" onClick={saveAll} disabled={saving}>
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save permissions'}
      </button>
      <SaveNotice feedback={feedback} />
    </div>
  );
}

function TabSettings({
  initial,
  breachImportEnabled,
  liveFilingEnabled,
}: {
  initial?: ProfileBootstrap['settings'];
  breachImportEnabled: boolean;
  liveFilingEnabled: boolean;
}) {
  const [webhook, setWebhook] = useState('');
  const [hibp, setHibp] = useState('');
  const [mode, setMode] = useState('shadow');
  const [liveAck, setLiveAck] = useState(false);
  const [maxDay, setMaxDay] = useState('20');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState<SaveFeedback>(null);

  useEffect(() => {
    if (!initial) return;
    setWebhook('');
    setHibp('');
    setMode(liveFilingEnabled ? initial.claimFilerMode : 'shadow');
    setLiveAck(liveFilingEnabled ? initial.claimFilerLiveAck : false);
    setMaxDay(initial.claimFilerMaxPerDay);
  }, [initial, liveFilingEnabled]);

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    if (mode === 'live' && !liveFilingEnabled) {
      setSaving(false);
      setFeedback({ type: 'error', text: 'Live filing controls are disabled for this workspace.' });
      return;
    }

    const fd = new FormData();
    if (webhook.trim()) fd.append('discord_webhook_url', webhook);
    if (hibp.trim()) fd.append('hibp_api_key', hibp);
    fd.append('claim_filer_mode', mode);
    if (liveAck) fd.append('claim_filer_live_ack', 'reviewed');
    fd.append('claim_filer_max_per_day', maxDay);
    const result = await postForm('/api/settings/save', fd);
    setSaving(false);
    if (!result.ok) {
      setSaved(false);
      setFeedback({ type: 'error', text: result.error });
      return;
    }
    setFeedback({ type: 'success', text: 'Runtime settings saved.' });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="card form">
      <div className="form-card-head">
        <h3>Profile settings</h3>
        <p className="muted small">These mirror the global runtime settings for this local single-user build.</p>
      </div>
      <div>
        <label>Discord notifications</label>
        <input type="text" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="Paste your Discord webhook URL" />
        <div className="hint">
          {initial?.discordWebhookConfigured ? 'Webhook is configured. Leave blank to keep the existing value.' : 'Optional notification destination.'}
        </div>
      </div>
      {breachImportEnabled ? (
        <div>
          <label>HIBP API key</label>
          <input type="text" value={hibp} onChange={(e) => setHibp(e.target.value)} placeholder="Optional breach import key" />
          <div className="hint">
            {initial?.hibpApiKeyConfigured ? 'HIBP key is configured. Leave blank to keep the existing value.' : 'Optional breach import key.'}
          </div>
        </div>
      ) : (
        <div className="notice">
          <h3>Breach import disabled</h3>
          <p>HIBP settings are hidden because breach evidence intake is disabled for this workspace.</p>
        </div>
      )}
      <div>
        <label>Claim filing mode</label>
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="shadow">Shadow - prepare without submitting</option>
          {liveFilingEnabled && <option value="live">Live - guarded submission after final checks</option>}
        </select>
        <div className="hint">
          {liveFilingEnabled
            ? 'Start in shadow mode until the intake and matcher evidence look right.'
            : 'Live filing controls are disabled for this workspace.'}
        </div>
      </div>
      <label className="notice warn safe-check-row">
        <input
          type="checkbox"
          checked={liveAck}
          onChange={(e) => setLiveAck(e.target.checked)}
          disabled={!liveFilingEnabled}
        />
        <span>
          <strong>Live-mode acknowledgement</strong>
          <span className="small">
            Required before live mode can be saved. Review matcher evidence, proof checks,
            permissions, daily cap, and shadow output first.
          </span>
        </span>
      </label>
      <div>
        <label>Max claims per day</label>
        <input type="number" value={maxDay} onChange={(e) => setMaxDay(e.target.value)} min="1" max="100" />
      </div>
      <button className="btn" type="button" onClick={save} disabled={saving}>
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save settings'}
      </button>
      <SaveNotice feedback={feedback} />
    </div>
  );
}
