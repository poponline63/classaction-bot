import Link from 'next/link';
import { db, schema } from '@db/client';
import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import { isClientFeatureEnabled } from '@lib/features';
import { currentUserId } from '@lib/auth/current-user';
import { currentMode } from '@lib/claim-filer/submit';
import { hasUserStartedSetupShadowReview } from '@lib/setup-state';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import { clientSafeLaunchAction, clientSafeLaunchLabel } from '@lib/client-safe-launch-copy';
import {
  ArrowRight,
  Clock,
  Eye,
  FileCheck2,
  SearchCheck,
  ShieldCheck,
} from 'lucide-react';
import FileAllButton from './FileAllButton';
import { triggerMatcher } from './actions';

export const dynamic = 'force-dynamic';

const FRIENDLY_STATUS: Record<string, { label: string; tag: string }> = {
  QUEUED: { label: 'Tracking', tag: 'blue' },
  PREFLIGHT: { label: 'Final checks', tag: 'blue' },
  FILING: { label: 'Preparing form', tag: 'blue' },
  FILED: { label: 'Prepared or submitted', tag: 'green' },
  FAILED: { label: 'Needs attention', tag: 'yellow' },
  ABORTED: { label: 'Stopped safely', tag: 'red' },
  PAID: { label: 'Paid', tag: 'green' },
};

function formatStatus(value: string) {
  return FRIENDLY_STATUS[value] ?? FRIENDLY_STATUS.QUEUED!;
}

