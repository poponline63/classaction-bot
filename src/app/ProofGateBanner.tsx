import { FileCheck2, LockKeyhole, ShieldCheck } from 'lucide-react';

export default function ProofGateBanner({ surface }: { surface: 'goal' | 'setup' }) {
  const surfaceCopy = surface === 'goal'
    ? 'This applies before matching, claim tracking, and any paid filing run.'
    : 'This applies during setup, permissions, and first review.';

  return (
    <section className="proof-gate-banner" aria-label="Proof rules">
      <span className="proof-gate-banner-icon" aria-hidden="true">
        <LockKeyhole size={18} />
      </span>
      <div className="proof-gate-banner-copy">
        <div className="proof-gate-banner-kicker">Proof rules</div>
        <strong>Claims needing proof stay in review. Category permissions stay enforced.</strong>
        <p>
          ClaimBot can help with eligible no-proof claims, but receipts, documents,
          signatures, and uncertain matches stay with the user for review. {surfaceCopy}
        </p>
      </div>
      <div className="proof-gate-banner-locks" aria-label="Active proof and permission locks">
        <span>
          <FileCheck2 aria-hidden="true" size={14} />
          Proof review required
        </span>
        <span>
          <ShieldCheck aria-hidden="true" size={14} />
          Permission required
        </span>
      </div>
    </section>
  );
}
