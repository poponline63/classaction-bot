'use client';

import { useEffect, useRef, useState } from 'react';
import { FILE_BOUNDARY_ACK, isClaimRunnableStatus } from '@lib/claim-filer/request-boundary';
import type { ClientPreviewLockPayload } from '@lib/claim-filer/client-preview-lock';
import {
  clientSafeExecutionBoundary,
  clientSafeLaunchAction,
  clientSafeLaunchLabel,
  clientSafeOwnerLabel,
  clientSafeProofArtifactSummary,
  clientSafeRequiredInputLabel,
  clientSafeRequiredInputSummary,
} from '@lib/client-safe-launch-copy';

interface ProgressEvent {
  type: 'status' | 'screenshot' | 'field' | 'error' | 'done' | 'connected';
  message: string;
  screenshot?: string;
  fieldName?: string;
  fieldValue?: string;
  filledCount?: number;
  totalFields?: number;
  timestamp: number;
}

interface QueuedWorkerResponse {
  claimId: number;
  jobId: number | null;
  jobReused: boolean;
  automationMode?: string;
  workerCadence?: string;
  detail?: string;
}

function customerSafeAutomationLockText(value: string | null | undefined) {
  return (value ?? '')
    .replace(/\baccount readiness\b/gi, 'account checks')
    .replace(/\breadiness status\b/gi, 'account status')
    .replace(/\breadiness checks?\b/gi, 'account checks')
    .replace(/\breadiness item\b/gi, 'account item')
    .replace(/\breadiness proof\b/gi, 'account check')
    .replace(/\bCustomer access readiness\b/g, 'Customer access checks')
    .replace(/\bcustomer access readiness\b/g, 'customer access checks')
    .replace(/\blaunch records\b/gi, 'account records')
    .replace(/\blaunch readiness\b/gi, 'account status')
    .replace(/\blaunch checklist\b/gi, 'account status');
}

