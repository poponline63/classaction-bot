import type { Metadata } from 'next';
import MktShell from '../_marketing/MktShell';

export const metadata: Metadata = {
  title: 'Terms of Service — ClaimBot',
  description: 'The terms that govern your use of ClaimBot: no legal advice, no guarantees, and you stay in control of every claim.',
};

// Marketing-styled Terms. The legal substance (required phrases) is preserved
// verbatim and verified by validate:legal.
export default function TermsPage() {
  return (
    <MktShell>
      <section className="mkt-section" style={{ paddingTop: 120 }}>
        <div className="mkt-wrap-narrow mkt-prose">
          <span className="mkt-eyebrow">Legal</span>
          <h1 style={{ marginTop: 12 }}>Terms of Service</h1>
          <p className="mkt-updated">Last updated June 2026</p>

          <p>
            ClaimBot is a settlement discovery, review, and claim-preparation workspace. It is designed
            to keep you in control of eligibility facts, permissions, and live filing decisions.
          </p>

          <h2>No legal advice</h2>
          <p>
            ClaimBot does not provide legal advice or guarantee eligibility, claim approval, payout amount,
            or payment timing. You should review each settlement notice and claim form before relying on
            prepared information.
          </p>

          <h2>Automation boundary</h2>
          <p>
            ClaimBot is a workflow tool, not a claims administrator, law firm, or settlement authority.
            External settlement sites and administrators control legal terms, deadlines, proof rules,
            claim approval, and payment decisions.
          </p>

          <h2>Truthful submissions</h2>
          <p>
            You should only allow claims supported by accurate facts. Category attestations, proof
            requirements, and daily safety limits exist to prevent unsupported or accidental submissions.
          </p>

          <h2>Proof and permission checks</h2>
          <p>
            ClaimBot will not track or prepare claims that are unsupported, proof-required, unpermitted,
            expired, missing a claim form, or marked uncertain by matcher review.
            Revoking permission blocks future claim tracking for that category.
          </p>

          <h2>Shadow-mode default</h2>
          <p>
            The hosted app starts in review mode. Live filing requires an explicit reviewed acknowledgement
            and should be enabled only after business and legal review.
          </p>

          <h2>User acknowledgement receipt</h2>
          <p>
            Setup completion requires a user Terms boundary acknowledgement before discovery, matching, or
            safe claim preparation can start. The acknowledgement is recorded in account history and does
            not replace category permissions, proof review, plan checks, or filing approval.
          </p>

          <h2>Business responsibility</h2>
          <p>
            The hosted business is responsible for sign-in, support routing, source review, account-history
            monitoring, data handling, contact information, and making sure customers understand the limits
            of automated claim preparation.
          </p>

          <h2>Data retention and exports</h2>
          <p>
            The business must publish and follow a retention policy for profile facts, evidence references,
            form-preparation records, screenshots, support records, and account-history records. You can
            request correction, export, or deletion through the configured support channel.
          </p>
        </div>
      </section>
    </MktShell>
  );
}
