'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface AuthorizationCardProps {
  category: string;
  label: string;
  defaultAttestation: string;
  initialEnabled: boolean;
  initialAttestationText: string;
  version: number;
  authorizedAt: string | null;
  revokedAt: string | null;
}

type Feedback = { type: 'success' | 'error'; text: string } | null;

export default function AuthorizationCard({
  category,
  label,
  defaultAttestation,
  initialEnabled,
  initialAttestationText,
  version,
  authorizedAt,
  revokedAt,
}: AuthorizationCardProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [attestationText, setAttestationText] = useState(initialAttestationText || defaultAttestation);
  const [manualConsent, setManualConsent] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const save = async () => {
    setFeedback(null);
    if (enabled && !attestationText.trim()) {
      setFeedback({ type: 'error', text: 'Enabled categories require verbatim attestation text.' });
      return;
    }
    if (enabled && !manualConsent) {
      setFeedback({ type: 'error', text: 'Full automation permission requires the manual attestation confirmation.' });
      return;
    }

    setSaving(true);
    const formData = new FormData();
    formData.append('category', category);
    if (enabled) formData.append('enabled', 'on');
    if (enabled && manualConsent) formData.append('manualConsent', 'on');
    formData.append('attestationText', attestationText);

    try {
      const response = await fetch('/api/setup/authorization', { method: 'POST', body: formData });
      if (!response.ok) {
        let message = 'Unable to save permission.';
        try {
          const json: unknown = await response.json();
          if (
            typeof json === 'object'
            && json !== null
            && 'error' in json
            && typeof json.error === 'string'
          ) {
            message = json.error;
          }
        } catch {
          // Keep the generic message.
        }
        setFeedback({ type: 'error', text: message });
        return;
      }
      setFeedback({ type: 'success', text: 'Permission saved and audit event recorded.' });
      router.refresh();
    } catch {
      setFeedback({ type: 'error', text: 'Unable to reach the app server.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id={`authorization-${category}`} className={`authorization-card ${enabled ? 'enabled' : ''}`}>
      <div className="authorization-card-head">
        <div>
          <h3>{label}</h3>
          <div className="status-row">
            <span className={`tag ${enabled ? 'good' : 'warn'}`}>
              {enabled ? 'Permission saved' : 'Review only'}
            </span>
            <span className="tag">Version {version}</span>
            {authorizedAt && <span className="tag">Authorized {authorizedAt}</span>}
            {revokedAt && <span className="tag warn">Revoked {revokedAt}</span>}
          </div>
        </div>
      </div>

      <div className="authorization-choice-panel" aria-label={`${label} permission choice`}>
        <div>
          <strong>Explicit permission required</strong>
          <p>
            This category can enter paid full automation only after the attestation is manually
            confirmed. It does not bypass proof, missing forms, account holds, final checks, or live-mode controls.
          </p>
        </div>
        <div className="authorization-choice-actions" role="group" aria-label="Permission decision">
          <button
            type="button"
            className={`authorization-choice authorize ${enabled ? 'active' : ''}`}
            aria-pressed={enabled}
            onClick={() => {
              setEnabled(true);
              setManualConsent(false);
            }}
          >
            Allow automation review
          </button>
          <button
            type="button"
            className={`authorization-choice shadow ${!enabled ? 'active' : ''}`}
            aria-pressed={!enabled}
            onClick={() => {
              setEnabled(false);
              setManualConsent(false);
            }}
          >
            Keep review only
          </button>
        </div>
      </div>

      <div className="form">
        <div>
          <label htmlFor={`attestation-${category}`}>Verbatim attestation text</label>
          <textarea
            id={`attestation-${category}`}
            value={attestationText}
            onChange={(event) => setAttestationText(event.target.value)}
            rows={4}
          />
          <div className="hint">
            This text is preserved exactly and checked again during final claim checks.
          </div>
        </div>
      </div>

      <label className={`authorization-manual-confirm ${manualConsent ? 'checked' : ''}`}>
        <input
          type="checkbox"
          checked={manualConsent}
          onChange={(event) => setManualConsent(event.target.checked)}
          disabled={!enabled}
        />
        <span>
          <strong>I have read and manually confirm this category attestation.</strong>
          <small>
            I understand this can unlock hands-off automation review for eligible no-proof claims on Pro.
            Proof-required claims stay manual, shadow mode remains the default, and live filing still requires separate approval.
          </small>
        </span>
      </label>

      {feedback && (
        <div className={`notice ${feedback.type === 'error' ? 'warn' : ''}`}>
          {feedback.text}
        </div>
      )}

      <button className="btn" type="button" disabled={saving || (enabled && !manualConsent)} onClick={save}>
        {saving ? 'Saving...' : enabled ? 'Save permission' : 'Save review-only status'}
      </button>
    </div>
  );
}
