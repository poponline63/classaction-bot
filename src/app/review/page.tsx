import { db, schema } from '@db/client';
import type { ReasoningTrace } from '@lib/matcher/types';
import { and, count, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { currentUserId } from '@lib/auth/current-user';
import { getMonthlyClaimAllowance, getUserSubscription } from '@lib/billing/entitlements';
import { buildAuthorizationPreview } from '@lib/claim-filer/authorization-preview';
import { evaluateQueueReadiness } from '@lib/claim-filer/queue-readiness';
import { QUEUE_BOUNDARY_ACK, QUEUE_TRUST_LOCK_ACK } from '@lib/claim-filer/request-boundary';
import { currentMode } from '@lib/claim-filer/submit';
import { isClientFeatureEnabled } from '@lib/features';
import { triggerMatcher, queueClaimFromMatch } from '../actions';
import { AlertTriangle, CheckCircle2, LockKeyhole } from 'lucide-react';
import { OperationalZeroState } from '../OperationalZeroState';
import LaunchTrustBridge from '../LaunchTrustBridge';
import ReviewMatchBrowser, { type ReviewMatchBrowserRow } from './ReviewMatchBrowser';

export const dynamic = 'force-dynamic';

interface SearchParams {
  verdict?: string;
}

function fmtDate(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : 'No deadline';
}

function verdictLabel(verdict: string) {
  return verdict.toLowerCase().replace(/_/g, ' ');
}

function categoryLabel(category: string) {
  return category.toLowerCase().replace(/_/g, ' ');
}

function browserTone(tone: 'green' | 'blue' | 'yellow' | 'red') {
  if (tone === 'green' || tone === 'blue') return 'pass' as const;
  if (tone === 'red') return 'fail' as const;
  return 'warn' as const;
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

function payloadNumber(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const userId = await currentUserId();
  const breachImportEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT');
  const settlementSearchEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');
  const subscription = await getUserSubscription(userId);
  const claimAllowance = await getMonthlyClaimAllowance(userId, { subscription });
  const filingMode = await currentMode();

  const verdictFilter = searchParams.verdict ?? 'ELIGIBLE';
  const totalSettlements = (await db.select({ n: count() }).from(schema.settlements))[0]?.n ?? 0;
  const latestMatcherReceipt = (await db
    .select({
      occurredAt: schema.auditLog.occurredAt,
      payloadJson: schema.auditLog.payloadJson,
    })
    .from(schema.auditLog)
    .where(and(
      eq(schema.auditLog.userId, userId),
      eq(schema.auditLog.eventType, 'MATCHER_RUN_COMPLETED'),
    ))
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(1))[0];
  const matcherReceiptPayload = payloadRecord(latestMatcherReceipt?.payloadJson);
  const matcherReceiptRows = [
    {
      label: 'Last refresh',
      value: latestMatcherReceipt
        ? latestMatcherReceipt.occurredAt.toLocaleString('en-US')
        : 'No matcher refresh receipt yet',
      detail: 'Every manual matcher refresh writes a private account-history record.',
    },
    {
      label: 'Sources processed',
      value: String(payloadNumber(matcherReceiptPayload, 'settlementsProcessed') ?? totalSettlements),
      detail: 'Matcher scope follows the current source catalog and enabled category feature flags.',
    },
    {
      label: 'Matches changed',
      value: String(payloadNumber(matcherReceiptPayload, 'verdictsChanged') ?? 0),
      detail: 'Changed verdicts also write individual MATCH_VERDICT_CHANGED audit events.',
    },
    {
      label: 'Run errors',
      value: String(payloadNumber(matcherReceiptPayload, 'errorCount') ?? 0),
      detail: 'Errors stay visible in the receipt so support can distinguish empty results from failed processing.',
    },
  ];

  const allRows = await db
    .select({
      match: schema.matches,
      settlement: schema.settlements,
    })
    .from(schema.matches)
    .innerJoin(schema.settlements, eq(schema.matches.settlementId, schema.settlements.id))
    .where(eq(schema.matches.userId, userId))
    .orderBy(desc(schema.matches.confidence), desc(schema.matches.updatedAt))
    .limit(300);

  const counts = { ELIGIBLE: 0, INELIGIBLE: 0, NEEDS_REVIEW: 0, all: allRows.length };
  for (const r of allRows) counts[r.match.verdict as keyof typeof counts]++;

  const rows = verdictFilter === 'all'
    ? allRows
    : allRows.filter(({ match }) => match.verdict === verdictFilter);

  const claims = await db
    .select()
    .from(schema.claims)
    .where(eq(schema.claims.userId, userId));
  const claimByMatch = new Map(claims.map((claim) => [claim.matchId, claim]));

  const authorizations = await db
    .select()
    .from(schema.classAuthorizations)
    .where(eq(schema.classAuthorizations.userId, userId));
  const activeAuthCategories = new Set(
    authorizations
      .filter((auth) => auth.enabled && !auth.revokedAt)
      .map((auth) => auth.category),
  );
  const authorizationByCategory = new Map(authorizations.map((auth) => [auth.category, auth]));
  const readinessByMatchId = new Map(
    allRows.map(({ match, settlement }) => {
      const existingClaim = claimByMatch.get(match.id);
      return [match.id, evaluateQueueReadiness({
        verdict: match.verdict,
        proofRequired: settlement.proofRequired,
        claimFormUrl: settlement.claimFormUrl,
        hasActiveAuthorization: activeAuthCategories.has(settlement.category),
        hasAutomationEntitlement: subscription.automationEnabled || claimAllowance.allowed,
        existingClaimId: existingClaim?.id,
      })] as const;
    }),
  );
  const queueReadyCount = allRows.filter(({ match }) => readinessByMatchId.get(match.id)?.canQueue).length;
  const alreadyQueuedCount = allRows.filter(({ match }) => readinessByMatchId.get(match.id)?.label === 'Already tracked').length;
  const proofRequiredCount = allRows.filter(({ match }) => readinessByMatchId.get(match.id)?.label === 'Proof required').length;
  const authorizationNeededCount = allRows.filter(({ match }) => readinessByMatchId.get(match.id)?.label === 'Permission needed').length;
  const missingFormCount = allRows.filter(({ match }) => readinessByMatchId.get(match.id)?.label === 'No claim form').length;
  const automationPlanNeededCount = allRows.filter(({ match }) => readinessByMatchId.get(match.id)?.label === 'Automation plan needed').length;
  const lockedBySafetyCount = proofRequiredCount + authorizationNeededCount + missingFormCount + automationPlanNeededCount;
  const activeAuthorizationCount = activeAuthCategories.size;
  const unresolvedRequirementCount = proofRequiredCount + authorizationNeededCount + missingFormCount + automationPlanNeededCount;
  const manifestRows = [
    {
      label: 'Run mode',
      value: filingMode === 'live' ? 'Live guarded' : 'Shadow Mode active',
      detail: filingMode === 'live'
        ? 'Live filing is enabled, but claim actions still require permission, proof, form, plan, and final checks.'
        : 'Claim work is prepared and recorded first. Nothing is transmitted to a claims administrator from shadow mode.',
      tone: filingMode === 'live' ? 'warn' : 'pass',
      icon: filingMode === 'live' ? AlertTriangle : CheckCircle2,
    },
    {
      label: 'Permission vitals',
      value: authorizationNeededCount > 0
        ? `${authorizationNeededCount} required`
        : `${activeAuthorizationCount} active`,
      detail: authorizationNeededCount > 0
        ? 'Update category permissions before these matches can move forward.'
        : activeAuthorizationCount > 0
          ? 'Active category permissions are available for the currently matched records.'
          : 'No category permissions are active; claim tracking remains locked until the user allows a category.',
      tone: authorizationNeededCount > 0 || activeAuthorizationCount === 0 ? 'warn' : 'pass',
      icon: authorizationNeededCount > 0 || activeAuthorizationCount === 0 ? LockKeyhole : CheckCircle2,
    },
    {
      label: 'Proof check inventory',
      value: proofRequiredCount > 0
        ? `${proofRequiredCount} manual`
        : 'Clear',
      detail: proofRequiredCount > 0
        ? 'Proof-required matches stay in review until documents, notices, or purchase records are handled manually.'
        : 'No proof-required matches are blocking this review view.',
      tone: proofRequiredCount > 0 ? 'warn' : 'pass',
      icon: proofRequiredCount > 0 ? LockKeyhole : CheckCircle2,
    },
    {
      label: 'Claim tracking',
      value: unresolvedRequirementCount > 0
        ? `Waiting on ${plural(unresolvedRequirementCount, 'requirement')}`
        : queueReadyCount > 0
          ? `${queueReadyCount} ready`
          : 'No matches ready yet',
      detail: unresolvedRequirementCount > 0
        ? `${plural(missingFormCount, 'form')} missing, ${plural(automationPlanNeededCount, 'plan check')} active, and ${plural(authorizationNeededCount, 'permission')} pending.`
        : queueReadyCount > 0
          ? 'Reviewed matches with form URLs and active permissions can move into claim tracking.'
          : 'No reviewed match currently satisfies permission, proof, form, and plan checks.',
      tone: unresolvedRequirementCount > 0 || queueReadyCount === 0 ? 'warn' : 'pass',
      icon: unresolvedRequirementCount > 0 || queueReadyCount === 0 ? LockKeyhole : CheckCircle2,
    },
  ];
  const queueGateRows = [
    {
      // Legal guardrail marker: Ready-match manifest.
      title: 'Ready matches',
      detail: `${queueReadyCount} match${queueReadyCount === 1 ? '' : 'es'} can move to claim tracking after individual fact review.`,
      tone: queueReadyCount > 0 ? 'pass' : 'warn',
    },
    {
      title: 'Locked matches',
      detail: `${lockedBySafetyCount} match${lockedBySafetyCount === 1 ? '' : 'es'} stay locked by proof, permission, form, or plan requirements.`,
      tone: lockedBySafetyCount > 0 ? 'warn' : 'pass',
    },
    {
      title: 'Tracking context',
      detail: settlementSearchEnabled
        ? 'Each tracking action carries match details, category permission, and settlement form context into the guarded claim flow.'
        : 'Each tracking action carries match details, category permission, and scoped claim form context into the guarded claim flow.',
      tone: 'pass',
    },
    {
      title: 'Shadow-aware tracking',
      detail: 'Claim tracking starts preparation and account-history capture; live submission still depends on hosted filing posture.',
      tone: 'pass',
    },
  ];
  const queueHandoffRows = [
    {
      title: 'Safety acknowledgement',
      detail: `${queueReadyCount} match${queueReadyCount === 1 ? '' : 'es'} can carry a final acknowledgement into claim tracking.`,
      tone: queueReadyCount > 0 ? 'pass' : 'warn',
    },
    {
      title: 'Tracking checks',
      detail: 'Review requirements map directly to tracking checks for mode, permission, proof, form, plan, and account history.',
      tone: 'pass',
    },
    {
      title: 'Blocked from tracking',
      detail: `${lockedBySafetyCount} match${lockedBySafetyCount === 1 ? '' : 'es'} remain outside tracking until blockers clear.`,
      tone: lockedBySafetyCount > 0 ? 'warn' : 'pass',
    },
    {
      title: 'Tracking record',
      detail: alreadyQueuedCount > 0
        ? `${alreadyQueuedCount} tracked match${alreadyQueuedCount === 1 ? '' : 'es'} already appear in claim tracking.`
        : 'A claim record appears after a reviewed match enters guarded tracking.',
      tone: alreadyQueuedCount > 0 ? 'pass' : 'warn',
    },
  ];
  // Guardrail marker: Review-to-tracking receipt remains an internal proof concept for server check coverage.
  const reviewToQueueReceiptRows = [
    {
      label: 'Tracking safety check',
      value: queueReadyCount > 0 ? `${queueReadyCount} can track` : 'No tracking release',
      detail: 'ClaimBot rechecks verdict, proof, form availability, category permission, and the plan filing allowance before tracking starts.',
      tone: queueReadyCount > 0 ? 'pass' : 'warn',
    },
    {
      label: 'Trust Lock acknowledgement',
      value: queueReadyCount > 0 ? 'Required per match' : 'Locked',
      detail: 'The tracking button carries the full-automation boundary and user acknowledgement before any claim row or filing job can be created.',
      tone: queueReadyCount > 0 ? 'pass' : 'warn',
    },
    {
      // Guardrail marker: CLAIM_QUEUE_BLOCKED and server check receipts stay internal; customers see account-history language.
      label: 'Blocked tracking record',
      value: lockedBySafetyCount > 0 ? `${lockedBySafetyCount} locked` : 'Clear',
      detail: 'If stale or direct requests fail a safety check, ClaimBot records the reason in account history without creating a claim row.',
      tone: lockedBySafetyCount > 0 ? 'warn' : 'pass',
    },
    {
      label: 'Submission boundary',
      value: filingMode === 'live' ? 'Live guarded' : 'Shadow only',
      detail: filingMode === 'live'
        ? 'Claim tracking is still only guarded intake; live dispatch depends on later claim-detail checks and filing acknowledgement.'
        : 'Claim tracking creates reviewable preparation work only. Shadow mode does not transmit submissions to administrators.',
      tone: filingMode === 'live' ? 'warn' : 'pass',
    },
  ];
  const actionNavigatorRows = [
    {
      label: 'Profile',
      title: totalSettlements > 0
        ? `${totalSettlements} ${settlementSearchEnabled ? 'claim source' : 'scoped'} record${totalSettlements === 1 ? '' : 's'} ready`
        : settlementSearchEnabled ? 'Claim sources pending' : 'Scoped records pending',
      detail: settlementSearchEnabled
        ? 'ClaimBot compares claim sources with saved profile facts.'
        : 'ClaimBot compares scoped opportunities with saved profile facts.',
      href: settlementSearchEnabled ? '/settlements' : '/goal',
      action: settlementSearchEnabled ? 'Find claims' : 'Review plan',
      tone: totalSettlements > 0 ? 'pass' : 'warn',
      icon: totalSettlements > 0 ? CheckCircle2 : AlertTriangle,
    },
    {
      label: 'Review',
      title: unresolvedRequirementCount > 0
        ? `${unresolvedRequirementCount} item${unresolvedRequirementCount === 1 ? '' : 's'} need attention`
        : queueReadyCount > 0 ? `${queueReadyCount} ready to track` : 'No ready matches yet',
      detail: unresolvedRequirementCount > 0
        ? 'Proof, permission, missing forms, or plan access must be handled before tracking.'
        : 'Review-ready matches still need your acknowledgement before tracking.',
      href: '#review-matches',
      action: 'Inspect matches',
      tone: queueReadyCount > 0 && unresolvedRequirementCount === 0 ? 'pass' : 'warn',
      icon: unresolvedRequirementCount > 0 ? LockKeyhole : CheckCircle2,
    },
    {
      label: 'Track',
      title: alreadyQueuedCount > 0
        ? `${alreadyQueuedCount} claim${alreadyQueuedCount === 1 ? '' : 's'} tracked`
        : filingMode === 'live' ? 'Live guarded' : 'Shadow review',
      detail: filingMode === 'live'
        ? 'Live mode still checks proof, permission, account history, and hosted filing posture.'
        : 'Tracked claims stay in shadow review unless live filing is explicitly enabled and reviewed.',
      href: '/claims',
      action: 'Track claims',
      tone: filingMode === 'live' ? 'warn' : 'pass',
      icon: filingMode === 'live' ? AlertTriangle : CheckCircle2,
    },
  ];
  const reviewBrowserRows: ReviewMatchBrowserRow[] = allRows.map(({ match, settlement }) => {
    const readiness = readinessByMatchId.get(match.id)!;
    const existingClaim = claimByMatch.get(match.id);
    const trace = match.reasoningJson as ReasoningTrace | null;

    return {
      id: match.id,
      settlementId: settlement.id,
      caseName: settlement.caseName,
      defendant: settlement.defendant,
      categoryLabel: categoryLabel(settlement.category),
      verdictLabel: verdictLabel(match.verdict),
      confidencePercent: Math.round(match.confidence * 100),
      readinessLabel: readiness.label,
      readinessDetail: readiness.detail,
      readinessTone: browserTone(readiness.tone),
      deadlineLabel: `Deadline: ${fmtDate(settlement.deadline)}`,
      proofRequired: settlement.proofRequired,
      authorizationActive: activeAuthCategories.has(settlement.category),
      claimFormLinked: Boolean(settlement.claimFormUrl),
      automationEntitlementActive: subscription.automationEnabled,
      alreadyQueued: Boolean(existingClaim),
      evidenceCount: trace?.evidence?.length ?? 0,
      settlementSearchEnabled,
      planLabel: subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1),
    };
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Match review</div>
          <h1>Review matches</h1>
          <p>
            Check possible matches before any claim moves forward. Claims that need proof,
            permission, a claim form, or a paid automation plan stay here.
          </p>
        </div>
        <form action={triggerMatcher} className="inline-form">
          <button className="btn" type="submit">
            Re-run matcher
          </button>
        </form>
      </div>

      <section className="review-action-navigator" aria-label="Review Action Navigator">
        <header className="review-action-navigator-head">
          <div>
            <div className="eyebrow">Action Navigator</div>
            <h2>Three steps: confirm facts, review matches, track claims.</h2>
            <p>
              Review stays simple on purpose. Proof, permission, claim-form, plan, and account-history checks
              still run before anything can move into claim tracking.
            </p>
          </div>
          <span className={`mode-badge ${filingMode === 'live' ? 'live' : 'shadow'}`}>
            {filingMode === 'live' ? 'Live guarded' : 'Shadow default'}
          </span>
        </header>
        <div className="review-action-navigator-grid">
          {actionNavigatorRows.map(({ icon: Icon, ...item }, index) => (
            <Link className={`review-action-navigator-item ${item.tone}`} href={item.href} key={item.label}>
              <span className={`review-action-navigator-icon ${item.tone}`} aria-hidden="true">
                <Icon size={17} />
              </span>
              <div>
                <small>Step {index + 1} - {item.label}</small>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <b>{item.action}</b>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <LaunchTrustBridge currentStep="safety" tierName={subscription.plan} />

      <details className="dashboard-detail-drawer review-refresh-drawer" aria-label="Match refresh history">
        <summary>
          <span>
            <strong>Match refresh history</strong>
            <small>Last matcher run, source count, changed matches, and errors.</small>
          </span>
          <b>{latestMatcherReceipt ? 'Recorded' : 'Pending'}</b>
        </summary>

      <section className="matcher-refresh-receipt" aria-label="Matcher Refresh Receipt">
        <header className="section-header">
          <div>
            {/* Guardrail marker: matcher refresh receipt backed by MATCHER_RUN_COMPLETED. */}
            <h2>Matcher refresh history</h2>
            <p className="muted">
              Re-running the matcher updates review data and records account history even when no
              verdicts change. That keeps support from guessing whether matches are stale, empty, or blocked.
            </p>
          </div>
          <div className="status-row">
            <form action={triggerMatcher} className="inline-form">
              <button className="btn ghost sm" type="submit">Re-run matcher and save history</button>
            </form>
            <Link className="btn ghost sm" href="/audit?actor=matcher">Open matcher history</Link>
          </div>
        </header>
        <div className="trust-strip">
          {matcherReceiptRows.map((row) => (
            <div className="trust-item" key={row.label}>
              <strong>{row.value}</strong>
              <span>{row.label}. {row.detail}</span>
            </div>
          ))}
        </div>
      </section>
      </details>

      {allRows.length === 0 && (
        <OperationalZeroState
          variant="review"
          meta="No matcher output is available for this user yet."
          actions={(
            <>
            <form action={triggerMatcher} className="inline-form">
              <button className="btn" type="submit">Re-run matcher</button>
            </form>
            <Link className="btn ghost" href="/profile">Refine criteria</Link>
            <Link className="btn ghost" href="/permissions">Manage permissions</Link>
            </>
          )}
        />
      )}

      <details className="dashboard-detail-drawer review-readiness-drawer" aria-label="More review checks">
        <summary>
          <span>
            <strong>More review details</strong>
            <small>Proof, permission, forms, plan access, and account-history checks.</small>
          </span>
          <b>{queueReadyCount} ready</b>
        </summary>

      <section className="claim-preflight-manifest" aria-label="Claim readiness checklist">
        <header className="claim-preflight-manifest-head">
          <div>
            <div className="eyebrow">Claim readiness checklist</div>
            <h2>What must be true before tracking</h2>
            <p>
              This read-only checkpoint summarizes the current filing mode, permissions, proof locks,
              form readiness, and plan checks before any match can move forward.
            </p>
          </div>
          <span className={`mode-badge ${filingMode === 'live' ? 'live' : 'shadow'}`}>
            {filingMode === 'live' ? 'Live mode guarded' : 'Shadow Mode active'}
          </span>
        </header>
        <div className="claim-preflight-manifest-grid">
          {manifestRows.map((row) => (
            <article className={`claim-preflight-manifest-item ${row.tone}`} key={row.label}>
              <span className={`manifest-gate-icon ${row.tone}`} aria-hidden="true">
                <row.icon size={16} strokeWidth={2.3} />
              </span>
              <div>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-section section-flush">
        <header className="section-header">
          <h2>Review readiness</h2>
          <p className="muted">
            This review separates matches that can move into claim tracking from records blocked by proof,
            missing forms, category permission, or prior claim activity.
          </p>
        </header>
        <div className="stats-grid" aria-label="Review readiness summary">
          <div className={`stat-card ${queueReadyCount > 0 ? 'needs-review' : ''}`}>
            <div className="stat-label">Ready to track</div>
            <div className="stat-value green">{queueReadyCount}</div>
          </div>
          <div className={`stat-card ${counts.NEEDS_REVIEW > 0 ? 'needs-review' : ''}`}>
            <div className="stat-label">Needs review</div>
            <Link className="stat-value stat-value-link warn" href="/review?verdict=NEEDS_REVIEW">{counts.NEEDS_REVIEW}</Link>
          </div>
          <div className="stat-card">
            <div className="stat-label">Already tracked</div>
            <Link className="stat-value stat-value-link blue" href="/claims">{alreadyQueuedCount}</Link>
          </div>
          <div className={`stat-card ${authorizationNeededCount > 0 ? 'needs-review' : ''}`}>
            <div className="stat-label">Permission needed</div>
            <Link className={`stat-value stat-value-link ${authorizationNeededCount > 0 ? 'warn' : 'text'}`} href="/permissions">
              {authorizationNeededCount}
            </Link>
          </div>
          <div className={`stat-card ${automationPlanNeededCount > 0 ? 'needs-review' : ''}`}>
            <div className="stat-label">Automation plan</div>
            <Link className={`stat-value stat-value-link ${subscription.automationEnabled ? 'green' : 'warn'}`} href="/pricing">
              {subscription.plan}
            </Link>
          </div>
        </div>
        <div className="trust-strip">
          <div className="trust-item">
            <strong>{proofRequiredCount} proof-required</strong>
            <span>These remain in review until documents or purchase records are handled.</span>
          </div>
          <div className="trust-item">
            <strong>{missingFormCount} missing forms</strong>
            <span>The filer needs a claim form URL before guarded automation can run.</span>
          </div>
          <div className="trust-item">
            <strong>{activeAuthCategories.size} active permissions</strong>
            <span>Category permissions are checked before tracking and again before filing work.</span>
          </div>
          <div className="trust-item">
            <strong>{subscription.automationEnabled ? 'Paid automation enabled' : `${automationPlanNeededCount} need paid automation`}</strong>
            <span>Free accounts include 5 guarded filings per month; paid plans remove the cap.</span>
          </div>
          <div className="trust-item">
            <strong>Evidence first</strong>
            <span>Matcher traces stay visible so weak or uncertain facts are not hidden.</span>
          </div>
        </div>
      </section>
      </details>

      <details className="dashboard-detail-drawer review-queue-receipts-drawer" aria-label="More tracking details">
        <summary>
          <span>
            <strong>More tracking details</strong>
            <small>Safety checks, blocked reasons, and tracking details.</small>
          </span>
          <b>{lockedBySafetyCount} locked</b>
        </summary>

      <section className="queue-gate-lock" aria-label="Tracking safety lock">
        <header className="queue-gate-lock-head">
          <div>
            <div className="eyebrow">Release checkpoint</div>
            <h2>Tracking safety lock</h2>
            <p>
              Use this checklist before tracking anything. A match only moves forward when the facts,
              category permission, claim form, paid automation access, and proof rule all line up.
            </p>
          </div>
          <Link className="btn ghost" href="/claims">Open claims</Link>
        </header>
        <div className="queue-gate-lock-grid">
          {queueGateRows.map((row) => (
            <article className={`queue-gate-lock-item ${row.tone}`} key={row.title}>
              <span className={`readiness-dot ${row.tone}`} aria-hidden="true" />
              <div>
                <strong>{row.title}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="queue-handoff-console" aria-label="Tracking context">
        <header className="queue-handoff-console-head">
          <div>
            <div className="eyebrow">Tracking context</div>
            <h2>How review decisions become tracked claims</h2>
            <p>
              This section keeps safety decisions, requirements, and tracking checks visible before
              a reviewed match enters claim tracking.
            </p>
          </div>
          <Link className="btn ghost" href="/claims">Open claims</Link>
        </header>
        <div className="queue-handoff-console-grid">
          {queueHandoffRows.map((row) => (
            <article className={`queue-handoff-console-item ${row.tone}`} key={row.title}>
              <span className={`readiness-dot ${row.tone}`} aria-hidden="true" />
              <div>
                <strong>{row.title}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="queue-gate-lock" aria-label="Review-to-tracking safety check">
        <header className="queue-gate-lock-head">
          <div>
            <div className="eyebrow">Review-to-tracking check</div>
            <h2>Safety checks before tracking</h2>
            <p>
              This check ties the visible review decision to the actual safety check. Claim tracking can only
              create a claim row and filing job after safety acknowledgement, proof, form, permission, plan,
              and matcher checks all pass again.
            </p>
          </div>
          <Link className="btn ghost" href="/audit?entity=match">Open blocked tracking history</Link>
        </header>
        <div className="queue-gate-lock-grid">
          {reviewToQueueReceiptRows.map((row) => (
            <article className={`queue-gate-lock-item ${row.tone}`} key={row.label}>
              <span className={`readiness-dot ${row.tone}`} aria-hidden="true" />
              <div>
                <strong>{row.label}: {row.value}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      </details>

      <section className="dashboard-section">
        <header className="section-header">
          <h2>Review decision guide</h2>
          <p className="muted">
            {settlementSearchEnabled
              ? 'Treat Review as the human checkpoint between source discovery and claim tracking. Nothing should move forward just because a settlement exists; the saved facts must support the match.'
              : 'Treat Review as the human checkpoint between scoped match intake and claim tracking. Nothing should move forward just because an opportunity was assigned; the saved facts must support the match.'}
          </p>
        </header>
        <div className="trust-strip">
          <div className="trust-item">
            <strong>Review only what fits</strong>
            <span>Saved facts must support the match before it can move forward.</span>
          </div>
          <div className="trust-item">
            <strong>Proof stays manual</strong>
            <span>Documents, purchase records, uncertain dates, and weak matches stay in review.</span>
          </div>
          <div className="trust-item">
            <strong>Track after consent</strong>
            <span>
              Permission, no-proof status, form availability, plan access, and account history are checked again.
            </span>
          </div>
        </div>
      </section>

      <div className="tabs">
        <Link className={`tab ${verdictFilter === 'ELIGIBLE' ? 'active' : ''}`} href="/review?verdict=ELIGIBLE">
          Eligible ({counts.ELIGIBLE})
        </Link>
        <Link className={`tab ${verdictFilter === 'NEEDS_REVIEW' ? 'active' : ''}`} href="/review?verdict=NEEDS_REVIEW">
          Needs review ({counts.NEEDS_REVIEW})
        </Link>
        <Link className={`tab ${verdictFilter === 'INELIGIBLE' ? 'active' : ''}`} href="/review?verdict=INELIGIBLE">
          Ineligible ({counts.INELIGIBLE})
        </Link>
        <Link className={`tab ${verdictFilter === 'all' ? 'active' : ''}`} href="/review?verdict=all">
          All ({counts.all})
        </Link>
      </div>

      <div className="notice evidence-guidance" role="note">
        <strong>Evidence rule:</strong>{' '}
        Move forward only with review-ready matches that have a passing matcher verdict, category permission, no proof
        requirement, and a claim form. Documents, purchase records, uncertain dates, and weak category matches
        should stay in review until the user confirms the supporting facts.
      </div>

      <div id="review-matches" />

      <ReviewMatchBrowser rows={reviewBrowserRows} />

      {rows.length === 0 && allRows.length > 0 ? (
        <div className="empty">
          <h3>No matches in this view</h3>
          <p>
            Complete intake, add purchase facts{breachImportEnabled ? ' or breach exposure' : ''},
            then re-run the matcher to refresh review matches.
          </p>
          <div className="status-row center-actions">
            <Link className="btn ghost sm" href="/profile">Update profile evidence</Link>
            <Link className="btn ghost sm" href="/permissions">Manage permissions</Link>
            {settlementSearchEnabled && (
              <Link className="btn ghost sm" href="/settlements">Check discovery health</Link>
            )}
          </div>
        </div>
      ) : rows.length > 0 ? (
        rows.map(({ match, settlement }) => {
          const trace = match.reasoningJson as ReasoningTrace | null;
          const existingClaim = claimByMatch.get(match.id);
          const readiness = readinessByMatchId.get(match.id)!;
          const authPreview = buildAuthorizationPreview(authorizationByCategory.get(settlement.category));

          return (
            <article key={match.id} className="card" aria-labelledby={`match-${match.id}-title`}>
              <div className="workflow-card-head">
                <div className="workflow-card-main">
                  <h3 id={`match-${match.id}-title`}>
                    {settlementSearchEnabled ? (
                      <Link href={`/settlements/${settlement.id}`}>{settlement.caseName}</Link>
                    ) : (
                      settlement.caseName
                    )}
                  </h3>
                  <div className="status-row">
                    <span className={`tag verdict-${match.verdict}`}>
                      {verdictLabel(match.verdict)} ({match.confidence.toFixed(2)})
                    </span>
                    <span className="tag">{settlement.category.toLowerCase().replace(/_/g, ' ')}</span>
                    {settlement.proofRequired ? (
                      <span className="tag warn">proof required</span>
                    ) : (
                      <span className="tag good">no proof required</span>
                    )}
                    <span className={`tag ${readiness.tone}`}>{readiness.label}</span>
                    <span className="tag">deadline: {fmtDate(settlement.deadline)}</span>
                  </div>
                </div>
                <div className="workflow-card-actions">
                  {readiness.canQueue ? (
                    <form action={queueClaimFromMatch} className="inline-form queue-trust-lock-form">
                      <input type="hidden" name="matchId" value={match.id} />
                      <input type="hidden" name="queueBoundaryAck" value={QUEUE_BOUNDARY_ACK} />
                      <div className="queue-trust-lock" aria-label="Safety check before tracking">
                        <strong>Safety check</strong>
                        <div className="queue-trust-lock-badges" aria-hidden="true">
                          <span>Review</span>
                          <span>Account record</span>
                          <span>Permission</span>
                        </div>
                        <label>
                          <input type="checkbox" name="queueTrustLock" value={QUEUE_TRUST_LOCK_ACK} required />
                          <span>
                            I reviewed the evidence and understand proof-required claims stay manual before any filing step.
                          </span>
                        </label>
                      </div>
                      <button className="btn" type="submit">
                        Track claim
                      </button>
                    </form>
                  ) : existingClaim ? (
                    <Link className="btn ghost" href={`/claims/${existingClaim.id}`}>
                      View claim
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className={`queue-readiness ${readiness.status}`} role="status">
                <strong>{readiness.label}</strong>
                <span>{readiness.detail}</span>
                {!readiness.canQueue && readiness.label === 'Permission needed' && (
                  <Link href="/permissions">Manage permissions</Link>
                )}
                {!readiness.canQueue && readiness.label === 'Automation plan needed' && (
                  <Link href="/pricing">View automation plans</Link>
                )}
              </div>

              <div className={`authorization-preview ${authPreview.status}`} aria-label="Permission preview before tracking">
                <div>
                  <span className={`readiness-dot ${authPreview.tone}`} aria-hidden="true" />
                  <strong>Permission preview before tracking: {authPreview.label}</strong>
                </div>
                <p>{authPreview.detail}</p>
                {authPreview.attestationPreview ? (
                  <blockquote>{authPreview.attestationPreview}</blockquote>
                ) : (
                  <Link href="/permissions">Add category permission</Link>
                )}
              </div>

              {trace?.evidence && trace.evidence.length > 0 ? (
                <div className="evidence-list" role="list" aria-label="Matcher evidence">
                  {trace.evidence.map((e, i) => (
                    <div key={i} className="notice evidence-item" role="listitem">
                      <span className={`tag verdict-${e.verdict}`}>
                        {e.ruleName} / {verdictLabel(e.verdict)} / {e.confidence.toFixed(2)}
                      </span>
                      <span>{e.reason}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted small">No detailed evidence trace was stored for this match.</p>
              )}
            </article>
          );
        })
      ) : null}
    </>
  );
}
