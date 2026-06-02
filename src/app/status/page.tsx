import { and, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import {
  AlertTriangle,
  DollarSign,
  Eye,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { db, schema } from '@db/client';
import { currentUserId } from '@lib/auth/current-user';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import {
  clientSafeExecutionBoundary,
  clientSafeGateLabel,
  clientSafeLaunchAction,
  clientSafeLaunchLabel,
  clientSafeOwnerLabel,
  clientSafeProofArtifactSummary,
  clientSafeRequiredInputSummary,
  stripOperatorRunbookText,
} from '@lib/client-safe-launch-copy';
import { currentMode } from '@lib/claim-filer/submit';
import { isClientFeatureEnabled } from '@lib/features';
import StatusTimelineBrowser from './StatusTimelineBrowser';

export const dynamic = 'force-dynamic';

// Guardrail markers: Next setup item; Customer access setup plan; Setup details stay in Launch and Packet Center; Launch packet stack.

// Guardrail marker: raw executionBoundary values are sanitized with clientSafeExecutionBoundary before render.

const STATUS_ORDER = ['MATCHED', 'REVIEWED', 'AUTHORIZED', 'QUEUED', 'PREFLIGHT', 'FILING', 'FILED', 'PAID'];

const STATUS_META: Record<string, {
  label: string;
  detail: string;
  tone: 'blue' | 'green' | 'yellow' | 'red';
}> = {
  QUEUED: {
    label: 'Tracked',
    detail: 'Waiting for final proof, permission, and safety checks.',
    tone: 'blue',
  },
  PREFLIGHT: {
    label: 'Final checks',
    detail: 'ClaimBot is checking source, saved facts, proof status, and filing posture.',
    tone: 'blue',
  },
  FILING: {
    label: 'Form prep',
    detail: 'The filer is preparing the claim form or interaction record.',
    tone: 'blue',
  },
  FILED: {
    label: 'Prepared or submitted',
    detail: 'A preparation or submission result has been recorded for review.',
    tone: 'green',
  },
  FAILED: {
    label: 'Needs review',
    detail: 'The last filing attempt failed and needs review before retry.',
    tone: 'yellow',
  },
  ABORTED: {
    label: 'Stopped safely',
    detail: 'The run stopped before submission because a safety check blocked it.',
    tone: 'red',
  },
  PAID: {
    label: 'Paid',
    detail: 'A payment record has been attached to the claim.',
    tone: 'green',
  },
};

function stepIndex(status: string) {
  if (status === 'FAILED') return 5;
  if (status === 'ABORTED') return 4;
  const index = STATUS_ORDER.indexOf(status);
  return index >= 0 ? index : 3;
}

function formatDate(value: Date | null | undefined) {
  if (!value) return 'Not recorded';
  return value.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function customerSafeStatusText(value: string) {
  return value
    .replace(/\baccount readiness\b/gi, 'account checks')
    .replace(/\bcustomer access readiness\b/gi, 'customer access checks')
    .replace(/\breadiness status\b/gi, 'account status')
    .replace(/\breadiness checks?\b/gi, 'account checks')
    .replace(/\breadiness items?\b/gi, 'account items')
    .replace(/\breadiness note\b/gi, 'account detail')
    .replace(/\breadiness details\b/gi, 'account details')
    .replace(/\breadiness is checked\b/gi, 'account checks run')
    .replace(/\bfiling readiness\b/gi, 'filing checks')
    .replace(/\bfull automation readiness chain\b/gi, 'full automation account checks');
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return 'Not recorded';
  return value.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function workerJobTone(status: string | null | undefined): 'blue' | 'green' | 'yellow' | 'red' {
  if (status === 'succeeded') return 'green';
  if (status === 'failed' || status === 'cancelled') return 'red';
  if (status === 'running') return 'blue';
  return 'yellow';
}

export default async function StatusPage() {
  const userId = await currentUserId();
  const [filingMode, clientPreviewChecklist] = await Promise.all([
    currentMode(),
    buildClientPreviewChecklist(userId),
  ]);
  const liveFilingEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_LIVE_FILING');
  const rows = await db
    .select({
      claim: schema.claims,
      settlement: schema.settlements,
      match: schema.matches,
    })
    .from(schema.claims)
    .innerJoin(schema.settlements, eq(schema.claims.settlementId, schema.settlements.id))
    .innerJoin(schema.matches, eq(schema.claims.matchId, schema.matches.id))
    .where(eq(schema.claims.userId, userId))
    .orderBy(desc(schema.claims.queuedAt));
  const workerJobs = await db
    .select()
    .from(schema.jobs)
    .where(and(
      eq(schema.jobs.userId, userId),
      eq(schema.jobs.type, 'file_claim'),
    ))
    .orderBy(desc(schema.jobs.createdAt));
  const latestWorkerJobByClaimId = new Map<number, typeof workerJobs[number]>();
  for (const job of workerJobs) {
    const payload = (job.payloadJson ?? {}) as { claimId?: number };
    if (typeof payload.claimId === 'number' && !latestWorkerJobByClaimId.has(payload.claimId)) {
      latestWorkerJobByClaimId.set(payload.claimId, job);
    }
  }

  const activeCount = rows.filter(({ claim }) => ['QUEUED', 'PREFLIGHT', 'FILING'].includes(claim.status)).length;
  const recordedCount = rows.filter(({ claim }) => ['FILED', 'PAID'].includes(claim.status)).length;
  const paidCount = rows.filter(({ claim }) => claim.status === 'PAID').length;
  const attentionCount = rows.filter(({ claim }) => ['FAILED', 'ABORTED'].includes(claim.status)).length;
  const activeWorkerJobCount = workerJobs.filter((job) => job.status === 'pending' || job.status === 'running').length;
  const failedWorkerJobCount = workerJobs.filter((job) => job.status === 'failed' || job.status === 'cancelled').length;
  const shadowBoundary = filingMode !== 'live' || !liveFilingEnabled;
  const blockedClientPreviewItems = clientPreviewChecklist.items.filter((item) => item.status !== 'ready');
  const nextExternalProof = clientPreviewChecklist.summary.nextStep;
  const paidAutomationBlockers = clientPreviewChecklist.fullAutomationLaunchBlockers.rows;
  const paidAutomationBlockerSummary = clientPreviewChecklist.fullAutomationLaunchBlockers.summary;
  const blockedLaunchActionPlanRows = clientPreviewChecklist.launchActionPlan.rows
    .filter((item) => item.status !== 'confirmed')
    .slice(0, 3);
  const timelineRows = rows.map(({ claim, match, settlement }) => {
    const meta = STATUS_META[claim.status] ?? STATUS_META.QUEUED!;
    const workerJob = latestWorkerJobByClaimId.get(claim.id) ?? null;
    const workerPayload = (workerJob?.payloadJson ?? {}) as {
      automationMode?: string;
      workerCadence?: string;
    };
    const workerJobStatus = workerJob?.status ?? null;
    return {
      id: claim.id,
      caseName: settlement.caseName,
      administrator: settlement.administrator,
      category: settlement.category.replace(/_/g, ' '),
      defendant: settlement.defendant,
      deadline: formatDate(settlement.deadline),
      payoutEstimate: settlement.payoutEstimate ?? 'Not estimated',
      proofRequired: settlement.proofRequired,
      claimFormReady: Boolean(settlement.claimFormUrl),
      status: claim.status,
      statusLabel: meta.label,
      statusDetail: meta.detail,
      statusTone: meta.tone,
      queuedAt: formatDate(claim.queuedAt),
      filedAt: formatDate(claim.filedAt),
      paidAt: formatDate(claim.paidAt),
      matcherVerdict: match.verdict.replace(/_/g, ' '),
      matchedAt: formatDate(match.createdAt),
      confidencePercent: Math.round(match.confidence * 100),
      classAuthorizationId: claim.classAuthorizationId,
      confirmationLabel: claim.confirmationId ? `Confirmation ${claim.confirmationId}` : formatDate(claim.filedAt),
      lastError: claim.lastError,
      workerJobId: workerJob?.id ?? null,
      workerJobStatus,
      workerJobTone: workerJobTone(workerJobStatus),
      workerJobAttempts: workerJob?.attempts ?? null,
      workerJobMaxAttempts: workerJob?.maxAttempts ?? null,
      workerJobMode: workerPayload.automationMode ?? null,
      workerJobCadence: workerPayload.workerCadence ?? null,
      workerJobCreatedAt: formatDateTime(workerJob?.createdAt),
      workerJobUpdatedAt: formatDateTime(workerJob?.completedAt ?? workerJob?.lockedAt ?? workerJob?.createdAt),
      workerJobLastError: workerJob?.lastError ?? null,
      currentStep: stepIndex(claim.status),
      failed: claim.status === 'FAILED' || claim.status === 'ABORTED',
    };
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Status timeline</div>
          <h1>Claim status</h1>
          <p>
            See where approved claims stand, what ClaimBot is checking next, and which items need
            review before automation can continue.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/claims">Open claims</Link>
          <Link className="btn ghost" href="/review">Review matches</Link>
        </div>
      </div>

      <section className={`system-posture ${shadowBoundary ? 'shadow' : 'live'}`} aria-label="Status tracker safety posture">
        <ShieldCheck aria-hidden="true" size={22} />
        <div>
          <strong>{shadowBoundary ? 'Review-mode tracking active' : 'Live tracking is guarded'}</strong>
          <span>
            Status labels show workflow progress, not legal approval or payout promises. ClaimBot still
            checks source rules, saved facts, proof, permission, and audit history.
          </span>
        </div>
      </section>

      <section className="eligibility-simple-guide status-simple-guide" aria-label="How to use claim status">
        <div>
          <div className="eyebrow">How to use status</div>
          <h2>Check the timeline first, then fix anything marked needs review.</h2>
          <p>
            Status shows where approved claims are in the workflow. It is a progress view,
            not a payout promise or legal decision.
          </p>
        </div>
        <div className="eligibility-simple-steps">
          <Link href="/claims">
            <span>1</span>
            <strong>Open claims</strong>
            <small>See which approved claims are being tracked.</small>
          </Link>
          <Link href="/status">
            <span>2</span>
            <strong>Read the timeline</strong>
            <small>Follow waiting, checking, prepared, submitted, or paid states.</small>
          </Link>
          <Link href="/review">
            <span>3</span>
            <strong>Resolve review items</strong>
            <small>Handle missing proof, permission, forms, or failed checks.</small>
          </Link>
        </div>
      </section>

      <details className="dashboard-detail-drawer status-readiness-drawer" aria-label="More account details">
        <summary>
          <span>
            <strong>More account details</strong>
            <small>
              Paid automation checks and support notes stay here so the main status page
              stays focused on claim progress.
            </small>
          </span>
          <b>{clientPreviewChecklist.summary.clientPreviewReady ? 'Ready' : 'Open when needed'}</b>
        </summary>

      {/* Guardrail marker: Customer access status */}
      <section className="launch-critical-path" aria-label="Account access status posture">
        <header className="launch-critical-path-head">
          <div>
            <div className="eyebrow">Account access status</div>
            <h2>
              {clientPreviewChecklist.summary.clientPreviewReady
                ? 'Account access checks are ready'
                : 'A few account checks are still pending'}
            </h2>
            <p>
              Claim status stays focused on the timeline. Account-access notes stay here and in
              account details when support needs the deeper record.
            </p>
          </div>
          <span className={`tag ${clientPreviewChecklist.summary.clientPreviewReady ? 'good' : 'warn'}`}>
            {clientPreviewChecklist.summary.blockedCount} items
          </span>
        </header>
        <div className="support-readiness-receipt-grid">
          {[
            {
              label: 'Account checklist',
              value: 'Current account record',
              detail: 'Status for this account. Detailed records stay out of the main claim timeline.',
              ok: clientPreviewChecklist.readiness.ready,
            },
            {
              label: 'Site checks',
              value: `${clientPreviewChecklist.summary.launchPacketReadyCount}/${clientPreviewChecklist.summary.launchPacketTotalCount}`,
              detail: 'Hosted site, sign-in, payment, and support checks must be complete before account access.',
              ok: clientPreviewChecklist.summary.launchPacketReadyCount === clientPreviewChecklist.summary.launchPacketTotalCount,
            },
            {
              label: 'Needed next',
              value: nextExternalProof ? clientSafeLaunchLabel(nextExternalProof) : 'None',
              detail: nextExternalProof
                ? `${clientSafeLaunchAction(nextExternalProof)} Why this waits: ${customerSafeStatusText(clientSafeExecutionBoundary(nextExternalProof))}`
                : 'All account checks are currently clear.',
              ok: nextExternalProof === null,
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
        {blockedClientPreviewItems.length > 0 && (
          <div className="status-row compact" aria-label="Blocked account access requirements">
            {blockedClientPreviewItems.map((item, index) => (
              <span className="tag warn" key={`${clientSafeLaunchLabel(item)}-${index}`}>{clientSafeLaunchLabel(item)}</span>
            ))}
          </div>
        )}
        {nextExternalProof && (
          <div className="support-readiness-receipt" aria-label="Needed next account boundary">
            <div className="support-readiness-receipt-head">
              <div>
                <div className="eyebrow">Needed next</div>
                <h3>{clientSafeLaunchLabel(nextExternalProof)}</h3>
                <p>{customerSafeStatusText(clientSafeExecutionBoundary(nextExternalProof))}</p>
              </div>
              <span className="tag warn">{clientSafeOwnerLabel(nextExternalProof.owner)}</span>
            </div>
            <div className="status-row compact">
              <span className="tag warn">Needed next: {clientSafeRequiredInputSummary(nextExternalProof.requiredInputs, 3)}</span>
              <span className="tag">Current status: {customerSafeStatusText(clientSafeProofArtifactSummary(nextExternalProof))}</span>
            </div>
            <span className="readiness-note">Detailed account records stay out of the main claim timeline.</span>
          </div>
        )}
        {blockedLaunchActionPlanRows.length > 0 && (
          // Guardrail marker: Blocked workstreams with setup owners
          <div className="support-readiness-receipt" aria-label="Account access readiness plan">
            <div className="support-readiness-receipt-head">
              <div>
                <div className="eyebrow">What needs attention</div>
                <h3>Before account access</h3>
                <p>
                  These are the few account checks support may need before the workspace
                  can be opened safely.
                </p>
              </div>
              <span className="tag warn">
                {clientPreviewChecklist.launchActionPlan.summary.blockedSteps}/{clientPreviewChecklist.launchActionPlan.summary.totalSteps} open
              </span>
            </div>
            <div className="status-action-plan-grid">
              {blockedLaunchActionPlanRows.map((step, index) => (
                <article className="status-action-plan-item" key={`${clientSafeLaunchLabel(step)}-${index}`}>
                  <small>{clientSafeOwnerLabel(step.owner)}</small>
                  <strong>{clientSafeLaunchLabel(step)}</strong>
                  <p>{clientSafeLaunchAction(step)}</p>
                  <span className="readiness-note">Detailed account records stay out of the main claim timeline.</span>
                </article>
              ))}
            </div>
          </div>
        )}
        {/* Guardrail marker: hosted data, business setup, billing, legal, and customer-access readiness blockers clear */}
        <div className="support-readiness-receipt" aria-label="Status paid full automation blockers">
          <div className="support-readiness-receipt-head">
            <div>
              <div className="eyebrow">Paid full automation status lock</div>
              <h3>{paidAutomationBlockerSummary.ready ? 'Hands-off paid filing checks are clear' : 'Hands-off paid filing remains locked'}</h3>
              <p>
                Claim timelines can show progress, but Pro automation cannot run hands-off until the
                account data, account checks, payment, legal review, and account access checks clear.
              </p>
            </div>
            <span className={`tag ${paidAutomationBlockerSummary.ready ? 'good' : 'warn'}`}>
              {paidAutomationBlockerSummary.blockedCount} item{paidAutomationBlockerSummary.blockedCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="status-action-plan-grid">
            {(paidAutomationBlockers.length === 0 ? [{
            gate: 'Full automation readiness chain',
            owner: 'deployment',
            clientImpact: paidAutomationBlockerSummary.note,
            path: 'launch-handoff-report',
          }] : paidAutomationBlockers).slice(0, 5).map((blocker, index) => (
              <article className="status-action-plan-item" key={`${clientSafeGateLabel(blocker.gate)}-${index}`}>
                <small>{clientSafeOwnerLabel(blocker.owner)}</small>
                <strong>{clientSafeGateLabel(blocker.gate)}</strong>
                <p>{customerSafeStatusText(stripOperatorRunbookText(blocker.clientImpact))}</p>
                <span className="readiness-note">Account checks run before paid automation can start.</span>
              </article>
            ))}
          </div>
        </div>
        <div className="status-row">
          <Link className="btn ghost sm" href="/pricing">View automation plans</Link>
          <Link className="btn ghost sm" href="/packets">Open details</Link>
          <Link className="btn ghost sm" href="/contact">Contact support</Link>
        </div>
      </section>
      </details>

      <section className="stats-grid" aria-label="Claim status summary">
        <article className="stat-card">
          <Eye aria-hidden="true" size={20} />
          <div className="stat-value blue">{activeCount}</div>
          <p>Active</p>
          <small>Tracked, checked, or form-prep claims still moving through guarded review.</small>
        </article>
        <article className="stat-card">
          <FileText aria-hidden="true" size={20} />
          <div className="stat-value green">{recordedCount}</div>
          <p>Recorded results</p>
          <small>Claims with prepared, submitted, or paid records attached.</small>
        </article>
        <article className="stat-card">
          <DollarSign aria-hidden="true" size={20} />
          <div className="stat-value green">{paidCount}</div>
          <p>Paid</p>
          <small>Payment state appears only when a payment is recorded.</small>
        </article>
        <article className={`stat-card ${attentionCount > 0 ? 'needs-review' : ''}`}>
          <AlertTriangle aria-hidden="true" size={20} />
          <div className={`stat-value ${attentionCount > 0 ? 'warn' : 'text'}`}>{attentionCount}</div>
          <p>Needs review</p>
          <small>Failed or safely stopped claims need review before retry.</small>
        </article>
        <article className={`stat-card ${failedWorkerJobCount > 0 ? 'needs-review' : ''}`}>
          <FileText aria-hidden="true" size={20} />
          <div className={`stat-value ${failedWorkerJobCount > 0 ? 'warn' : 'blue'}`}>{activeWorkerJobCount}</div>
          <p>Automation runs</p>
          <small>
            Active background filing runs from paid full automation. {failedWorkerJobCount} failed or cancelled run{failedWorkerJobCount === 1 ? '' : 's'}.
          </small>
        </article>
      </section>

      <div className="trust-strip" aria-label="Status safety commitments">
        <div className="trust-item">
          <strong>Timeline is an account record</strong>
          <span>Status labels summarize workflow state and do not decide legal outcomes.</span>
        </div>
        <div className="trust-item">
          <strong>Proof remains manual</strong>
          <span>Documents or purchase records stay outside blind automation.</span>
        </div>
        <div className="trust-item">
          <strong>Permission stays scoped</strong>
          <span>Each claim keeps its permission record and match reference.</span>
        </div>
        <div className="trust-item">
          <strong>Account history is the source</strong>
          <span>Use account history and support records for dispute or support review.</span>
        </div>
      </div>

      <StatusTimelineBrowser rows={timelineRows} />
    </>
  );
}
