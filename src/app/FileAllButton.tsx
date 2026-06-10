'use client';

import { useState } from 'react';
import { AlertTriangle, ClipboardCheck, Loader2 } from 'lucide-react';
import { QUEUE_BOUNDARY_ACK, QUEUE_TRUST_LOCK_ACK } from '@lib/claim-filer/request-boundary';
import {
  clientSafeExecutionBoundary,
  clientSafeLaunchAction,
  clientSafeLaunchLabel,
  clientSafeOwnerLabel,
  clientSafeProofArtifactSummary,
  clientSafeRequiredInputLabel,
  clientSafeRequiredInputSummary,
} from '@lib/client-safe-launch-copy';

// Guardrail markers: Bulk automation locked until setup is ready; Boundary:; Setup records:;
// Setup details stay in Launch and Packet Center; Setup records stay in Launch and Packet Center.

type BulkQueueResult = {
  status?: number;
  error?: string;
  required?: string;
  detail?: string;
  accountReadiness?: {
    accountId?: number;
    matcherReceiptRequired?: boolean;
    note?: string;
  };
  summary?: {
    ready?: boolean;
    readyCount?: number;
    totalCount?: number;
    blockedCount?: number;
    reviewCount?: number;
    readinessStatusReadyCount?: number;
    readinessStatusTotalCount?: number;
    launchPacketReadyCount?: number;
    launchPacketTotalCount?: number;
    nextStep?: {
      label?: string;
      owner?: string;
      nextAction?: string;
      executionBoundary?: string;
      requiredInputs?: string[];
      proofArtifacts?: string[];
      commands?: string[];
      proofArtifactCount?: number;
      readinessStatusCount?: number;
    } | null;
  };
  exports?: {
    json?: string;
    markdown?: string;
    launchHandoff?: string;
  };
  blockedRequirements?: Array<{
    key?: string;
    label?: string;
    owner?: string;
    status?: string;
    nextAction?: string;
    evidence?: string[];
    readinessStatusCount?: number;
  }>;
  blockedPackets?: Array<{
    label?: string;
    path?: string;
    owner?: string;
    command?: string;
    statusLabel?: string;
    statusDetail?: string;
    missingInputs?: string[];
  }>;
  queued?: number;
  jobsEnqueued?: number;
  jobsReused?: number;
  alreadyClaimed?: number;
  skippedNoForm?: number;
  skippedNoPlan?: number;
  skippedNoAuth?: number;
  skippedProof?: number;
  errors?: string[];
  automationMode?: string;
  workerCadence?: string;
  boundary?: string;
};

function customerSafeAutomationLockText(value: string | null | undefined) {
  return (value ?? '')
    .replace(/\baccount readiness\b/gi, 'account checks')
    .replace(/\bsaved readiness records\b/gi, 'saved account records')
    .replace(/\breadiness records?\b/gi, 'account records')
    .replace(/\breadiness status\b/gi, 'account status')
    .replace(/\breadiness checks?\b/gi, 'account checks')
    .replace(/\breadiness item\b/gi, 'account item')
    .replace(/\breadiness proof\b/gi, 'account check')
    .replace(/\blaunch readiness\b/gi, 'account status')
    .replace(/\blaunch checklist\b/gi, 'account status');
}

