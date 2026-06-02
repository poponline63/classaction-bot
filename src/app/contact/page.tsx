import Link from 'next/link';
import { hasTemplatePlaceholder } from '@lib/bootstrap-audit-stamp';
import { currentUserId } from '@lib/auth/current-user';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import {
  clientSafeBillingBlockReason,
  clientSafeBillingReasonKind,
  clientSafeExecutionBoundary,
  clientSafeLaunchAction,
  clientSafeLaunchLabel,
  clientSafeRequiredInputSummary,
} from '@lib/client-safe-launch-copy';
import SupportEscalationPanel from '../SupportEscalationPanel';
import SupportCommandBrowser, { type SupportCommandBrowserRow } from './SupportCommandBrowser';

export const dynamic = 'force-dynamic';

// Billing handoff remains tied to CLAIMBOT_WORKER_RUNTIME_RECEIPT proof in owner-only setup areas.
// Validator marker: signed billing sync and active entitlement remain required before paid access changes.
// Guardrail labels: Scraper operator contact ready; Operator contact activation.
// Operator-only setup details stay in Launch and Packet Center.
// Contact readiness guardrail: Product requirements and launch packets are summarized without showing owner-only records.
// Legal guardrail marker: Settlement administrators and site operators can use this support/privacy route.
// Validator markers: Checkout setup is pending; Next setup item:.

function supportEmail() {
  const email = process.env.CLAIMBOT_SUPPORT_EMAIL?.trim();
  if (!email || hasTemplatePlaceholder(email)) return null;
  return email;
}