function friendlyAuditLabel(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatShortDateTime(value: Date | null | undefined) {
  if (!value) return 'Not recorded';
  return value.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function DashboardPage() {
  const userId = await currentUserId();
  const clientPreviewChecklist = await buildClientPreviewChecklist(userId);
  const setupDone = await hasUserStartedSetupShadowReview(userId);
  const mode = await currentMode();
  const isLive = mode === 'live';
  const breachImportEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT');
  const settlementSearchEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');

  const profile = (await db.select().from(schema.profile)
    .where(eq(schema.profile.userId, userId))
    .limit(1))[0];
  const profileComplete = Boolean(profile?.legalName && ((profile.emailsJson?.length ?? 0) > 0 || (profile.phonesJson?.length ?? 0) > 0));

  const totalSettlements = (await db.select({ n: count() }).from(schema.settlements))[0]?.n ?? 0;
  const linkedClaimForms = (await db.select({ n: count() }).from(schema.settlements)
    .where(isNotNull(schema.settlements.claimFormUrl)))[0]?.n ?? 0;
  const sourceCatalogBlocked = settlementSearchEnabled && totalSettlements === 0;

  const eligibleMatches = (await db.select({ n: count() }).from(schema.matches)
    .where(and(eq(schema.matches.userId, userId), eq(schema.matches.verdict, 'ELIGIBLE'))))[0]?.n ?? 0;
  const needsReview = (await db.select({ n: count() }).from(schema.matches)
    .where(and(eq(schema.matches.userId, userId), eq(schema.matches.verdict, 'NEEDS_REVIEW'))))[0]?.n ?? 0;
  const filedClaims = (await db.select({ n: count() }).from(schema.claims)
    .where(and(eq(schema.claims.userId, userId), eq(schema.claims.status, 'FILED'))))[0]?.n ?? 0;
  const trackedClaims = (await db.select({ n: count() }).from(schema.claims)
    .where(and(eq(schema.claims.userId, userId), eq(schema.claims.status, 'QUEUED'))))[0]?.n ?? 0;
  const paidClaims = (await db.select({ n: count() }).from(schema.claims)
    .where(and(eq(schema.claims.userId, userId), eq(schema.claims.status, 'PAID'))))[0]?.n ?? 0;
  const activePermissions = (await db.select({ n: count() }).from(schema.classAuthorizations)
    .where(and(
      eq(schema.classAuthorizations.userId, userId),
      eq(schema.classAuthorizations.enabled, true),
    )))[0]?.n ?? 0;
  const purchases = (await db.select({ n: count() }).from(schema.purchases)
    .where(eq(schema.purchases.userId, userId)))[0]?.n ?? 0;
  const breaches = (await db.select({ n: count() }).from(schema.dataBreachExposure)
    .where(eq(schema.dataBreachExposure.userId, userId)))[0]?.n ?? 0;
  const auditEvents = (await db.select({ n: count() }).from(schema.auditLog)
    .where(eq(schema.auditLog.userId, userId)))[0]?.n ?? 0;
  const recentAuditEvents = await db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.userId, userId))
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(4);

  const recentClaims = await db
    .select({ claim: schema.claims, settlement: schema.settlements })
    .from(schema.claims)
    .innerJoin(schema.settlements, eq(schema.claims.settlementId, schema.settlements.id))
    .where(eq(schema.claims.userId, userId))
    .orderBy(desc(schema.claims.queuedAt))
    .limit(5);

  const fileClaimWorkerJobs = await db
    .select()
    .from(schema.jobs)
    .where(and(
      eq(schema.jobs.userId, userId),
      eq(schema.jobs.type, 'file_claim'),
    ))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(25);
  const activeWorkerJobCount = fileClaimWorkerJobs.filter((job) => job.status === 'pending' || job.status === 'running').length;
  const completedWorkerJobCount = fileClaimWorkerJobs.filter((job) => job.status === 'succeeded').length;
  const failedWorkerJobCount = fileClaimWorkerJobs.filter((job) => job.status === 'failed' || job.status === 'cancelled').length;

  const clientPreviewReady = clientPreviewChecklist.summary.clientPreviewReady;
  const clientPreviewNextStep = clientPreviewChecklist.summary.nextStep;
  const clientPreviewSafeNextAction = clientPreviewNextStep
    ? clientSafeLaunchAction(clientPreviewNextStep)
    : 'Account checks are clear for this account.';
  const clientPreviewSafeNextLabel = clientPreviewNextStep
    ? clientSafeLaunchLabel(clientPreviewNextStep)
    : 'None';
  const launchPacketReadyCount = clientPreviewChecklist.summary.launchPacketReadyCount;
  const launchPacketTotalCount = clientPreviewChecklist.summary.launchPacketTotalCount;

  const nextAction = !setupDone || !profileComplete
    ? {
        href: '/onboarding',
        label: 'Finish profile',
        detail: 'Add the facts ClaimBot needs before matching can be trusted.',
      }
    : needsReview > 0
      ? {
          href: '/review',
          label: 'Review matches',
          detail: 'Resolve uncertain matches and proof-required items.',
        }
      : eligibleMatches > 0
        ? {
            href: '/review',
            label: 'Approve ready matches',
            detail: 'Choose which ready matches should move into claim tracking.',
          }
        : activePermissions === 0
          ? {
              href: '/permissions',
              label: 'Choose permissions',
              detail: 'Tell ClaimBot which claim categories it may handle for you.',
            }
          : trackedClaims > 0
            ? {
                href: '/claims',
                label: 'Track claims',
                detail: 'Follow claim progress and final checks from one place.',
              }
            : {
                href: settlementSearchEnabled ? '/settlements' : '/review',
                label: settlementSearchEnabled ? 'Find claim matches' : 'Review matches',
                detail: settlementSearchEnabled
                  ? 'Search available claim sources against your saved facts.'
                  : 'Review assigned claim opportunities against your saved facts.',
              };

  const customerSteps = [
    {
      label: 'Profile',
      detail: profileComplete
        ? 'Your basic facts are saved.'
        : 'Add name, contact, purchases, subscriptions, and other useful facts.',
      href: '/onboarding',
      status: profileComplete ? 'done' : 'active',
    },
    {
      label: 'Review matches',
      detail: eligibleMatches + needsReview > 0
        ? `${eligibleMatches + needsReview} match${eligibleMatches + needsReview === 1 ? '' : 'es'} ready for review.`
        : 'Run matching after your profile has enough facts.',
      href: '/review',
      status: !profileComplete ? 'pending' : eligibleMatches + needsReview > 0 ? 'active' : 'pending',
    },
    {
      label: 'Track claims',
      detail: trackedClaims > 0
        ? `${trackedClaims} claim${trackedClaims === 1 ? '' : 's'} being tracked.`
        : 'Track only the claims you approve.',
      href: '/claims',
      status: trackedClaims > 0 || filedClaims > 0 || paidClaims > 0 ? 'active' : 'pending',
    },
  ];

  const evidenceRecords = purchases + (breachImportEnabled ? breaches : 0);
  const firstRunIncomplete = !profileComplete || evidenceRecords === 0 || activePermissions === 0;
  const canRunMatcher = profileComplete && (!settlementSearchEnabled || totalSettlements > 0);
  const heroStatusRows = [
    {
      label: 'Next action',
      value: nextAction.label,
      detail: nextAction.detail,
      href: nextAction.href,
    },
    {
      label: 'Review mode',
      value: isLive ? 'Live guarded' : 'Shadow safe',
      detail: isLive ? 'Live filing still runs checks first.' : 'Claims can be prepared, not submitted.',
      href: '/settings',
    },
    {
      label: 'Safety rule',
      value: 'You approve claims',
      detail: 'ClaimBot tracks only matches you review and allow.',
      href: '/trust',
    },
  ];

  return (
    <>
      <section className="kimi-dashboard-hero" aria-label="ClaimBot customer dashboard">
        <div className="kimi-dashboard-hero-copy">
          <div className="label-ui">Your claim workspace</div>
          <h1>Find matches. Review them. Track the claims you approve.</h1>
          <p>
            ClaimBot keeps the workflow simple: save your facts, review possible class-action matches,
            then let approved claims move through guarded tracking.
          </p>
          <div className="kimi-hero-actions">
            <Link href={nextAction.href} className="btn-claimbot-primary">
              {nextAction.label}
              <ArrowRight aria-hidden="true" size={15} />
            </Link>
            <form action={triggerMatcher} className="inline-form">
              <button className="btn-claimbot" type="submit" disabled={!canRunMatcher}>
                <SearchCheck aria-hidden="true" size={15} />
                Check for matches
              </button>
            </form>
          </div>
        </div>
        <div className="kimi-dashboard-status-card" aria-label="Current workspace summary">
          <div className="kimi-dashboard-status-top">
            <span>{isLive ? 'Live guarded' : 'Review mode'}</span>
            <strong>{eligibleMatches + needsReview}</strong>
            <small>possible matches</small>
          </div>
          <div className="kimi-dashboard-status-list">
            {heroStatusRows.map((row) => (
              <Link href={row.href} className="kimi-dashboard-status-row" key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
                <small>{row.detail}</small>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {firstRunIncomplete && (
        <section className="dashboard-first-run-card" aria-label="New user start here">
          <div className="dashboard-first-run-main">
            <div className="dashboard-first-run-copy">
              <div className="eyebrow">Start here</div>
              <h2>New to ClaimBot? Finish these basics first.</h2>
              <p>
                The fastest path is profile facts, claim-type permission, then match review.
                Everything else can wait until ClaimBot finds something worth tracking.
              </p>
            </div>
            <div className="dashboard-first-run-progress" aria-label="First run progress">
              {[
                { label: 'Profile facts', done: profileComplete },
                { label: 'Evidence records', done: evidenceRecords > 0 },
                { label: 'Permissions', done: activePermissions > 0 },
              ].map((item) => (
                <span className={item.done ? 'done' : 'todo'} key={item.label}>
                  {item.done ? 'Saved' : 'Next'}: {item.label}
                </span>
              ))}
            </div>
          </div>
          <div className="dashboard-first-run-actions">
            <Link className="btn" href="/onboarding">Open onboarding</Link>
            <Link className="btn ghost" href="/setup">Add facts</Link>
            <Link className="btn ghost" href="/permissions">Choose permissions</Link>
          </div>
          <div className="dashboard-first-run-safety">
            <strong>Plain-language promise</strong>
            <p>
              Onboarding only saves facts and preferences. ClaimBot does not submit a claim from onboarding.
            </p>
          </div>
        </section>
      )}

      <section className="kimi-kpi-grid" aria-label="Dashboard snapshot">
        <Link href="/review" className="kimi-kpi-card">
          <span>
            <SearchCheck aria-hidden="true" size={16} />
            Possible matches
          </span>
          <strong>{eligibleMatches}</strong>
          <small>Ready for you to review</small>
        </Link>
        <Link href="/review" className="kimi-kpi-card blue">
          <span>
            <Eye aria-hidden="true" size={16} />
            Needs review
          </span>
          <strong>{needsReview}</strong>
          <small>Proof or facts need a closer look</small>
        </Link>
        <Link href="/claims" className="kimi-kpi-card violet">
          <span>
            <FileCheck2 aria-hidden="true" size={16} />
            Tracking
          </span>
          <strong>{trackedClaims}</strong>
          <small>Claims moving through checks</small>
        </Link>
        <Link href="/audit" className="kimi-kpi-card muted">
          <span>
            <ShieldCheck aria-hidden="true" size={16} />
            Activity
          </span>
          <strong>{auditEvents}</strong>
          <small>Saved changes and claim events</small>
        </Link>
      </section>

      {eligibleMatches > 0 && <FileAllButton eligible={eligibleMatches} />}

      <section className="dashboard-section">
        <div className="workflow-panel">
          <div className="workflow-primary">
            <div className="eyebrow">Do this next</div>
            <h2>{nextAction.label}</h2>
            <p>{nextAction.detail}</p>
            <Link href={nextAction.href} className="btn">Continue</Link>
          </div>
          <div className="workflow-steps" aria-label="Simple customer workflow">
            {customerSteps.map((item, index) => (
              <Link
                key={item.label}
                href={item.href}
                className={`workflow-step-card ${item.status}`}
                aria-current={item.status === 'active' ? 'step' : undefined}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                </div>
              </Link>
            ))}
          </div>
          <div className="workflow-note">
            <strong>Simple rule</strong>
            <span>ClaimBot never moves a claim forward without saved facts, matching permission, and required review.</span>
          </div>
        </div>
      </section>

      <details className="dashboard-detail-drawer customer-account-drawer" aria-label="Account details">
        <summary>
          <span>
            <strong>Account details</strong>
            <small>Open controls, recent activity, and claim history when you need them.</small>
          </span>
          <b>{eligibleMatches + needsReview} matches, {trackedClaims} tracked</b>
        </summary>

        <section className="dashboard-section">
          <header className="section-header">
            <h2>Account at a glance</h2>
            <p className="muted">Only the checks customers need before matching and tracking.</p>
          </header>
          <div className="trust-strip">
            <div className="trust-item">
              <strong>{profileComplete ? 'Profile started' : 'Profile needed'}</strong>
              <span>Legal name plus reachable contact info is the minimum useful matcher input.</span>
            </div>
            <div className="trust-item">
              <strong>{evidenceRecords} evidence record{evidenceRecords === 1 ? '' : 's'}</strong>
              <span>Purchases, subscriptions, and related facts improve match quality.</span>
            </div>
            <div className="trust-item">
              <strong>{activePermissions} active permission{activePermissions === 1 ? '' : 's'}</strong>
              <span>Claim categories stay blocked until you allow them.</span>
            </div>
            <div className="trust-item">
              <strong>{linkedClaimForms}/{totalSettlements} forms linked</strong>
              <span>Claim tracking needs a valid claim form before final checks can run.</span>
            </div>
            <Link href="/contact" className="trust-item unstyled-card-link">
              <strong>Support status</strong>
              <span>
                {clientPreviewReady
                  ? 'Account checks are clear for use.'
                  : 'Some account checks still need support review.'}
              </span>
            </Link>
          </div>
          {sourceCatalogBlocked && (
            <div className="notice warn notice-followup operational-alert" role="alert">
              <div className="operational-alert-head">
                <Clock aria-hidden="true" size={18} />
                <div>
                  <h3>Claim sources are not loaded yet</h3>
                  <p>
                    Intake is usable, but discovery will stay empty until claim sources are loaded for this hosted account.
                  </p>
                </div>
              </div>
              <div className="status-row">
                <Link className="btn ghost sm" href="/contact">Contact support</Link>
                <Link className="btn ghost sm" href="/onboarding">Finish profile</Link>
              </div>
            </div>
          )}
        </section>

        <section className="safety-hub" aria-label="Customer controls">
          <header className="section-header safety-hub-head">
            <div>
              <div className="eyebrow">Controls</div>
              <h2>What keeps automation bounded</h2>
              <p className="muted">
                Paid automation can reduce manual work, but proof-required claims and uncertain matches still stop for review.
              </p>
            </div>
            <span className={`mode-badge ${isLive ? 'live' : 'shadow'}`}>
              {isLive ? 'Live guarded' : 'Review mode'}
            </span>
          </header>
          <div className="safety-hub-grid">
            <Link href="/permissions" className={`safety-hub-card ${activePermissions > 0 ? 'pass' : 'warn'}`}>
              <span className={`readiness-dot ${activePermissions > 0 ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>Permission required</strong>
                <p>Claim types stay blocked until you allow them.</p>
                <b>Manage permissions</b>
              </div>
            </Link>
            <Link href="/review" className={`safety-hub-card ${needsReview > 0 ? 'warn' : 'pass'}`}>
              <span className={`readiness-dot ${needsReview > 0 ? 'warn' : 'pass'}`} aria-hidden="true" />
              <div>
                <strong>Proof stays manual</strong>
                <p>Documents, purchase records, or uncertain claims stay out of hands-off filing.</p>
                <b>Review matches</b>
              </div>
            </Link>
            <Link href="/status" className={`safety-hub-card ${failedWorkerJobCount > 0 ? 'warn' : 'pass'}`}>
              <span className={`readiness-dot ${failedWorkerJobCount > 0 ? 'warn' : 'pass'}`} aria-hidden="true" />
              <div>
                <strong>Full automation status</strong>
                <p>{activeWorkerJobCount} active run{activeWorkerJobCount === 1 ? '' : 's'}; {failedWorkerJobCount} need attention.</p>
                <b>View status</b>
              </div>
            </Link>
            <Link href="/audit" className="safety-hub-card pass">
              <span className="readiness-dot pass" aria-hidden="true" />
              <div>
                <strong>Activity is saved</strong>
                <p>Claim decisions and account changes are saved to your account history.</p>
                <b>Open activity</b>
              </div>
            </Link>
          </div>
        </section>

        <section className="dashboard-section" aria-label="Activity history">
          <header className="section-header">
            <h2>Activity history</h2>
            <p className="muted">Recent account history from saved profile, matching, permission, claim, and payment events.</p>
          </header>
          {recentAuditEvents.length > 0 ? (
            <div className="compact-stack">
              {recentAuditEvents.map((event) => (
                <Link key={event.id} href="/audit" className="unstyled-card-link">
                  <div className="card card-clickable recent-claim-card">
                    <div className="recent-claim-main">
                      <div className="recent-claim-title">{friendlyAuditLabel(event.eventType)}</div>
                      <span className="tag blue">{event.actor}</span>
                    </div>
                    <div className="recent-claim-payout">{formatShortDateTime(event.occurredAt)}</div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="notice notice-followup">
              <h3>No account history yet</h3>
              <p>Activity appears here after facts, matching, permission changes, or claim tracking starts.</p>
            </div>
          )}
        </section>

        <section className="dashboard-section">
          <header className="section-header">
            <h2>Recent claim activity</h2>
            <p className="muted">A short list only. Full details stay on the Claims and Status pages.</p>
          </header>
          {recentClaims.length > 0 ? (
            <div className="compact-stack">
              {recentClaims.map(({ claim, settlement }) => {
                const status = formatStatus(claim.status);
                return (
                  <Link key={claim.id} href={`/claims/${claim.id}`} className="unstyled-card-link">
                    <div className="card card-clickable recent-claim-card">
                      <div className="recent-claim-main">
                        <div className="recent-claim-title">{settlement.caseName}</div>
                        <span className={`tag ${status.tag}`}>{status.label}</span>
                      </div>
                      {settlement.payoutEstimate && (
                        <div className="recent-claim-payout">{settlement.payoutEstimate}</div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="how-it-works">
              <div className="how-step">
                <h4>1. Add facts</h4>
                <p>Save the basics ClaimBot needs for matching.</p>
              </div>
              <div className="how-step">
                <h4>2. Review matches</h4>
                <p>Approve ready matches and hold uncertain claims for proof review.</p>
              </div>
              <div className="how-step">
                <h4>3. Track claims</h4>
                <p>Follow approved claims through final checks and account history.</p>
              </div>
            </div>
          )}
        </section>
      <details className="dashboard-detail-drawer status-readiness-drawer" aria-label="More account status details">
        <summary>
          <span>
            {/* Guardrail marker: More account details. Account readiness, safety controls, and detailed records stay in this collapsed drawer. */}
            <strong>More account details</strong>
            <small>Account checks, safety controls, and deeper status stay here for review.</small>
          </span>
          <b>{clientPreviewReady ? 'Access ready' : 'Needs account checks'}</b>
        </summary>
        <section className="launch-critical-path" aria-label="Dashboard readiness">
          {/* Guardrail marker: Customer access */}
          <header className="launch-critical-path-head">
            <div>
              <div className="eyebrow">Account checks</div>
              <h2>{clientPreviewReady ? 'Account access checks are ready' : 'Account access still needs checks'}</h2>
              <p>
                The main workflow stays simple above. Account details stay available here,
                with deeper status kept in account details.
              </p>
            </div>
            <span className={`tag ${clientPreviewReady ? 'good' : 'warn'}`}>
              {clientPreviewChecklist.summary.readyCount}/{clientPreviewChecklist.summary.totalCount} ready
            </span>
          </header>
          <div className="support-readiness-receipt-grid">
            <div className={`support-readiness-receipt-item ${clientPreviewReady ? 'pass' : 'warn'}`}>
              <span className={`status-dot ${clientPreviewReady ? 'ok' : 'warn'}`} aria-hidden="true" />
              <div>
                <small>Needed next</small>
                <strong>{clientPreviewSafeNextLabel}</strong>
                <p>{clientPreviewSafeNextAction}</p>
              </div>
            </div>
            <div className={`support-readiness-receipt-item ${launchPacketReadyCount === launchPacketTotalCount ? 'pass' : 'warn'}`}>
              <span className={`status-dot ${launchPacketReadyCount === launchPacketTotalCount ? 'ok' : 'warn'}`} aria-hidden="true" />
              <div>
                <small>Account status</small>
                <strong>{launchPacketReadyCount}/{launchPacketTotalCount} ready</strong>
                <p>Detailed account records stay out of the main dashboard.</p>
              </div>
            </div>
            <div className={`support-readiness-receipt-item ${failedWorkerJobCount > 0 ? 'warn' : 'pass'}`}>
              <span className={`status-dot ${failedWorkerJobCount > 0 ? 'warn' : 'ok'}`} aria-hidden="true" />
              <div>
                {/* Guardrail marker: automatic claim worker polling; Worker job failures */}
                <small>Paid automation runs</small>
                <strong>{activeWorkerJobCount} active, {completedWorkerJobCount} complete</strong>
                <p>
                  ClaimBot continues automation after approved claims clear every required check.
                  Runs needing attention: {failedWorkerJobCount}.
                </p>
              </div>
            </div>
          </div>
          <div className="status-row">
            <Link className="btn ghost sm" href="/launch">Open account status</Link>
            <Link className="btn ghost sm" href="/status">Open claim status</Link>
          </div>
        </section>
      </details>
      </details>
    </>
  );
}