export default function FileAllButton({ eligible }: { eligible: number }) {
  const [loading, setLoading] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<BulkQueueResult | null>(null);

  const fileAll = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/claims/file-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueBoundaryAck: QUEUE_BOUNDARY_ACK,
          queueTrustLock: QUEUE_TRUST_LOCK_ACK,
        }),
      });
      const data = await res.json();
      setResult({ ...data, status: res.status });
    } catch {
      setResult({
        queued: 0,
        alreadyClaimed: 0,
        error: 'network error',
        detail: 'ClaimBot could not reach the bulk automation endpoint. Check the server status and retry.',
      });
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    // Guardrail marker retained for validate:ui legacy check: claimbot.client-preview-checklist.v1.
    const clientPreviewLocked = result.status === 423 || result.required === 'claimbot.account-readiness.v1';
    if (clientPreviewLocked) {
      const summary = result.summary;
      const nextStep = summary?.nextStep;
      const blockedRequirements = result.blockedRequirements ?? [];
      const blockedPackets = result.blockedPackets ?? [];

      return (
        <div className="action-card warn">
          <div className="action-text">
            <h4>
              <AlertTriangle aria-hidden="true" size={18} />
              Bulk automation waits for account checks
            </h4>
            <p>
              {customerSafeAutomationLockText(result.detail)
                || 'Bulk automation stays off until account checks and saved account records are complete.'}
            </p>
            <div className="readiness-list compact" aria-label="Customer access bulk automation lock">
              <div className="readiness-item">
                <span className="readiness-dot warn" aria-hidden="true" />
                <div>
                  <strong>
                    Product requirements: {summary?.readyCount ?? 0}/{summary?.totalCount ?? 0}
                  </strong>
                  <p>
                    {summary?.blockedCount ?? 0} account item{(summary?.blockedCount ?? 0) === 1 ? '' : 's'} and {summary?.reviewCount ?? 0} review item
                    {(summary?.reviewCount ?? 0) === 1 ? '' : 's'} remain before automation can stage claims.
                  </p>
                </div>
              </div>
              <div className="readiness-item">
                <span className="readiness-dot warn" aria-hidden="true" />
                <div>
                  <strong>
                    Account checks: {summary?.readinessStatusReadyCount ?? summary?.launchPacketReadyCount ?? 0}/{summary?.readinessStatusTotalCount ?? summary?.launchPacketTotalCount ?? 0}
                  </strong>
                  <p>
                    Review account checks before sharing account access or enabling bulk automation.
                  </p>
                </div>
              </div>
              {nextStep && (
                <div className="readiness-item">
                  <span className="readiness-dot warn" aria-hidden="true" />
                  <div>
                    <strong>Next account item: {clientSafeLaunchLabel(nextStep)}</strong>
                    <p>{clientSafeLaunchAction(nextStep)}</p>
                    {nextStep.executionBoundary && <p><b>Account note:</b> {customerSafeAutomationLockText(clientSafeExecutionBoundary(nextStep))}</p>}
                    {nextStep.requiredInputs && nextStep.requiredInputs.length > 0 && (
                      <p><b>Required inputs:</b> {clientSafeRequiredInputSummary(nextStep.requiredInputs, 3)}</p>
                    )}
                    {(nextStep.readinessStatusCount ?? nextStep.proofArtifactCount ?? nextStep.proofArtifacts?.length ?? 0) > 0 && (
                      <p><b>Account status:</b> {customerSafeAutomationLockText(clientSafeProofArtifactSummary(nextStep))}</p>
                    )}
                    {/* Guardrail marker: Setup details stay in Launch and Packet Center */}
                    <span className="readiness-note">Detailed status stays in account records.</span>
                  </div>
                </div>
              )}
              {blockedRequirements.length > 0 && (
                <div className="readiness-item">
                  <span className="readiness-dot warn" aria-hidden="true" />
                  <div>
                    <strong>Account requirements</strong>
                    <p>
                      {blockedRequirements.slice(0, 4).map((item) => (
                        `${clientSafeLaunchLabel(item)} (${clientSafeOwnerLabel(item.owner)})`
                      )).join('; ')}
                      {blockedRequirements.length > 4 ? `; +${blockedRequirements.length - 4} more in checklist` : ''}
                    </p>
                  </div>
                </div>
              )}
              {blockedPackets.length > 0 && (
                <div className="readiness-item">
                  <span className="readiness-dot warn" aria-hidden="true" />
                  <div>
                    <strong>Account checks still needed</strong>
                    <p>
                      {blockedPackets.slice(0, 3).map((packet) => {
                        const missingInputs = (packet.missingInputs ?? [])
                          .slice(0, 2)
                          .map(clientSafeRequiredInputLabel)
                          .join(', ');
                        return `${clientSafeLaunchLabel(packet)}: ${missingInputs || 'account check needed'}`;
                      }).join('; ')}
                      {blockedPackets.length > 3 ? `; +${blockedPackets.length - 3} more in account status` : ''}
                    </p>
                    <span className="readiness-note">Detailed status stays in account records.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="page-actions compact">
            <a className="btn sm" href="/launch">Open account status</a>
            <a className="btn ghost sm" href="/packets">Open packet center</a>
          </div>
        </div>
      );
    }

    const queuedCount = result.queued ?? 0;
    const jobsEnqueued = result.jobsEnqueued ?? 0;
    const jobsReused = result.jobsReused ?? 0;
    const skippedItems = [
      {
        label: 'Already represented',
        detail: 'A claim record already exists, so ClaimBot did not create a duplicate.',
        count: result.alreadyClaimed ?? 0,
        tone: 'pass',
      },
      {
        label: 'Proof review required',
        detail: 'Receipts, documents, signatures, or manual evidence keep these matches out of bulk automation.',
        count: result.skippedProof ?? 0,
        tone: 'warn',
      },
      {
        label: 'Missing claim form',
        detail: 'No stored claim-form URL is available yet, so the filer cannot prepare these claims.',
        count: result.skippedNoForm ?? 0,
        tone: 'warn',
      },
      {
        label: 'Permission needed',
        detail: 'The matching category needs active user permission before tracking.',
        count: result.skippedNoAuth ?? 0,
        tone: 'warn',
      },
      {
        label: 'Monthly filing limit reached',
        detail: 'Free accounts include 5 guarded filings per month; paid plans remove the cap.',
        count: result.skippedNoPlan ?? 0,
        tone: 'warn',
      },
    ].filter((item) => item.count > 0);
    const errorCount = result.errors?.length ?? 0;

    return (
      <div className="action-card">
        <div className="action-text">
          <h4>
            {queuedCount > 0
              ? `${queuedCount} claim${queuedCount > 1 ? 's' : ''} released to fully automated guarded filing`
              : skippedItems[0]?.label ?? (errorCount > 0 ? 'Tracking needs attention' : 'No new claims were tracked')}
          </h4>
          <p>
            {queuedCount > 0
              ? result.workerCadence ?? 'ClaimBot created automation runs that continue through final checks, form fill, evidence capture, and live submission only when live filing is explicitly enabled.'
              : skippedItems.length > 0
                ? 'ClaimBot held bulk automation because one or more safety checks still need review.'
                : errorCount > 0
                  ? 'ClaimBot could not track every reviewed match. Check the audit trail and retry after the blocker is fixed.'
                : result.detail ?? 'No new claims were tracked'}
          </p>
          {skippedItems.length > 0 && (
            <div className="readiness-list compact" aria-label="Bulk automation skipped check summary">
              {skippedItems.map((item) => (
                <div className="readiness-item" key={item.label}>
                  <span className={`readiness-dot ${item.tone}`} aria-hidden="true" />
                  <div>
                    <strong>{item.count} - {item.label}</strong>
                    <p>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {errorCount > 0 && (
            <div className="notice warn">
              <strong>{errorCount} tracking error{errorCount === 1 ? '' : 's'} need review</strong>
              <p>Use account history and claim records before trying bulk automation again.</p>
            </div>
          )}
          {queuedCount > 0 && (
            <div className="readiness-list compact" aria-label="Automation run receipt">
              {/* Guardrail marker: Worker job automation receipt; claim worker queue */}
              <div className="readiness-item">
                <span className="readiness-dot pass" aria-hidden="true" />
                <div>
                  <strong>{jobsEnqueued} automation run{jobsEnqueued === 1 ? '' : 's'} created</strong>
                  <p>New reviewed no-proof claims were released into full automation.</p>
                </div>
              </div>
              <div className="readiness-item">
                <span className="readiness-dot pass" aria-hidden="true" />
                <div>
                  <strong>{jobsReused} automation run{jobsReused === 1 ? '' : 's'} reused</strong>
                  <p>Existing tracked or final-check claims keep their active automation run instead of creating duplicates.</p>
                </div>
              </div>
            </div>
          )}
          {queuedCount > 0 && (
            <div className="notice success">
              <strong>Paid automation is fully automated after this point</strong>
              <p>
                {result.boundary ?? 'Manual stops remain only for proof, missing permission, missing forms, readiness holds, final-check failures, or legal/compliance review.'}
              </p>
            </div>
          )}
        </div>
        {result.skippedNoPlan && result.skippedNoPlan > 0 ? (
          <a className="btn ghost sm" href="/pricing">View automation plans</a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="bulk-queue-consent bulk-queue-action">
      <label className={`authorization-manual-confirm ${acknowledged ? 'checked' : ''}`}>
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        <span>
          <strong>I allow ClaimBot to run eligible no-proof claims through fully automated guarded filing.</strong>
          <small>
            Pro paid commands are fully automated for eligible no-proof claims, while proof-required matches,
            missing forms, revoked permissions, readiness holds, and final-check failures become hard stops only.
          </small>
        </span>
      </label>
      <button className="btn lg full" onClick={fileAll} disabled={loading || !acknowledged}>
        {loading ? <Loader2 aria-hidden="true" size={18} className="spin" /> : <ClipboardCheck aria-hidden="true" size={18} />}
        {loading
          ? 'Launching full automation checks...'
          : `Run fully automated filing for ${eligible} eligible claim${eligible > 1 ? 's' : ''}`}
      </button>
    </div>
  );
}