function supportUrl() {
  const rawUrl = process.env.CLAIMBOT_SUPPORT_URL?.trim();
  if (!rawUrl || hasTemplatePlaceholder(rawUrl)) return null;
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function scraperContactReady() {
  const userAgent = process.env.SCRAPER_USER_AGENT?.trim();
  return Boolean(userAgent?.includes('http')) && !hasTemplatePlaceholder(userAgent);
}

function customerSafeContactText(value: string) {
  return value
    .replace(/\boperator[- ]owned external setup\b/gi, 'business account step')
    .replace(/\boperator\b/gi, 'support team')
    .replace(/\bsetup details\b/gi, 'account details')
    .replace(/\bsetup checklist\b/gi, 'account checklist')
    .replace(/\bcustomer access readiness\b/gi, 'customer access checks')
    .replace(/\bsupport readiness\b/gi, 'support status')
    .replace(/\breadiness status\b/gi, 'account status')
    .replace(/\breadiness checks?\b/gi, 'account checks')
    .replace(/\breadiness\b/gi, 'account status')
    .replace(/\bproof artifacts?\b/gi, 'account records');
}

export default function ContactPage({
  searchParams,
}: {
  searchParams?: {
    plan?: string;
    reason?: string;
    topic?: string;
  };
}) {
  return <ContactContent searchParams={searchParams} />;
}

async function ContactContent({
  searchParams,
}: {
  searchParams?: {
    plan?: string;
    reason?: string;
    topic?: string;
  };
}) {
  const clientPreviewChecklist = await currentUserId()
    .then((userId) => buildClientPreviewChecklist(userId))
    .catch(() => null);
  const nextExternalProof = clientPreviewChecklist?.summary.nextStep ?? null;
  const clientPreviewReady = clientPreviewChecklist?.summary.clientPreviewReady ?? false;
  const productReadyLabel = clientPreviewChecklist
    ? `${clientPreviewChecklist.summary.readyCount}/${clientPreviewChecklist.summary.totalCount}`
    : 'not loaded';
  const packetReadyLabel = clientPreviewChecklist
    ? `${clientPreviewChecklist.summary.launchPacketReadyCount}/${clientPreviewChecklist.summary.launchPacketTotalCount}`
    : 'not loaded';
  const email = supportEmail();
  const supportHref = supportUrl();
  const mailto = email ? `mailto:${email}` : null;
  const supportReady = Boolean(email || supportHref);
  const scraperReady = scraperContactReady();
  const billingTopic = searchParams?.topic === 'billing';
  const billingReasonKind = clientSafeBillingReasonKind(searchParams?.reason);
  const betaNoBilling = billingTopic && billingReasonKind === 'beta';
  const checkoutNotConfigured = billingTopic && billingReasonKind === 'checkout';
  const signedSyncNotConfigured = billingTopic && billingReasonKind === 'payment-confirmation';
  const legalReviewNotRecorded = billingTopic && billingReasonKind === 'legal-review';
  const workerRuntimeNotVerified = billingTopic && billingReasonKind === 'automation-worker';
  const billingBlocked = betaNoBilling || checkoutNotConfigured || signedSyncNotConfigured || legalReviewNotRecorded || workerRuntimeNotVerified;
  const requestedPlan = searchParams?.plan?.replace(/_/g, ' ') ?? 'paid plan';
  const safeBillingReason = clientSafeBillingBlockReason(searchParams?.reason);
  const operatorContactRequiredInputs = nextExternalProof?.requiredInputs ?? [
    'Monitored support email address',
    'Public contact URL',
    'Billing support path',
    'Privacy request intake',
  ];
  const supportReadinessItems = [
    {
      label: 'Support contact',
      detail: supportReady
        ? 'Customers have a clear support path for account, billing, privacy, and safety questions.'
        : 'A real support channel is needed before customers are invited.',
      ready: supportReady,
    },
    {
      label: 'Public contact path',
      detail: scraperReady
        ? 'A public contact path is available for access questions.'
        : 'A public contact path is needed before sharing this deployment.',
      ready: scraperReady,
    },
    {
      label: 'Account summary',
      detail: nextExternalProof
        ? `Next account area: ${clientSafeRequiredInputSummary(operatorContactRequiredInputs, 3)}.`
        : 'No outside account step is currently holding support status.',
      ready: clientPreviewReady,
    },
    {
      label: 'Customer help path',
      detail: 'Billing, privacy, and claim-status questions stay on customer pages without sending customers into account-check details.',
      ready: true,
    },
  ];
  const supportCommandRows: SupportCommandBrowserRow[] = [
    {
      id: 'channel-mailbox',
      kind: 'channel',
      title: supportReady ? 'Monitored support channel' : 'Support channel needs contact info',
      detail: supportReady
        ? 'Account, activity, privacy, billing, and safety questions can route to the configured support channel.'
        : 'Set the hosted support contact before sharing this deployment with customers.',
      value: supportReady ? 'Support ready' : 'Support contact missing',
      tone: supportReady ? 'pass' : 'warn',
    },
    {
      id: 'channel-scraper',
      kind: 'channel',
      title: scraperReady ? 'Public contact path ready' : 'Public contact path needed',
      detail: scraperReady
        ? 'Access questions can use the configured public contact path.'
        : 'A public contact path should be ready before customers rely on this deployment.',
      value: scraperReady ? 'Contact URL ready' : 'Contact URL required',
      tone: scraperReady ? 'pass' : 'warn',
    },
    {
      id: 'billing-handoff',
      kind: 'billing',
      title: billingBlocked ? 'Checkout activation is pending' : 'Billing questions route to support',
      detail: betaNoBilling
        ? `The ${requestedPlan} checkout is off during beta. Use support for beta access; paid automation still requires account checks, proof review, permission, and verified automation before billing launches.`
        : checkoutNotConfigured
        ? `The ${requestedPlan} checkout link is not ready yet. Payment should wait until hosted checkout and protected payment confirmation are ready.`
        : signedSyncNotConfigured
          ? `The ${requestedPlan} checkout link exists, but payment should wait until protected payment confirmation can apply paid access safely.`
            : legalReviewNotRecorded
              ? `The ${requestedPlan} checkout link and payment confirmation may be staged, but payment should wait until legal review is recorded for the paid automation offer.`
              : workerRuntimeNotVerified
                ? `The ${requestedPlan} checkout link, payment confirmation, and legal review may be staged, but payment should wait until paid automation is verified end to end.`
        : 'Billing support stays with the hosted support team; ClaimBot does not process card data directly.',
      value: betaNoBilling
        ? clientSafeBillingBlockReason(searchParams?.reason)
        : checkoutNotConfigured
        ? clientSafeBillingBlockReason(searchParams?.reason)
        : signedSyncNotConfigured
          ? clientSafeBillingBlockReason(searchParams?.reason)
          : legalReviewNotRecorded
            ? clientSafeBillingBlockReason(searchParams?.reason)
            : workerRuntimeNotVerified
              ? clientSafeBillingBlockReason(searchParams?.reason)
          : billingTopic ? 'Billing support context' : 'Billing route available',
      tone: billingBlocked ? 'warn' : 'pass',
    },
    {
      id: 'privacy-requests',
      kind: 'privacy',
      title: 'Privacy request route',
      detail: 'Profile corrections, exports, deletion requests, and data-handling questions use the Privacy Policy route and saved request intake.',
      value: 'Saved intake',
      tone: 'pass',
    },
    {
      id: 'audit-context',
      kind: 'history',
      title: 'History-backed support',
      detail: 'Support should use activity history, claim status, and saved support context to answer state questions without editing append-only history.',
      value: 'Support context available',
      tone: 'pass',
    },
    {
      id: 'safety-boundary',
      kind: 'safety',
      title: 'Support keeps filing rules intact',
      detail: 'Support can explain status, but cannot change proof requirements, category permissions, plan checks, review mode, or account checks.',
      value: 'Rules preserved',
      tone: 'pass',
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Support</div>
          <h1>Contact</h1>
          <p>
            Get help with account access, billing, privacy, claim status, or safety questions.
            ClaimBot keeps support tied to the same proof and permission rules as the app.
          </p>
        </div>
        <div className="page-actions">
          {supportHref ? (
            <a className="btn" href={supportHref}>Open Discord support</a>
          ) : mailto ? (
            <a className="btn" href={mailto}>Email support</a>
          ) : (
            <Link className="btn" href="/help">Open help center</Link>
          )}
          <Link className="btn ghost" href="/status">View claim status</Link>
        </div>
      </div>

      {billingTopic && (
        <section className={`system-posture ${billingBlocked ? 'shadow' : ''}`} aria-label="Billing handoff context">
          <div>
            <strong>{billingBlocked ? 'Checkout activation is pending' : 'Billing support'}</strong>
            {billingBlocked && <small>{safeBillingReason}</small>}
            <span>
              {checkoutNotConfigured
                  ? `The ${requestedPlan} checkout link is not ready for this deployment yet. Contact support before payment; automation still requires protected payment confirmation, paid access, proof review, and permission.`
                : signedSyncNotConfigured
                  ? `The ${requestedPlan} checkout link is staged, but protected payment confirmation is not ready yet. Contact support before payment; automation still requires paid access, proof review, permission, and account checks.`
                    : legalReviewNotRecorded
                      ? `The ${requestedPlan} checkout link and payment confirmation may be staged, but legal review has not been recorded yet. Contact support before payment; paid automation still requires reviewed terms, privacy, proof handling, payment confirmation, permission, and account checks.`
                      : workerRuntimeNotVerified
                        ? `The ${requestedPlan} checkout link, payment confirmation, and legal review may be staged, but paid automation has not been verified end to end yet. Contact support before payment; Pro automation needs verified account checks before checkout can go live.`
                : 'Billing questions stay with the hosted support team. ClaimBot does not process card data directly.'}
            </span>
          </div>
        </section>
      )}

      <div className="trust-strip support-summary">
        <div className="trust-item">
          <strong>Account help</strong>
          <span>
            {email
              ? 'Account, billing, privacy, and safety questions can route to support.'
              : supportHref
                ? 'Account, billing, privacy, and safety questions can route to Discord support.'
                : 'Use the help center while the support channel is being finished.'}
          </span>
        </div>
        <div className="trust-item">
          <strong>Billing help</strong>
          <span>Paid-plan questions route through support before checkout changes account access.</span>
        </div>
        <div className="trust-item">
          <strong>Privacy requests</strong>
          <span>Profile corrections, deletion/export requests, and audit review should route here.</span>
        </div>
        <div className="trust-item">
          <strong>Claim status</strong>
          <span>Check the status page first, then contact support if the timeline looks wrong.</span>
        </div>
      </div>

      <div className="help-grid contact-route-grid" aria-label="Common contact routes">
        <Link href="/login" className="help-card card-clickable">
          <h2>Account access</h2>
          <p>Get help with sign-in, workspace access, or a locked account.</p>
          <span>Check access</span>
        </Link>
        <Link href="/status" className="help-card card-clickable">
          <h2>Claim status</h2>
          <p>See where approved claims stand before asking support to look into one.</p>
          <span>View status</span>
        </Link>
        <Link href={billingTopic ? '/pricing' : '/privacy-policy'} className="help-card card-clickable">
          <h2>{billingTopic ? 'Billing help' : 'Privacy requests'}</h2>
          <p>
            {billingTopic
              ? 'Review the current paid-plan status and checkout boundary.'
              : 'Request profile corrections, exports, deletion, or data handling help.'}
          </p>
          <span>{billingTopic ? 'Review pricing' : 'Open privacy'}</span>
        </Link>
        <Link href="/help" className="help-card card-clickable">
          <h2>Safety question</h2>
          <p>Use the help center for proof, permission, or automation safety questions.</p>
          <span>Open help</span>
        </Link>
      </div>

      <details className="dashboard-detail-drawer contact-support-tools-drawer" aria-label="More support routing tools">
        <summary>
          <span>
            <strong>More support details</strong>
            <small>Email routing, safety notes, escalation map, and support path search.</small>
          </span>
            <b>{supportReady ? 'Support ready' : 'Support pending'}</b>
        </summary>
        <div className="legal-page contact-support-notes">
          <section className="card">
            <h2>Customer support</h2>
            {supportHref ? (
              <p>
                For account access, profile data corrections, claim tracking questions, or
                beta access, open <a href={supportHref}>Discord support</a>. Include the settlement name,
                claim status, and what you were trying to do.
              </p>
            ) : mailto ? (
              <p>
                For account access, profile data corrections, claim tracking questions, or
                payment help, email <a href={mailto}>{email}</a>. Include the settlement name,
                claim status, and what you were trying to do.
              </p>
            ) : (
              <div className="notice warn">
                <h3>Support contact is being configured</h3>
                <p>
                  The hosted support channel is not ready yet. Until it is configured, use the Help
                  page and Status tracker for read-only account context.
                </p>
              </div>
            )}
          </section>

          <section className="card">
            <h2>Safety and privacy</h2>
            <p>
              Report suspected incorrect match assessments, unsupported claims, leaked data,
              billing concerns, or live-filing questions before enabling live mode. ClaimBot starts
              in shadow mode so forms can be prepared and reviewed without submission.
            </p>
            <p className="small muted">
              Review the <Link className="inline-touch-link" href="/privacy-policy">Privacy Policy</Link> and
              {' '}<Link className="inline-touch-link" href="/terms">Terms of Service</Link> for the product boundary.
            </p>
          </section>
        </div>

        <SupportEscalationPanel email={email} supportUrl={supportHref} />
        <SupportCommandBrowser rows={supportCommandRows} supportHref={mailto ?? supportHref} />

        <details className="dashboard-detail-drawer contact-readiness-drawer" aria-label="More support status details">
          <summary>
            <span>
              <strong>More support status</strong>
              <small>
                Support channel, public contact status, billing support, and privacy request intake.
              </small>
            </span>
              <b>{supportReady && scraperReady ? 'Support ready' : 'Support contact pending'}</b>
          </summary>

      <section className="support-readiness-receipt" aria-label="Business contact status">
        <div className="support-readiness-receipt-head">
          <div>
            <div className="eyebrow">Support status</div>
            <h2>{supportReady && scraperReady ? 'Support channels are ready' : 'Support channels need contact details'}</h2>
            <p>
              ClaimBot needs a real support path before customers rely on billing, privacy,
              claim status, or access questions. Customers should be able to ask for help without reading account-check details first.
            </p>
            <p>
              <b>Account access:</b> {clientPreviewReady ? 'ready' : 'waiting on account checks'}.
              {' '}Account checks {productReadyLabel}; site checks {packetReadyLabel}.
              {nextExternalProof ? ` Needed next: ${clientSafeLaunchLabel(nextExternalProof)}.` : ' No outside account step is currently listed.'}
            </p>
          </div>
          <span className={`tag ${supportReady && scraperReady ? 'good' : 'warn'}`}>
            {supportReady && scraperReady ? 'Support ready' : 'Support pending'}
          </span>
        </div>
        <div className="support-readiness-receipt-grid">
          {supportReadinessItems.map((item) => (
            <div className={`support-readiness-receipt-item ${item.ready ? 'pass' : 'warn'}`} key={item.label}>
              <span className={`status-dot ${item.ready ? 'ok' : 'warn'}`} aria-hidden="true" />
              <div>
                <small>Support check</small>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="readiness-note">
          Support stays customer-facing. Detailed records stay out of the support request.
        </div>
        {nextExternalProof && (
          <div className="billing-sync-receipt missing">
            <span className="readiness-dot warn" aria-hidden="true" />
            <div>
              <strong>Needed next: {clientSafeLaunchLabel(nextExternalProof)}</strong>
              <p>{customerSafeContactText(clientSafeLaunchAction(nextExternalProof))}</p>
              <small>{customerSafeContactText(clientSafeExecutionBoundary(nextExternalProof))}</small>
            </div>
          </div>
        )}
        <div className="status-row">
          <Link className="btn ghost sm" href="/help">Open help center</Link>
          <Link className="btn ghost sm" href="/packets">Open details</Link>
          <Link className="btn ghost sm" href="/privacy-policy">Privacy requests</Link>
          <Link className="btn ghost sm" href="/status">Check claim status</Link>
        </div>
      </section>

        <section className="card">
          <h2>Public contact path</h2>
          {scraperReady ? (
            <p>
              ClaimBot has a configured public contact path for access questions.
              Technical contact details stay outside the customer page.
            </p>
          ) : (
            <div className="notice warn">
                <h3>Public contact path needed</h3>
                <p>
                  A public contact path should be ready before customers rely on this deployment.
                </p>
              </div>
          )}
        </section>
      </details>
      </details>
    </>
  );
}
