const legalBoundaryRows = [
  {
    title: 'User facts stay user-controlled',
    body: 'Profile facts, evidence records, and category permissions are used for matching and review, not for invented eligibility.',
  },
  {
    title: 'Automation remains guarded',
    body: 'Claim preparation cannot bypass proof requirements, missing permission, expired deadlines, or uncertain matcher results.',
  },
  {
    title: 'Shadow mode is the baseline',
    body: 'Hosted onboarding starts with preview and activity records; live filing requires separate reviewed launch controls.',
  },
  {
    title: 'Audit and support stay available',
    body: 'The business should keep account-history exports, support routing, privacy requests, and pause paths available for customer review.',
  },
];

export default function LegalBoundarySummary() {
  return (
    <section className="legal-boundary-summary" aria-label="Legal boundary summary">
      <div className="legal-boundary-head">
        <div>
          <div className="legal-boundary-kicker">Legal boundary summary</div>
          <h2>What the hosted app can and cannot do</h2>
          <p>
            ClaimBot is a controlled workflow for matching, review, permission, and history-backed
            preparation. It is not a settlement administrator, law firm, or proof substitute.
          </p>
        </div>
      </div>
      <div className="legal-boundary-grid">
        {legalBoundaryRows.map((row) => (
          <div className="legal-boundary-item" key={row.title}>
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
