import LegalBoundarySummary from '../LegalBoundarySummary';
import LegalPolicyBrowser, { type LegalPolicyBrowserRow } from '../LegalPolicyBrowser';

export default function TermsPage() {
  const termsPolicyRows: LegalPolicyBrowserRow[] = [
    {
      id: 'boundary-no-legal-advice',
      kind: 'boundary',
      title: 'No legal advice',
      detail: 'ClaimBot does not provide legal advice or guarantee eligibility, claim approval, payout amount, or payment timing.',
      value: 'Settlement administrators decide outcomes',
      tone: 'pass',
    },
    {
      id: 'boundary-automation',
      kind: 'boundary',
      title: 'Automation boundary',
      detail: 'ClaimBot is a workflow tool, not a claims administrator, law firm, or settlement authority.',
      value: 'External sources stay authoritative',
      tone: 'pass',
    },
    {
      id: 'safety-truthful-submissions',
      kind: 'safety',
      title: 'Truthful submissions',
      detail: 'Users should only allow claims supported by accurate facts, active attestations, and any required proof.',
      value: 'No fabricated eligibility',
      tone: 'pass',
    },
    {
      id: 'control-proof-permission',
      kind: 'control',
      title: 'Proof and permission checks',
      detail: 'Unsupported, proof-required, unpermitted, expired, missing-form, or uncertain claims should not move into claim tracking or preparation.',
      value: 'Claim checks remain active',
      tone: 'warn',
    },
    {
      id: 'safety-shadow-mode',
      kind: 'safety',
      title: 'Shadow-mode default',
      detail: 'The hosted app starts in review mode. Live filing requires an explicit reviewed acknowledgement and an enabled filing setting.',
      value: 'No automatic submission by default',
      tone: 'pass',
    },
    {
      id: 'control-terms-receipt',
      kind: 'control',
      title: 'User acknowledgement receipt',
      detail: 'Setup completion requires a user Terms boundary acknowledgement before discovery, matching, or safe claim preparation can start.',
      value: 'Recorded before matching',
      tone: 'pass',
    },
    {
      id: 'operator-responsibility',
      kind: 'operator',
      title: 'Business responsibility',
      detail: 'The hosted business owns sign-in, support routing, source review, account-history monitoring, contact information, data handling, and account access limits.',
      value: 'Published duties stay explicit',
      tone: 'warn',
    },
    {
      id: 'data-retention-exports',
      kind: 'data',
      title: 'Data retention and exports',
      detail: 'The business must publish and follow retention, correction, export, and deletion workflows for profile facts, evidence, support records, and account history.',
      value: 'User data controls',
      tone: 'pass',
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Legal</div>
          <h1>Terms of Service</h1>
          <p>
            ClaimBot is a settlement discovery, review, and claim-preparation workspace. It is designed
            to keep users in control of eligibility facts, permissions, and live filing decisions.
          </p>
        </div>
      </div>

      <LegalBoundarySummary />

      <LegalPolicyBrowser
        rows={termsPolicyRows}
        title="Search terms boundaries before claim or filing decisions"
        description="Review ClaimBot product limits, user duties, business responsibilities, and safety checks."
      />

      <div className="legal-page">
        <section className="card">
          <h2>No legal advice</h2>
          <p>
            ClaimBot does not provide legal advice or guarantee eligibility, claim approval, payout amount,
            or payment timing. Users should review each settlement notice and claim form before relying on
            prepared information.
          </p>
        </section>

        <section className="card">
          <h2>Automation boundary</h2>
          <p>
            ClaimBot is a workflow tool, not a claims administrator, law firm, or settlement authority.
            External settlement sites and administrators control legal terms, deadlines, proof rules,
            claim approval, and payment decisions.
          </p>
        </section>

        <section className="card">
          <h2>Truthful submissions</h2>
          <p>
            Users should only allow claims supported by accurate facts. Category attestations, proof
            requirements, and daily safety limits exist to prevent unsupported or accidental submissions.
          </p>
        </section>

        <section className="card">
          <h2>Proof and permission checks</h2>
          <p>
            ClaimBot should not track or prepare claims that are unsupported, proof-required,
            unpermitted, expired, missing a claim form, or marked uncertain by matcher review.
            Revoking permission blocks future claim tracking for that category.
          </p>
        </section>

        <section className="card">
          <h2>Shadow-mode default</h2>
          <p>
            The hosted app starts in review mode. Live filing requires an explicit reviewed
            acknowledgement and should be enabled only after business and legal review.
          </p>
        </section>

        <section className="card">
          <h2>User acknowledgement receipt</h2>
          <p>
            Setup completion requires a user Terms boundary acknowledgement before discovery, matching,
            or safe claim preparation can start. The acknowledgement is recorded in account history and
            does not replace category permissions, proof review, plan checks, or filing approval.
          </p>
        </section>

        <section className="card">
          <h2>Business responsibility</h2>
          <p>
            The hosted business is responsible for sign-in, support routing, source review,
            account-history monitoring, data handling, contact information, and making sure customers understand
            the limits of automated claim preparation.
          </p>
        </section>

        <section className="card">
          <h2>Data retention and exports</h2>
          <p>
            The business must publish and follow a retention policy for profile facts, evidence references,
            form-preparation records, screenshots, support records, and account-history records. Users should be
            able to request correction, export, or deletion through the configured support channel.
          </p>
        </section>
      </div>
    </>
  );
}
