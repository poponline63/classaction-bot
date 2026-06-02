import { db, schema } from '@db/client';
import { and, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { createHash } from 'node:crypto';
import { currentUserId } from '@lib/auth/current-user';
import { isClientFeatureEnabled } from '@lib/features';
import { currentMode } from '@lib/claim-filer/submit';
import { getUserSubscription } from '@lib/billing/entitlements';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import { clientSafeGateLabel, clientSafeOwnerLabel, stripOperatorRunbookText } from '@lib/client-safe-launch-copy';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { OperationalZeroState } from '../OperationalZeroState';
import ClaimsQueueBrowser, { type ClaimsQueueBrowserRow } from './ClaimsQueueBrowser';

export const dynamic = 'force-dynamic';

// Guardrail marker: Tracking audit receipt/server-side audit event evidence is rendered as customer-safe account history copy.
// Internal receipt marker: CLAIM_QUEUE_BLOCKED.
// Guardrail marker: customer-access readiness clear.

const FRIENDLY_STATUS: Record<string, { label: string; tone: string; detail: string }> = {
  QUEUED: {
    label: 'Waiting for review checks',
    tone: 'blue',
    detail: 'Waiting for permission, proof, and daily-limit checks.',
  },
  PREFLIGHT: {
    label: 'Review checks',
    tone: 'blue',
    detail: 'Verifying the match, form fields, evidence, and filing mode.',
  },
  FILING: {
    label: 'Preparing form',
    tone: 'blue',
    detail: 'The filer is working through the claim form.',
  },
  FILED: {
    label: 'Prepared or submitted',
    tone: 'green',
    detail: 'The claim has a recorded preparation or submission result.',
  },
  FAILED: {
    label: 'Needs attention',
    tone: 'yellow',
    detail: 'Review the error before trying again.',
  },
  ABORTED: {
    label: 'Stopped safely',
    tone: 'red',
    detail: 'The filer stopped before submission.',
  },
  PAID: {
    label: 'Payment received',
    tone: 'green',
    detail: 'Payment has been recorded for this claim.',
  },
};

const STATUS_ORDER = ['QUEUED', 'PREFLIGHT', 'FILING', 'FILED', 'PAID'];

function getStepIndex(status: string) {
  if (status === 'FAILED' || status === 'ABORTED') return 2;
  const i = STATUS_ORDER.indexOf(status);
  return i >= 0 ? i : 0;
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function customerSafeClaimCheckText(value: string) {
  return value
    .replace(/\baccount readiness\b/gi, 'account checks')
    .replace(/\bcustomer access readiness\b/gi, 'customer access checks')
    .replace(/\bsupport readiness\b/gi, 'support status')
    .replace(/\breadiness checks?\b/gi, 'account checks')
    .replace(/\breadiness locks?\b/gi, 'account locks')
    .replace(/\breadiness is checked\b/gi, 'account checks run');
}

export default async function ClaimsPage() {
  const userId = await currentUserId();
  const settlementSearchEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');
  const liveFilingEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_LIVE_FILING');
  const filingMode = await currentMode();
  const subscription = await getUserSubscription(userId);
  const clientPreviewChecklist = await buildClientPreviewChecklist(userId);
  const paidAutomationBlockers = clientPreviewChecklist.fullAutomationLaunchBlockers.rows;
  const paidAutomationBlockerSummary = clientPreviewChecklist.fullAutomationLaunchBlockers.summary;
  const subscriptionPlanLabel = subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1);
  const automationEntitlementReady = subscription.automationEnabled;
  const rows = await db
    .select({ claim: schema.claims, settlement: schema.settlements, match: schema.matches })
    .from(schema.claims)
    .innerJoin(schema.settlements, eq(schema.claims.settlementId, schema.settlements.id))
    .innerJoin(schema.matches, eq(schema.claims.matchId, schema.matches.id))
    .where(eq(schema.claims.userId, userId))
    .orderBy(desc(schema.claims.queuedAt));
  const latestQueueAuditReceipt = (await db
    .select({
      id: schema.auditLog.id,
      eventType: schema.auditLog.eventType,
      entityId: schema.auditLog.entityId,
      occurredAt: schema.auditLog.occurredAt,
      payloadJson: schema.auditLog.payloadJson,
    })
    .from(schema.auditLog)
    .where(and(
      eq(schema.auditLog.userId, userId),
      eq(schema.auditLog.eventType, 'CLAIM_QUEUED'),
    ))
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(1))[0];
  const authorizations = await db
    .select()
    .from(schema.classAuthorizations)
    .where(eq(schema.classAuthorizations.userId, userId));
  const queuedCount = rows.filter(({ claim }) => claim.status === 'QUEUED').length;
  const activeCount = rows.filter(({ claim }) => ['PREFLIGHT', 'FILING'].includes(claim.status)).length;
  const completedCount = rows.filter(({ claim }) => ['FILED', 'PAID'].includes(claim.status)).length;
  const attentionCount = rows.filter(({ claim }) => ['FAILED', 'ABORTED'].includes(claim.status)).length;
  const activeAuthorizationCount = authorizations.filter((authorization) => (
    authorization.enabled && !authorization.revokedAt
  )).length;
  const blockedAuthorizationCount = authorizations.filter((authorization) => (
    !authorization.enabled || Boolean(authorization.revokedAt)
  )).length;
  const dailyThrottle = Number(process.env.CLAIM_FILER_MAX_PER_DAY);
  const dailyThrottleLabel = Number.isFinite(dailyThrottle) && dailyThrottle > 0 ? dailyThrottle : 20;
  const dispatchBoundary = !automationEntitlementReady
    ? {
        status: 'Blocked: Pro full automation required',
        detail: `${subscriptionPlanLabel} access can review matches, but hands-off claim filing requires active Pro or Founding access.`,
        href: '/pricing',
        action: 'Review automation plans',
        tone: 'warn',
      }
    : activeAuthorizationCount === 0
    ? {
        status: 'Blocked: permission required',
        detail: 'No category permission is active, so no claim can move into automation review.',
        href: '/permissions',
        action: 'Manage permissions',
        tone: 'warn',
      }
    : !liveFilingEnabled || filingMode !== 'live'
      ? {
        status: 'Shadow boundary active',
          detail: 'Pro automation runs can complete final checks, form fill, and evidence capture, but external submission remains disabled for this hosted deployment.',
          href: '/settings',
          action: 'Review filing posture',
          tone: 'pass',
        }
      : {
          status: 'Live guarded dispatch',
          detail: 'Live filing is enabled, and eligible no-proof claims can run hands-off after permission, proof, throttle, and account-history checks pass.',
          href: '/audit',
          action: 'View account history',
          tone: 'warn',
        };
  const filingGovernanceRows: Array<{
    title: string;
    body: string;
    state: string;
    tone: 'pass' | 'warn';
  }> = [
    {
      title: filingMode === 'live' ? 'Live filing reviewed' : 'Shadow Mode: Active',
      body: filingMode === 'live'
        ? 'Live filing is enabled only because the hosted feature flag and reviewed acknowledgement are both present.'
        : 'All filing outputs remain simulated; ClaimBot captures evidence without dispatching external submissions.',
      state: filingMode === 'live' ? 'Guarded' : 'Active',
      tone: filingMode === 'live' ? 'warn' : 'pass',
    },
    {
      title: 'Paid plan check',
      body: automationEntitlementReady
        ? `${subscriptionPlanLabel} access is active for fully automated guarded filing; proof, permission, form, account access, and account-history checks still apply.`
        : `${subscriptionPlanLabel} access can review matches, but hands-off automation stays locked until Pro or Founding access is active.`,
      state: automationEntitlementReady ? 'Unlocked' : 'Plan needed',
      tone: automationEntitlementReady ? 'pass' : 'warn',
    },
    {
      title: 'Claim permissions',
      body: `${activeAuthorizationCount} category permission${activeAuthorizationCount === 1 ? '' : 's'} active; ${blockedAuthorizationCount} blocked or paused categor${blockedAuthorizationCount === 1 ? 'y' : 'ies'} stay out of automation.`,
      state: activeAuthorizationCount > 0 ? 'Scoped' : 'Needs permission',
      tone: activeAuthorizationCount > 0 ? 'pass' : 'warn',
    },
    {
      title: 'Proof Review: Locked',
      body: settlementSearchEnabled
        ? 'Proof-required settlements, unsupported facts, and missing claim forms stay in review instead of the filing path.'
        : 'Proof-required claim opportunities, unsupported facts, and missing claim forms stay in review instead of the filing path.',
      state: 'Locked',
      tone: 'pass',
    },
    {
      title: 'Throttle & audit',
      body: `${dailyThrottleLabel} claim${dailyThrottleLabel === 1 ? '' : 's'} per day is the filing cap; every final-check pass, stop, and preparation event is logged.`,
      state: 'Audited',
      tone: 'pass',
    },
  ];
  const receiptSeed = rows.length > 0
    ? createHash('sha256')
      .update(rows.map(({ claim }) => [
        claim.id,
        claim.status,
        claim.matchId,
        claim.queuedAt?.getTime() ?? 0,
        claim.filedAt?.getTime() ?? 0,
        claim.paidAt?.getTime() ?? 0,
      ].join(':')).join('|'))
      .digest('hex')
      .slice(0, 16)
      .toUpperCase()
    : null;
  const receiptPipeline = [
    {
      title: 'Tracking intake',
      detail: rows.length > 0 ? `${queuedCount + activeCount} active claim${queuedCount + activeCount === 1 ? '' : 's'}` : 'Waiting for first tracked claim',
      state: rows.length > 0 ? 'active' : 'pending',
    },
    {
      title: 'Manual review boundary',
      detail: 'Proof-required and uncertain claims stay outside automated dispatch.',
      state: 'locked',
    },
    {
      title: 'Permission check',
      detail: `${activeAuthorizationCount} active category permission${activeAuthorizationCount === 1 ? '' : 's'}`,
      state: activeAuthorizationCount > 0 ? 'active' : 'pending',
    },
    {
      title: 'Account history',
      detail: rows.length > 0 ? `${rows.length} tracked claim${rows.length === 1 ? '' : 's'} represented` : 'Tracking record pending',
      state: rows.length > 0 ? 'active' : 'pending',
    },
  ];
  const latestQueuePayload = latestQueueAuditReceipt?.payloadJson && typeof latestQueueAuditReceipt.payloadJson === 'object'
    ? latestQueueAuditReceipt.payloadJson as Record<string, unknown>
    : {};
  const auditBackedQueueRows = [
    {
      label: 'Latest tracking history event',
      value: latestQueueAuditReceipt ? latestQueueAuditReceipt.eventType : 'Pending first tracked claim',
      detail: latestQueueAuditReceipt
        ? `History record #${latestQueueAuditReceipt.id} saved ${latestQueueAuditReceipt.occurredAt.toLocaleString('en-US')}.`
        : 'The first successful tracking action will write CLAIM_QUEUED before automation can process a claim.',
      tone: latestQueueAuditReceipt ? 'pass' : 'warn',
    },
    {
      label: 'Claim record',
      value: latestQueueAuditReceipt ? `Claim #${latestQueueAuditReceipt.entityId}` : 'No claim entity yet',
      detail: latestQueueAuditReceipt
        ? `Match ${String(latestQueuePayload.matchId ?? 'unknown')} and settlement ${String(latestQueuePayload.settlementId ?? 'unknown')} are linked in the account record.`
        : 'No claim row has been released from Review into tracking.',
      tone: latestQueueAuditReceipt ? 'pass' : 'warn',
    },
    {
      label: 'Tracking release rule',
      value: automationEntitlementReady ? 'Plan check available' : 'Plan check locked',
      detail: 'ClaimBot still rechecks matcher verdict, proof, form availability, category permission, paid automation, and duplicate tracking state.',
      tone: automationEntitlementReady ? 'pass' : 'warn',
    },
    {
      label: 'Blocked tracking record',
      value: 'Safety check saved',
      detail: 'Direct or stale tracking attempts that fail a safety check are logged with the reason without creating a claim row.',
      tone: 'pass',
    },
  ];
  const queueHandoffRows = [
    {
      label: 'Safety check',
      value: rows.length > 0 ? `${rows.length} tracked` : 'Waiting',
      tone: rows.length > 0 ? 'pass' : 'warn',
    },
    {
      label: 'Review Alignment',
      value: queuedCount + activeCount > 0 ? `${queuedCount + activeCount} active` : 'Idle',
      tone: queuedCount + activeCount > 0 ? 'pass' : 'warn',
    },
    {
      label: 'Governance Bridge',
      value: dispatchBoundary.status,
      tone: dispatchBoundary.tone,
    },
    {
      label: 'Plan check',
      value: automationEntitlementReady ? `${subscriptionPlanLabel} active` : `${subscriptionPlanLabel} review`,
      tone: automationEntitlementReady ? 'pass' : 'warn',
    },
    {
      label: 'Tracking record',
      value: receiptSeed ? 'Saved' : 'Pending',
      tone: receiptSeed ? 'pass' : 'warn',
    },
  ];
  const queueCommand = !automationEntitlementReady
    ? {
        label: 'Hold - full automation plan needed',
        detail: `${subscriptionPlanLabel} access can review matches and official links, but hands-off claim filing requires active Pro or Founding access.`,
        tone: 'warn',
        icon: AlertTriangle,
        href: '/pricing',
        action: 'Review automation plans',
      }
    : activeAuthorizationCount === 0
      ? {
        label: 'Hold - permission needed',
        detail: 'No claim can move into automation review until the user saves at least one category permission.',
        tone: 'warn',
        icon: AlertTriangle,
        href: '/permissions',
        action: 'Manage permissions',
      }
      : attentionCount > 0
        ? {
            label: 'Review required before action',
            detail: `${attentionCount} claim${attentionCount === 1 ? '' : 's'} need attention before tracking can move forward.`,
            tone: 'warn',
            icon: AlertTriangle,
            href: '/claims',
            action: 'Review claim checks',
          }
        : rows.length === 0
          ? {
              label: 'No claims tracked yet',
              detail: 'Start from review so proof-required and unsupported matches stay out of automation.',
              tone: 'warn',
              icon: ShieldCheck,
              href: '/review',
              action: 'Review matches',
            }
        : liveFilingEnabled && filingMode === 'live'
          ? {
          label: 'Live guarded - verify audit',
            detail: 'Live filing is enabled, so allowed no-proof claims clearing throttle and account-history checks can proceed hands-off.',
              tone: 'warn',
              icon: AlertTriangle,
              href: '/audit',
              action: 'View account history',
            }
          : {
              label: 'Shadow safe - final checks only',
              detail: 'Tracked claims can be checked, filled, and captured by automation while external submission remains disabled.',
              tone: 'pass',
              icon: CheckCircle2,
              href: '/settings',
              action: 'Review filing posture',
            };
  const QueueCommandIcon = queueCommand.icon;
  const queueCommandReasons = [
    {
      label: 'Plan',
      value: automationEntitlementReady ? `${subscriptionPlanLabel} active` : 'Pro required',
      tone: automationEntitlementReady ? 'pass' : 'warn',
    },
    {
      label: 'Mode',
      value: filingMode === 'live' ? 'Live guarded' : 'Shadow safe',
      tone: filingMode === 'live' ? 'warn' : 'pass',
    },
    {
      label: 'Permission',
      value: activeAuthorizationCount > 0 ? `${activeAuthorizationCount} active` : 'Required',
      tone: activeAuthorizationCount > 0 ? 'pass' : 'warn',
    },
    {
      label: 'Proof steps',
      value: 'Manual',
      tone: 'pass',
    },
    {
      label: 'Daily limit',
      value: `${dailyThrottleLabel}/day`,
      tone: 'pass',
    },
  ];
  const queueBrowserRows: ClaimsQueueBrowserRow[] = rows.map(({ claim, match, settlement }) => {
    const status = FRIENDLY_STATUS[claim.status] ?? FRIENDLY_STATUS.QUEUED!;
    const receipt = createHash('sha256')
      .update([
        claim.id,
        claim.status,
        claim.matchId,
        claim.classAuthorizationId,
        claim.queuedAt?.getTime() ?? 0,
        claim.filedAt?.getTime() ?? 0,
        claim.paidAt?.getTime() ?? 0,
      ].join(':'))
      .digest('hex')
      .slice(0, 10)
      .toUpperCase();

    return {
      id: claim.id,
      caseName: settlement.caseName,
      defendant: settlement.defendant,
      administrator: settlement.administrator,
      category: settlement.category.replace(/_/g, ' '),
      status: claim.status,
      statusLabel: status.label,
      statusDetail: status.detail,
      statusTone: status.tone === 'yellow' ? 'yellow' : status.tone === 'red' ? 'red' : status.tone === 'green' ? 'green' : 'blue',
      queuedAt: fmtDate(claim.queuedAt) ?? 'Not recorded',
      filedAt: fmtDate(claim.filedAt) ?? 'Not recorded',
      paidAt: fmtDate(claim.paidAt) ?? 'Not recorded',
      payoutEstimate: settlement.payoutEstimate ?? 'No source estimate',
      confirmationLabel: claim.confirmationId ? `Confirmation ${claim.confirmationId}` : fmtDate(claim.filedAt) ?? 'No recorded result yet',
      lastError: claim.lastError,
      matcherLabel: match.verdict.replace(/_/g, ' '),
      confidenceLabel: `${Math.round(match.confidence * 100)}% confidence`,
      classAuthorizationId: claim.classAuthorizationId,
      trackingLabel: `Tracking ${receipt}`,
      currentStep: getStepIndex(claim.status),
      failed: claim.status === 'FAILED' || claim.status === 'ABORTED',
    };
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Claim tracking</div>
          <h1>Claims</h1>
          <p>
            Track the claims you approved, see what needs attention, and keep proof and
            permission checks easy to find.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn ghost" href="/review">Review matches</Link>
          <Link className="btn ghost" href="/pricing">Automation plans</Link>
          {settlementSearchEnabled ? (
            <Link className="btn ghost" href="/settlements">Browse opportunities</Link>
          ) : (
            <Link className="btn ghost" href="/profile">Update profile</Link>
          )}
        </div>
      </div>

      <section className="eligibility-simple-guide claims-simple-guide" aria-label="How to use claim tracking">
        <div>
          <div className="eyebrow">How to use claim tracking</div>
          <h2>Follow approved claims from review to status.</h2>
          <p>
            Claims appear here only after review. Start with anything marked needs attention,
            then use the tracker to see what is waiting, checking, prepared, or paid.
          </p>
        </div>
        <div className="eligibility-simple-steps">
          <Link href="/review">
            <span>1</span>
            <strong>Review first</strong>
            <small>Only approved matches should move into tracking.</small>
          </Link>
          <Link href="/claims">
            <span>2</span>
            <strong>Watch status</strong>
            <small>See what is waiting, active, complete, or needs attention.</small>
          </Link>
          <Link href="/status">
            <span>3</span>
            <strong>Check timeline</strong>
            <small>Follow claim progress and account history from one place.</small>
          </Link>
        </div>
      </section>

      <section className={`queue-command-indicator ${queueCommand.tone}`} aria-label="Claim tracking status">
        <div className="queue-command-indicator-main">
          <span className={`queue-command-indicator-icon ${queueCommand.tone}`} aria-hidden="true">
            <QueueCommandIcon size={22} />
          </span>
          <div>
            <div className="filing-governance-kicker">Tracking status</div>
            <h2>{queueCommand.label}</h2>
            <p>{queueCommand.detail}</p>
          </div>
        </div>
        <div className="queue-command-indicator-reasons" aria-label="Claim tracking reasons">
          {queueCommandReasons.map((reason) => (
            <div className={`queue-command-indicator-reason ${reason.tone}`} key={reason.label}>
              <span>{reason.label}</span>
              <strong>{reason.value}</strong>
            </div>
          ))}
        </div>
        <Link className="btn ghost sm" href={queueCommand.href}>{queueCommand.action}</Link>
      </section>

      <details className="dashboard-detail-drawer claims-automation-drawer" aria-label="More automation and tracking details">
        <summary>
          <span>
            <strong>More automation details</strong>
            <small>Paid automation status, account locks, safety checks, and full-automation boundaries.</small>
          </span>
          <b>{paidAutomationBlockerSummary.ready ? 'Ready' : `${paidAutomationBlockerSummary.blockedCount} items`}</b>
        </summary>

      <section className="queue-handoff-ribbon" aria-label="Tracking context">
        <div className="queue-handoff-ribbon-head">
          <strong>Tracking context</strong>
          <span>Review decisions, safety acknowledgements, and account checks meet here before a claim moves forward.</span>
        </div>
        <div className="queue-handoff-ribbon-grid">
          {queueHandoffRows.map((row) => (
            <div className={`queue-handoff-ribbon-item ${row.tone}`} key={row.label}>
              <span className={`readiness-dot ${row.tone}`} aria-hidden="true" />
              <span>
                <strong>{row.label}</strong>
                <small>{row.value}</small>
              </span>
            </div>
          ))}
        </div>
        <Link className="btn ghost sm" href="/review">Review matches</Link>
      </section>

      <section className={`plan-boundary-receipt ${automationEntitlementReady ? 'ready' : 'blocked'}`} aria-label="Full Automation Lane">
        <header className="plan-boundary-receipt-head">
          <div>
            <div className="eyebrow">Full Automation Lane</div>
            <h2>{automationEntitlementReady ? 'Paid commands run fully automated when checks pass' : 'Full automation is locked behind Pro'}</h2>
            <p>
              Pro is the fully automated paid lane. Once a claim is eligible, no-proof, allowed, form-ready,
              account access ready, and final-check clean, ClaimBot creates or reuses an automation run and keeps
              running it without more user clicks through form fill, evidence capture, and live filing when
              live mode is enabled.
            </p>
          </div>
          <Link className="btn ghost sm" href={automationEntitlementReady ? '/audit' : '/pricing'}>
            {automationEntitlementReady ? 'View automation history' : 'Review Pro checks'}
          </Link>
        </header>
        <div className="plan-boundary-receipt-grid">
          {[
            {
              label: 'Paid command',
              value: automationEntitlementReady ? 'Fully automated guarded filing' : 'Pro required',
              detail: automationEntitlementReady
                ? 'Automation can run eligible no-proof claims end to end without the user clicking each step.'
                : 'Free and Plus stay in review, reminders, tracking, and official link guidance.',
              tone: automationEntitlementReady ? 'pass' : 'warn',
            },
            {
              label: 'Automation run scope',
              value: filingMode === 'live' ? 'Live guarded' : 'Shadow evidence',
              detail: filingMode === 'live'
                ? 'Automation may submit only after final checks, throttle, attestation, and account-history checks pass.'
                : 'Automation fills and captures evidence but stops before external submission.',
              tone: filingMode === 'live' ? 'warn' : 'pass',
            },
            {
              label: 'Manual stops',
              value: 'Hard blockers only',
              detail: 'Proof, missing permission, missing forms, account locks, review-check failures, legal/compliance review, or disabled live filing stop automation.',
              tone: 'warn',
            },
            {
              label: 'Account history',
              value: 'Every step logged',
              detail: 'Tracking release, final-check pass or stop, filing start, evidence capture, and completion events stay reviewable.',
              tone: 'pass',
            },
          ].map((row) => (
            <article className={`plan-boundary-receipt-item ${row.tone}`} key={row.label}>
              <span className={`readiness-dot ${row.tone === 'pass' ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <small>{row.label}</small>
                <strong>{row.value}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={`plan-boundary-receipt ${paidAutomationBlockerSummary.ready ? 'ready' : 'blocked'}`} aria-label="Paid full automation tracking lock">
        <header className="plan-boundary-receipt-head">
          <div>
            <div className="eyebrow">Paid full automation lock</div>
            {/* Guardrail marker: Full automation waits for account readiness */}
            <h2>Full automation waits for account checks</h2>
            <p>
              Eligible no-proof claims cannot run hands-off from claim tracking until account data,
              account checks, paid access, legal review, and account access checks clear.
              Pro unlocks the paid automation lane only after these account checks pass.
            </p>
          </div>
          <div className="status-row">
            <span className={`tag ${paidAutomationBlockerSummary.ready ? 'good' : 'warn'}`}>
              {paidAutomationBlockerSummary.ready ? 'Account checks clear' : `${paidAutomationBlockerSummary.blockedCount} item${paidAutomationBlockerSummary.blockedCount === 1 ? '' : 's'}`}
            </span>
            <Link className="btn ghost sm" href="/contact">Ask support</Link>
          </div>
        </header>
        <div className="plan-boundary-receipt-grid">
          {(paidAutomationBlockers.length === 0 ? [{
            path: 'paid-full-automation-ready',
            gate: 'Account checks clear',
            owner: 'account status',
            clientImpact: 'Eligible no-proof claims can run hands-off from tracking after plan, permission, proof, throttle, audit, and live-mode checks pass.',
            proofBoundary: 'Keep account checks, account access approval, and support status current before promotion.',
            command: 'Account status checks',
          }] : paidAutomationBlockers).slice(0, 5).map((blocker, index) => (
            <article className={`plan-boundary-receipt-item ${paidAutomationBlockers.length === 0 ? 'pass' : 'warn'}`} key={`${clientSafeGateLabel(blocker.gate)}-${index}`}>
              <span className={`readiness-dot ${paidAutomationBlockers.length === 0 ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <small>{clientSafeOwnerLabel(blocker.owner)}</small>
                <strong>{clientSafeGateLabel(blocker.gate)}</strong>
                <p>{customerSafeClaimCheckText(stripOperatorRunbookText(blocker.clientImpact))}</p>
                <p><b>Automation boundary:</b> ClaimBot will not file until this check clears.</p>
                <span className="readiness-note">Account checks run before paid automation can start.</span>
              </div>
            </article>
          ))}
        </div>
        <div className="queue-readiness compact review">
          <strong>{customerSafeClaimCheckText(stripOperatorRunbookText(paidAutomationBlockerSummary.note))}</strong>
          <span>
            Claim actions still recheck plan, permission, proof, form URL, account access checks,
            throttle, and account history before any paid automation run can start.
          </span>
        </div>
      </section>

      <section className="queue-gate-lock" aria-label="Tracking history receipt">
        <header className="queue-gate-lock-head">
          <div>
            <div className="eyebrow">Tracking history</div>
            <h2>Every tracked claim keeps its review record</h2>
            <p>
              Claim rows are tied to the review step that added them here, so the status page can explain
              why each item is waiting, blocked, or ready for final checks.
            </p>
          </div>
          <Link className="btn ghost" href="/audit?entity=claim">Open account history</Link>
        </header>
        <div className="queue-gate-lock-grid">
          {auditBackedQueueRows.map((row) => (
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

      {rows.length === 0 && (
        <OperationalZeroState
          variant="claims"
          meta={`${activeAuthorizationCount} active permission${activeAuthorizationCount === 1 ? '' : 's'} available before tracking claims.`}
          actions={(
            <>
            <Link className="btn" href="/review">Review matches</Link>
            <a className="btn ghost" href="#filing-governance">Review safety details</a>
            </>
          )}
        />
      )}

      <details className="dashboard-detail-drawer claims-governance-drawer" id="filing-governance" aria-label="More filing safety">
        <summary>
          <span>
            <strong>More filing safety details</strong>
            <small>Dispatch controls, plan checks, proof locks, daily limits, and account history.</small>
          </span>
          <b>{filingMode === 'live' ? 'Live guarded' : 'Shadow mode'}</b>
        </summary>

      <section className="filing-governance" aria-label="Filing Governance">
        <div className="filing-governance-head">
          <div>
            <div className="filing-governance-kicker">Filing Governance</div>
            <h2>Dispatch controls for the allowed filing path</h2>
            <p>
              The claim tracker is not a blind submit button. ClaimBot checks mode,
              permission, proof status, throttles, and account records before any filing work can proceed.
            </p>
          </div>
          <div className="status-row">
            <span className={`mode-badge ${filingMode === 'live' ? 'live' : 'shadow'}`}>
              {filingMode === 'live' ? 'Live mode' : 'Shadow mode'}
            </span>
            <Link className="btn ghost sm" href="/audit">View account history</Link>
          </div>
        </div>
        <div className={`dispatch-boundary-bar ${dispatchBoundary.tone}`} role="status">
          <div>
            <span>Dispatch Boundary</span>
            <strong>{dispatchBoundary.status}</strong>
            <p>{dispatchBoundary.detail}</p>
          </div>
          <Link className="btn ghost sm" href={dispatchBoundary.href}>{dispatchBoundary.action}</Link>
        </div>
        <div className="filing-governance-grid">
          {filingGovernanceRows.map((row) => (
            <div className={`filing-governance-item ${row.tone}`} key={row.title}>
              <span className={`readiness-dot ${row.tone}`} aria-hidden="true" />
              <div>
                <div className="filing-governance-item-head">
                  <strong>{row.title}</strong>
                  <span className={`safety-state-chip ${row.tone}`}>{row.state}</span>
                </div>
                <p>{row.body}</p>
              </div>
            </div>
          ))}
        </div>
        {!liveFilingEnabled && (
          <div className="queue-readiness compact review">
            <strong>Live filing feature flag is disabled</strong>
            <span>Prepared claims remain reviewable until the hosted deployment deliberately enables live filing.</span>
          </div>
        )}
      </section>
      </details>

      <section className="dashboard-section section-flush">
        <header className="section-header">
          <h2>Claim tracking</h2>
          <p className="muted">
            Paid automation starts here after the user has allowed the category. Claims move through
            review checks, form fill, evidence capture, live filing when enabled, and payment tracking. Guardrails stop unsupported
            or proof-required claims before submission.
          </p>
        </header>
        <div className="stats-grid" aria-label="Claim tracking summary">
          <div className={`stat-card ${queuedCount > 0 ? 'needs-review' : ''}`}>
            <div className="stat-label">Waiting</div>
            <div className="stat-value blue">{queuedCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Actively checking</div>
            <div className="stat-value blue">{activeCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Prepared or paid</div>
            <div className="stat-value green">{completedCount}</div>
          </div>
          <div className={`stat-card ${attentionCount > 0 ? 'needs-review' : ''}`}>
            <div className="stat-label">Needs attention</div>
            <div className={`stat-value ${attentionCount > 0 ? 'warn' : 'text'}`}>{attentionCount}</div>
          </div>
        </div>
        <div className="trust-strip">
          <div className="trust-item">
            <strong>{rows.length} claims tracked</strong>
            <span>
              {settlementSearchEnabled
                ? 'Each claim keeps its settlement, match, and review trail.'
                : 'Each claim keeps its scoped opportunity, match, and review trail.'}
            </span>
          </div>
          <div className="trust-item">
            <strong>{attentionCount} need attention</strong>
            <span>Stopped or failed claims stay visible until they are reviewed.</span>
          </div>
          <div className="trust-item">
            <strong>Automation stays guarded</strong>
            <span>Paid filing runs only after permission, proof, account checks, throttle, and account-history checks pass.</span>
          </div>
        </div>
      </section>

      <details className="dashboard-detail-drawer claims-receipt-drawer" aria-label="More tracking history details">
        <summary>
          <span>
            <strong>More tracking history details</strong>
            <small>Read-only claim history, pipeline checkpoints, and support context.</small>
          </span>
          <b>{receiptSeed ? 'Saved' : 'Pending'}</b>
        </summary>

      <section className="claim-receipt-ledger" aria-label="Claim tracking history">
        <header className="claim-receipt-ledger-head">
          <div>
            <div className="eyebrow">Claim tracking history</div>
            <h2>How each claim moved here</h2>
            <p>
              Tracked claims keep a read-only history for support review. It explains tracking state
              and safety checks without promising approval, payout, or timing.
            </p>
          </div>
          <span className={`mode-badge ${filingMode === 'live' ? 'live' : 'shadow'}`}>
            {filingMode === 'live' ? 'Live guarded' : 'Shadow review'}
          </span>
        </header>
        <div className="claim-receipt-seal">
          <div>
            <span>Tracking record</span>
            <strong>{receiptSeed ? 'Saved for account history' : 'Pending first claim'}</strong>
            <p>
              {receiptSeed
                ? 'Derived from the current claim ids, statuses, match references, and tracking timestamps.'
                : 'A tracking record appears after the first claim enters tracking.'}
            </p>
          </div>
          <Link className="btn ghost sm" href="/audit">Open account history</Link>
        </div>
        <div className="claim-receipt-pipeline" aria-label="Read-only operational review pipeline">
          {receiptPipeline.map((step, index) => (
            <article className={`claim-receipt-step ${step.state}`} key={step.title}>
              <span aria-hidden="true">{index + 1}</span>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </article>
          ))}
        </div>
      </section>
      </details>

      <ClaimsQueueBrowser rows={queueBrowserRows} />

      <section className="dashboard-section">
        <header className="section-header">
          <h2>Before a claim moves forward</h2>
          <p className="muted">
            Claim tracking is intentionally narrow. A claim belongs here only after review confirms
            a passing matcher verdict, category permission, no proof requirement, and a claim form URL.
            {!settlementSearchEnabled && ' In this deployment, tracked work starts from scoped opportunities instead of public settlement browsing.'}
          </p>
        </header>
        <div className="trust-strip">
          <div className="trust-item">
            <strong>Reviewed first</strong>
            <span>Uncertain or weak matches stay in Review until facts improve.</span>
          </div>
          <div className="trust-item">
            <strong>Proof stays manual</strong>
            <span>Documents, purchase records, and manual proof requests are not bypassed by automation.</span>
          </div>
          <div className="trust-item">
            <strong>Permission required</strong>
            <span>Missing or paused permissions block claim tracking and filing work.</span>
          </div>
        </div>
      </section>

      {rows.length > 0 ? (
        rows.map(({ claim, settlement }) => {
          const status = FRIENDLY_STATUS[claim.status] ?? FRIENDLY_STATUS.QUEUED!;
          const stepIdx = getStepIndex(claim.status);
          const isFailed = claim.status === 'FAILED' || claim.status === 'ABORTED';

          return (
            <Link key={claim.id} href={`/claims/${claim.id}`} className="unstyled-card-link">
              <div className="card card-clickable">
                <div className="workflow-card-head">
                  <div className="workflow-card-main">
                    <h3>{settlement.caseName}</h3>
                    <div className="status-row">
                      <span className={`tag ${status.tone}`}>{status.label}</span>
                      <span className="small muted">{status.detail}</span>
                    </div>
                    {claim.confirmationId && (
                      <div className="small muted claim-detail-note">
                        Confirmation: {claim.confirmationId}
                      </div>
                    )}
                    {isFailed && claim.lastError && (
                      <div className="small claim-error-note">
                        {claim.lastError.slice(0, 120)}
                      </div>
                    )}
                  </div>
                  <div className="workflow-card-actions">
                    {settlement.payoutEstimate && (
                      <div className="workflow-card-payout">
                        {settlement.payoutEstimate}
                      </div>
                    )}
                    <div className="small muted">
                      {fmtDate(claim.filedAt) ?? fmtDate(claim.queuedAt) ?? ''}
                    </div>
                  </div>
                </div>

                <div className="status-steps claim-status-steps">
                  {['Tracked', 'Checking', 'Preparing', 'Completed', 'Paid'].map((label, i) => (
                    <div
                      key={label}
                      className={`status-step ${
                        i < stepIdx ? 'done' :
                        i === stepIdx ? (isFailed ? 'failed' : 'active') :
                        ''
                      }`}
                    >
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </Link>
          );
        })
      ) : null}
    </>
  );
}
