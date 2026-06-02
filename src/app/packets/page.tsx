import { and, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import {
  AlertTriangle,
  ClipboardCheck,
  FileCheck,
  FileText,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { db, schema } from '@db/client';
import { buildLaunchEvidence, readLatestMatcherRunReceipt } from '@lib/audit/support-packet';
import { currentUserId } from '@lib/auth/current-user';
import { getUserSubscription } from '@lib/billing/entitlements';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import { currentMode } from '@lib/claim-filer/submit';
import { getDatabaseSchemaReadiness } from '@lib/database-schema-readiness';
import {
  buildFullAutomationLaunchBlockers,
  summarizeFullAutomationLaunchBlockers,
} from '@lib/full-automation-launch-blockers';
import { getLaunchPacketArtifactRows } from '@lib/launch-packet-stack';
import { readLaunchPacketRefreshReport } from '@lib/launch-packet-refresh-report';
import { formatLocalVerificationDuration } from '@lib/local-verification-packet';
import { getSourceCatalogReadiness } from '@lib/source-catalog-readiness';
import { getAllSettings } from '@lib/settings';
import CliCommandRows from '../CliCommandRows';
import PacketCenterBrowser from './PacketCenterBrowser';
import type { PacketBrowserRow } from './PacketCenterBrowser';

export const dynamic = 'force-dynamic';

const STATUS_META: Record<string, {
  label: string;
  detail: string;
  tone: 'blue' | 'green' | 'yellow' | 'red';
}> = {
  QUEUED: {
    label: 'Tracked packet',
    detail: 'Waiting for guarded final checks.',
    tone: 'blue',
  },
  PREFLIGHT: {
    label: 'Final-check packet',
    detail: 'Safety, source, proof, and mode checks are running.',
    tone: 'blue',
  },
  FILING: {
    label: 'Preparing packet',
    detail: 'ClaimBot is preparing form evidence.',
    tone: 'blue',
  },
  FILED: {
    label: 'Recorded packet',
    detail: 'A preparation or submission record exists.',
    tone: 'green',
  },
  FAILED: {
    label: 'Packet needs review',
    detail: 'Last run failed and should be reviewed.',
    tone: 'yellow',
  },
  ABORTED: {
    label: 'Packet stopped safely',
    detail: 'A safety check stopped the run.',
    tone: 'red',
  },
  PAID: {
    label: 'Paid packet',
    detail: 'Payment has been recorded.',
    tone: 'green',
  },
};

function formatDate(value: Date | null | undefined) {
  if (!value) return 'Not recorded';
  return value.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function workerJobTone(status: string | null | undefined): 'pass' | 'warn' | 'fail' {
  if (status === 'succeeded') return 'pass';
  if (status === 'failed' || status === 'cancelled') return 'fail';
  return 'warn';
}

function artifactCount(claim: typeof schema.claims.$inferSelect) {
  return [
    claim.screenshotEmptyFormPath,
    claim.screenshotFilledFormPath,
    claim.screenshotConfirmationPath,
    claim.pdfReceiptPath,
  ].filter(Boolean).length;
}

function setupOwnerLabel(owner: string) {
  return owner === 'operator' ? 'business owner' : owner;
}

function packetReadiness(input: {
  authorizationActive: boolean;
  matcherVerdict: string;
  proofRequired: boolean;
  claimFormUrl: string | null;
  artifactCount: number;
}) {
  if (!input.authorizationActive) {
    return {
      label: 'Permission blocked',
      detail: 'The category attestation is disabled or revoked.',
      tone: 'fail' as const,
    };
  }
  if (input.matcherVerdict !== 'ELIGIBLE') {
    return {
      label: 'Matcher review needed',
      detail: 'The saved matcher verdict does not currently clear the claim boundary.',
      tone: 'warn' as const,
    };
  }
  if (input.proofRequired) {
    return {
      label: 'Proof review needed',
      detail: 'The source record asks for proof, so documents stay manual.',
      tone: 'warn' as const,
    };
  }
  if (!input.claimFormUrl) {
    return {
      label: 'Form missing',
      detail: 'A claim form URL is required before a packet can proceed.',
      tone: 'warn' as const,
    };
  }
  if (input.artifactCount > 0) {
    return {
      label: 'Evidence captured',
      detail: `${input.artifactCount}/4 evidence records are attached.`,
      tone: 'pass' as const,
    };
  }
  return {
    label: 'Ready for final checks',
    detail: 'Core checks are aligned; evidence records appear after preparation.',
    tone: 'pass' as const,
  };
}

export default async function PacketsPage() {
  const userId = await currentUserId();
  const [
    filingMode,
    rows,
    claimAuditEvents,
    settings,
    subscription,
    databaseSchemaReadiness,
    sourceCatalogReadiness,
    matcherRunReceipt,
    workerJobs,
    clientPreviewChecklist,
  ] = await Promise.all([
    currentMode(),
    db
      .select({
        claim: schema.claims,
        settlement: schema.settlements,
        match: schema.matches,
        authorization: schema.classAuthorizations,
      })
      .from(schema.claims)
      .innerJoin(schema.settlements, eq(schema.claims.settlementId, schema.settlements.id))
      .innerJoin(schema.matches, eq(schema.claims.matchId, schema.matches.id))
      .innerJoin(schema.classAuthorizations, eq(schema.claims.classAuthorizationId, schema.classAuthorizations.id))
      .where(eq(schema.claims.userId, userId))
      .orderBy(desc(schema.claims.queuedAt)),
    db
      .select({
        entityId: schema.auditLog.entityId,
        occurredAt: schema.auditLog.occurredAt,
      })
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.userId, userId), eq(schema.auditLog.entityType, 'claim'))),
    getAllSettings(),
    getUserSubscription(userId),
    getDatabaseSchemaReadiness(),
    getSourceCatalogReadiness(),
    readLatestMatcherRunReceipt(userId),
    db
      .select()
      .from(schema.jobs)
      .where(and(
        eq(schema.jobs.userId, userId),
        eq(schema.jobs.type, 'file_claim'),
      ))
      .orderBy(desc(schema.jobs.createdAt)),
    buildClientPreviewChecklist(userId),
  ]);
  const launchEvidence = buildLaunchEvidence({
    settings,
    subscription,
    databaseSchemaReadiness,
    sourceCatalogReadiness,
    matcherRunReceipt,
  });
  const supportPacketCriticalPath = launchEvidence.launchCriticalPath;
  const supportPacketBlockedCount = supportPacketCriticalPath.filter((item) => item.status === 'blocked').length;
  const supportPacketActionPlan = launchEvidence.launchActionPlan;
  const supportPacketActionPlanRows = supportPacketActionPlan.rows.slice(0, 5);
  const setupAutomationControls = launchEvidence.automationControls.setupShadowReview;
  const billingCheckoutHandoff = launchEvidence.automationControls.billingCheckoutHandoff;
  const planGate = launchEvidence.planGate;
  const checkoutBlockReasons = Object.values(billingCheckoutHandoff.checkoutBlockReasons).filter(Boolean);
  const launchPacketRows = getLaunchPacketArtifactRows(matcherRunReceipt);
  const launchPacketReadyCount = launchPacketRows.filter((artifact) => artifact.ready).length;
  const launchPacketRefreshReport = readLaunchPacketRefreshReport();
  const latestLaunchRefreshResults = launchPacketRefreshReport.commands.slice(-5);
  const fullAutomationLaunchBlockers = buildFullAutomationLaunchBlockers(launchPacketRows);
  const fullAutomationLaunchBlockerSummary = summarizeFullAutomationLaunchBlockers(fullAutomationLaunchBlockers);
  const ownerHandoffBriefs = clientPreviewChecklist.ownerHandoffBriefs;
  const auditCounts = claimAuditEvents.reduce<Map<number, number>>((map, event) => {
    map.set(event.entityId, (map.get(event.entityId) ?? 0) + 1);
    return map;
  }, new Map());
  const latestWorkerJobByClaimId = new Map<number, typeof workerJobs[number]>();
  for (const job of workerJobs) {
    const payload = (job.payloadJson ?? {}) as { claimId?: number };
    if (typeof payload.claimId === 'number' && !latestWorkerJobByClaimId.has(payload.claimId)) {
      latestWorkerJobByClaimId.set(payload.claimId, job);
    }
  }
  const totalArtifacts = rows.reduce((sum, { claim }) => sum + artifactCount(claim), 0);
  const exportableCount = rows.filter(({ claim }) => claim.status !== 'QUEUED' || auditCounts.has(claim.id)).length;
  const attentionCount = rows.filter(({ claim }) => ['FAILED', 'ABORTED'].includes(claim.status)).length;
  const activeWorkerJobCount = workerJobs.filter((job) => job.status === 'pending' || job.status === 'running').length;
  const failedWorkerJobCount = workerJobs.filter((job) => job.status === 'failed' || job.status === 'cancelled').length;
  const proofReviewCount = rows.filter(({ settlement }) => settlement.proofRequired).length;
  const formReadyCount = rows.filter(({ settlement }) => Boolean(settlement.claimFormUrl)).length;
  const authorizationActiveCount = rows.filter(({ authorization }) => authorization.enabled && !authorization.revokedAt).length;
  const shadowMode = filingMode !== 'live';
  const packetRows: PacketBrowserRow[] = rows.map(({ authorization, claim, match, settlement }) => {
    const artifacts = artifactCount(claim);
    const status = STATUS_META[claim.status] ?? STATUS_META.QUEUED!;
    const workerJob = latestWorkerJobByClaimId.get(claim.id) ?? null;
    const workerPayload = (workerJob?.payloadJson ?? {}) as {
      automationMode?: string;
      workerCadence?: string;
    };
    const readiness = packetReadiness({
      authorizationActive: authorization.enabled && !authorization.revokedAt,
      matcherVerdict: match.verdict,
      proofRequired: settlement.proofRequired,
      claimFormUrl: settlement.claimFormUrl,
      artifactCount: artifacts,
    });

    return {
      id: claim.id,
      caseName: settlement.caseName,
      defendant: settlement.defendant,
      queuedAt: formatDate(claim.queuedAt),
      statusLabel: status.label,
      statusDetail: status.detail,
      statusTone: status.tone,
      readinessLabel: readiness.label,
      readinessDetail: readiness.detail,
      readinessTone: readiness.tone,
      authorizationLabel: authorization.enabled && !authorization.revokedAt ? `Active v${authorization.attestationVersion}` : 'Blocked or revoked',
      matcherLabel: `${match.verdict.replace(/_/g, ' ')} at ${Math.round(match.confidence * 100)}%`,
      artifactCount: artifacts,
      auditCount: auditCounts.get(claim.id) ?? 0,
      workerJobId: workerJob?.id ?? null,
      workerJobStatus: workerJob?.status ?? null,
      workerJobTone: workerJobTone(workerJob?.status),
      workerJobAttempts: workerJob?.attempts ?? null,
      workerJobMaxAttempts: workerJob?.maxAttempts ?? null,
      workerJobMode: workerPayload.automationMode ?? null,
      workerJobCadence: workerPayload.workerCadence ?? null,
      workerJobLastError: workerJob?.lastError ?? null,
      artifacts: [
        { label: 'Empty form', captured: Boolean(claim.screenshotEmptyFormPath) },
        { label: 'Filled form', captured: Boolean(claim.screenshotFilledFormPath) },
        { label: 'Confirmation', captured: Boolean(claim.screenshotConfirmationPath) },
        { label: 'PDF receipt', captured: Boolean(claim.pdfReceiptPath) },
      ],
    };
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Claim packet preparation</div>
          <h1>Packet Center</h1>
          <p>
            Track the claim packets ClaimBot is preparing for you. Each packet shows what is ready,
            what needs proof or review, and whether paid automation can continue safely.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/review">Review matches</Link>
          <Link className="btn ghost" href="/status">Status tracker</Link>
        </div>
      </div>

      <section className={`system-posture ${shadowMode ? 'shadow' : 'live'}`} aria-label="Packet center safety posture">
        <Lock aria-hidden="true" size={22} />
        <div>
          <strong>{shadowMode ? 'Packets remain in shadow review' : 'Live packets remain gated'}</strong>
          <span>
            ClaimBot can prepare eligible packets automatically, but it stops for missing proof,
            consent, legal review, or account setup.
          </span>
        </div>
      </section>

      <section className="stats-grid" aria-label="Packet center summary">
        <article className="stat-card">
          <FileText aria-hidden="true" size={20} />
          <div className="stat-value blue">{rows.length}</div>
          <p>Claim packets</p>
          <small>Claims currently tracked, prepared, stopped, submitted, or paid.</small>
        </article>
        <article className="stat-card">
          <FileCheck aria-hidden="true" size={20} />
          <div className="stat-value green">{totalArtifacts}</div>
          <p>Evidence records</p>
          <small>Screenshots and receipts ClaimBot has attached to packets.</small>
        </article>
        <article className="stat-card">
          <ClipboardCheck aria-hidden="true" size={20} />
          <div className="stat-value green">{exportableCount}</div>
          <p>Review records</p>
          <small>Packets with status history available if support needs context.</small>
        </article>
        <article className={`stat-card ${attentionCount > 0 ? 'needs-review' : ''}`}>
          <AlertTriangle aria-hidden="true" size={20} />
          <div className={`stat-value ${attentionCount > 0 ? 'warn' : 'text'}`}>{attentionCount}</div>
          <p>Needs review</p>
          <small>Failed or safely stopped packets should be reviewed before retry.</small>
        </article>
        <article className={`stat-card ${failedWorkerJobCount > 0 ? 'needs-review' : ''}`}>
          <ShieldCheck aria-hidden="true" size={20} />
          <div className={`stat-value ${failedWorkerJobCount > 0 ? 'warn' : 'blue'}`}>{activeWorkerJobCount}</div>
          <p>Automation status</p>
          <small>
            Paid automation only runs after checks clear. {failedWorkerJobCount} run{failedWorkerJobCount === 1 ? '' : 's'} need review.
          </small>
        </article>
      </section>

      <div className="trust-strip" aria-label="Packet preparation safeguards">
        <div className="trust-item">
          <strong>Proof stays in your control</strong>
          <span>Requests needing documents pause until proof is reviewed.</span>
        </div>
        <div className="trust-item">
          <strong>Automation is guarded</strong>
          <span>Eligible no-proof packets can move automatically after checks clear.</span>
        </div>
        <div className="trust-item">
          <strong>You can inspect the path</strong>
          <span>Every prepared packet keeps status, receipts, and account history.</span>
        </div>
        <div className="trust-item">
          <strong>Consent is required</strong>
          <span>Setup consent is checked before discovery, matching, or claim tracking starts.</span>
        </div>
        <div className="trust-item">
          <strong>Shadow mode first</strong>
          <span>First launch keeps packets reviewable until live filing is enabled.</span>
        </div>
      </div>

      <section className="packet-prep-runway" aria-label="Read-only packet preparation runway">
        <header className="packet-prep-runway-head">
          <div>
              <div className="eyebrow">Packet preparation runway</div>
            <h2>Your packet moves through four clear stages</h2>
            <p>
              ClaimBot keeps the workflow simple: pick a packet, confirm documentation, review the
              claim details, then allow final approval only when the safety checks are clear. It
              remains a read-only runway until the packet has proof, consent, and permission.
            </p>
          </div>
          <span className={`tag ${shadowMode ? 'warn' : 'good'}`}>
            {shadowMode ? 'Nothing has been filed yet' : 'Live mode still gated'}
          </span>
        </header>

        <div className="packet-runway-steps" aria-label="Packet preparation stages">
          <article className="packet-runway-step done">
            <span>01</span>
            <div>
              <strong>Select packet</strong>
              <p>{rows.length} claim packet{rows.length === 1 ? '' : 's'} available for review.</p>
            </div>
          </article>
          <article className={`packet-runway-step ${proofReviewCount > 0 ? 'warn' : 'done'}`}>
            <span>02</span>
            <div>
              <strong>Documentation Checklist</strong>
              <p>
                {proofReviewCount > 0
                  ? `${proofReviewCount} packet${proofReviewCount === 1 ? '' : 's'} require manual proof review.`
                  : `${totalArtifacts} evidence record${totalArtifacts === 1 ? '' : 's'} already attached.`}
              </p>
            </div>
          </article>
          <article className={`packet-runway-step ${rows.length > 0 && formReadyCount === rows.length && authorizationActiveCount === rows.length ? 'done' : 'active'}`}>
            <span>03</span>
            <div>
              <strong>Review Your Claim Packet</strong>
              <p>
                {formReadyCount}/{rows.length} with forms and {authorizationActiveCount}/{rows.length} with active permissions.
              </p>
            </div>
          </article>
          <article className={`packet-runway-step ${attentionCount > 0 ? 'locked' : 'active'}`}>
            <span>04</span>
            <div>
              <strong>Ready for Final Approval</strong>
              <p>
                {attentionCount > 0
                  ? `${attentionCount} packet${attentionCount === 1 ? '' : 's'} need review before final approval.`
                  : `${exportableCount} packet${exportableCount === 1 ? '' : 's'} have exportable review context.`}
              </p>
            </div>
          </article>
        </div>

        <div className="packet-runway-notice">
          <strong>Final approval remains separate</strong>
          <span>
            Packet readiness is not filing authority. Proof-heavy packets, missing forms, revoked
            permissions, failed runs, and live filing decisions stay behind explicit review.
          </span>
        </div>
      </section>

      <PacketCenterBrowser rows={packetRows} />

      <details className="dashboard-detail-drawer packet-operator-drawer" aria-label="Advanced proof records">
        <summary>
          <span>
            <strong>Advanced proof records</strong>
            <small>
              Business setup evidence, export links, packet refresh records, and setup notes stay here
              instead of crowding the customer packet workflow. Automation runs and worker lifecycle
              evidence remain available for operator review.
            </small>
          </span>
          <b>{launchPacketReadyCount}/{launchPacketRows.length} setup records ready</b>
        </summary>

      <section className="launch-critical-path" aria-label="Support packet launch evidence">
        <header className="launch-critical-path-head">
          <div>
            <div className="eyebrow">Support packet evidence</div>
            <h2>Launch path is included in the account support packet</h2>
            <p>
              The account-level support export includes masked launch evidence, schema checks,
              source catalog readiness, billing handoff evidence, and the ordered launch-critical path.
            </p>
          </div>
          <span className={`tag ${supportPacketBlockedCount === 0 ? 'good' : 'warn'}`}>
            {supportPacketBlockedCount} blocked
          </span>
        </header>
        <ol className="launch-critical-path-list">
          {supportPacketCriticalPath.slice(0, 5).map((item, index) => (
            <li className={`launch-critical-path-item ${item.status}`} key={item.key}>
              <span className="launch-critical-path-index">{index + 1}</span>
              <div>
                <div className="launch-critical-path-title">
                  <strong>{item.label}</strong>
                  <span className={`tag ${item.status === 'confirmed' ? 'good' : 'warn'}`}>
                    {item.status === 'confirmed' ? 'Clear' : `${item.blockerCount} blocker${item.blockerCount === 1 ? '' : 's'}`}
                  </span>
                </div>
                <p><b>Owner:</b> {setupOwnerLabel(item.owner)}</p>
                <p><b>Proof:</b> {item.proofNeeded}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="support-readiness-receipt" aria-label="Support packet action plan execution boundaries">
          <div className="support-readiness-receipt-head">
            <div>
              <div className="eyebrow">Client preview action plan</div>
              <h3>Blocked workstreams are exportable</h3>
              <p>
                Packet Center mirrors the launch action plan exported in the support packet and client-preview
                checklist. Each remaining workstream shows what Codex can verify, what still needs account,
                business, legal, or deployment action, and the first non-secret command to run.
              </p>
            </div>
            <span className={`tag ${supportPacketActionPlan.summary.blockedSteps === 0 ? 'good' : 'warn'}`}>
              {supportPacketActionPlan.summary.confirmedSteps}/{supportPacketActionPlan.summary.totalSteps} clear
            </span>
          </div>
          <div className="launch-proof-matrix-grid support-action-plan-grid">
            {supportPacketActionPlanRows.map((step) => (
              <article className={`launch-proof-matrix-row ${step.status}`} key={step.key}>
                <div className="launch-proof-matrix-index">{step.order}</div>
                <div className="launch-proof-matrix-main">
                  <div className="launch-proof-matrix-title">
                    <strong>{step.label}</strong>
                    <span className={`tag ${step.status === 'confirmed' ? 'good' : 'warn'}`}>
                      {step.status === 'confirmed' ? 'Clear' : `${step.blockerCount} blocker${step.blockerCount === 1 ? '' : 's'}`}
                    </span>
                  </div>
                  <p><b>Owner:</b> {setupOwnerLabel(step.owner)}</p>
                  <p><b>Objective:</b> {step.objective}</p>
                  <p><b>Execution boundary:</b> {step.executionBoundary}</p>
                  <p><b>Required inputs:</b> {step.requiredInputs.join(', ')}</p>
                  <p><b>Setup records:</b> {step.proofArtifacts.slice(0, 3).join(', ')}{step.proofArtifacts.length > 3 ? `, +${step.proofArtifacts.length - 3} more` : ''}</p>
                </div>
                <div className="launch-proof-matrix-action">
                  <span>First command</span>
                  <code>{step.commands[0] ?? 'npm run launch:handoff'}</code>
                </div>
              </article>
            ))}
          </div>
          {supportPacketActionPlan.rows.length > supportPacketActionPlanRows.length && (
            <p className="muted small">
              +{supportPacketActionPlan.rows.length - supportPacketActionPlanRows.length} more action-plan step{supportPacketActionPlan.rows.length - supportPacketActionPlanRows.length === 1 ? '' : 's'} in the support packet JSON.
            </p>
          )}
        </div>
        <div className="support-readiness-receipt" aria-label="Packet Center owner handoff queue">
          <div className="support-readiness-receipt-head">
            <div>
              <div className="eyebrow">Owner handoff queue</div>
              <h3>Blocked packet work grouped by owner</h3>
              <p>
                Packet Center mirrors the same owner handoff briefs as the launch handoff export,
                so the setup team can see the first action, required inputs, and packet proof gaps
                without opening raw JSON.
              </p>
            </div>
            <span className={`tag ${ownerHandoffBriefs.length === 0 ? 'good' : 'warn'}`}>
              {ownerHandoffBriefs.length} owner{ownerHandoffBriefs.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="launch-proof-matrix-grid support-action-plan-grid">
            {ownerHandoffBriefs.length === 0 ? (
              <article className="launch-proof-matrix-row confirmed">
                <div className="launch-proof-matrix-index">OK</div>
                <div className="launch-proof-matrix-main">
                  <div className="launch-proof-matrix-title">
                    <strong>All setup owners are clear</strong>
                    <span className="tag good">Ready</span>
                  </div>
                  <p>No blocked setup owner workstreams are recorded in the client-preview checklist.</p>
                </div>
                <div className="launch-proof-matrix-action">
                  <code>npm run client:checklist</code>
                </div>
              </article>
            ) : ownerHandoffBriefs.map((brief, index) => (
              <article className="launch-proof-matrix-row blocked" key={brief.owner}>
                <div className="launch-proof-matrix-index">{index + 1}</div>
                <div className="launch-proof-matrix-main">
                  <div className="launch-proof-matrix-title">
                    <strong>{setupOwnerLabel(brief.owner)}</strong>
                    <span className="tag warn">
                      {brief.blockedPacketCount} blocked packet{brief.blockedPacketCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p><b>First action:</b> {brief.firstAction}</p>
                  <p>
                    <b>Required inputs:</b>{' '}
                    {brief.requiredInputs.length > 0 ? brief.requiredInputs.slice(0, 4).join('; ') : 'No additional inputs listed.'}
                    {brief.requiredInputs.length > 4 ? `; +${brief.requiredInputs.length - 4} more` : ''}
                  </p>
                  <p>
                    <b>Workstreams:</b> {brief.blockedWorkstreamCount} blocked workstream{brief.blockedWorkstreamCount === 1 ? '' : 's'}.
                  </p>
                  {brief.blockedPackets[0]?.nextAction && (
                    <p><b>Next packet action:</b> {brief.blockedPackets[0].nextAction}</p>
                  )}
                </div>
                <div className="launch-proof-matrix-action">
                  <span>{brief.safeLocalCommands.length} local command{brief.safeLocalCommands.length === 1 ? '' : 's'} ready</span>
                  {brief.safeLocalCommands.slice(0, 2).map((command) => (
                    <code key={command}>{command}</code>
                  ))}
                  {brief.externalInputCommands.length > 0 && (
                    <code>{brief.externalInputCommands.length} waiting on external input</code>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="support-readiness-receipt" aria-label="Matcher receipt export evidence">
          <div className="support-readiness-receipt-head">
            <div>
              <div className="eyebrow">Paid checkout receipt</div>
              <h3>{planGate.paidCheckoutReady ? 'Paid checkout is cleared for processor handoff' : 'Paid checkout is locked before payment'}</h3>
              <p>
                Support packet evidence separates processor billing readiness from paid checkout readiness.
                Checkout still needs {billingCheckoutHandoff.requiredLegalReviewAck}={billingCheckoutHandoff.requiredLegalReviewAckValue}
                {' '}before users can be sent to the paid automation offer.
              </p>
            </div>
            <span className={`tag ${planGate.paidCheckoutReady ? 'good' : 'warn'}`}>
              {planGate.paidCheckoutReady ? 'Checkout clear' : 'Checkout locked'}
            </span>
          </div>
          <div className="support-readiness-receipt-grid">
            {[
              {
                label: 'Processor billing',
                value: planGate.paymentProcessorReady ? 'Ready' : 'Blocked',
                detail: launchEvidence.billing.note,
                ok: planGate.paymentProcessorReady,
              },
              {
                label: 'Paid checkout',
                value: planGate.paidCheckoutReady ? 'Ready' : 'Locked',
                detail: checkoutBlockReasons.length > 0
                  ? `Current block reason: ${checkoutBlockReasons.join(', ')}.`
                  : 'No paid-checkout block reason is currently recorded.',
                ok: planGate.paidCheckoutReady,
              },
              {
                label: 'Legal review gate',
                value: billingCheckoutHandoff.requiredLegalReviewAckValue,
                detail: `Missing legal review reports as ${billingCheckoutHandoff.expectedBlockReasonWhenLegalReviewMissing}.`,
                ok: billingCheckoutHandoff.checkoutBlockReasons.proMonthly !== billingCheckoutHandoff.expectedBlockReasonWhenLegalReviewMissing,
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
        </div>
        <div className="support-readiness-receipt" aria-label="Launch packet refresh receipt">
          <div className="support-readiness-receipt-head">
            <div>
              <div className="eyebrow">Launch packet refresh receipt</div>
              <h3>
                {launchPacketRefreshReport.ready
                  ? `Packet refresh passed ${launchPacketRefreshReport.passed}/${launchPacketRefreshReport.total}`
                  : 'Refresh the launch packet stack before handoff'}
              </h3>
              <p>
                Packet Center now carries the same non-secret refresh receipt as Launch, so the
              business owner can verify every packet export was regenerated together before sharing
                support, billing, legal, deployment, or client-preview evidence.
              </p>
            </div>
            <span className={`tag ${launchPacketRefreshReport.ready ? 'good' : 'warn'}`}>
              {launchPacketRefreshReport.ready ? 'Refresh clear' : `${launchPacketRefreshReport.failed} failed`}
            </span>
          </div>
          <div className="support-readiness-receipt-grid">
            {[
              {
                label: 'Refresh report',
                value: launchPacketRefreshReport.exists ? launchPacketRefreshReport.path : 'Not generated',
                detail: launchPacketRefreshReport.boundary,
                ok: launchPacketRefreshReport.ready,
              },
              {
                label: 'Generated',
                value: launchPacketRefreshReport.generatedAt
                  ? new Date(launchPacketRefreshReport.generatedAt).toLocaleString('en-US')
                  : 'Pending',
                detail: `Duration: ${formatLocalVerificationDuration(launchPacketRefreshReport.totalDurationMs)}.`,
                ok: launchPacketRefreshReport.generatedAt !== null,
              },
              {
                label: 'Command results',
                value: `${launchPacketRefreshReport.passed}/${launchPacketRefreshReport.total} passed`,
                detail: launchPacketRefreshReport.failed > 0
                  ? `${launchPacketRefreshReport.failed} packet refresh command${launchPacketRefreshReport.failed === 1 ? '' : 's'} need attention.`
                  : 'All recorded packet refresh commands passed.',
                ok: launchPacketRefreshReport.ready,
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
          <div className="launch-proof-matrix-grid support-action-plan-grid">
            <article className={`launch-proof-matrix-row ${launchPacketRefreshReport.ready ? 'confirmed' : 'blocked'}`}>
              <div className="launch-proof-matrix-index">{launchPacketRefreshReport.ready ? 'OK' : '!'}</div>
              <div className="launch-proof-matrix-main">
                <div className="launch-proof-matrix-title">
                  <strong>{launchPacketRefreshReport.failed > 0 ? 'Failed refresh commands' : 'Latest refresh commands'}</strong>
                  <span className={`tag ${launchPacketRefreshReport.ready ? 'good' : 'warn'}`}>
                    {launchPacketRefreshReport.failed > 0 ? `${launchPacketRefreshReport.failed} failed` : 'Recorded'}
                  </span>
                </div>
                <p>
                  {latestLaunchRefreshResults.length > 0
                    ? latestLaunchRefreshResults.map((command) => `${command.label}: ${command.ok ? 'pass' : 'failed'}`).join('; ')
                    : 'No launch packet refresh commands have been recorded yet.'}
                </p>
                <p><b>Boundary:</b> The refresh receipt proves local packet regeneration only; it does not clear account, billing, legal, automation processing, or deployed preview checks.</p>
              </div>
              <div className="launch-proof-matrix-action">
                <span>Refresh commands</span>
                <CliCommandRows commands={['npm run launch:refresh:packets', 'npm run launch:handoff', 'npm run client:checklist']} compact />
              </div>
            </article>
          </div>
        </div>
        <div className="support-readiness-receipt" aria-label="Matcher receipt export evidence">
          <div className="support-readiness-receipt-head">
            <div>
              <div className="eyebrow">User consent receipt</div>
              <h3>Terms check audited before packet automation</h3>
              <p>
                Support packet evidence includes {setupAutomationControls.requiredTermsAck} and
                {` ${setupAutomationControls.termsEventType}`} before discovery, matching, or safe
                claim preparation can start.
              </p>
            </div>
            <span className="tag good">Terms gate enforced</span>
          </div>
        </div>
        <div className="support-readiness-receipt" aria-label="Matcher receipt export evidence">
          <div className="support-readiness-receipt-head">
            <div>
              <div className="eyebrow">Matcher refresh receipt</div>
              <h3>Packet exports can prove the matcher was refreshed</h3>
              <p>
                The support packet carries the latest MATCHER_RUN_COMPLETED receipt with aggregate
                source, insert, update, verdict-change, and error counts.
              </p>
            </div>
            <span className={`tag ${matcherRunReceipt.exists ? 'good' : 'warn'}`}>
              {matcherRunReceipt.exists ? 'Receipt ready' : 'Run matcher first'}
            </span>
          </div>
          <div className="support-readiness-receipt-grid">
            {[
              {
                label: 'Last refresh',
                value: matcherRunReceipt.exists ? formatDate(matcherRunReceipt.occurredAt ? new Date(matcherRunReceipt.occurredAt) : null) : 'Not recorded',
                detail: matcherRunReceipt.exists ? `Audit event #${matcherRunReceipt.auditEventId}` : 'Review needs a matcher run before this proof exists.',
                ok: matcherRunReceipt.exists,
              },
              {
                label: 'Matches inserted',
                value: matcherRunReceipt.matchesInserted === null ? 'Pending' : String(matcherRunReceipt.matchesInserted),
                detail: 'New match rows created during the latest refresh.',
                ok: matcherRunReceipt.matchesInserted !== null,
              },
              {
                label: 'Matches updated',
                value: matcherRunReceipt.matchesUpdated === null ? 'Pending' : String(matcherRunReceipt.matchesUpdated),
                detail: 'Existing match rows refreshed with current profile and source facts.',
                ok: matcherRunReceipt.matchesUpdated !== null,
              },
              {
                label: 'Run errors',
                value: matcherRunReceipt.errorCount === null ? 'Pending' : String(matcherRunReceipt.errorCount),
                detail: 'Nonzero errors should be resolved before client handoff.',
                ok: matcherRunReceipt.errorCount === 0,
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
        </div>
        <div className="status-row">
          <a className="btn ghost sm" href="/api/audit/support-packet">Export support packet (JSON)</a>
          <Link className="btn ghost sm" href="/launch">Review launch readiness</Link>
        </div>
      </section>

      <section className="launch-proof-matrix" aria-label="Setup packet ledger">
        <header className="launch-proof-matrix-head">
          <div>
            <div className="eyebrow">Setup packet ledger</div>
            <h2>Client-preview blockers are tracked as setup records</h2>
            <p>
              Packet Center also tracks the launch proof files, so claim packets, support exports,
              matcher proof, and deployment handoff evidence stay in the same review workflow.
            </p>
          </div>
          <span className={`tag ${launchPacketReadyCount === launchPacketRows.length ? 'good' : 'warn'}`}>
            {launchPacketReadyCount}/{launchPacketRows.length} packets ready
          </span>
        </header>
        <div className="launch-proof-matrix-grid">
          {launchPacketRows.map((artifact, index) => (
            <article className={`launch-proof-matrix-row ${artifact.ready ? 'confirmed' : 'blocked'}`} key={artifact.path}>
              <div className="launch-proof-matrix-index">{index + 1}</div>
              <div className="launch-proof-matrix-main">
                <div className="launch-proof-matrix-title">
                  <strong>{artifact.label}</strong>
                  <span className={`tag ${artifact.ready ? 'good' : 'warn'}`}>{artifact.statusLabel}</span>
                </div>
                <p><b>Record:</b> {artifact.path}</p>
                <p><b>Proves:</b> {artifact.proof}</p>
                <p><b>Status:</b> {artifact.statusDetail}</p>
                <p><b>Next:</b> {artifact.nextAction}</p>
                {artifact.missingInputs.length > 0 && (
                  <p><b>Needed:</b> {artifact.missingInputs.slice(0, 3).join('; ')}{artifact.missingInputs.length > 3 ? `; +${artifact.missingInputs.length - 3} more in the packet` : ''}</p>
                )}
              </div>
              <div className="launch-proof-matrix-action">
                <span>{setupOwnerLabel(artifact.owner)}</span>
                <code>{artifact.command}</code>
                <code>{artifact.updatedAtLabel}</code>
              </div>
            </article>
          ))}
        </div>
        <div className="status-row">
          <Link className="btn ghost sm" href="/launch">Open Launch Readiness</Link>
          <a className="btn ghost sm" href="/api/audit/netlify-launch-doctor">Export Netlify doctor (JSON)</a>
          <a className="btn ghost sm" href="/api/audit/client-preview-checklist">Export client preview checklist (JSON)</a>
          <a className="btn ghost sm" href="/api/audit/external-activation-workbook">Export activation workbook (JSON)</a>
          <a className="btn ghost sm" href="/api/audit/launch-handoff">Export launch handoff (JSON)</a>
          <a className="btn ghost sm" href="/api/audit/support-packet">Export support packet (JSON)</a>
        </div>
      </section>

      <section className="launch-proof-matrix" aria-label="Paid full automation packet blockers">
        <header className="launch-proof-matrix-head">
          <div>
            <div className="eyebrow">Paid full automation blockers</div>
            <h2>{fullAutomationLaunchBlockerSummary.ready ? 'Packet proof clears paid automation' : 'These packets still lock hands-off paid filing'}</h2>
            <p>
              Packet Center keeps the automation promise tied to evidence: Pro automation is hands-off only
              after every hosted, billing, legal, Identity, and preview packet clears.
            </p>
          </div>
          <span className={`tag ${fullAutomationLaunchBlockerSummary.ready ? 'good' : 'warn'}`}>
            {fullAutomationLaunchBlockerSummary.blockedCount} blocker{fullAutomationLaunchBlockerSummary.blockedCount === 1 ? '' : 's'}
          </span>
        </header>
        <div className="launch-proof-matrix-grid">
          {fullAutomationLaunchBlockers.length === 0 ? (
            <article className="launch-proof-matrix-row confirmed">
              <div className="launch-proof-matrix-index">OK</div>
              <div className="launch-proof-matrix-main">
                <div className="launch-proof-matrix-title">
                  <strong>Full automation packet chain</strong>
                  <span className="tag good">Clear</span>
                </div>
                <p>{fullAutomationLaunchBlockerSummary.note}</p>
              </div>
              <div className="launch-proof-matrix-action">
                <span>deployment</span>
                <code>npm run launch:handoff</code>
              </div>
            </article>
          ) : fullAutomationLaunchBlockers.map((blocker, index) => (
            <article className="launch-proof-matrix-row blocked" key={blocker.path}>
              <div className="launch-proof-matrix-index">{index + 1}</div>
              <div className="launch-proof-matrix-main">
                <div className="launch-proof-matrix-title">
                  <strong>{blocker.gate}</strong>
                  <span className="tag warn">{blocker.statusLabel}</span>
                </div>
                <p><b>Record:</b> {blocker.path}</p>
                <p><b>Impact:</b> {blocker.clientImpact}</p>
                <p><b>Boundary:</b> {blocker.proofBoundary}</p>
                {blocker.missingInputs.length > 0 && (
                  <p><b>Needed:</b> {blocker.missingInputs.slice(0, 3).join('; ')}{blocker.missingInputs.length > 3 ? `; +${blocker.missingInputs.length - 3} more` : ''}</p>
                )}
              </div>
              <div className="launch-proof-matrix-action">
                <span>{setupOwnerLabel(blocker.owner)}</span>
                <code>{blocker.command}</code>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card launch-card" aria-label="Packet handoff boundary">
        <div className="launch-card-head">
          <div>
            <div className="eyebrow">Handoff boundary</div>
            <h2>What a packet export proves</h2>
          </div>
          <Link className="btn ghost sm" href="/audit">Open account history</Link>
        </div>
        <div className="settings-list">
          <div className="settings-row">
            <div>
              <strong>Source and match context</strong>
              <span>Exported packets include settlement, matcher, and claim state for review.</span>
            </div>
            <ShieldCheck aria-hidden="true" size={17} />
          </div>
          <div className="settings-row">
            <div>
              <strong>Permission text</strong>
              <span>The category attestation is exported verbatim with version and revocation state.</span>
            </div>
            <ShieldCheck aria-hidden="true" size={17} />
          </div>
          <div className="settings-row">
            <div>
              <strong>Evidence records and digest</strong>
              <span>Screenshots, receipt paths, account events, and SHA-256 digest support tamper checks.</span>
            </div>
            <ShieldCheck aria-hidden="true" size={17} />
          </div>
        </div>
      </section>
      </details>
    </>
  );
}
