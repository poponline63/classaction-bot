import { db, schema } from '@db/client';
import { eq, and, desc } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUserId } from '@lib/auth/current-user';
import { getUserSubscription } from '@lib/billing/entitlements';
import { currentMode } from '@lib/claim-filer/submit';
import { buildClaimSafetyConsole } from '@lib/claim-filer/claim-safety-console';
import { getClientPreviewAutomationLock } from '@lib/claim-filer/client-preview-lock';
import { FILE_BOUNDARY_ACK, isClaimRunnableStatus } from '@lib/claim-filer/request-boundary';
import { isClientFeatureEnabled } from '@lib/features';
import { runFileClaim } from '../../actions';
import LiveViewer from './LiveViewer';
import ClaimDetailPacketBrowser, { type ClaimDetailPacketRow } from './ClaimDetailPacketBrowser';

export const dynamic = 'force-dynamic';

const FRIENDLY_STATUS: Record<string, { label: string; tone: string; desc: string }> = {
  QUEUED: {
    label: 'Tracked for final checks',
    tone: 'blue',
    desc: 'This claim is waiting for permission, proof, matcher, and filing-mode checks.',
  },
  PREFLIGHT: {
    label: 'Final checks',
    tone: 'blue',
    desc: 'ClaimBot is verifying the match, evidence, form fields, and current runtime mode.',
  },
  FILING: {
    label: 'Preparing form',
    tone: 'blue',
    desc: 'ClaimBot is working through the settlement claim form.',
  },
  FILED: {
    label: 'Prepared or submitted',
    tone: 'green',
    desc: 'The claim has a recorded preparation or submission result and confirmation data when available.',
  },
  FAILED: {
    label: 'Needs attention',
    tone: 'yellow',
    desc: 'Review the error and retry after fixing the underlying issue.',
  },
  ABORTED: {
    label: 'Stopped safely',
    tone: 'red',
    desc: 'ClaimBot stopped before submission because a guardrail or form check failed.',
  },
  PAID: {
    label: 'Payment received',
    tone: 'green',
    desc: 'Payment has been recorded for this claim.',
  },
};

const ABORT_EXPLANATIONS: Record<string, string> = {
  AUTHORIZATION_DISABLED: 'The category permission for this settlement type is turned off. Enable it in Permissions, then retry.',
  AUTHORIZATION_REVOKED: 'The category permission was revoked. Re-enable it in Permissions, then retry.',
  AUTHORIZATION_NOT_FOUND: 'No permission was found for this settlement category. Enable the correct category first.',
  CATEGORY_MISMATCH: 'The stored permission category does not match this settlement category.',
  DEADLINE_PASSED: 'The claim deadline has passed, so this settlement is no longer accepting claims.',
  PROOF_REQUIRED: 'This settlement requires proof, so it stays in review until supporting documents are handled manually.',
  NO_CLAIM_FORM_URL: 'No claim form URL is stored for this settlement.',
  MATCHER_VERDICT_NOT_ELIGIBLE: 'The matcher no longer marks this settlement as eligible for the current profile.',
  MATCHER_CONFIDENCE_TOO_LOW: 'The matcher confidence is too low. Add more profile, purchase, or breach detail before retrying.',
  RATE_LIMIT_EXCEEDED: 'The daily claim limit has been reached. Retry after the limit resets.',
  AUTOMATION_PLAN_REQUIRED: 'The monthly filing allowance for this account is used up, so final checks stayed paused.',
  CLAIM_NOT_FOUND: 'Claim record not found.',
  CLAIM_NOT_QUEUED: 'This claim has already moved out of the tracked state.',
  SETTLEMENT_NOT_FOUND: 'Settlement record not found.',
  MATCH_NOT_FOUND: 'Match record not found. Re-run the matcher from Review.',
};

