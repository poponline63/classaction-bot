import Link from 'next/link';
import { hasTemplatePlaceholder } from '@lib/bootstrap-audit-stamp';
import { currentUserId } from '@lib/auth/current-user';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import {
  clientSafeExecutionBoundary,
  clientSafeLaunchAction,
  clientSafeLaunchLabel,
  clientSafeProofArtifactSummary,
  clientSafeRequiredInputSummary,
} from '@lib/client-safe-launch-copy';
import SupportEscalationPanel from '../SupportEscalationPanel';
import HelpCommandBrowser, { type HelpCommandBrowserRow } from './HelpCommandBrowser';

export const dynamic = 'force-dynamic';

function supportEmail() {
  const email = process.env.CLAIMBOT_SUPPORT_EMAIL?.trim();
  if (!email || hasTemplatePlaceholder(email)) return null;
  return email;
}

function customerSafeHelpText(value: string) {
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

const helpTopics = [
  {
    title: 'Start with your facts',
    body: 'Add the facts ClaimBot needs before reviewing matches: name, contact details, addresses, and purchase or subscription details.',
    href: '/setup',
    action: 'Start with facts',
  },
  {
    title: 'Review matches',
    body: 'Check matched claim opportunities before anything moves forward. Uncertain, expired, unpermitted, or proof-required claims stay in review.',
    href: '/review',
    action: 'Review matches',
  },
  {
    title: 'Manage permissions',
    body: 'Choose which claim categories ClaimBot may review. Turning a category off blocks future tracking for that category.',
    href: '/permissions',
    action: 'View permissions',
  },
  {
    title: 'Track claims',
    body: 'See where each tracked claim stands, including review status, proof needs, filing posture, and preparation results.',
    href: '/status',
    action: 'Open status',
  },
];

export default async function HelpPage() {
  const email = supportEmail();
  const mailto = email ? `mailto:${email}` : null;
  const clientPreviewChecklist = await currentUserId()
    .then((userId) => buildClientPreviewChecklist(userId))
    .catch(() => null);
  const nextExternalProof = clientPreviewChecklist?.summary.nextStep ?? null;
  const productReadyLabel = clientPreviewChecklist
    ? `${clientPreviewChecklist.summary.readyCount}/${clientPreviewChecklist.summary.totalCount}`
    : 'Sign in required';
  const launchPacketReadyLabel = clientPreviewChecklist
    ? `${clientPreviewChecklist.summary.launchPacketReadyCount}/${clientPreviewChecklist.summary.launchPacketTotalCount}`
    : 'Sign in required';
  const helpCommandRows: HelpCommandBrowserRow[] = [
    ...helpTopics.map((topic) => ({
      id: `topic-${topic.href.replace(/[^a-z0-9]+/gi, '-')}`,
      kind: topic.href === '/setup'
        ? 'intake' as const
        : topic.href === '/permissions'
          ? 'permission' as const
          : topic.href === '/claims'
            ? 'status' as const
            : 'review' as const,
      title: topic.title,
      detail: topic.body,
      value: topic.action,
      href: topic.href,
      action: topic.action,
      tone: 'pass' as const,
    })),
    {
      id: 'support-mailbox',
      kind: 'support',
      title: email ? 'Support mailbox is configured' : 'Support mailbox needs contact info',
      detail: email
        ? 'Customer requests can route to the configured support address.'
        : 'The support mailbox should be configured before sharing account access.',
      value: email ? 'Mailbox ready' : 'Missing support contact',
      href: email ? '/contact' : '/settings',
      action: email ? 'Contact details' : 'Set support contact',
      tone: email ? 'pass' : 'warn',
    },
    {
      id: 'client-preview-next-proof',
      kind: 'launch',
      title: nextExternalProof ? 'Account access status' : 'Account access ready',
      detail: nextExternalProof
        ? `This workspace is not ready for account access yet. ${clientSafeLaunchAction(nextExternalProof)}`
        : 'This signed workspace has the required hosted access checks recorded.',
      value: clientPreviewChecklist?.summary.clientPreviewReady ? 'Access ready' : 'Waiting on account checks',
      href: '/launch',
      action: 'Open account status',
      tone: clientPreviewChecklist?.summary.clientPreviewReady ? 'pass' : 'warn',
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Help</div>
          <h1>Help and support</h1>
          <p>
            Find the next step for account basics, review, claim status, billing, privacy, or support without
            changing any claim data.
          </p>
        </div>
        <div className="page-actions">
          {mailto ? (
            <a className="btn" href={mailto}>Email support</a>
          ) : (
            <Link className="btn" href="/contact">Contact support</Link>
          )}
          <Link className="btn ghost" href="/contact">Contact details</Link>
        </div>
      </div>

      <section className="system-posture shadow">
        <div>
          <strong>Review mode is on</strong>
          <span>
            ClaimBot can prepare reviewable claim activity, but forms are not submitted from Help.
          </span>
        </div>
      </section>

      <div className="trust-strip support-summary">
        <div className="trust-item">
          <strong>Account basics</strong>
          <span>
            {email
              ? 'Get help with sign-in, profile facts, permissions, and claim status.'
              : 'Use Help and Contact while the support mailbox is being finished.'}
          </span>
        </div>
        <div className="trust-item">
          <strong>No legal advice</strong>
          <span>Support can explain product state, but settlement administrators control legal outcomes.</span>
        </div>
        <div className="trust-item">
          <strong>Status first</strong>
          <span>Use claim status and account history before asking support to investigate.</span>
        </div>
        <div className="trust-item">
          <strong>Proof review remains</strong>
          <span>Support should not bypass proof-required or uncertain matches.</span>
        </div>
      </div>

      <div className="help-grid">
        {helpTopics.map((topic) => (
          <Link key={topic.title} href={topic.href} className="help-card card-clickable">
            <h2>{topic.title}</h2>
            <p>{topic.body}</p>
            <span>{topic.action}</span>
          </Link>
        ))}
      </div>

      <details className="dashboard-detail-drawer help-tools-drawer" aria-label="More help details">
        <summary>
          <span>
            <strong>More help details</strong>
            <small>Support routing, account checks, and safety boundaries when the four main paths are not enough.</small>
          </span>
          <b>{email ? 'Support ready' : 'Support contact pending'}</b>
        </summary>

        <SupportEscalationPanel email={email} />

        <HelpCommandBrowser rows={helpCommandRows} />

        <details className="dashboard-detail-drawer help-readiness-drawer" aria-label="More support status details">
          <summary>
            <span>
              <strong>More support status</strong>
              <small>
                Account access status, record counts, and the needed next step stay here so
                everyday help starts with customer support paths.
              </small>
            </span>
            <b>Account checks {productReadyLabel}</b>
          </summary>

      <section className="help-client-preview-gate" aria-label="Help account access status">
        <div className="help-client-preview-gate-head">
          <div>
            {/* Guardrail markers: Support readiness. Support should use the next setup item. */}
            <div className="eyebrow">Support status</div>
            <h2>{clientPreviewChecklist?.summary.clientPreviewReady ? 'Account access checks are clear' : 'Support should use the needed next step'}</h2>
            <p>
              {/* Guardrail marker: same account-scoped setup checklist */}
              {/* Guardrail marker: same account-scoped setup checklist */}
              Help and support use the same account checklist as account status,
              Pricing, Trust, Login, and paid automation locks.
            </p>
          </div>
          <span className={`tag ${clientPreviewChecklist?.summary.clientPreviewReady ? 'good' : 'warn'}`}>
            Account checks {productReadyLabel}
          </span>
        </div>
        <div className="help-client-preview-grid">
          <div>
            <strong>Account access</strong>
            <span>
              {clientPreviewChecklist
                ? clientPreviewChecklist.summary.clientPreviewReady
                  ? 'Ready'
                  : `${clientPreviewChecklist.summary.blockedCount} items still needed`
                : 'Requires signed account context'}
            </span>
          </div>
          <div>
            <strong>Account status</strong>
            <span>{launchPacketReadyLabel} ready</span>
          </div>
          <div>
            <strong>Needed next</strong>
            <span>{nextExternalProof ? clientSafeLaunchLabel(nextExternalProof) : 'No outside account step'}</span>
          </div>
        </div>
        {nextExternalProof && (
          <div className="help-client-preview-next-proof">
            <strong>Next action: {clientSafeLaunchAction(nextExternalProof)}</strong>
            <p>Why this waits: {customerSafeHelpText(clientSafeExecutionBoundary(nextExternalProof))}</p>
            <span>Needed next: {clientSafeRequiredInputSummary(nextExternalProof.requiredInputs, 4)}</span>
            <span>Current status: {customerSafeHelpText(clientSafeProofArtifactSummary(nextExternalProof))}</span>
          </div>
        )}
        <section className="card launch-card" aria-label="Account status validation">
          <div className="launch-card-head">
            <div>
              <div className="eyebrow">Account checks</div>
              <h2>Validation before account access</h2>
            </div>
            <Link className="btn ghost sm" href="/launch">Open account status</Link>
          </div>
          <p className="muted">
            Confirm sign-in, support, billing, legal review, mobile layout, and offline behavior
            before enabling account access.
          </p>
        </section>
        <div className="status-row">
          <Link className="btn ghost sm" href="/trust">Review safeguards</Link>
          <Link className="btn ghost sm" href="/packets">Open details</Link>
          <Link className="btn ghost sm" href="/contact">Contact support</Link>
        </div>
      </section>
      </details>

        <details className="dashboard-detail-drawer help-boundary-drawer" aria-label="More support boundaries">
          <summary>
            <span>
              <strong>More support boundaries</strong>
              <small>Includes what ClaimBot will not do, offline support, and account details.</small>
            </span>
            <b>Support details</b>
          </summary>

        <div className="legal-page support-sections">
          <section className="card">
            <h2>What ClaimBot will not do</h2>
            <p>
              It will not fabricate eligibility, bypass a proof requirement, move a claim forward without
              active category permission, or trust a live filing setting without account checks.
            </p>
          </section>

          <section className="card">
            <h2>When to contact support</h2>
            <p>
              Contact support for account access, incorrect profile data, settlement-source questions,
              audit review, privacy requests, or live-filing account review.
            </p>
            {mailto ? (
              <p className="small muted">Current support mailbox: <a href={mailto}>{email}</a></p>
            ) : (
              <div className="notice warn">
                <strong>Support contact needs contact info</strong>
                <p>
                  The hosted support mailbox is not ready yet. Until it is configured, use Contact
                  and Status for read-only support context.
                </p>
              </div>
            )}
          </section>

          <section className="card">
            <h2>Offline and installed app support</h2>
            <p>
              Installed ClaimBot shells can open the offline safety page, but profile facts,
              permissions, claim status, and audit records require reconnecting to the hosted app.
            </p>
          </section>

          <section className="card">
            <h2>Before sharing account access</h2>
            <p>
              The published site, payment, sign-in, support, and legal review checks should be complete
              before customers are invited into paid automation.
            </p>
            <p className="small muted">
              Account status: <Link className="inline-touch-link" href="/launch">Open account status</Link>. Legal boundary:
              {' '}<Link className="inline-touch-link" href="/terms">Terms</Link> and <Link className="inline-touch-link" href="/privacy-policy">Privacy Policy</Link>.
            </p>
          </section>
        </div>
      </details>
      </details>
    </>
  );
}
