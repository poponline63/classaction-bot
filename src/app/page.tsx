import Link from 'next/link';
import { db, schema } from '@db/client';
import { and, count, desc, eq, gte, isNotNull } from 'drizzle-orm';
import { isClientFeatureEnabled } from '@lib/features';
import { currentUserId } from '@lib/auth/current-user';
import { currentMode } from '@lib/claim-filer/submit';
import { hasUserStartedSetupShadowReview } from '@lib/setup-state';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import { clientSafeLaunchAction, clientSafeLaunchLabel } from '@lib/client-safe-launch-copy';
import { getMonthlyClaimAllowance, getUserSubscription } from '@lib/billing/entitlements';
import {
  ArrowRight,
  CircleCheck,
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

function startOfCurrentUtcMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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
  const matchesThisWeek = (await db.select({ n: count() }).from(schema.matches)
    .where(and(
      eq(schema.matches.userId, userId),
      gte(schema.matches.updatedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
    )))[0]?.n ?? 0;
  const recentAuditEvents = await db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.userId, userId))
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(5);

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

  const subscription = await getUserSubscription(userId);
  const claimAllowance = await getMonthlyClaimAllowance(userId, { subscription });
  const nextMonth = startOfCurrentUtcMonth();
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const allowanceResetLabel = nextMonth.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });

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

  const evidenceRecords = purchases + (breachImportEnabled ? breaches : 0);
  const firstRunIncomplete = !profileComplete || evidenceRecords === 0 || activePermissions === 0;
  const canRunMatcher = profileComplete && (!settlementSearchEnabled || totalSettlements > 0);

  // "Anything new for me?" — the one highest-leverage action this session.
  const nextAction = !setupDone || !profileComplete
    ? {
        href: '/onboarding',
        label: 'Finish your profile',
        detail: 'Add the facts ClaimBot needs before matching can be trusted.',
        cta: 'Finish profile',
      }
    : needsReview > 0
      ? {
          href: '/review',
          label: `Review ${needsReview} match${needsReview === 1 ? '' : 'es'} waiting on you`,
          detail: 'Resolve uncertain matches and proof-required items so they can move forward.',
          cta: 'Review matches',
        }
      : eligibleMatches > 0
        ? {
            href: '/review',
            label: `Approve ${eligibleMatches} ready match${eligibleMatches === 1 ? '' : 'es'}`,
            detail: 'Choose which ready matches should move into claim tracking.',
            cta: 'Approve matches',
          }
        : activePermissions === 0
          ? {
              href: '/permissions',
              label: 'Choose your claim permissions',
              detail: 'Tell ClaimBot which claim categories it may handle for you.',
              cta: 'Choose permissions',
            }
          : trackedClaims > 0
            ? {
                href: '/claims',
                label: `Follow ${trackedClaims} tracked claim${trackedClaims === 1 ? '' : 's'}`,
                detail: 'Follow claim progress and final checks from one place.',
                cta: 'Track claims',
              }
            : {
                href: settlementSearchEnabled ? '/settlements' : '/review',
                label: 'All caught up',
                detail: settlementSearchEnabled
                  ? 'Nothing is waiting on you. New settlements are checked against your facts every day.'
                  : 'Nothing is waiting on you. Review assigned claim opportunities any time.',
                cta: settlementSearchEnabled ? 'Browse settlements' : 'Open review',
              };

  // "Where's my money?" — the funnel, each stage clickable.
  const pipeline = [
    {
      href: '/review',
      icon: SearchCheck,
      label: 'Possible matches',
      value: eligibleMatches,
      detail: matchesThisWeek > 0 ? `${matchesThisWeek} updated this week` : 'Ready for you to review',
    },
    {
      href: '/review',
      icon: Eye,
      label: 'Needs review',
      value: needsReview,
      detail: 'Proof or facts need a closer look',
    },
    {
      href: '/claims',
      icon: Clock,
      label: 'Tracking',
      value: trackedClaims,
      detail: 'Claims moving through checks',
    },
    {
      href: '/claims',
      icon: FileCheck2,
      label: 'Prepared',
      value: filedClaims + paidClaims,
      detail: 'Packets prepared or paid out',
    },
  ];

  // "Is anything stuck?" — only items blocked on the user.
  const attentionItems = [
    ...(sourceCatalogBlocked
      ? [{
          href: '/contact',
          tone: 'warn' as const,
          chip: 'Sources',
          title: 'Claim sources are not loaded yet',
          action: 'Contact support',
        }]
      : []),
    ...(needsReview > 0
      ? [{
          href: '/review',
          tone: 'warn' as const,
          chip: 'Review',
          title: `${needsReview} match${needsReview === 1 ? '' : 'es'} need proof or a closer look`,
          action: 'Review now',
        }]
      : []),
    ...(eligibleMatches > 0 && activePermissions === 0
      ? [{
          href: '/permissions',
          tone: 'warn' as const,
          chip: 'Permission',
          title: 'Ready matches are waiting on a claim-type permission',
          action: 'Choose permissions',
        }]
      : []),
    ...(failedWorkerJobCount > 0
      ? [{
          href: '/status',
          tone: 'bad' as const,
          chip: 'Runs',
          title: `${failedWorkerJobCount} automation run${failedWorkerJobCount === 1 ? '' : 's'} need attention`,
          action: 'Open status',
        }]
      : []),
  ];

  const firstRunSteps = [
    { label: 'Profile facts', done: profileComplete, href: '/onboarding' },
    { label: 'Evidence records', done: evidenceRecords > 0, href: '/setup' },
    { label: 'Permissions', done: activePermissions > 0, href: '/permissions' },
  ];

  return (
    <>
      <header className="dash-head" aria-label="Dashboard header">
        <div>
          <div className="eyebrow">Your claim workspace</div>
          <h1>Find matches. Review them. Track the claims you approve.</h1>
        </div>
        <form action={triggerMatcher} className="inline-form">
          <button className="btn ghost" type="submit" disabled={!canRunMatcher}>
            <SearchCheck aria-hidden="true" size={15} />
            Check for matches
          </button>
        </form>
      </header>

      {firstRunIncomplete ? (
        <section className="dash-next dashboard-first-run-card" aria-label="New user start here">
          <div>
            <div className="eyebrow">Start here</div>
            <h2>Three quick steps before matching can be trusted.</h2>
            <p>
              The fastest path is profile facts, claim-type permission, then match review.
              Onboarding only saves facts and preferences — ClaimBot does not submit a claim from onboarding.
            </p>
            <div className="dash-first-run-steps" aria-label="First run progress">
              {firstRunSteps.map((item, index) => (
                <Link className={`dash-first-run-step ${item.done ? 'done' : 'todo'}`} href={item.href} key={item.label}>
                  <span aria-hidden="true">{item.done ? <CircleCheck size={16} /> : index + 1}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="dash-next-action">
            <Link className="btn lg" href="/onboarding">
              Open onboarding
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </section>
      ) : (
        <section className="dash-next" aria-label="Next action">
          <div>
            <div className="eyebrow">Next for you</div>
            <h2>{nextAction.label}</h2>
            <p>{nextAction.detail}</p>
          </div>
          <div className="dash-next-action">
            <Link className="btn lg" href={nextAction.href}>
              {nextAction.cta}
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </section>
      )}

      <section className="dash-pipeline" aria-label="Claim pipeline">
        {pipeline.map((stage) => (
          <Link href={stage.href} className="dash-pipeline-card" key={stage.label}>
            <span className="dash-pipeline-label">
              <stage.icon aria-hidden="true" size={15} />
              {stage.label}
            </span>
            <strong>{stage.value}</strong>
            <small>{stage.detail}</small>
          </Link>
        ))}
      </section>

      {eligibleMatches > 0 && <FileAllButton eligible={eligibleMatches} />}

      <section className="dash-attention" aria-label="Needs your attention">
        <header className="section-header">
          <h2>Needs your attention</h2>
        </header>
        {attentionItems.length > 0 ? (
          <div className="dash-attention-list">
            {attentionItems.map((item) => (
              <Link className="dash-attention-row" href={item.href} key={item.title}>
                <span className={`tag ${item.tone === 'bad' ? 'red' : 'yellow'}`}>{item.chip}</span>
                <strong>{item.title}</strong>
                <b>{item.action} <ArrowRight aria-hidden="true" size={14} /></b>
              </Link>
            ))}
          </div>
        ) : (
          <div className="dash-attention-empty">
            <CircleCheck aria-hidden="true" size={18} />
            <span>Nothing needs you right now. New matches will appear here when they need a decision.</span>
          </div>
        )}
      </section>

      <div className="dash-secondary">
        <section className="dash-activity" aria-label="Activity history">
          <header className="section-header">
            <h2>Activity history</h2>
            <p className="muted">Recent account history from profile, matching, permission, claim, and payment events.</p>
          </header>
          {recentAuditEvents.length > 0 ? (
            <div className="dash-activity-list">
              {recentAuditEvents.map((event) => (
                <Link key={event.id} href="/audit" className="dash-activity-row">
                  <span>{friendlyAuditLabel(event.eventType)}</span>
                  <small>{formatShortDateTime(event.occurredAt)}</small>
                </Link>
              ))}
              <Link className="dash-activity-more" href="/audit">
                Open full account history
                <ArrowRight aria-hidden="true" size={14} />
              </Link>
            </div>
          ) : (
            <div className="notice notice-followup">
              <h3>No account history yet</h3>
              <p>Activity appears here after facts, matching, permission changes, or claim tracking starts.</p>
            </div>
          )}
        </section>

        <section className="dash-plan" aria-label="Plan usage">
          <header className="section-header">
            <h2>Plan</h2>
          </header>
          {claimAllowance.unlimited ? (
            <div className="dash-plan-card">
              <strong>Uncapped filings</strong>
              <p>Your plan removes the monthly filing cap. Proof, permission, and review checks still apply to every claim.</p>
              <Link className="btn ghost sm" href="/pricing">View plan</Link>
            </div>
          ) : (
            <div className="dash-plan-card">
              <strong>
                {claimAllowance.used} of {claimAllowance.limit} included filings used
              </strong>
              <div
                className="dash-plan-meter"
                role="img"
                aria-label={`${claimAllowance.used} of ${claimAllowance.limit} included filings used this month`}
              >
                <i style={{ width: `${Math.min(100, Math.round((claimAllowance.used / (claimAllowance.limit || 1)) * 100))}%` }} />
              </div>
              <p>Resets {allowanceResetLabel}. Paid plans remove the monthly cap.</p>
              <Link className="btn ghost sm" href="/pricing">Compare plans</Link>
            </div>
          )}
        </section>
      </div>

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
