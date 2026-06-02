import { db, schema } from '@db/client';
import { and, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUserId } from '@lib/auth/current-user';
import { getUserSubscription } from '@lib/billing/entitlements';
import { buildAuthorizationPreview } from '@lib/claim-filer/authorization-preview';
import { evaluateQueueReadiness } from '@lib/claim-filer/queue-readiness';
import { QUEUE_BOUNDARY_ACK, QUEUE_TRUST_LOCK_ACK } from '@lib/claim-filer/request-boundary';
import { buildSettlementSelfAssessment } from '@lib/claim-filer/settlement-self-assessment';
import { isClientFeatureEnabled, isSettlementCategoryEnabled } from '@lib/features';
import { queueClaimFromMatch } from '../../actions';
import SettlementDetailBrowser, { type SettlementDetailBrowserRow } from './SettlementDetailBrowser';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date | null | undefined) {
  if (!d) return 'Not listed';
  return d.toISOString().slice(0, 10);
}

const FRIENDLY_SOURCES: Record<string, string> = {
  classaction_org: 'ClassAction.org',
  top_class_actions: 'Top Class Actions',
  manual: 'Manual intake',
};

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source URL';
  }
}

export default async function SettlementDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH')) {
    notFound();
  }

  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const rows = await db
    .select()
    .from(schema.settlements)
    .where(eq(schema.settlements.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) notFound();
  if (!isSettlementCategoryEnabled(row.category)) notFound();

  const userId = await currentUserId();
  const subscription = await getUserSubscription(userId);
  const match = (await db
    .select()
    .from(schema.matches)
    .where(and(eq(schema.matches.userId, userId), eq(schema.matches.settlementId, row.id)))
    .limit(1))[0];
  const claim = match ? (await db
    .select()
    .from(schema.claims)
    .where(and(eq(schema.claims.userId, userId), eq(schema.claims.matchId, match.id)))
    .limit(1))[0] : null;
  const authorization = (await db
    .select()
    .from(schema.classAuthorizations)
    .where(and(eq(schema.classAuthorizations.userId, userId), eq(schema.classAuthorizations.category, row.category)))
    .limit(1))[0];
  const authorizationActive = Boolean(authorization?.enabled && !authorization.revokedAt);
  const authorizationPreview = buildAuthorizationPreview(authorization);
  const readiness = evaluateQueueReadiness({
    verdict: match?.verdict,
    proofRequired: row.proofRequired,
    claimFormUrl: row.claimFormUrl,
    hasActiveAuthorization: authorizationActive,
    hasAutomationEntitlement: subscription.automationEnabled,
    existingClaimId: claim?.id,
  });
  const selfAssessment = buildSettlementSelfAssessment({
    classDefinition: row.classDefinition,
    classPeriodStart: row.classPeriodStart,
    classPeriodEnd: row.classPeriodEnd,
    deadline: row.deadline,
    proofRequired: row.proofRequired,
    claimFormUrl: row.claimFormUrl,
    matchVerdict: match?.verdict,
    matchConfidence: match?.confidence,
    authorizationActive,
    automationEntitlementActive: subscription.automationEnabled,
  });
  const sourceLabel = FRIENDLY_SOURCES[row.source] ?? row.source;
  const sourceBoundaryRows: Array<{
    label: string;
    detail: string;
    tone: SettlementDetailBrowserRow['tone'];
  }> = [
    {
      label: 'Provenance',
      detail: `${sourceLabel} record from ${sourceHost(row.sourceUrl)}. External source remains authoritative.`,
      tone: 'pass',
    },
    {
      label: 'Match bounds',
      detail: match
        ? `Saved matcher verdict is ${match.verdict.toLowerCase().replace(/_/g, ' ')}; claim checks still apply.`
        : 'No saved matcher verdict yet; run review matching before treating this as user-specific.',
      tone: match ? 'pass' : 'warn',
    },
    {
      label: 'Customer scope',
      detail: authorizationActive
        ? 'A category attestation exists for this settlement category.'
        : 'Category permission is missing, so the claim path remains locked.',
      tone: authorizationActive ? 'pass' : 'warn',
    },
    {
      label: 'Source sync',
      detail: `Discovered ${fmtDate(row.discoveredAt)}; deadline ${fmtDate(row.deadline)}.`,
      tone: row.discoveredAt ? 'pass' : 'warn',
    },
  ];
  const settlementDetailRows: SettlementDetailBrowserRow[] = [
    ...sourceBoundaryRows.map((item) => ({
      id: `source-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      kind: 'source' as const,
      title: item.label,
      detail: item.detail,
      value: item.tone === 'pass' ? 'Source context available' : 'Source context needs review',
      tone: item.tone,
    })),
    {
      id: 'gate-queue',
      kind: 'gate',
      title: 'Claim check',
      detail: readiness.detail,
      value: readiness.label,
      tone: readiness.canQueue ? 'pass' : readiness.status === 'blocked' ? 'fail' : 'warn',
    },
    {
      id: 'gate-plan',
      kind: 'gate',
      title: subscription.automationEnabled ? 'Paid automation enabled' : 'Automation plan needed',
      detail: subscription.automationEnabled
        ? `${subscription.plan} access is active; proof, permission, form, and final checks still apply.`
        : 'Free users can review settlement context, but the permissioned filing path requires Pro or Founding access.',
      value: subscription.plan,
      tone: subscription.automationEnabled ? 'pass' : 'warn',
    },
    {
      id: 'gate-match',
      kind: 'gate',
      title: match ? `Matcher verdict: ${match.verdict.toLowerCase().replace(/_/g, ' ')}` : 'No saved match yet',
      detail: match
        ? `User-specific matcher confidence is ${match.confidence.toFixed(2)}.`
        : 'Run review matching before this settlement is treated as user-specific.',
      value: match?.verdict ?? 'No matcher output',
      tone: match?.verdict === 'ELIGIBLE' ? 'pass' : match ? 'warn' : 'warn',
    },
    {
      id: 'gate-authorization',
      kind: 'gate',
      title: authorizationActive ? 'Category permission active' : 'Category permission missing',
      detail: authorizationActive
        ? `Stored attestation v${authorization?.attestationVersion ?? 1} covers this settlement category.`
        : 'Enable the category only when the attestation is true for this user.',
      value: authorizationActive ? 'Allowed' : 'Permission needed',
      tone: authorizationActive ? 'pass' : 'warn',
    },
    {
      id: 'record-class-definition',
      kind: 'record',
      title: 'Class definition',
      detail: row.classDefinition,
      value: row.category.toLowerCase().replace(/_/g, ' '),
      tone: 'warn',
    },
    {
      id: 'record-claim-form',
      kind: 'record',
      title: row.claimFormUrl ? 'Claim form URL stored' : 'Claim form URL missing',
      detail: row.claimFormUrl
        ? 'Final checks can inspect the external form only after a claim clears claim checks.'
        : 'A claim cannot be queued until a form URL is available.',
      value: row.claimFormUrl ? sourceHost(row.claimFormUrl) : 'No form URL',
      tone: row.claimFormUrl ? 'pass' : 'fail',
    },
    ...selfAssessment.map((item) => ({
      id: `assessment-${item.key}`,
      kind: 'assessment' as const,
      title: item.title,
      detail: item.detail,
      value: item.prompt,
      tone: item.status,
    })),
  ];

  return (
    <>
      <p className="small">
        <Link href="/settlements">Settlements / {row.caseName}</Link>
      </p>

      <div className="page-header">
        <div>
          <div className="eyebrow">Settlement detail</div>
          <h1>{row.caseName}</h1>
          <p>
            Review class terms, deadlines, proof requirements, and source links before this settlement
            is treated as claim-ready.
          </p>
          <div className="status-row">
            <span className="tag">{row.category.toLowerCase().replace(/_/g, ' ')}</span>
            <span className="tag blue">{row.status.toLowerCase()}</span>
            {row.proofRequired ? (
              <span className="tag warn">Proof required</span>
            ) : (
              <span className="tag good">No proof required</span>
            )}
            {row.claimFormUrl ? (
              <span className="tag blue">Claim form available</span>
            ) : (
              <span className="tag warn">No claim form URL</span>
            )}
          </div>
        </div>
        <div className="settlement-action-panel">
          <div className="source-authority-strip" aria-label="Source authority and tracking safety">
            <div>
              <strong>Source Authority</strong>
              <span>External settlement source is authoritative. No eligibility fabrication. Proof-required manual review enforced.</span>
            </div>
            <div className="source-authority-badges">
              <span className="tag blue">External Authority</span>
              <span className="tag warn">Proof review</span>
              <span className="tag">Tracking Checks</span>
            </div>
          </div>
          <div className="page-actions">
            <Link className="btn ghost" href="/review">Review matches</Link>
            {!readiness.canQueue && readiness.label === 'Permission needed' && (
              <Link className="btn ghost" href="/permissions">Manage permission</Link>
            )}
            {!readiness.canQueue && readiness.label === 'Automation plan needed' && (
              <Link className="btn ghost" href="/pricing">View automation plans</Link>
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
                <button className="btn" type="submit">Track claim</button>
              </form>
            )}
            {claim && (
              <Link className="btn" href={`/claims/${claim.id}`}>View claim</Link>
            )}
            {row.claimFormUrl && (
              <a className="btn ghost" href={row.claimFormUrl} target="_blank" rel="noreferrer">
                Open claim form
              </a>
            )}
          </div>
        </div>
      </div>

      <section className="source-boundary-console" aria-label="Source and Boundary">
        <header className="source-boundary-console-head">
          <div>
            <div className="eyebrow">Source &amp; Boundary</div>
            <h2>Review source context before claim checks.</h2>
            <p>
              This record is useful for research and matching, but it does not create eligibility,
              payout, or filing permission without user-specific checks.
            </p>
          </div>
          <a className="btn ghost" href="#self-assessment">Review match context</a>
        </header>
        <div className="source-boundary-console-grid">
          {sourceBoundaryRows.map((item) => (
            <article className={`source-boundary-console-item ${item.tone}`} key={item.label}>
              <span className={`readiness-dot ${item.tone}`} aria-hidden="true" />
              <div>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <SettlementDetailBrowser rows={settlementDetailRows} settlementId={row.id} />

      <div className="detail-grid">
        <section className="card">
          <h2>Class definition</h2>
          <p>{row.classDefinition}</p>
        </section>

        <aside className="card">
          <h2>Claim posture</h2>
          <div className="readiness-list">
            <div className="readiness-item">
              <span className={`readiness-dot ${readiness.status === 'ready' ? 'pass' : readiness.status === 'blocked' ? 'fail' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>{readiness.label}</strong>
                <p>{readiness.detail}</p>
              </div>
            </div>
            <div className="readiness-item">
              <span className={`readiness-dot ${subscription.automationEnabled ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>{subscription.automationEnabled ? 'Paid automation enabled' : 'Automation plan needed'}</strong>
                <p>
                  {subscription.automationEnabled
                    ? `${subscription.plan} access can track review-ready no-proof claims for the permissioned filing path.`
                    : 'Free users can review matches, but the permissioned filing path requires Pro or Founding access.'}
                </p>
              </div>
            </div>
            <div className="readiness-item">
              <span className={`readiness-dot ${match?.verdict === 'ELIGIBLE' ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>{match ? `Matcher verdict: ${match.verdict.toLowerCase().replace(/_/g, ' ')}` : 'No saved match yet'}</strong>
                <p>
                  {match
                    ? 'Matcher evidence is user-specific and can be reviewed before tracking.'
                    : 'Run review matching after profile or evidence changes before treating this settlement as claim-ready.'}
                </p>
              </div>
            </div>
            <div className="readiness-item">
              <span className={`readiness-dot ${authorizationActive ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>{authorizationActive ? 'Category permission active' : 'Category permission missing'}</strong>
                <p>
                  {authorizationActive
                    ? `Stored attestation v${authorization?.attestationVersion ?? 1} covers this settlement category.`
                    : 'Enable the category only when the attestation is true for this user.'}
                </p>
              </div>
            </div>
            <div className="readiness-item">
              <span className={`readiness-dot ${row.proofRequired ? 'warn' : 'pass'}`} aria-hidden="true" />
              <div>
                <strong>{row.proofRequired ? 'Proof must be reviewed' : 'No proof requirement stored'}</strong>
                <p>
                  {row.proofRequired
                    ? 'Keep this settlement in review until supporting documents are handled.'
                    : 'This may be trackable after profile match and category permission.'}
                </p>
              </div>
            </div>
            <div className="readiness-item">
              <span className={`readiness-dot ${row.claimFormUrl ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>{row.claimFormUrl ? 'Claim form URL stored' : 'Claim form URL missing'}</strong>
                <p>
                  {row.claimFormUrl
                    ? 'Final checks can inspect the external form when a claim is tracked.'
                    : 'A claim cannot be tracked until a form URL is available.'}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <section className="dashboard-section" id="self-assessment">
        <header className="section-header">
          <h2>Readiness snapshot</h2>
          <p className="muted">
            This snapshot uses the same tracking check as Review and Settlements, so the detail page
            cannot imply a claim is ready when permission, proof, form, or matcher checks still block it.
          </p>
        </header>
        <div className="stats-grid" aria-label="Settlement readiness snapshot">
          <div className="stat-card">
            <div className="stat-label">Claim check</div>
            <div className={`stat-value ${readiness.canQueue ? 'green' : readiness.status === 'blocked' ? 'warn' : 'text'}`}>
              {readiness.label}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Match verdict</div>
            <div className={`stat-value ${match?.verdict === 'ELIGIBLE' ? 'green' : 'text'}`}>
              {match?.verdict ? match.verdict.toLowerCase().replace(/_/g, ' ') : 'None'}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Authorization</div>
            <div className={`stat-value ${authorizationActive ? 'green' : 'warn'}`}>
              {authorizationActive ? 'Active' : 'Needed'}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Automation plan</div>
            <div className={`stat-value ${subscription.automationEnabled ? 'green' : 'warn'}`}>
              {subscription.plan}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Claim record</div>
            <div className={`stat-value ${claim ? 'blue' : 'text'}`}>
              {claim ? claim.status.toLowerCase().replace(/_/g, ' ') : 'Not tracked'}
            </div>
          </div>
        </div>
        <div className="trust-strip">
          <div className="trust-item">
            <strong>One tracking check</strong>
            <span>Detail, review, and settlement list pages use the same readiness rules.</span>
          </div>
          <div className="trust-item">
            <strong>No proof bypass</strong>
            <span>Proof-required settlements remain manual-review items.</span>
          </div>
          <div className="trust-item">
            <strong>Permission required</strong>
            <span>Category attestations are checked before claim tracking and again in final checks.</span>
          </div>
          <div className="trust-item">
            <strong>Paid automation check</strong>
            <span>Free users keep matching and review; the permissioned filing path unlocks with Pro or Founding.</span>
          </div>
          <div className="trust-item">
            <strong>Source remains authority</strong>
            <span>External settlement pages control legal terms, deadlines, and administrator instructions.</span>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <header className="section-header">
          <h2>Self-assessment before tracking</h2>
          <p className="muted">
            Use these settlement-specific questions before tracking. They do not decide eligibility
            for the user; they make the source terms, saved facts, proof rules, deadline, and
            permission checks explicit.
          </p>
        </header>
        <div className="readiness-list checklist-panel" aria-label="Settlement self-assessment checklist">
          {selfAssessment.map((item) => (
            <div className="readiness-item" key={item.key}>
              <span className={`readiness-dot ${item.status}`} aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                <p>{item.prompt}</p>
                <p className="muted small">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <header className="section-header">
          <h2>Permission preview</h2>
          <p className="muted">
            This is the exact category attestation ClaimBot relies on before tracking. It is checked
            again during final checks and stored with claim audit records.
          </p>
        </header>
        <div className={`authorization-preview ${authorizationPreview.status}`}>
          <div>
            <span className={`readiness-dot ${authorizationPreview.tone}`} aria-hidden="true" />
            <strong>{authorizationPreview.label}</strong>
          </div>
          <p>{authorizationPreview.detail}</p>
          {authorizationPreview.attestationPreview ? (
            <blockquote>{authorizationPreview.attestationPreview}</blockquote>
          ) : (
            <Link href="/permissions">Add category attestation</Link>
          )}
        </div>
      </section>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Class period start</div>
          <div className="stat-value text">{fmtDate(row.classPeriodStart)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Class period end</div>
          <div className="stat-value text">{fmtDate(row.classPeriodEnd)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Deadline</div>
          <div className="stat-value text">{fmtDate(row.deadline)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Potential recovery</div>
          <div className="stat-value text">{row.payoutEstimate ?? 'Not listed'}</div>
        </div>
      </div>

      <div className="card">
        <h2>Source details</h2>
        <div className="meta">
          <span><b>Source:</b> {row.source}</span>
          <span><b>Administrator:</b> {row.administrator}</span>
          <span><b>CAPTCHA:</b> {row.captchaType}</span>
          <span><b>Payout structure:</b> {row.payoutStructure ?? 'Not listed'}</span>
        </div>
        <div className="compliance-box">
          ClaimBot uses source details for matching and final checks. External settlement pages remain the
          authority for legal terms, deadlines, and administrator instructions.
        </div>
        <div className="detail-link-stack">
          <p>
            <b>Source URL:</b>{' '}
            <a href={row.sourceUrl} target="_blank" rel="noreferrer">
              {row.sourceUrl}
            </a>
          </p>
          {row.claimFormUrl && (
            <p>
              <b>Claim form:</b>{' '}
              <a href={row.claimFormUrl} target="_blank" rel="noreferrer">
                {row.claimFormUrl}
              </a>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
