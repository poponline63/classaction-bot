import { db, schema } from '@db/client';
import { SETTLEMENT_CATEGORIES, type SettlementCategory } from '@db/schema';
import { and, desc, eq, gte, ne, type SQL } from 'drizzle-orm';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { currentUserId } from '@lib/auth/current-user';
import { getMonthlyClaimAllowance, getUserSubscription } from '@lib/billing/entitlements';
import { evaluateQueueReadiness } from '@lib/claim-filer/queue-readiness';
import { QUEUE_BOUNDARY_ACK, QUEUE_TRUST_LOCK_ACK } from '@lib/claim-filer/request-boundary';
import { currentMode } from '@lib/claim-filer/submit';
import { isClientFeatureEnabled, isSettlementCategoryEnabled } from '@lib/features';
import { queueClaimFromMatch } from '../actions';
import SearchBar from './SearchBar';
import FileAllButton from '../FileAllButton';
import SettlementDiscoveryBrowser, { type SettlementDiscoveryBrowserRow } from './SettlementDiscoveryBrowser';

export const dynamic = 'force-dynamic';

interface SearchParams {
  category?: string;
  proof?: string;
  upcoming?: string;
  show?: string;
}

function daysUntil(d: Date | null | undefined) {
  if (!d) return null;
  return Math.floor((d.getTime() - Date.now()) / 86_400_000);
}

function deadlineBadge(d: Date | null | undefined) {
  const days = daysUntil(d);
  if (days === null) return null;
  if (days < 0) return { text: 'Expired', cls: 'bad' };
  if (days < 7) return { text: `${days}d left`, cls: 'bad' };
  if (days < 30) return { text: `${days}d left`, cls: 'warn' };
  return { text: `${days}d left`, cls: 'green' };
}

function fmtSourceDate(d: Date | null | undefined) {
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not recorded';
}

const FRIENDLY_CATEGORIES: Record<string, string> = {
  CONSUMER_PRODUCT_PURCHASE: 'Product purchase',
  SUBSCRIPTION_SERVICE: 'Subscription',
  DATA_BREACH: 'Data breach',
  ROBOCALL_TCPA: 'Unwanted calls',
  DECEPTIVE_ADVERTISING: 'False advertising',
  AUTO_DEFECT: 'Vehicle issue',
  EMPLOYMENT: 'Employment',
  UNKNOWN: 'Other',
};

const FRIENDLY_SOURCES: Record<string, string> = {
  classaction_org: 'ClassAction.org',
  top_class_actions: 'Top Class Actions',
  manual: 'Manual intake',
};

function matchBoundary(match: { verdict: string } | undefined) {
  if (!match) {
    return {
      title: 'Source record only',
      detail: 'This settlement still needs user-specific matching before eligibility language appears.',
    };
  }
  if (match.verdict === 'ELIGIBLE') {
    return {
      title: 'Profile match found',
      detail: 'Saved profile facts currently support a possible match; claim checks still apply.',
    };
  }
  if (match.verdict === 'NEEDS_REVIEW') {
    return {
      title: 'Evidence review needed',
      detail: 'ClaimBot needs more user facts or proof review before treating this as queue-ready.',
    };
  }
  return {
    title: 'Not a current fit',
    detail: 'The saved profile does not currently support this settlement as a possible match.',
  };
}

