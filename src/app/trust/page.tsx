import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import {
  Eye,
  History,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { db, schema } from '@db/client';
import { buildLaunchEvidence, readLatestMatcherRunReceipt } from '@lib/audit/support-packet';
import { currentUserId } from '@lib/auth/current-user';
import { getBillingReadiness } from '@lib/billing/checkout';
import { getUserSubscription } from '@lib/billing/entitlements';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import {
  clientSafeBillingBlockReason,
  clientSafeExecutionBoundary,
  clientSafeGateLabel,
  clientSafeLaunchAction,
  clientSafeLaunchLabel,
  clientSafeOwnerLabel,
  clientSafeProofArtifactSummary,
  clientSafeRequiredInputSummary,
  stripOperatorRunbookText,
} from '@lib/client-safe-launch-copy';
import { getLaunchReadiness } from '@lib/launch-readiness';
import TrustComplianceBrowser, { type TrustBrowserSection } from './TrustComplianceBrowser';

export const dynamic = 'force-dynamic';

// Guardrail markers: Setup checklist; Next setup item; Next setup trust boundary; Product readiness;
// Customer access setup plan; Remaining setup is traceable; Setup details stay in Launch and Packet Center;
// Hands-off paid filing still needs setup; Paid automation readiness; Customer access readiness.

// Audit/privacy packet evidence: Deletion requests are recorded for operator handling.
// Guardrail marker: raw executionBoundary values are sanitized with clientSafeExecutionBoundary before render.

function formatDate(value: Date | number | string | null | undefined) {
  if (!value) return 'Not recorded';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function statusLabel(ok: boolean) {
  return ok ? 'Confirmed' : 'Needs attention';
}

function customerSafeTrustText(value: string) {
  return value
    .replace(/\boperator[- ]owned external setup\b/gi, 'business account step')
    .replace(/\boperator\b/gi, 'support team')
    .replace(/\bsetup details\b/gi, 'account details')
    .replace(/\bsetup evidence\b/gi, 'account records')
    .replace(/\bsetup checklist\b/gi, 'account checklist')
    .replace(/\bsetup\b/gi, 'account step')
    .replace(/\bcustomer access readiness\b/gi, 'customer access checks')
    .replace(/\bsupport readiness\b/gi, 'support status')
    .replace(/\bpaid automation readiness\b/gi, 'paid automation status')
    .replace(/\breadiness status\b/gi, 'account status')
    .replace(/\breadiness checks?\b/gi, 'account checks')
    .replace(/\breadiness items?\b/gi, 'account items')
    .replace(/\breadiness proof\b/gi, 'account check')
    .replace(/\breadiness\b/gi, 'account status')
    .replace(/\bproof artifacts?\b/gi, 'account records');
}

export default async function TrustPage() {
  const userId = await currentUserId();
  const [launchReadiness, subscription, recentAuditEvents, matcherRunReceipt] = await Promise.all([
    getLaunchReadiness(),
    getUserSubscription(userId),
    db
      .select({
        id: schema.auditLog.id,
        eventType: schema.auditLog.eventType,
        actor: schema.auditLog.actor,
        entityType: schema.auditLog.entityType,
        occurredAt: schema.auditLog.occurredAt,
      })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.userId, userId))
      .orderBy(desc(schema.auditLog.occurredAt))
      .limit(6),
    readLatestMatcherRunReceipt(userId),
  ]);
  const clientPreviewChecklist = await buildClientPreviewChecklist(userId);
  const {
    current,
    databaseSchemaReadiness,
    mode,
    readiness,
    sourceCatalogReadiness,
  } = launchReadiness;
  const billing = getBillingReadiness();
  const launchEvidence = buildLaunchEvidence({
    settings: current,
    subscription,
    databaseSchemaReadiness,
    sourceCatalogReadiness,
    matcherRunReceipt,
  });
  const launchCriticalPath = launchEvidence.launchCriticalPath;
  const setupAutomationControls = launchEvidence.automationControls.setupShadowReview;
  const billingCheckoutHandoff = launchEvidence.automationControls.billingCheckoutHandoff;
  const planGate = launchEvidence.planGate;
  const proCheckoutBlockReason = clientSafeBillingBlockReason(billingCheckoutHandoff.checkoutBlockReasons.proMonthly);
  const legalReviewCheckoutLock = clientSafeBillingBlockReason(
    billingCheckoutHandoff.expectedBlockReasonWhenLegalReviewMissing,
  );
  const nextExternalProof = clientPreviewChecklist.summary.nextStep;
  const paidAutomationBlockerSummary = clientPreviewChecklist.fullAutomationLaunchBlockers.summary;
  const paidAutomationBlockers = clientPreviewChecklist.fullAutomationLaunchBlockers.rows;
  const blockedClientPreviewItems = clientPreviewChecklist.items.filter((item) => item.status !== 'ready');
  const blockedClientPreviewActionRows = clientPreviewChecklist.launchActionPlan.rows
    .filter((item) => item.status !== 'confirmed')
    .slice(0, 2);
  const simpleReadinessRows = [
    {
      label: 'Product checks',
      value: `${clientPreviewChecklist.summary.readyCount}/${clientPreviewChecklist.summary.totalCount} ready`,
      detail: clientPreviewChecklist.summary.clientPreviewReady
        ? 'The customer-facing flow is ready for use.'
        : 'Some account checks still need confirmation before account access.',
      ok: clientPreviewChecklist.summary.blockedCount === 0,
    },
    {
      label: 'Account checklist',
      value: `${clientPreviewChecklist.summary.launchPacketReadyCount}/${clientPreviewChecklist.summary.launchPacketTotalCount} ready`,
      detail: 'Account checks are reviewed before account access.',
      ok: clientPreviewChecklist.summary.launchPacketReadyCount === clientPreviewChecklist.summary.launchPacketTotalCount,
    },
    {
      label: 'Paid automation availability',
      value: paidAutomationBlockerSummary.ready ? 'Ready' : 'Locked',
      detail: paidAutomationBlockerSummary.ready
        ? 'No-proof claims that pass review can run through the guarded automation lane.'
        : 'Hands-off filing stays off until account checks, billing, legal review, and published-site checks are complete.',
      ok: paidAutomationBlockerSummary.ready,
    },
    {
      label: 'Needed next',
      value: nextExternalProof ? clientSafeLaunchLabel(nextExternalProof) : 'None',
      detail: nextExternalProof
        ? clientSafeLaunchAction(nextExternalProof)
        : 'No remaining account task is blocking account access.',
      ok: nextExternalProof === null,
    },
  ];

  const statusCards = [
    {
      label: 'Automation status',
      value: mode === 'live' ? 'Reviewed filing' : 'Review mode',
      detail: mode === 'live'
        ? 'Filing checks facts, permission, proof, and account history first.'
        : 'ClaimBot can find matches now; filing stays off until the account is ready.',
      ok: mode !== 'live' || readiness.ok,
      icon: Eye,
    },
    {
      label: 'Payment safety',
      value: billing.ready ? 'Checkout ready' : 'Checkout locked',
      detail: billing.ready
        ? 'Payments use hosted checkout; card details stay with the payment processor.'
        : 'Paid automation is locked until checkout and compliance review are ready.',
      ok: billing.ready,
      icon: Lock,
    },
    {
      label: 'Account record',
      value: recentAuditEvents.length > 0 ? `${recentAuditEvents.length} recent events` : 'Ready for events',
      detail: recentAuditEvents.length > 0
        ? 'Important account actions are recorded without showing private evidence here.'
        : 'Important account, claim, billing, and support actions will be recorded.',
      ok: true,
      icon: History,
    },
  ];

  const trustSections = [
    {
      id: 'facts',
      title: 'Real facts only',
      icon: 'eye',
      tone: 'safety',
      body: 'Saved facts and source rules drive review. A possible match is not the same thing as a submitted claim.',
    },
    {
      id: 'proof',
      title: 'Proof stays manual',
      icon: 'shield',
      tone: 'safety',
      body: 'Claims that need documents, purchase records, signatures, or notice letters pause until those proof items are handled.',
    },
    {
      id: 'activity',
      title: 'Every action is logged',
      icon: 'history',
      tone: 'audit',
      body: 'Review, support, billing, and filing-related actions keep an account history so support can explain what happened.',
    },
    {
      id: 'privacy',
      title: 'Privacy requests are controlled',
      icon: 'lock',
      tone: 'hosted',
      body: 'Privacy exports and privacy requests are authenticated, audited, and no-store. Deletion requests are recorded for manual handling instead of silently deleting claim, billing, or account history.',
    },
  ] satisfies TrustBrowserSection[];

  const trustAuditRows = recentAuditEvents.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    actor: event.actor,
    entityType: event.entityType,
    occurredAt: formatDate(event.occurredAt),
  }));

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Trust center</div>
          <h1>Trust and safety</h1>
          <p>
            The short version of what ClaimBot can automate, what still needs review,
            and how your account history stays explainable.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/help">Get help</Link>
          <Link className="btn ghost" href="/permissions">Review permissions</Link>
        </div>
      </div>

      <section className={`system-posture ${mode === 'live' ? 'live' : 'shadow'}`} aria-label="Trust posture summary">
        <ShieldCheck aria-hidden="true" size={22} />
        <div>
          <strong>{mode === 'live' ? 'Live filing is reviewed and guarded' : 'Shadow mode is the active safety baseline'}</strong>
          <span>
            No claim can bypass saved facts, permission, proof review, or account history.
          </span>
        </div>
      </section>

      <TrustComplianceBrowser sections={trustSections} auditEvents={trustAuditRows} />

      <details className="dashboard-detail-drawer trust-readiness-drawer" aria-label="Account safety details">
        <summary>
          <span>
            <strong>Account safety details</strong>
            <small>
              Account checks, payment safety, and support status. Detailed records stay out of the main safety view.
            </small>
          </span>
          <b>{clientPreviewChecklist.summary.clientPreviewReady ? 'Ready' : 'Needs checks'}</b>
        </summary>

        <section className="launch-critical-path" aria-label="Account access status">
          <header className="launch-critical-path-head">
            <div>
              <div className="eyebrow">Status view</div>
              <h2>
                {clientPreviewChecklist.summary.clientPreviewReady
                  ? 'Account access is ready'
                  : 'Account access still needs checks'}
              </h2>
              <p>
                Customers should see the simple safety promise above. This drawer keeps the remaining
                access and paid-automation checks short.
              </p>
            </div>
            <span className={`tag ${clientPreviewChecklist.summary.clientPreviewReady ? 'good' : 'warn'}`}>
              {clientPreviewChecklist.summary.blockedCount} items
            </span>
          </header>

          <div className="support-readiness-receipt-grid">
            {simpleReadinessRows.map((item) => (
              <div className={`support-readiness-receipt-item ${item.ok ? 'pass' : 'warn'}`} key={item.label}>
                <span className={`status-dot ${item.ok ? 'ok' : 'warn'}`} aria-hidden="true" />
                <div>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                <p>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <section className="stats-grid" aria-label="Trust status cards">
            {statusCards.map(({ detail, icon: Icon, label, ok, value }) => (
              <article className={`stat-card ${ok ? '' : 'needs-review'}`} key={label}>
                <span className={`status-dot ${ok ? 'ok' : 'warn'}`} aria-hidden="true" />
                <Icon aria-hidden="true" size={20} />
                <div className="stat-value">{value}</div>
                <p>{label}</p>
                <small>{detail}</small>
              </article>
            ))}
          </section>

          <div className="support-readiness-receipt" aria-label="Trust support readiness summary">
            <div className="support-readiness-receipt-head">
              <div>
                {/* Guardrail marker: Support readiness evidence */}
                <div className="eyebrow">Support status</div>
                <h3>Support can see the important status</h3>
                <p>
                  Checkout, consent, matching, and account status stay visible as short support lines.
                  Detailed status stays in account records.
                </p>
              </div>
              <span className={`tag ${launchCriticalPath.every((item) => item.status !== 'blocked') ? 'good' : 'warn'}`}>
                {launchCriticalPath.filter((item) => item.status === 'blocked').length} items
              </span>
            </div>
            <div className="support-readiness-receipt-grid">
              {[
                {
                  label: 'Match refresh status',
                  value: matcherRunReceipt.exists ? 'Recorded' : 'Not recorded',
                  detail: 'A recent match refresh can be checked by support without exposing profile facts.',
                  ok: matcherRunReceipt.exists,
                },
                {
                  label: 'User consent status',
                  value: setupAutomationControls.termsEventType,
                  detail: `Terms acknowledgement: ${setupAutomationControls.requiredTermsAck}.`,
                  ok: true,
                },
                {
                  label: 'Paid checkout status',
                  value: planGate.paidCheckoutReady ? 'Checkout clear' : 'Checkout locked',
                  detail: `Processor billing ${statusLabel(planGate.paymentProcessorReady).toLowerCase()}; Pro checkout: ${proCheckoutBlockReason.toLowerCase()}; legal review: ${legalReviewCheckoutLock.toLowerCase()}.`,
                  ok: planGate.paidCheckoutReady,
                },
                {
                  label: 'Installed app stays safe',
                  value: 'No claim cache',
                  detail: 'The offline shell does not cache claim records, proof documents, filing drafts, or legal decisions.',
                  ok: true,
                },
              ].map((item) => (
                <div className={`support-readiness-receipt-item ${item.ok ? 'pass' : 'warn'}`} key={item.label}>
                  <span className={`status-dot ${item.ok ? 'ok' : 'warn'}`} aria-hidden="true" />
                  <div>
                    <small>{item.label}</small>
                    <strong>{item.value}</strong>
                    <p>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="status-action-plan-grid">
              {launchCriticalPath.slice(0, 2).map((item, index) => (
                <article className="status-action-plan-item" key={`${clientSafeLaunchLabel(item)}-${index}`}>
                  <small>{clientSafeOwnerLabel(item.owner)}</small>
                  <strong>{clientSafeLaunchLabel(item)}</strong>
                  <p>{customerSafeTrustText(stripOperatorRunbookText(item.proofNeeded))}</p>
                </article>
              ))}
            </div>
          </div>

          {nextExternalProof && (
            <div className="support-readiness-receipt" aria-label="Next account trust boundary">
              <div className="support-readiness-receipt-head">
                <div>
                  <div className="eyebrow">Next account trust boundary</div>
                  <h3>{clientSafeLaunchLabel(nextExternalProof)}</h3>
                  <p>{customerSafeTrustText(clientSafeExecutionBoundary(nextExternalProof))}</p>
                </div>
                <span className="tag warn">{clientSafeOwnerLabel(nextExternalProof.owner)}</span>
              </div>
              <div className="status-row compact">
                <span className="tag warn">Needed next: {clientSafeRequiredInputSummary(nextExternalProof.requiredInputs, 3)}</span>
                <span className="tag">Current status: {customerSafeTrustText(clientSafeProofArtifactSummary(nextExternalProof))}</span>
              </div>
              <span className="readiness-note">Detailed account records stay out of the main safety view.</span>
            </div>
          )}

          {blockedClientPreviewActionRows.length > 0 && (
            <div className="support-readiness-receipt" aria-label="Trust account access plan">
              <div className="support-readiness-receipt-head">
                <div>
                  <div className="eyebrow">Account access plan</div>
                  <h3>Remaining account work is traceable</h3>
                  <p>
                    {clientPreviewChecklist.launchActionPlan.summary.blockedSteps} account step{clientPreviewChecklist.launchActionPlan.summary.blockedSteps === 1 ? '' : 's'} remain.
                    Deeper account status stays in account records.
                  </p>
                </div>
                <span className="tag warn">
                  {clientPreviewChecklist.launchActionPlan.summary.blockedSteps}/{clientPreviewChecklist.launchActionPlan.summary.totalSteps} still needed
                </span>
              </div>
              <div className="status-action-plan-grid">
                {blockedClientPreviewActionRows.map((step, index) => (
                  <article className="status-action-plan-item" key={`${clientSafeLaunchLabel(step)}-${index}`}>
                  <small>{clientSafeOwnerLabel(step.owner)}</small>
                  <strong>{clientSafeLaunchLabel(step)}</strong>
                  <p>{customerSafeTrustText(clientSafeLaunchAction(step))}</p>
                </article>
              ))}
              </div>
            </div>
          )}

          <div className="support-readiness-receipt" aria-label="Trust paid automation readiness">
            <div className="support-readiness-receipt-head">
              <div>
                <div className="eyebrow">Paid automation availability</div>
                <h3>{paidAutomationBlockerSummary.ready ? 'Paid automation is ready' : 'Hands-off paid filing still needs account checks'}</h3>
                <p>
                  Pro can only run eligible no-proof claims hands-off after account checks are complete.
                  Proof, missing permission, missing forms, failed review checks, and account holds still stop automation.
                </p>
              </div>
              <span className={`tag ${paidAutomationBlockerSummary.ready ? 'good' : 'warn'}`}>
                {paidAutomationBlockerSummary.blockedCount} item{paidAutomationBlockerSummary.blockedCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="status-action-plan-grid">
              {(paidAutomationBlockers.length === 0 ? [{
                gate: 'Full automation availability',
                owner: 'deployment',
                clientImpact: paidAutomationBlockerSummary.note,
                path: 'launch-handoff-report',
              }] : paidAutomationBlockers).slice(0, 2).map((blocker, index) => (
                <article className="status-action-plan-item" key={`${clientSafeGateLabel(blocker.gate)}-${index}`}>
                  <small>{clientSafeOwnerLabel(blocker.owner)}</small>
                  <strong>{clientSafeGateLabel(blocker.gate)}</strong>
                  <p>{customerSafeTrustText(stripOperatorRunbookText(blocker.clientImpact))}</p>
                </article>
              ))}
            </div>
          </div>

          {blockedClientPreviewItems.length > 0 && (
            <div className="support-readiness-receipt" aria-label="Remaining account items">
              <div>
                <div className="eyebrow">Still needed</div>
                <h3>Needed next</h3>
                <p>
                  Keep this list short on Trust. Use account status for the full account sequence.
                </p>
              </div>
              <div className="status-action-plan-grid">
                {blockedClientPreviewItems.slice(0, 3).map((item, index) => (
                  <article className="status-action-plan-item" key={`${clientSafeLaunchLabel(item)}-${index}`}>
                    <small>{clientSafeOwnerLabel(item.owner)}</small>
                    <strong>{clientSafeLaunchLabel(item)}</strong>
                    <p>{customerSafeTrustText(clientSafeLaunchAction(item))}</p>
                  </article>
                ))}
              </div>
              {blockedClientPreviewItems.length > 3 && (
                <span className="readiness-note">
                  {blockedClientPreviewItems.length - 3} more account check{blockedClientPreviewItems.length - 3 === 1 ? '' : 's'} are listed in account status.
                </span>
              )}
            </div>
          )}

          <div className="status-row">
            <Link className="btn ghost sm" href="/pricing">View automation plans</Link>
            <Link className="btn ghost sm" href="/launch">Open account status</Link>
            <Link className="btn ghost sm" href="/packets">Open details</Link>
            <Link className="btn ghost sm" href="/contact">Contact support</Link>
          </div>
        </section>
      </details>

    </>
  );
}
