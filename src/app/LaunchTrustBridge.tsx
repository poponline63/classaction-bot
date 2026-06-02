type LaunchTrustBridgeStep = 'launch' | 'safety';

function formatTierName(plan: string) {
  return plan.slice(0, 1).toUpperCase() + plan.slice(1);
}

export default function LaunchTrustBridge({
  currentStep,
  tierName,
}: {
  currentStep: LaunchTrustBridgeStep;
  tierName: string;
}) {
  const normalizedTier = formatTierName(tierName);
  const clientReviewMode = currentStep === 'safety';
  const segments = [
    {
      key: 'pricing',
      badge: normalizedTier === 'Free' ? 'FREE' : 'PAID',
      heading: `Automation Tier Active: ${normalizedTier}`,
      detail: clientReviewMode
        ? 'Paid full automation can organize profile facts, evidence, reminders, claim tracking, and guarded filing for eligible no-proof claims. We do not evaluate legal eligibility.'
        : 'Paid full automation can organize profile facts, evidence, reminders, claim tracking, and worker-run filing for eligible no-proof claims. We do not evaluate legal eligibility.',
    },
    {
      key: 'launch',
      badge: normalizedTier === 'Free' ? 'DRAFT MODE' : 'PAID AUTOMATION',
      heading: normalizedTier === 'Free'
        ? clientReviewMode ? 'Manual Review Control' : 'Manual Account Control'
        : 'Permissioned Full Automation',
      detail: normalizedTier === 'Free'
        ? clientReviewMode
          ? 'Free review prepares materials only. Filing stays manual until a paid plan, permission, account checks, and claim checks clear.'
          : 'Free review prepares materials only. Filing stays manual until a paid plan, permission, account checks, and claim checks clear.'
        : clientReviewMode
          ? 'Paid commands are designed to run fully automated after explicit permission, account checks, and claim checks clear; proof-required or uncertain items still stop for review.'
          : 'Paid commands are designed to run fully automated after explicit permission, account checks, and claim checks clear; proof-required or uncertain items still stop for review.',
    },
    {
      key: 'safety',
      badge: 'GUARDED',
      heading: currentStep === 'safety' ? 'Safety Review Active' : 'Safety Review Ready',
      detail: 'Review checks validate proof, permission, source context, and final sign-off before any submission path can be considered.',
    },
  ];

  return (
    <section className={`launch-trust-bridge ${currentStep}`} aria-label="Automation trust bridge">
      <header className="launch-trust-bridge-head">
        <div>
          <div className="eyebrow">{clientReviewMode ? 'Automation safety bridge' : 'Pricing to account handoff'}</div>
          <h2>Paid full automation, guarded review</h2>
          <p>
            This bridge keeps the commercial promise tied to the safety model: paid automation improves
            workflow packaging and permissioned execution, not legal outcome certainty or proof bypassing.
          </p>
        </div>
        <span className="tag blue">Account trust bridge</span>
      </header>
      <div className="launch-trust-bridge-grid">
        {segments.map((segment) => (
          <article
            className={`launch-trust-bridge-segment ${segment.key === currentStep ? 'active' : ''}`}
            key={segment.key}
          >
            <span>{segment.badge}</span>
            <strong>{segment.heading}</strong>
            <p>{segment.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