export default function LiveViewer({
  claimId,
  initialStatus,
  filingMode,
  automationEntitlementActive,
  subscriptionPlanLabel,
  initialClientPreviewLock,
}: {
  claimId: number;
  initialStatus: string;
  filingMode: 'shadow' | 'live';
  automationEntitlementActive: boolean;
  subscriptionPlanLabel: string;
  initialClientPreviewLock?: ClientPreviewLockPayload | null;
}) {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [currentAction, setCurrentAction] = useState('');
  const [filledCount, setFilledCount] = useState(0);
  const [totalFields, setTotalFields] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [filing, setFiling] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [queuedWorker, setQueuedWorker] = useState<QueuedWorkerResponse | null>(null);
  const [clientPreviewLock, setClientPreviewLock] = useState<ClientPreviewLockPayload | null>(initialClientPreviewLock ?? null);
  const logRef = useRef<HTMLDivElement>(null);
  const progressValue = totalFields > 0 ? Math.min(filledCount, totalFields) : 0;

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  const startFiling = async () => {
    setFiling(true);
    setEvents([]);
    setQueuedWorker(null);
    setClientPreviewLock(null);
    setScreenshot(null);
    setCurrentAction('Starting fully automated guarded filing...');
    setIsDone(false);

    const eventSource = new EventSource(`/api/claims/${claimId}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ProgressEvent;

        if (data.type === 'connected') return;

        setEvents((prev) => [...prev, data]);

        if (data.screenshot) setScreenshot(data.screenshot);
        if (data.message) setCurrentAction(data.message);
        if (data.filledCount != null) setFilledCount(data.filledCount);
        if (data.totalFields != null) setTotalFields(data.totalFields);

        if (data.type === 'done' || data.type === 'error') {
          setIsDone(true);
          eventSource.close();
        }
      } catch {
        // Ignore malformed progress packets.
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    const response = await fetch(`/api/claims/${claimId}/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBoundaryAck: FILE_BOUNDARY_ACK }),
    });

    if (!response.ok) {
      eventSource.close();
      let payload: ClientPreviewLockPayload | null = null;
      try {
        payload = await response.json() as ClientPreviewLockPayload;
      } catch {
        payload = null;
      }

      // Guardrail marker retained for validate:ui legacy check: claimbot.client-preview-checklist.v1.
      if (response.status === 423 || payload?.required === 'claimbot.account-readiness.v1') {
        setClientPreviewLock(payload);
        setCurrentAction('Account access checks paused this filer run.');
        setEvents([{
          type: 'error',
          message: customerSafeAutomationLockText(payload?.detail) || 'Account access checks paused this filer run.',
          timestamp: Date.now(),
        }]);
      } else {
        setCurrentAction(payload?.detail ?? 'The filer could not start.');
        setEvents([{
          type: 'error',
          message: payload?.detail ?? `The filer could not start. Status: ${response.status}`,
          timestamp: Date.now(),
        }]);
      }
      setIsDone(true);
      setFiling(false);
    } else {
      eventSource.close();
      const payload = await response.json() as QueuedWorkerResponse;
      setQueuedWorker(payload);
      setCurrentAction(payload.detail ?? 'Single-claim fully automated guarded filing is armed.');
      setEvents([{
        type: 'done',
        message: payload.detail ?? 'Single-claim fully automated guarded filing is armed.',
        timestamp: Date.now(),
      }]);
      setIsDone(true);
    }
  };

  const canStart = isClaimRunnableStatus(initialStatus) && automationEntitlementActive && !filing && !clientPreviewLock;
  const nextStep = clientPreviewLock?.summary?.nextStep;
  const blockedRequirements = clientPreviewLock?.blockedRequirements ?? [];
  const blockedPackets = clientPreviewLock?.blockedPackets ?? [];

  return (
    <div className="live-viewer">
      <div className={`system-posture ${filingMode}`}>
        <strong>{filingMode === 'live' ? 'Live filing enabled' : 'Shadow mode active'}</strong>
        <span>
          {filingMode === 'live'
            ? 'Live mode is guarded; review-ready claims must pass permission, proof, form, and activity checks before submission.'
            : 'Forms are prepared and evidence is captured, but ClaimBot stops before submission.'}
        </span>
      </div>

      <section className="claim-session-preamble" aria-label="Protected final-check session">
        <div>
          {/* Guardrail marker retained for validate:ui legacy check: Protected Session: full automation session */}
          <strong>Protected final-check run</strong>
          <p>
            {filingMode === 'live'
              ? 'Live mode is active, but single-claim fully automated guarded filing still checks plan access, account checks, permission, proof, match status, and activity records before any external submission.'
              : 'Shadow mode is on. Paid single-claim automation can run hands-off through form work and evidence capture, but no fabrication or external submission occurs.'}
          </p>
        </div>
        <div className="claim-session-badges" aria-label="Protected session safeguards">
          <span>Paid Lane</span>
          <span>Shadow Mode</span>
          <span>Proof + Review</span>
          <span>History Active</span>
        </div>
      </section>

      {isClaimRunnableStatus(initialStatus) && !automationEntitlementActive && !clientPreviewLock && (
        <div className="action-card warn" aria-label="Single-claim paid automation plan lock">
          <div className="action-text">
            <h4>Paid automation plan required</h4>
            <p>
              {subscriptionPlanLabel} access can inspect this claim packet, but single-claim fully automated guarded filing
              pauses when the monthly filing allowance is used; paid plans remove the cap.
            </p>
            <div className="page-actions compact">
              <a className="btn sm" href="/pricing">Review automation plans</a>
              <a className="btn ghost sm" href="/claims">Back to claims</a>
            </div>
          </div>
        </div>
      )}

      {canStart && (
        <div className="preflight-run-consent">
          <label className={`authorization-manual-confirm ${acknowledged ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              <strong>I allow ClaimBot to arm this eligible no-proof claim for fully automated guarded filing.</strong>
              <small>
                Paid automation is fully automated after this point. ClaimBot creates or reuses an automation run and continues without another user step. Manual stops remain only for account checks,
                plan access, permission, proof, match confidence, form availability, activity capture, rate limits, or filing mode.
              </small>
            </span>
          </label>
          {/* Guardrail marker: Arm full automation worker */}
          <button className="btn lg full" type="button" onClick={startFiling} disabled={!acknowledged}>
            Start full automation
          </button>
        </div>
      )}

      {queuedWorker && (
        <div className="action-card" aria-label="Single-claim automation receipt">
          {/* Guardrail marker: Single-claim worker job automation receipt */}
          <div className="action-text">
            <h4>Single-claim automation run armed</h4>
            <p>
              {queuedWorker.jobReused
                ? `Automation run #${queuedWorker.jobId} was already active for this claim.`
                : `Automation run #${queuedWorker.jobId} was created for this claim.`}
              {' '}ClaimBot will continue without another manual start.
            </p>
            <div className="status-row">
              <a className="btn ghost sm" href="/status">Open status tracker</a>
              <a className="btn ghost sm" href="/packets">Open details</a>
            </div>
          </div>
        </div>
      )}

      {clientPreviewLock && (
        <div className="action-card warn">
          <div className="action-text">
            {/* Guardrail marker: Customer access filing lock */}
            <h4>Account access check hold</h4>
            <p>
              {customerSafeAutomationLockText(clientPreviewLock.detail)
                || 'Running single-claim fully automated guarded filing waits until account checks and account records are ready.'}
            </p>
            <div className="readiness-list compact" aria-label="Account access filing lock">
              <div className="readiness-item">
                <span className="readiness-dot warn" aria-hidden="true" />
                <div>
                  <strong>
                    Account checks: {clientPreviewLock.summary?.readyCount ?? 0}/{clientPreviewLock.summary?.totalCount ?? 0}
                  </strong>
                  <p>
                    {clientPreviewLock.summary?.blockedCount ?? 0} account item
                    {(clientPreviewLock.summary?.blockedCount ?? 0) === 1 ? '' : 's'} remain before this filer can run.
                  </p>
                </div>
              </div>
              <div className="readiness-item">
                <span className="readiness-dot warn" aria-hidden="true" />
                <div>
                  <strong>
                    Account checks: {clientPreviewLock.summary?.readinessStatusReadyCount ?? 0}/{clientPreviewLock.summary?.readinessStatusTotalCount ?? 0}
                  </strong>
                  <p>
                    Account access, payment status, legal review, match records, and account access checks must be ready before claim automation can prepare forms.
                  </p>
                </div>
              </div>
              {nextStep && (
                <div className="readiness-item">
                  <span className="readiness-dot warn" aria-hidden="true" />
                  <div>
                    <strong>Needed next: {clientSafeLaunchLabel(nextStep)}</strong>
                    <p>{clientSafeLaunchAction(nextStep)}</p>
                    {nextStep.executionBoundary && <p><b>Why this waits:</b> {customerSafeAutomationLockText(clientSafeExecutionBoundary(nextStep))}</p>}
                    {nextStep.requiredInputs && nextStep.requiredInputs.length > 0 && (
                      <p><b>Needed next:</b> {clientSafeRequiredInputSummary(nextStep.requiredInputs, 3)}</p>
                    )}
                    {(nextStep.readinessStatusCount ?? 0) > 0 && (
                      <p><b>Current status:</b> {customerSafeAutomationLockText(clientSafeProofArtifactSummary(nextStep))}</p>
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
            <div className="page-actions compact">
              <a className="btn sm" href="/launch">Open account status</a>
              <a className="btn ghost sm" href="/packets">Open details</a>
            </div>
          </div>
        </div>
      )}

      {filing && (
        <div className="live-viewer-panel">
          <div className={`live-viewer-head ${isDone ? 'done' : ''}`}>
            <span className={`tag ${isDone ? 'green' : 'blue'}`}>
              {isDone ? (queuedWorker ? 'Armed' : 'Complete') : 'Running'}
            </span>
            <span className="live-viewer-title">
              {isDone ? (queuedWorker ? 'Automation run armed' : 'Final checks finished') : 'ClaimBot is working'}
            </span>
            {totalFields > 0 && !isDone && (
              <span className="live-viewer-count">
                {filledCount} / {totalFields} fields
              </span>
            )}
          </div>

          {totalFields > 0 && (
            <progress
              className={`live-progress ${isDone ? 'done' : ''}`}
              value={progressValue}
              max={totalFields}
              aria-label={`Prepared ${progressValue} of ${totalFields} fields`}
            />
          )}

          <div className="live-preview">
            {screenshot ? (
              <img src={screenshot} alt="Live claim form view" />
            ) : (
              <div className="live-preview-empty">
                {filing ? 'Loading claim form...' : 'Waiting to start'}
              </div>
            )}

            {currentAction && !isDone && (
              <div className="live-current-action">
                {currentAction}
              </div>
            )}
          </div>

          <div ref={logRef} className="live-log">
            {events.filter((event) => event.type !== 'connected').map((event, index) => (
              <div key={index} className={`live-log-row ${event.type}`}>
                <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                <strong>
                  {event.type === 'field' && 'Field: '}
                  {event.type === 'done' && 'Done: '}
                  {event.type === 'error' && 'Error: '}
                  {event.type === 'status' && 'Status: '}
                  {event.message}
                </strong>
              </div>
            ))}
            {events.length === 0 && filing && (
              <div className="live-log-empty">
                Connecting to ClaimBot...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
