'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface SettingsFormProps {
  discordWebhookConfigured: boolean;
  hibpApiKeyConfigured: boolean;
  initialMode: string;
  initialLiveAck: boolean;
  initialMaxPerDay: string;
  breachImportEnabled: boolean;
  liveFilingFeatureEnabled: boolean;
}

type Feedback = { type: 'success' | 'error'; text: string } | null;

export default function SettingsForm({
  discordWebhookConfigured,
  hibpApiKeyConfigured,
  initialMode,
  initialLiveAck,
  initialMaxPerDay,
  breachImportEnabled,
  liveFilingFeatureEnabled,
}: SettingsFormProps) {
  const router = useRouter();
  const [webhook, setWebhook] = useState('');
  const [hibp, setHibp] = useState('');
  const [mode, setMode] = useState(liveFilingFeatureEnabled ? initialMode : 'shadow');
  const [liveAck, setLiveAck] = useState(liveFilingFeatureEnabled ? initialLiveAck : false);
  const [maxPerDay, setMaxPerDay] = useState(initialMaxPerDay);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const save = async () => {
    setSaving(true);
    setFeedback(null);

    if (mode === 'live' && !liveFilingFeatureEnabled) {
      setSaving(false);
      setFeedback({ type: 'error', text: 'Live filing is disabled for this client deployment.' });
      return;
    }

    if (mode === 'live' && !liveAck) {
      setSaving(false);
      setFeedback({ type: 'error', text: 'Live mode requires explicit review acknowledgement.' });
      return;
    }

    const formData = new FormData();
    if (webhook.trim()) formData.append('discord_webhook_url', webhook.trim());
    if (breachImportEnabled && hibp.trim()) formData.append('hibp_api_key', hibp.trim());
    formData.append('claim_filer_mode', mode);
    if (liveAck) formData.append('claim_filer_live_ack', 'reviewed');
    formData.append('claim_filer_max_per_day', maxPerDay);

    try {
      const response = await fetch('/api/settings/save', { method: 'POST', body: formData });
      if (!response.ok) {
        let message = 'Unable to save settings.';
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

      setWebhook('');
      setHibp('');
      setFeedback({ type: 'success', text: 'Settings saved. Hosted readiness has been refreshed.' });
      router.refresh();
    } catch {
      setFeedback({ type: 'error', text: 'Unable to reach the app server.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card form" id="runtime-settings">
      <div>
        <label htmlFor="discord_webhook_url">Discord webhook URL</label>
        <input
          type="password"
          id="discord_webhook_url"
          value={webhook}
          onChange={(event) => setWebhook(event.target.value)}
          placeholder="Paste a new webhook URL"
        />
        <span className="hint">
          {discordWebhookConfigured
            ? 'Webhook is configured. Leave blank to keep the existing value.'
            : 'Optional destination for scraper and claim-operation notifications.'}
        </span>
      </div>

      {breachImportEnabled ? (
        <div>
          <label htmlFor="hibp_api_key">HIBP API key</label>
          <input
            type="password"
            id="hibp_api_key"
            value={hibp}
            onChange={(event) => setHibp(event.target.value)}
            placeholder="Paste a new HIBP key"
          />
          <span className="hint">
            {hibpApiKeyConfigured
              ? 'HIBP key is configured. Leave blank to keep the existing value.'
              : 'Optional key for breach exposure imports.'}
          </span>
        </div>
      ) : (
        <div className="notice">
          <h3>Breach import disabled</h3>
          <p>HIBP settings are hidden because breach evidence intake is disabled for this client deployment.</p>
        </div>
      )}

      <div>
        <label htmlFor="claim_filer_mode">Claim filer mode</label>
        <select
          id="claim_filer_mode"
          value={mode}
          onChange={(event) => setMode(event.target.value)}
        >
          <option value="shadow">Shadow - prepare forms without submitting</option>
          {liveFilingFeatureEnabled && (
            <option value="live">Live - guarded submission after final checks</option>
          )}
        </select>
        <span className="hint">
          {liveFilingFeatureEnabled
            ? 'Shadow mode is the recommended default for hosted onboarding and QA.'
            : 'Live filing controls are disabled by this client feature flag.'}
        </span>
      </div>

      <label className="notice warn safe-check-row">
        <input
          type="checkbox"
          checked={liveAck}
          onChange={(event) => setLiveAck(event.target.checked)}
          disabled={!liveFilingFeatureEnabled}
        />
        <span>
          <strong>Enable live filing acknowledgement</strong>
          <span className="small">
            Required before saving live mode. Review matcher evidence, proof review,
            category permissions, daily cap, and shadow-mode output first.
          </span>
        </span>
      </label>

      <div>
        <label htmlFor="claim_filer_max_per_day">Max claims per day</label>
        <input
          type="number"
          id="claim_filer_max_per_day"
          value={maxPerDay}
          min="1"
          max="100"
          onChange={(event) => setMaxPerDay(event.target.value)}
        />
        <span className="hint">Rate-limit claim attempts so a bad matcher result cannot cascade.</span>
      </div>

      {feedback && (
        <div className={`notice ${feedback.type === 'error' ? 'warn' : ''}`}>
          {feedback.text}
        </div>
      )}

      <div className="settings-submit-row">
        <button className="btn" type="button" disabled={saving} onClick={save}>
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
