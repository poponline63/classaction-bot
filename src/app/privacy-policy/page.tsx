import LegalBoundarySummary from '../LegalBoundarySummary';
import LegalPolicyBrowser, { type LegalPolicyBrowserRow } from '../LegalPolicyBrowser';

export default function PrivacyPolicyPage({
  searchParams,
}: {
  searchParams?: { privacyRequest?: string };
}) {
  const requestStatus = searchParams?.privacyRequest;
  const privacyPolicyRows: LegalPolicyBrowserRow[] = [
    {
      id: 'data-matching',
      kind: 'data',
      title: 'Data used for matching',
      detail: 'Profile facts, contact details, addresses, purchase records, subscription facts, breach exposure records, permissions, and claim status history support possible-match review.',
      value: 'User-provided facts only',
      tone: 'pass',
    },
    {
      id: 'data-operational-records',
      kind: 'data',
      title: 'Operational records',
      detail: 'Matcher traces, claim state, form-preparation records, confirmation identifiers, account-history events, feature flags, and support context are retained for troubleshooting and support.',
      value: 'History-backed support',
      tone: 'pass',
    },
    {
      id: 'control-export',
      kind: 'control',
      title: 'Export requests',
      detail: 'Signed-in users can download account data, and export activity is recorded in account history.',
      value: 'Authenticated data export',
      tone: 'pass',
    },
    {
      id: 'control-deletion',
      kind: 'control',
      title: 'Deletion requests',
      detail: 'Deletion and correction requests are recorded for business review and do not automatically erase fraud-prevention, legal, accounting, or account-history records.',
      value: 'Audited request intake',
      tone: requestStatus === 'invalid' ? 'warn' : 'pass',
    },
    {
      id: 'operator-retention',
      kind: 'operator',
      title: 'Retention policy',
      detail: 'The business must define the retention window for profile facts, evidence, screenshots, support records, form records, and account history before turning on account access.',
      value: 'Business policy needed',
      tone: 'warn',
    },
    {
      id: 'safety-offline',
      kind: 'safety',
      title: 'Offline cache boundary',
      detail: 'The installed shell may cache static offline assets, but claim data, profile facts, permissions, audit logs, and final-check state require the hosted app.',
      value: 'Static offline assets only',
      tone: 'pass',
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Legal</div>
          <h1>Privacy Policy</h1>
          <p>
            ClaimBot stores user-provided profile facts, evidence records, permissions, settings,
            claim preparation logs, and audit events so users can review settlement matches before any
            live filing action is allowed.
          </p>
        </div>
      </div>

      <LegalBoundarySummary />

      <LegalPolicyBrowser
        rows={privacyPolicyRows}
        title="Search privacy boundaries before support or data requests"
        description="Review what ClaimBot stores, exports, records, and routes to the hosted business."
      />

      <div className="legal-page">
        <section className="card">
          <h2>Data used for matching</h2>
          <p>
            The app may process contact details, mailing addresses, purchase records, subscription facts,
            breach exposure records, category permissions, and claim status history. These records are
            used to assess possible settlement eligibility and to prepare reviewable claim drafts.
          </p>
        </section>

        <section className="card">
          <h2>Operational records</h2>
          <p>
            ClaimBot may also store matcher traces, claim status, form-preparation records,
            confirmation identifiers, account-history events, runtime settings, feature-flag posture, and support
            context needed to troubleshoot customer questions.
          </p>
        </section>

        <section className="card">
          <h2>Retention and export policy</h2>
          <p>
            The business should define a written retention window before turning on account access. Profile
            facts, evidence references, form-preparation records, screenshots, support records, and
            account-history records should be kept only as long as needed for claim review, support, compliance,
            and user-requested exports.
          </p>
          <p>
            Deletion requests should remove or anonymize profile facts and evidence records unless a
            specific audit, fraud-prevention, legal, or accounting reason requires preserving a minimal
            operational record. Export requests should include profile facts, saved evidence references,
            permissions, claim status, and account-history records.
          </p>
        </section>

        <section className="card">
          <h2>User control</h2>
          <p>
            Users remain responsible for the truth and completeness of claim information. Proof-required,
            uncertain, or unpermitted matches stay in review and are not submitted automatically.
          </p>
        </section>

        <section className="card">
          <h2>Offline and install behavior</h2>
          <p>
            The installed app shell may cache only static offline assets. Claim data, profile facts,
            permissions, audit logs, and final-check state are not cached for offline use and require
            reconnecting to the hosted app.
          </p>
        </section>

        <section className="card">
          <h2>Hosted deployment</h2>
          <p>
            Hosted deployments should configure sign-in, data storage, contact information, and
            review-mode defaults before turning on account access. Secret setup values are not shown back in the app.
          </p>
        </section>

        <section className="card">
          <h2>Support and privacy requests</h2>
          {requestStatus === 'received' && (
            <div className="notice success">
              <strong>Privacy request recorded</strong>
              <p>
                The request was added to account history for business review.
              </p>
            </div>
          )}
          {requestStatus === 'invalid' && (
            <div className="notice warn">
              <strong>More detail needed</strong>
              <p>
                Add at least a short description so support can route the request.
              </p>
            </div>
          )}
          <p>
            Hosted deployments should publish a monitored support mailbox for account access,
            profile correction, account-history review, data handling, and deletion or export requests.
          </p>
          <p>
            Signed-in users can download the stored account data export as JSON. Deletion and
            correction requests still go through support so required account-history, fraud-prevention,
            legal, or accounting records can be retained only where needed.
          </p>
          <p>
            <a className="btn ghost sm" href="/privacy-export">Download privacy export</a>
          </p>
          <p className="small muted">
            The download requires a signed-in account and creates an audited privacy export.
          </p>
          <form className="settings-form compact" action="/api/privacy/request" method="post">
            <label>
              Request type
              <select name="requestType" defaultValue="export">
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
              <textarea
                name="message"
                minLength={12}
                rows={4}
                placeholder="Describe the profile correction, export, deletion, or data-handling request."
                required
              />
            </label>
            <button className="btn" type="submit">Record privacy request</button>
            <p className="small muted">
              Signed-in requests are recorded for business review. This form does not automatically
              delete records.
            </p>
          </form>
        </section>
      </div>
    </>
  );
}
