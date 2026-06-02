import { ClipboardCheck, FileSearch, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const recoveryRows = [
  {
    title: 'Check tracked claims',
    detail: 'Open the claims list to find active claim records tied to this workspace.',
    Icon: ClipboardCheck,
  },
  {
    title: 'Review matches',
    detail: 'If the claim was not created yet, review matched settlements before tracking anything.',
    Icon: FileSearch,
  },
  {
    title: 'Safety stays on',
    detail: 'No form work starts from a missing claim record. Permission, proof, plan, and account checks still apply.',
    Icon: ShieldCheck,
  },
] as const;

export default function ClaimNotFound() {
  return (
    <>
      <p className="small">
        <Link href="/claims">Back to claims</Link>
      </p>

      <section className="operational-zero-state claims" aria-label="Claim detail not found">
        <div className="operational-zero-ribbon" aria-label="Missing claim safety checks">
          <span><ShieldCheck size={14} aria-hidden="true" /> Shadow Mode: On</span>
          <span>Category permission: Required</span>
          <span>Proof Review: Enforced</span>
          <span>Account History: Protected</span>
        </div>

        <div className="operational-zero-main">
          <div className="operational-zero-icon" aria-hidden="true">
            <FileSearch size={30} strokeWidth={1.9} />
          </div>
          <div>
            <div className="eyebrow">Claim detail</div>
            <h1>Claim record not found</h1>
            <p>
              This claim link does not match a claim in the current workspace. Use the claims list
              or review queue to open a current record.
            </p>
          </div>
        </div>

        <div className="operational-zero-context">
          <strong>No claim action started</strong>
          <p>
            ClaimBot did not prepare, submit, or change a claim from this page. Missing records stay
            read-only until a reviewed match is tracked again.
          </p>
        </div>

        <div className="operational-zero-pipeline" aria-label="Claim recovery steps">
          {recoveryRows.map(({ title, detail, Icon }, index) => (
            <div className={`operational-zero-step ${index === 0 ? 'active' : ''}`} key={title}>
              <span aria-hidden="true"><Icon size={14} /></span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </div>

        <div className="operational-zero-actions">
          <Link className="btn" href="/claims">Open claims</Link>
          <Link className="btn ghost" href="/review">Review matches</Link>
          <Link className="btn ghost" href="/status">Check status</Link>
        </div>
      </section>
    </>
  );
}
