import { getAllSettings } from '@lib/settings';
import { saveSettings } from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const current = await getAllSettings();

  return (
    <>
      <h1>Settings</h1>
      <p className="muted small">
        Runtime configuration. Changes take effect immediately — no restart needed.
      </p>

      <form action={saveSettings} className="form" style={{ maxWidth: 600 }}>
        <div>
          <label htmlFor="discord_webhook_url">Discord webhook URL</label>
          <input
            type="text"
            id="discord_webhook_url"
            name="discord_webhook_url"
            defaultValue={current.discord_webhook_url ?? ''}
            placeholder="https://discord.com/api/webhooks/..."
          />
          <span className="small muted">Get daily scrape notifications in your Discord server</span>
        </div>

        <div>
          <label htmlFor="hibp_api_key">HIBP API key</label>
          <input
            type="text"
            id="hibp_api_key"
            name="hibp_api_key"
            defaultValue={current.hibp_api_key ?? ''}
            placeholder="(optional) get one at haveibeenpwned.com/API"
          />
          <span className="small muted">Auto-import your data breach exposure from HaveIBeenPwned</span>
        </div>

        <div>
          <label htmlFor="claim_filer_mode">Claim filer mode</label>
          <select
            id="claim_filer_mode"
            name="claim_filer_mode"
            defaultValue={current.claim_filer_mode ?? 'shadow'}
          >
            <option value="shadow">Shadow (fills forms but does NOT submit)</option>
            <option value="live">Live (actually submits claims)</option>
          </select>
          <span className="small muted">
            Start with shadow mode to verify forms are filled correctly.
            Flip to live only after reviewing shadow results.
          </span>
        </div>

        <div>
          <label htmlFor="claim_filer_max_per_day">Max claims per day</label>
          <input
            type="number"
            id="claim_filer_max_per_day"
            name="claim_filer_max_per_day"
            defaultValue={current.claim_filer_max_per_day ?? '20'}
            min="1"
            max="100"
          />
          <span className="small muted">Rate limit to prevent runaway filings</span>
        </div>

        <div style={{ marginTop: 12 }}>
          <button className="btn" type="submit">
            Save settings
          </button>
        </div>
      </form>
    </>
  );
}
