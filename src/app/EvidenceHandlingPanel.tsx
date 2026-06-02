const evidenceHandlingRows = [
  {
    title: 'You provide facts; we never fabricate.',
    body: 'ClaimBot stores the facts you enter and does not create, alter, or assume evidence on your behalf.',
  },
  {
    title: 'Matcher finds potential fits only.',
    body: 'Evidence records are compared with settlement criteria to surface possible matches; the matcher does not contact administrators or file claims.',
  },
  {
    title: 'Proof steps stay manual.',
    body: 'If a settlement asks for documents, receipts, signatures, or notices, the process pauses for review instead of bypassing proof.',
  },
  {
    title: 'Shadow mode is on.',
    body: 'Prepared activity stays in review first and is saved to account history until live automation is deliberately enabled.',
  },
];

interface EvidenceHandlingPanelProps {
  href: string;
}

export default function EvidenceHandlingPanel({ href }: EvidenceHandlingPanelProps) {
  return (
    <section className="evidence-handling-panel" aria-label="How your evidence is handled">
      <div className="evidence-handling-head">
        <div>
          <div className="evidence-handling-kicker">Evidence custody</div>
          <h2>How your evidence is handled</h2>
          <p>
            These records improve matching, but they do not remove permission, proof, review,
            or final safety checks from the filing workflow.
          </p>
        </div>
        <a className="btn ghost sm" href={href}>Continue to evidence intake</a>
      </div>
      <div className="evidence-handling-grid">
        {evidenceHandlingRows.map((row) => (
          <div className="evidence-handling-item pass" key={row.title}>
            <span className="readiness-dot pass" aria-hidden="true" />
            <div>
              <strong>{row.title}</strong>
              <p>{row.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
