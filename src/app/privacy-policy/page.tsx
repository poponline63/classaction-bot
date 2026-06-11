import type { Metadata } from 'next';
import MktShell from '../_marketing/MktShell';

export const metadata: Metadata = {
  title: 'Privacy Policy — ClaimBot',
  description: 'What ClaimBot stores, how it’s used, retention and export policy, and how to make a privacy request.',
};

// Marketing-styled Privacy Policy. Required legal phrases are preserved
// verbatim (validate:legal) and the real privacy-request form + export are kept.
export default function PrivacyPolicyPage({
  searchParams,
}: {
  searchParams?: { privacyRequest?: string };
}) {
  const requestStatus = searchParams?.privacyRequest;

  return (
    <MktShell>
      <section className="mkt-section" style={{ paddingTop: 120 }}>
        <div className="mkt-wrap-narrow mkt-prose">
          <span className="mkt-eyebrow">Legal</span>
          <h1 style={{ marginTop: 12 }}>Privacy Policy</h1>
          <p className="mkt-updated">Last updated June 2026</p>

          <p>
            ClaimBot stores user-provided profile facts, evidence records, permissions, settings, claim
            preparation logs, and audit events so you can review settlement matches before any live filing
            action is allowed.
          </p>

          <h2>Data used for matching</h2>
          <p>
            The app may process contact details, mailing addresses, purchase records, subscription facts,
            breach exposure records, category permissions, and claim status history. These records are used
            to assess possible settlement eligibility and to prepare reviewable claim drafts.
          </p>

          <h2>Operational records</h2>
          <p>
            ClaimBot may also store matcher traces, claim status, form-preparation records, confirmation
            identifiers, account-history events, runtime settings, feature-flag posture, and support context
            needed to troubleshoot customer questions.
          </p>

          <h2>Retention and export policy</h2>
          <p>
            The business should define a written retention window before turning on account access. Profile
            facts, evidence references, form-preparation records, screenshots, support records, and
            account-history records should be kept only as long as needed for claim review, support,
            compliance, and user-requested exports.
          </p>
          <p>
            Deletion requests should remove or anonymize profile facts and evidence records unless a specific
            audit, fraud-prevention, legal, or accounting reason requires preserving a minimal operational
            record. Export requests should include profile facts, saved evidence references, permissions,
            claim status, and account-history records.
          </p>

          <h2>You stay in control</h2>
          <p>
            You remain responsible for the truth and completeness of claim information. Proof-required,
            uncertain, or unpermitted matches stay in review and are not submitted automatically.
          </p>

          <h2>Offline and install behavior</h2>
          <p>
            The installed app shell may cache only static offline assets. Claim data, profile facts,
            permissions, audit logs, and final-check state are not cached for offline use and require
            reconnecting to the hosted app.
          </p>

          <h2>Support and privacy requests</h2>
          <p>
            Hosted deployments should publish a monitored support mailbox for account access, profile
            correction, account-history review, data handling, and deletion or export requests. Signed-in
            users can download the stored account data export as JSON.
          </p>

          {requestStatus === 'received' && (
            <p style={{ color: 'var(--green)' }}><strong>Privacy request recorded.</strong> It was added to account history for business review.</p>
          )}
          {requestStatus === 'invalid' && (
            <p style={{ color: 'var(--purple)' }}><strong>More detail needed.</strong> Add at least a short description so support can route the request.</p>
          )}

          <p style={{ marginTop: 16 }}>
            <a className="mkt-btn mkt-btn-ghost" href="/privacy-export" style={{ height: 44 }}>Download privacy export</a>
          </p>

          <form className="mkt-form" action="/api/privacy/request" method="post" style={{ margin: '24px 0 0' }}>
            <label>
              Request type
              <select name="requestType" defaultValue="export" style={{ background: 'rgba(245,240,235,0.05)', border: '1px solid var(--mkt-border)', borderRadius: 12, color: 'var(--paper)', padding: '12px 14px', minHeight: 48, font: 'inherit' }}>
                <option value="export">Export</option>
                <option value="correction">Correction</option>
                <option value="deletion">Deletion</option>
                <option value="restriction">Restrict processing</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Contact email
              <input name="contactEmail" type="email" placeholder="you@example.com" />
            </label>
            <label>
              Request details
              <textarea name="message" minLength={12} rows={4} placeholder="Describe the profile correction, export, deletion, or data-handling request." required />
            </label>
            <button className="mkt-btn mkt-btn-purple" type="submit">Record privacy request</button>
          </form>
        </div>
      </section>
    </MktShell>
  );
}