export default async function SettlementsPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH')) {
    return (
      <>
        <div className="page-header">
          <div>
            <div className="eyebrow">Settlement discovery</div>
            <h1>Settlements</h1>
            <p>
              Settlement browsing is disabled for this workspace. Matching and claim review
              can stay available while source data is prepared.
            </p>
          </div>
          <div className="page-actions">
            <Link className="btn ghost" href="/review">Review matches</Link>
            <Link className="btn ghost" href="/settings">Review settings</Link>
          </div>
        </div>
        <div className="notice warn">
          <h3>Settlement browsing is turned off</h3>
          <p>
            ClaimBot can turn on settlement browsing after the deployment is ready for customer search.
            Until then, use Review for assigned matches and claim opportunities.
          </p>
        </div>
      </>
    );
  }

  const userId = await currentUserId();
  const subscription = await getUserSubscription(userId);
  const claimAllowance = await getMonthlyClaimAllowance(userId, { subscription });
  const filingMode = await currentMode();
  const showFilter = searchParams.show ?? 'eligible';

  const where: SQL[] = [];
  if (!isSettlementCategoryEnabled('DATA_BREACH')) {
    where.push(ne(schema.settlements.category, 'DATA_BREACH'));
  }
  if (searchParams.category && searchParams.category !== 'all') {
    if (isSettlementCategoryEnabled(searchParams.category)) {
      where.push(eq(schema.settlements.category, searchParams.category as SettlementCategory));
    }
  }
  if (searchParams.proof === 'false') where.push(eq(schema.settlements.proofRequired, false));
  if (searchParams.proof === 'true') where.push(eq(schema.settlements.proofRequired, true));
  if (searchParams.upcoming === 'true') where.push(gte(schema.settlements.deadline, new Date()));

  const settlements = await db
    .select()
    .from(schema.settlements)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(schema.settlements.discoveredAt))
    .limit(200);

  const matches = await db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.userId, userId));
  const matchMap = new Map(matches.map((m) => [m.settlementId, m]));

  const claims = await db
    .select()
    .from(schema.claims)
    .where(eq(schema.claims.userId, userId));
  const claimByMatch = new Map(claims.map((c) => [c.matchId, c]));

  const authorizations = await db
    .select()
    .from(schema.classAuthorizations)
    .where(eq(schema.classAuthorizations.userId, userId));
  const activeAuthCategories = new Set(
    authorizations
      .filter((auth) => auth.enabled && !auth.revokedAt)
      .map((auth) => auth.category),
  );
  const readinessBySettlementId = new Map(
    settlements.map((settlement) => {
      const match = matchMap.get(settlement.id);
      const claim = match ? claimByMatch.get(match.id) : null;
      return [settlement.id, evaluateQueueReadiness({
        verdict: match?.verdict,
        proofRequired: settlement.proofRequired,
        claimFormUrl: settlement.claimFormUrl,
        hasActiveAuthorization: activeAuthCategories.has(settlement.category),
        hasAutomationEntitlement: subscription.automationEnabled || claimAllowance.allowed,
        existingClaimId: claim?.id,
      })] as const;
    }),
  );

  let filtered = settlements;
  if (showFilter === 'eligible') {
    filtered = settlements.filter((s) => matchMap.get(s.id)?.verdict === 'ELIGIBLE');
  } else if (showFilter === 'review') {
    filtered = settlements.filter((s) => matchMap.get(s.id)?.verdict === 'NEEDS_REVIEW');
  }

  const eligibleCount = settlements.filter((s) => matchMap.get(s.id)?.verdict === 'ELIGIBLE').length;
  const reviewCount = settlements.filter((s) => matchMap.get(s.id)?.verdict === 'NEEDS_REVIEW').length;
  const queueReadyCount = settlements.filter((s) => readinessBySettlementId.get(s.id)?.canQueue).length;
  const proofRequiredCount = settlements.filter((s) => s.proofRequired).length;
  const missingFormCount = settlements.filter((s) => !s.claimFormUrl).length;
  const automationPlanNeededCount = settlements.filter((s) => readinessBySettlementId.get(s.id)?.label === 'Automation plan needed').length;
  const automationPlanStatus = subscription.automationEnabled ? 'Automation active' : 'Plan check';
  const claimFormCount = settlements.filter((s) => s.claimFormUrl).length;
  const sourceCount = new Set(settlements.map((s) => s.source)).size;
  const totalEnabledCategories = SETTLEMENT_CATEGORIES.filter((c) => c !== 'UNKNOWN' && isSettlementCategoryEnabled(c)).length;
  const categoriesCovered = new Set(settlements.map((s) => s.category)).size;
  const unscoredCount = settlements.filter((s) => !matchMap.has(s.id)).length;
  const expiringSoonCount = settlements.filter((s) => {
    const days = daysUntil(s.deadline);
    return days !== null && days >= 0 && days < 30;
  }).length;
  const latestDiscovery = settlements[0]?.discoveredAt;
  const coverageReadinessRows = [
    {
      title: 'Live source meter',
      detail: `${sourceCount} source provider${sourceCount === 1 ? '' : 's'} and ${categoriesCovered} of ${totalEnabledCategories} enabled categor${totalEnabledCategories === 1 ? 'y' : 'ies'} covered.`,
      tone: settlements.length > 0 ? 'pass' : 'warn',
    },
    {
      title: 'Discovery firewall',
      detail: `${unscoredCount} discovered settlement${unscoredCount === 1 ? '' : 's'} still need user-specific matching before eligibility language appears.`,
      tone: unscoredCount > 0 ? 'warn' : 'pass',
    },
    {
      title: 'Four-check tracker',
      detail: `Auth ${activeAuthCategories.size}, proof locked ${proofRequiredCount}, forms missing ${missingFormCount}, plan checks needed ${automationPlanNeededCount}.`,
      tone: proofRequiredCount + missingFormCount + automationPlanNeededCount > 0 ? 'warn' : 'pass',
    },
    {
      title: 'Shadow queue pill',
      detail: `${queueReadyCount} settlement${queueReadyCount === 1 ? '' : 's'} can enter shadow final checks after review; live filing remains a separate setting.`,
      tone: queueReadyCount > 0 ? 'pass' : 'warn',
    },
  ];
  const sourceBoundaryRows = [
    {
      label: 'Provenance',
      detail: settlements.length > 0
        ? `${sourceCount} source provider${sourceCount === 1 ? '' : 's'} represented in the current catalog.`
        : 'No source provenance is available until the catalog is loaded.',
      tone: settlements.length > 0 ? 'pass' : 'warn',
    },
    {
      label: 'Match bounds',
      detail: `${categoriesCovered} categor${categoriesCovered === 1 ? 'y' : 'ies'} represented; source discovery stays separate from user-specific matching.`,
      tone: categoriesCovered > 0 ? 'pass' : 'warn',
    },
    {
      label: 'Customer scope',
      detail: `${eligibleCount + reviewCount} record${eligibleCount + reviewCount === 1 ? '' : 's'} currently have user-specific matcher output.`,
      tone: eligibleCount + reviewCount > 0 ? 'pass' : 'warn',
    },
    {
      label: 'Source sync',
      detail: latestDiscovery
        ? `Latest source record discovered ${fmtSourceDate(latestDiscovery)}.`
        : 'Source sync has not produced a settlement record yet.',
      tone: latestDiscovery ? 'pass' : 'warn',
    },
  ];
  const settlementWorkflowAction = settlements.length === 0
    ? {
        href: '/launch',
        label: 'Open account status',
        detail: 'Load source records before treating discovery as customer-ready.',
      }
    : eligibleCount + reviewCount > 0
      ? {
          href: '/review',
          label: 'Review match context',
          detail: 'Check user-specific matches before any claim-tracking decision.',
        }
      : activeAuthCategories.size === 0
        ? {
            href: '/permissions',
            label: 'Save permissions',
            detail: 'Category permissions are required before tracking.',
          }
        : {
            href: '#settlement-results',
            label: 'Inspect source records',
            detail: 'Browse source manifests without treating records as filing permission.',
          };
  const settlementBrowserRows: SettlementDiscoveryBrowserRow[] = settlements.map((settlement) => {
    const match = matchMap.get(settlement.id);
    const claim = match ? claimByMatch.get(match.id) : null;
    const readiness = readinessBySettlementId.get(settlement.id)!;
    const boundary = matchBoundary(match);
    const deadline = deadlineBadge(settlement.deadline);
    const sourceLabel = FRIENDLY_SOURCES[settlement.source] ?? settlement.source;
    const matchLabel = match?.verdict === 'ELIGIBLE'
      ? 'Possible match'
      : match?.verdict === 'NEEDS_REVIEW'
        ? 'Needs review'
        : match
          ? 'Not a fit'
          : 'Source only';

    return {
      id: settlement.id,
      caseName: settlement.caseName,
      defendant: settlement.defendant,
      categoryLabel: FRIENDLY_CATEGORIES[settlement.category] ?? settlement.category,
      sourceLabel,
      sourceUrl: settlement.sourceUrl,
      discoveredAt: fmtSourceDate(settlement.discoveredAt),
      deadlineLabel: deadline?.text ?? 'No deadline recorded',
      payoutLabel: settlement.payoutEstimate
        ? `${settlement.payoutEstimate} projected only`
        : 'No source payout estimate',
      matchLabel,
      matchDetail: boundary.detail,
      readinessLabel: readiness.label,
      readinessDetail: readiness.detail,
      readinessTone: readiness.tone,
      authorizationActive: activeAuthCategories.has(settlement.category),
      proofRequired: settlement.proofRequired,
      claimFormAvailable: Boolean(settlement.claimFormUrl),
      automationEntitlementActive: subscription.automationEnabled,
      claimQueued: Boolean(claim),
    };
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Settlement discovery</div>
          <h1>Settlements</h1>
          <p>
            {settlements.length} settlements tracked, with {eligibleCount} that may match your profile
            and {reviewCount} waiting on more evidence.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn ghost" href="/review">Review matches</Link>
          <Link className="btn ghost" href="/profile">Update profile</Link>
        </div>
      </div>

      <section className={`settlement-workflow-ribbon ${filingMode === 'live' ? 'live' : 'shadow'}`} aria-label="Settlement Workflow Ribbon">
        <div className="settlement-workflow-ribbon-status">
          <span className={`settlement-workflow-ribbon-icon ${filingMode === 'live' ? 'warn' : 'pass'}`} aria-hidden="true">
            <ShieldCheck size={20} />
          </span>
          <div>
            <small>Status</small>
            <strong>{filingMode === 'live' ? 'Live guarded' : 'Shadow mode active'}</strong>
          </div>
        </div>
        <div className="settlement-workflow-ribbon-trust">
          <small>Trust boundary</small>
          <strong>Source records are not claim permission.</strong>
          <p>
            Trust source provenance, then require user-specific matching, permission, proof review,
            form availability, and activity records before tracking.
          </p>
        </div>
        <div className="settlement-workflow-ribbon-action">
          <small>Next safe action</small>
          <Link className="btn sm" href={settlementWorkflowAction.href}>
            {settlementWorkflowAction.label}
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
          <span>{settlementWorkflowAction.detail}</span>
        </div>
      </section>

      <section className="source-boundary-console" aria-label="Source and Boundary">
        <header className="source-boundary-console-head">
          <div>
            <div className="eyebrow">Source &amp; Boundary</div>
            <h2>Source records are not claim permission.</h2>
            <p>
              This console separates catalog provenance, match boundaries, customer scope, and source
              sync health before any settlement is treated as ready to track.
            </p>
          </div>
          <Link className="btn ghost" href="/review">Review match context</Link>
        </header>
        <div className="source-boundary-console-grid">
          {sourceBoundaryRows.map((row) => (
            <article className={`source-boundary-console-item ${row.tone}`} key={row.label}>
              <span className={`readiness-dot ${row.tone}`} aria-hidden="true" />
              <div>
                <strong>{row.label}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {eligibleCount > 0 && <FileAllButton eligible={eligibleCount} />}

      {settlements.length === 0 ? (
        <section className="settlement-zero-command dashboard-section section-flush" aria-label="Settlement empty-state command center">
          <div className="settlement-zero-main">
            <div>
              <div className="eyebrow">Catalog checks</div>
              <h2>Shadow Mode Active</h2>
              <div className="status-row settlement-zero-status" aria-label="Empty catalog posture">
                <span className="tag blue">Shadow default</span>
                <span className="tag green">Account history on</span>
                    <span className="tag yellow">Source data needed</span>
              </div>
              <p>
                No settlement source records are loaded yet. ClaimBot holds discovery, matching,
                and claim tracking until source data exists instead of pretending there are no relevant claims.
              </p>
            </div>
            <div className="settlement-zero-actions">
              <Link className="btn" href="/review">Review matches</Link>
              <Link className="btn ghost" href="/launch">Open account status</Link>
            </div>
          </div>
          <div className="settlement-zero-safety">
            <strong>Safety boundary</strong>
            <p>
              No claim is matched or dispatched without user category permission, proof-backed manual
              review, and your explicit dispatch approval. Shadow mode remains the default; every action
              is written to account history.
            </p>
            <p className="settlement-zero-provenance">
              Source provenance pending: settlement source, last-sync date, match boundary, and filing
              checks will appear on every source record after the catalog is loaded.
            </p>
          </div>
          <div className="settlement-zero-grid" aria-label="Empty catalog safety checks">
            <div>
              <span>01</span>
              <strong>Load source catalog</strong>
              <p>Import or scrape reviewed settlement notices before turning on customer discovery.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Profile facts first</strong>
              <p>Saved facts and active permissions decide whether a source record can become a review item.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Proof stays manual</strong>
              <p>Document or purchase-record requirements stay blocked until a user handles the evidence.</p>
            </div>
            <div>
              <span>04</span>
              <strong>Audit before dispatch</strong>
              <p>Review and queue actions are traceable before any live filing switch can matter.</p>
            </div>
          </div>
        </section>
      ) : (
        <section className="dashboard-section section-flush">
          <header className="section-header">
            <h2>Coverage summary</h2>
            <p className="muted">
              Discovery records are separated from filing checks so source browsing never implies
              a claim is ready before proof, form, permission, and plan checks pass.
            </p>
          </header>
          <div className="settlement-stage-stack" aria-label="Settlement coverage summary">
            <div className="settlement-stage">
              <div className="settlement-stage-head">
                <span>Stage 1</span>
                <strong>Discovery</strong>
              </div>
              <div className="stats-grid compact">
                <div className={`stat-card ${eligibleCount > 0 ? 'needs-review' : ''}`}>
                  <div className="stat-label">May match profile</div>
                  <Link href="/settlements?show=eligible" className="stat-value stat-value-link green">{eligibleCount}</Link>
                  <p className="stat-note">Source record found; user-specific checks still apply.</p>
                </div>
              </div>
            </div>
            <div className="settlement-stage-divider" aria-hidden="true" />
            <div className="settlement-stage">
              <div className="settlement-stage-head">
                <span>Stage 2</span>
                <strong>Readiness checks</strong>
              </div>
              <div className="stats-grid compact readiness-gate-grid">
                <div className={`stat-card ${reviewCount > 0 ? 'needs-review' : ''}`}>
                  <div className="stat-label">Needs review</div>
                  <Link href="/settlements?show=review" className="stat-value stat-value-link warn">{reviewCount}</Link>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Ready for checks</div>
                  <div className="stat-value blue">{queueReadyCount}</div>
                </div>
                <div className={`stat-card ${automationPlanNeededCount > 0 ? 'needs-review' : ''}`}>
                  <div className="stat-label">Automation plan</div>
                  <Link href="/pricing" className={`stat-value stat-value-link ${subscription.automationEnabled ? 'green' : 'warn'}`}>
                    {automationPlanStatus}
                  </Link>
                  <p className="stat-note">
                    {subscription.automationEnabled
                      ? 'Permissioned filing access is available after proof and authority checks pass.'
                      : 'Free accounts include 5 permissioned filings per month.'}
                  </p>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Expiring under 30 days</div>
                  <div className={`stat-value ${expiringSoonCount > 0 ? 'warn' : 'text'}`}>{expiringSoonCount}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="trust-strip">
            <div className="trust-item">
              <strong>{proofRequiredCount} proof-required</strong>
              <span>These stay in review until supporting documents are handled.</span>
            </div>
            <div className="trust-item">
              <strong>{missingFormCount} missing forms</strong>
              <span>Claims cannot enter final checks until a form URL exists.</span>
            </div>
            <div className="trust-item">
              <strong>{activeAuthCategories.size} active permissions</strong>
              <span>Category attestations are checked before every queue action.</span>
            </div>
            <div className="trust-item">
              <strong>{subscription.automationEnabled ? 'Paid automation enabled' : `${automationPlanNeededCount} plan check${automationPlanNeededCount === 1 ? '' : 's'} needed`}</strong>
              <span>Free accounts include 5 permissioned filings per month; paid plans remove the cap.</span>
            </div>
            <div className="trust-item">
              <strong>Shadow default</strong>
              <span>Queued claims still prepare without submitting unless live mode is reviewed.</span>
            </div>
          </div>
        </section>
      )}

      <section className="settlement-readiness-bar" aria-label="Settlement Coverage and Readiness">
        <header className="settlement-readiness-head">
          <div>
            <div className="eyebrow">Source trust layer</div>
            <h2>Settlement Coverage &amp; Readiness</h2>
            <p>
              Discovery only means ClaimBot found a source record. Claim readiness still depends on
              user-specific matching, permission, proof rules, form availability, and plan checks.
            </p>
          </div>
          <span className="mode-badge shadow">Shadow queue</span>
        </header>
        <div className="settlement-readiness-grid">
          {coverageReadinessRows.map((row) => (
            <article className={`settlement-readiness-item ${row.tone}`} key={row.title}>
              <span className={`readiness-dot ${row.tone}`} aria-hidden="true" />
              <div>
                <strong>{row.title}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <header className="section-header">
          <h2>Discovery health</h2>
          <p className="muted">
            Settlement source records must exist before customers can inspect matches. Empty catalogs mean
            source data is still missing, not proof that no claims pertain to the user.
          </p>
        </header>
        <div className="stats-grid" aria-label="Settlement discovery health">
          <div className={`stat-card ${settlements.length === 0 ? 'needs-review' : ''}`}>
            <div className="stat-label">Source catalog</div>
            <div className={`stat-value ${settlements.length > 0 ? 'green' : 'warn'}`}>{settlements.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Source providers</div>
            <div className="stat-value text">{sourceCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Forms linked</div>
            <div className="stat-value text">{claimFormCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Latest discovery</div>
            <div className="stat-value text">{latestDiscovery ? latestDiscovery.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'None'}</div>
          </div>
        </div>
        {settlements.length === 0 && (
          <div className="notice warn notice-followup">
            <h3>Source catalog empty</h3>
            <p>
              Load settlement sources before turning on customer discovery. Until then, profile intake, permissions,
              review checks, and shadow-mode safeguards remain available, but ClaimBot cannot discover
              possible claims from an empty catalog.
            </p>
            <div className="status-row">
              <Link className="btn ghost sm" href="/launch">Open account status</Link>
              <Link className="btn ghost sm" href="/settings">Check source settings</Link>
              <Link className="btn ghost sm" href="/profile">Prepare profile evidence</Link>
            </div>
          </div>
        )}
      </section>

      <div id="settlement-results" />

      <SettlementDiscoveryBrowser rows={settlementBrowserRows} />

      <SearchBar />

      <div className="tabs">
        <Link href="/settlements?show=all" className={`tab ${showFilter === 'all' ? 'active' : ''}`}>
          All ({settlements.length})
        </Link>
        <Link href="/settlements?show=eligible" className={`tab ${showFilter === 'eligible' ? 'active' : ''}`}>
          Possible match ({eligibleCount})
        </Link>
        <Link href="/settlements?show=review" className={`tab ${showFilter === 'review' ? 'active' : ''}`}>
          Needs review ({reviewCount})
        </Link>
      </div>

      <form className="filter-bar" method="get">
        <input type="hidden" name="show" value={showFilter} />
        <select name="category" defaultValue={searchParams.category ?? 'all'}>
          <option value="all">All categories</option>
          {SETTLEMENT_CATEGORIES.filter((c) => isSettlementCategoryEnabled(c)).map((c) => (
            <option key={c} value={c}>{FRIENDLY_CATEGORIES[c] ?? c}</option>
          ))}
        </select>
        <select name="proof" defaultValue={searchParams.proof ?? 'any'}>
          <option value="any">Any proof status</option>
          <option value="false">No proof required</option>
          <option value="true">Proof required</option>
        </select>
        <button type="submit">Filter</button>
      </form>

      {filtered.length === 0 ? (
        <div className="empty">
          {settlements.length === 0 ? (
            <>
              <h3>No settlement sources loaded</h3>
              <p>
                Load settlement source data before treating this workspace as ready for customer
                settlement discovery.
              </p>
            </>
          ) : (
            <>
              <h3>No settlements match your filters</h3>
              <p>
                Try changing the filters or <Link href="/setup">complete your profile</Link> to refresh
                match quality.
              </p>
            </>
          )}
        </div>
      ) : (
        filtered.map((s) => {
          const match = matchMap.get(s.id);
          const claim = match ? claimByMatch.get(match.id) : null;
          const deadline = deadlineBadge(s.deadline);
          const readiness = readinessBySettlementId.get(s.id)!;
          const boundary = matchBoundary(match);
          const sourceLabel = FRIENDLY_SOURCES[s.source] ?? s.source;

          return (
            <div key={s.id} className="card">
              <div className="workflow-card-head">
                <div className="workflow-card-main">
                  <h3>
                    <Link href={`/settlements/${s.id}`}>{s.caseName}</Link>
                  </h3>
                  <p className="workflow-card-detail">
                    {s.classDefinition.slice(0, 160)}...
                  </p>
                  <div className="status-row">
                    <span className="tag">{FRIENDLY_CATEGORIES[s.category] ?? s.category}</span>
                    {!s.proofRequired ? (
                      <span className="tag green">No proof required</span>
                    ) : (
                      <span className="tag yellow">Proof required</span>
                    )}
                    {deadline && <span className={`tag ${deadline.cls}`}>{deadline.text}</span>}
                    {match?.verdict === 'ELIGIBLE' && (
                      <span className="tag green">Possible match</span>
                    )}
                    {match?.verdict === 'NEEDS_REVIEW' && (
                      <span className="tag yellow">Needs review</span>
                    )}
                    {claim && (
                      <span className="tag blue">Claim queued</span>
                    )}
                    <span className={`tag ${readiness.tone}`}>{readiness.label}</span>
                    {!match && <span className="tag warn">Discovered not eligible</span>}
                  </div>
                  <div className="gate-pill-row" aria-label="Settlement claim checks">
                    <span className={`gate-pill ${activeAuthCategories.has(s.category) ? 'pass' : 'warn'}`}>
                      Auth
                    </span>
                    <span className={`gate-pill ${s.proofRequired ? 'warn' : 'pass'}`}>
                      Proof
                    </span>
                    <span className={`gate-pill ${s.claimFormUrl ? 'pass' : 'warn'}`}>
                      Form
                    </span>
                    <span className={`gate-pill ${subscription.automationEnabled ? 'pass' : 'warn'}`}>
                      Plan
                    </span>
                  </div>
                  <div className="settlement-source-manifest" aria-label="Eligibility and source manifest">
                    <div className="settlement-source-manifest-head">
                      <strong>Source manifest</strong>
                      <Link href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
                        Open source
                      </Link>
                    </div>
                    <div className="settlement-source-manifest-grid">
                      <div>
                        <span>Catalog source</span>
                        <strong>{sourceLabel}</strong>
                        <small>Discovered {fmtSourceDate(s.discoveredAt)}</small>
                      </div>
                      <div>
                        <span>Match boundary</span>
                        <strong>{boundary.title}</strong>
                        <small>{boundary.detail}</small>
                      </div>
                      <div>
                        <span>Filing checks</span>
                        <strong>{readiness.label}</strong>
                        <small>{readiness.detail}</small>
                      </div>
                      <div>
                        <span>Value note</span>
                        <strong>{s.payoutEstimate ? 'Projected only' : 'No estimate'}</strong>
                        <small>No payout is promised; final eligibility and award depend on the settlement administrator.</small>
                      </div>
                    </div>
                  </div>
                  {match && (
                    <div className={`queue-readiness compact ${readiness.status}`}>
                      <strong>{readiness.label}</strong>
                      <span>{readiness.detail}</span>
                      {!readiness.canQueue && readiness.label === 'Permission needed' && (
                        <Link href="/permissions">Manage permissions</Link>
                      )}
                      {!readiness.canQueue && readiness.label === 'Automation plan needed' && (
                        <Link href="/pricing">View automation plans</Link>
                      )}
                    </div>
                  )}
                </div>
                <div className="workflow-card-actions">
                  {s.payoutEstimate && (
                    <div className="workflow-card-payout">
                      <span>{s.payoutEstimate}</span>
                      <small>Projected, not guaranteed</small>
                    </div>
                  )}
                  {readiness.canQueue && match && (
                    <form action={queueClaimFromMatch} className="inline-form queue-trust-lock-form">
                      <input type="hidden" name="matchId" value={match.id} />
                      <input type="hidden" name="queueBoundaryAck" value={QUEUE_BOUNDARY_ACK} />
                      <div className="queue-trust-lock compact" aria-label="Trust Lock before tracking">
                        <strong>Trust Lock</strong>
                        <label>
                          <input type="checkbox" name="queueTrustLock" value={QUEUE_TRUST_LOCK_ACK} required />
                          <span>Reviewed; proof-required claims stay manual.</span>
                        </label>
                      </div>
                      <button className="btn sm" type="submit">Track claim</button>
                    </form>
                  )}
                  {claim && (
                    <Link href={`/claims/${claim.id}`} className="btn sm ghost">
                      View claim
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