function getAbortExplanation(error: string | null): string {
  if (!error) return 'An unknown error occurred.';
  for (const [key, explanation] of Object.entries(ABORT_EXPLANATIONS)) {
    if (error.includes(key)) return explanation;
  }
  return error;
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return 'Not recorded';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtDateShort(d: Date | null | undefined) {
  if (!d) return 'Not recorded';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function evidenceLabel(path: string | null) {
  return path ? 'Captured' : 'Missing';
}

function evidenceTone(path: string | null): ClaimDetailPacketRow['tone'] {
  return path ? 'pass' : 'warn';
}

function workerJobTone(status: string | null | undefined): ClaimDetailPacketRow['tone'] {
  if (status === 'succeeded') return 'pass';
  if (status === 'failed' || status === 'cancelled') return 'fail';
  return 'warn';
}

export default async function ClaimDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const userId = await currentUserId();
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const rows = await db
    .select({
      claim: schema.claims,
      settlement: schema.settlements,
      match: schema.matches,
      auth: schema.classAuthorizations,
    })
    .from(schema.claims)
    .innerJoin(schema.settlements, eq(schema.claims.settlementId, schema.settlements.id))
    .innerJoin(schema.matches, eq(schema.claims.matchId, schema.matches.id))
    .innerJoin(
      schema.classAuthorizations,
      eq(schema.claims.classAuthorizationId, schema.classAuthorizations.id),
    )
    .where(and(eq(schema.claims.id, id), eq(schema.claims.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) notFound();

  const { claim, settlement, match, auth } = row;
  const workerJobs = (await db
    .select()
    .from(schema.jobs)
    .where(and(
      eq(schema.jobs.userId, userId),
      eq(schema.jobs.type, 'file_claim'),
    ))
    .orderBy(desc(schema.jobs.createdAt)))
    .filter((job) => {
      const payload = (job.payloadJson ?? {}) as { claimId?: number };
      return payload.claimId === claim.id;
    });
  const latestWorkerJob = workerJobs[0] ?? null;
  const latestWorkerPayload = (latestWorkerJob?.payloadJson ?? {}) as {
    automationMode?: string;
    workerCadence?: string;
  };
  const auditEvents = await db
    .select()
    .from(schema.auditLog)
    .where(and(
      eq(schema.auditLog.userId, userId),
      eq(schema.auditLog.entityType, 'claim'),
      eq(schema.auditLog.entityId, claim.id),
    ))
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(5);
  const filingMode = await currentMode();
  const subscription = await getUserSubscription(userId);
  const subscriptionPlanLabel = subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1);
  const settlementSearchEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');
  const status = FRIENDLY_STATUS[claim.status] ?? FRIENDLY_STATUS.QUEUED!;
  const isFailed = claim.status === 'FAILED' || claim.status === 'ABORTED';
  const canRunPreflight = isClaimRunnableStatus(claim.status);
  const clientPreviewLock = canRunPreflight
    ? await getClientPreviewAutomationLock(userId)
    : null;
  const initialClientPreviewLock = clientPreviewLock?.locked ? clientPreviewLock.payload : null;
  const completionLabel = filingMode === 'live' ? 'Submitted' : 'Prepared';
  const authorizationActive = auth.enabled && !auth.revokedAt;
  const attestationCaptured = Boolean(claim.submittedAttestationText);
  const evidenceItems = [
    { label: 'Empty form screenshot', path: claim.screenshotEmptyFormPath },
    { label: 'Filled form screenshot', path: claim.screenshotFilledFormPath },
    { label: 'Confirmation screenshot', path: claim.screenshotConfirmationPath },
    { label: 'PDF receipt', path: claim.pdfReceiptPath },
  ];
  const capturedArtifactCount = evidenceItems.filter((item) => item.path).length;
  const safetyConsoleItems = buildClaimSafetyConsole({
    filingMode,
    automationEntitlementActive: subscription.automationEnabled,
    subscriptionPlan: subscription.plan,
    subscriptionStatus: subscription.status,
    authorizationActive,
    authorizedAt: auth.authorizedAt,
    proofRequired: settlement.proofRequired,
    claimFormUrl: settlement.claimFormUrl,
    matcherVerdict: match.verdict,
    matcherConfidence: match.confidence,
    capturedArtifacts: capturedArtifactCount,
    totalArtifacts: evidenceItems.length,
    auditEventCount: auditEvents.length,
  });
  const preExecutionSealRows = [
    {
      title: 'Snapshot boundary',
      detail: `Claim #${claim.id} was tracked ${fmtDate(claim.queuedAt)}. A SHA-256 digest is generated when the audit export is downloaded.`,
      tone: 'pass',
    },
    {
      title: 'Safety defaults locked',
      detail: `${filingMode === 'live' ? 'Live guarded' : 'Shadow mode'} | Permission required | Proof-required manual | No fabrication | Account history.`,
      tone: filingMode === 'live' ? 'warn' : 'pass',
    },
    {
      title: 'Plan check',
      detail: subscription.automationEnabled
        ? `${subscriptionPlanLabel}/${subscription.status} access is active for full guarded automation; claim-specific checks still apply.`
        : `${subscriptionPlanLabel}/${subscription.status} includes 5 guarded filings per month; final checks pause when the allowance is used.`,
      tone: subscription.automationEnabled ? 'pass' : 'warn',
    },
    {
      title: 'Custody chain',
      detail: `Matcher verdict ${match.verdict.toLowerCase().replace(/_/g, ' ')} at ${match.confidence.toFixed(2)} confidence, backed by category permission v${auth.attestationVersion}.`,
      tone: authorizationActive && match.verdict === 'ELIGIBLE' ? 'pass' : 'warn',
    },
    {
      title: 'Account history',
      detail: `${auditEvents.length} recent claim history event${auditEvents.length === 1 ? '' : 's'} visible here; full account history is included in the export.`,
      tone: auditEvents.length > 0 ? 'pass' : 'warn',
    },
    {
      title: 'Automation run receipt',
      detail: latestWorkerJob
        ? `Automation run #${latestWorkerJob.id} is ${latestWorkerJob.status}; attempts ${latestWorkerJob.attempts}/${latestWorkerJob.maxAttempts}; schedule ${latestWorkerPayload.workerCadence ?? 'not recorded'}.`
        : 'No automation run is currently attached to this claim packet.',
      tone: latestWorkerJob ? workerJobTone(latestWorkerJob.status) : 'warn',
    },
  ];
  // Guardrail marker: Worker lifecycle receipt.
  const claimPacketRows: ClaimDetailPacketRow[] = [
    ...safetyConsoleItems.map((item) => ({
      id: `gate-${item.key}`,
      kind: 'gate' as const,
      title: item.label,
      detail: item.detail,
      value: item.value,
      tone: item.tone,
    })),
    {
      id: 'record-attestation',
      kind: 'artifact' as const,
      title: 'Submitted attestation text',
      detail: attestationCaptured
        ? 'ClaimBot captured the form attestation during final checks.'
        : 'Captured only after ClaimBot finds the form attestation during final checks.',
      value: attestationCaptured ? 'Captured' : 'Missing',
      tone: attestationCaptured ? 'pass' : 'warn',
    },
    ...evidenceItems.map((item) => ({
      id: `record-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      kind: 'artifact' as const,
      title: item.label,
      detail: item.path
        ? 'Evidence record is stored for claim review and export.'
        : 'Evidence has not been captured for this claim packet yet.',
      value: evidenceLabel(item.path),
      tone: evidenceTone(item.path),
    })),
    ...(workerJobs.length === 0
      ? [{
        id: 'worker-missing',
        kind: 'worker' as const,
        title: 'Automation run',
        detail: 'No automation run is attached yet. Start paid full automation only after all readiness and claim checks pass.',
        value: 'Missing',
        tone: 'warn' as const,
      }]
      : workerJobs.slice(0, 3).map((job) => {
        const payload = (job.payloadJson ?? {}) as { automationMode?: string; workerCadence?: string };
        return {
          id: `worker-${job.id}`,
          kind: 'worker' as const,
          title: `Automation run #${job.id}`,
          detail: `Status ${job.status}; attempts ${job.attempts}/${job.maxAttempts}; schedule ${payload.workerCadence ?? 'not recorded'}; mode ${payload.automationMode ?? 'not recorded'}.`,
          value: job.status,
          tone: workerJobTone(job.status),
        };
      })),
    ...auditEvents.map((event) => ({
      id: `audit-${event.id}`,
      kind: 'audit' as const,
      title: event.eventType.replace(/_/g, ' ').toLowerCase(),
      detail: `${fmtDateShort(event.occurredAt)} by ${event.actor}`,
      value: `claim #${event.entityId}`,
      tone: 'pass' as const,
    })),
  ];

  return (
    <>
      <p className="small">
        <Link href="/claims">Back to claims</Link>
      </p>

      <div className="page-header">
        <div>
          <div className="eyebrow">Claim detail</div>
          <h1>{settlement.caseName}</h1>
          <div className="status-row">
            <span className={`tag ${status.tone}`}>{status.label}</span>
            <span className="tag">confidence {match.confidence.toFixed(2)}</span>
            <span className="tag">permission v{auth.attestationVersion}</span>
            <span className={`tag ${filingMode === 'live' ? 'warn' : 'blue'}`}>
              {filingMode === 'live' ? 'live mode' : 'shadow mode'}
            </span>
          </div>
          <p>{status.desc}</p>
        </div>
        {settlement.payoutEstimate && (
          <div className="claim-payout-panel">
            <div className="claim-payout-label">Estimated payout</div>
            <div className="claim-payout-value">{settlement.payoutEstimate}</div>
          </div>
        )}
      </div>

      <section className="pre-execution-seal" aria-label="Pre-Execution Seal">
        <header className="pre-execution-seal-head">
          <div>
            <div className="pre-execution-seal-kicker">Pre-Execution Seal</div>
            <h2>Claim operations packet</h2>
            <p>
              This packet binds the claim to its source, matcher result, permission, evidence posture,
              and audit history before any live submission path can proceed.
            </p>
          </div>
          <Link className="btn ghost" href="/packets">
            Review packet record
          </Link>
        </header>
        <div className="pre-execution-seal-grid">
          {preExecutionSealRows.map((row) => (
            <article className={`pre-execution-seal-item ${row.tone}`} key={row.title}>
              <span className={`readiness-dot ${row.tone}`} aria-hidden="true" />
              <div>
                <strong>{row.title}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card claim-safety-console" aria-label="Live safety console">
        <div className="readiness-head">
          <div>
            <div className="eyebrow">Live safety console</div>
            <h2>Automation decision record</h2>
            <p className="muted small">
              This claim is inspectable before and after form preparation: mode, permission,
              plan check, check result, captured evidence, and exportable account history stay visible together.
            </p>
          </div>
          <Link className="btn ghost sm" href="/audit?entity=claim">
            Review account history
          </Link>
        </div>
        <div className="claim-safety-grid">
          {safetyConsoleItems.map((item) => (
            <div className={`claim-safety-item ${item.tone}`} key={item.key}>
              <span className={`readiness-dot ${item.tone}`} aria-hidden="true" />
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <ClaimDetailPacketBrowser rows={claimPacketRows} claimId={claim.id} />

      {isFailed && claim.lastError && (
        <div className="notice warn notice-spaced">
          <h3>{claim.status === 'ABORTED' ? 'Why this claim stopped' : 'What needs attention'}</h3>
          <p>{getAbortExplanation(claim.lastError)}</p>
          {canRunPreflight && (
            <form action={runFileClaim} className="claim-retry-form">
              <input type="hidden" name="claimId" value={claim.id} />
              <input type="hidden" name="fileBoundaryAck" value={FILE_BOUNDARY_ACK} />
              <button className="btn" type="submit">Retry final checks</button>
            </form>
          )}
          {!canRunPreflight && (
            <p className="small muted">
              This packet is locked for review. Create or track a fresh claim run only after the
              underlying evidence, permission, or form issue is resolved.
            </p>
          )}
        </div>
      )}

      <div className="detail-grid">
        <section className="card readiness-card">
          <div className="readiness-head">
            <div>
              <div className="eyebrow">Safety checks</div>
              <h2>Can this claim proceed?</h2>
              <p className="muted small">
                ClaimBot runs these checks again during final checks before preparing or submitting a form.
              </p>
            </div>
            <span className={`tag ${subscription.automationEnabled && authorizationActive && !settlement.proofRequired && settlement.claimFormUrl ? 'good' : 'warn'}`}>
              {subscription.automationEnabled && authorizationActive && !settlement.proofRequired && settlement.claimFormUrl ? 'Ready check' : 'Review check'}
            </span>
          </div>
          <div className="readiness-list">
            <div className="readiness-item">
              <span className={`readiness-dot ${subscription.automationEnabled ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>{subscription.automationEnabled ? 'Automation plan active' : 'Automation plan needed'}</strong>
                <p>
                  {subscription.automationEnabled
                    ? `${subscriptionPlanLabel} access is active; final checks still inspect claim-specific checks before form work.`
                    : 'This claim record remains reviewable; final checks pause when the monthly filing allowance is used.'}
                </p>
              </div>
            </div>
            <div className="readiness-item">
              <span className={`readiness-dot ${authorizationActive ? 'pass' : 'fail'}`} aria-hidden="true" />
              <div>
                <strong>{authorizationActive ? 'Permission active' : 'Permission inactive'}</strong>
                <p>
                  {authorizationActive
                    ? `Category ${auth.category.toLowerCase().replace(/_/g, ' ')} is enabled with stored attestation v${auth.attestationVersion}.`
                    : 'This category must be allowed again before the claim can proceed.'}
                </p>
              </div>
            </div>
            <div className="readiness-item">
              <span className={`readiness-dot ${settlement.proofRequired ? 'warn' : 'pass'}`} aria-hidden="true" />
              <div>
                <strong>{settlement.proofRequired ? 'Proof required' : 'No proof requirement stored'}</strong>
                <p>
                  {settlement.proofRequired
                    ? 'Supporting documents must be handled manually before claim preparation.'
                    : 'Final checks can continue if the matcher and permission still pass.'}
                </p>
              </div>
            </div>
            <div className="readiness-item">
              <span className={`readiness-dot ${settlement.claimFormUrl ? 'pass' : 'fail'}`} aria-hidden="true" />
              <div>
                <strong>{settlement.claimFormUrl ? 'Claim form linked' : 'Claim form missing'}</strong>
                <p>
                  {settlement.claimFormUrl
                    ? 'The filer has an external claim form URL to inspect.'
                    : 'A form URL is required before final checks can prepare this claim.'}
                </p>
              </div>
            </div>
            <div className="readiness-item">
              <span className={`readiness-dot ${match.verdict === 'ELIGIBLE' ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>Matcher verdict: {match.verdict.toLowerCase().replace(/_/g, ' ')}</strong>
                <p>Confidence {match.confidence.toFixed(2)} is stored with this claim record.</p>
              </div>
            </div>
          </div>
        </section>

        <aside className="card readiness-card">
          <div className="readiness-head">
            <div>
              <div className="eyebrow">Evidence trail</div>
              <h2>What has been captured?</h2>
              <p className="muted small">
                Captured records support review, account history, and customer questions after preparation.
              </p>
            </div>
            <span className={`tag ${attestationCaptured ? 'good' : 'warn'}`}>
              {attestationCaptured ? 'Attestation captured' : 'No attestation yet'}
            </span>
          </div>
          <div className="readiness-list">
            <div className="readiness-item">
              <span className={`readiness-dot ${attestationCaptured ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>Submitted attestation text</strong>
                <p>
                  {attestationCaptured
                    ? claim.submittedAttestationText!.slice(0, 180)
                    : 'Captured only after ClaimBot finds the form attestation during final checks.'}
                </p>
              </div>
            </div>
            {evidenceItems.map((item) => (
              <div className="readiness-item" key={item.label}>
                <span className={`readiness-dot ${evidenceTone(item.path)}`} aria-hidden="true" />
                <div>
                  <strong>{item.label}</strong>
                  <p>{evidenceLabel(item.path)}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="card">
        <h3>Timeline</h3>
        <div className="status-row">
          <span className="tag">Tracked: {fmtDate(claim.queuedAt)}</span>
          {claim.filedAt && <span className="tag green">{completionLabel}: {fmtDate(claim.filedAt)}</span>}
          {claim.confirmationId && <span className="tag blue">Confirmation: {claim.confirmationId}</span>}
          {claim.paidAt && <span className="tag green">Paid: {fmtDate(claim.paidAt)}</span>}
          <span className="tag">Retries: {claim.retryCount}</span>
        </div>
      </div>

      <div className="card card-spaced">
        <div className="settlement-detail-footer">
          <div>
            <h3>Recent history events</h3>
            <p className="muted small">
              Claim-scoped inputs, permission text, records, and event history are saved in
              account history for support review.
            </p>
          </div>
          <Link className="btn ghost sm" href="/audit">
            Open account history
          </Link>
        </div>
        {auditEvents.length > 0 ? (
          <div className="readiness-list">
            {auditEvents.map((event) => (
              <div className="readiness-item" key={event.id}>
                <span className="readiness-dot pass" aria-hidden="true" />
                <div>
                  <strong>{event.eventType.replace(/_/g, ' ').toLowerCase()}</strong>
                  <p>{fmtDateShort(event.occurredAt)} by {event.actor}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">No claim audit events have been recorded yet.</p>
        )}
      </div>

      <LiveViewer
        claimId={claim.id}
        initialStatus={claim.status}
        filingMode={filingMode}
        automationEntitlementActive={subscription.automationEnabled}
        subscriptionPlanLabel={subscriptionPlanLabel}
        initialClientPreviewLock={initialClientPreviewLock}
      />

      <div className="card card-spaced">
        <div className="settlement-detail-footer">
          <div>
            <h3>Settlement details</h3>
            <p className="muted small">{settlement.classDefinition.slice(0, 220)}</p>
          </div>
          {settlementSearchEnabled ? (
            <Link href={`/settlements/${settlement.id}`} className="btn ghost sm">View settlement</Link>
          ) : (
            <Link href="/review" className="btn ghost sm">Back to review</Link>
          )}
        </div>
      </div>
    </>
  );
}
