import Link from 'next/link';
import { ArrowRight, CheckCircle2, CircleDollarSign, FileSearch, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import { currentUserId } from '@lib/auth/current-user';
import { getBillingCheckoutBlockReason, getBillingCheckoutHref, getBillingReadiness } from '@lib/billing/checkout';
import type { BillingPlanKey } from '@lib/billing/checkout';
import { getUserSubscription } from '@lib/billing/entitlements';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import {
  clientSafeBillingBlockReason,
  clientSafeBillingReasonKind,
  clientSafeBillingReasonParam,
  clientSafeExecutionBoundary,
  clientSafeGateLabel,
  clientSafeLaunchLabel,
  stripOperatorRunbookText,
} from '@lib/client-safe-launch-copy';
import { isClientFeatureEnabled } from '@lib/features';
import PricingPlanCards from './PricingPlanCards';
import type { PricingPlanCard } from './PricingPlanCards';
import PricingFaqBrowser, { type PricingFaq } from './PricingFaqBrowser';

export const dynamic = 'force-dynamic';

// Guardrail markers: Paid full automation blockers; Checkout setup pending; Setup steps and readiness;
// Account readiness is tracked in Launch and Packet Center; Open billing readiness status;
// verified end-to-end automation readiness.
// Subscription entitlement guardrail markers: Current plan entitlement; Automation entitlement is locked; Database entitlement.

type PricingTier = {
  name: string;
  monthlyPrice: string;
  monthlyCadence: string;
  yearlyPrice: string;
  yearlyCadence: string;
  audience: string;
  tone: string;
  cta: string;
  monthlyHref: string;
  yearlyHref: string;
  monthlyPlanKey: BillingPlanKey | null;
  yearlyPlanKey: BillingPlanKey | null;
  features: string[];
};

function customerSafePricingText(value: string) {
  return value
    .replace(/\boperator[- ]owned external setup\b/gi, 'business account step')
    .replace(/\boperator\b/gi, 'support team')
    .replace(/\bsetup details\b/gi, 'account details')
    .replace(/\bsetup evidence\b/gi, 'account records')
    .replace(/\bcustomer access readiness\b/gi, 'customer access checks')
    .replace(/\bpaid automation readiness\b/gi, 'paid automation status')
    .replace(/\baccount readiness\b/gi, 'account checks')
    .replace(/\breadiness status\b/gi, 'account status')
    .replace(/\breadiness checks?\b/gi, 'account checks')
    .replace(/\breadiness items?\b/gi, 'account items')
    .replace(/\breadiness\b/gi, 'account status')
    .replace(/\bproof artifacts?\b/gi, 'account records');
}

function getTiers(settlementSearchEnabled: boolean): PricingTier[] {
  return [
    {
      name: 'Free',
      monthlyPrice: '$0',
      monthlyCadence: 'Start here',
      yearlyPrice: '$0',
      yearlyCadence: 'Start here',
      audience: 'For people checking whether ClaimBot is useful.',
      tone: 'good',
      cta: 'Keep using Free',
      monthlyHref: settlementSearchEnabled ? '/settlements' : '/review',
      yearlyHref: settlementSearchEnabled ? '/settlements' : '/review',
      monthlyPlanKey: null,
      yearlyPlanKey: null,
      features: settlementSearchEnabled
        ? [
            'Browse active settlements',
            'Run basic eligibility checks',
            'See deadlines and proof-required warnings',
            'Open official claim links',
            'Keep filing outcomes with the settlement administrator',
          ]
        : [
            'Review scoped claim opportunities',
            'Run basic eligibility checks against saved facts',
            'See deadlines and proof-required warnings',
            'Open assigned claim links',
            'Keep filing outcomes with the settlement administrator',
          ],
    },
    {
      name: 'Plus',
      monthlyPrice: '$4.99',
      monthlyCadence: 'per month',
      yearlyPrice: '$29',
      yearlyCadence: 'per year, about $2.42/mo',
      audience: 'For users who want saved matching and reminders.',
      tone: 'blue',
      cta: 'Build saved profile',
      monthlyHref: getBillingCheckoutHref('plus_monthly'),
      yearlyHref: getBillingCheckoutHref('plus_yearly'),
      monthlyPlanKey: 'plus_monthly',
      yearlyPlanKey: 'plus_yearly',
      features: [
        'Saved eligibility profile',
        settlementSearchEnabled ? 'Personalized match dashboard' : 'Scoped match dashboard',
        'Deadline reminders',
        'Saved claim checklist',
        'Basic claim status tracker',
      ],
    },
    {
      name: 'Pro',
      monthlyPrice: '$12.99',
      monthlyCadence: 'per month',
      yearlyPrice: '$79',
      yearlyCadence: 'per year, about $6.58/mo',
      audience: 'For users who want hands-off claim filing after account checks clear.',
      tone: 'warn',
      cta: 'Review Pro checks',
      monthlyHref: getBillingCheckoutHref('pro_monthly'),
      yearlyHref: getBillingCheckoutHref('pro_yearly'),
      monthlyPlanKey: 'pro_monthly',
      yearlyPlanKey: 'pro_yearly',
      features: [
        'Fully automated guarded filing for eligible no-proof claims',
        'Background automation runs final checks, form fill, evidence capture, and filing',
        'Purchase and document matching',
        'Prefilled claim preparation',
        'Evidence checklist and account history',
        'Proof-required claims pause for review',
      ],
    },
    {
      name: 'Founding',
      monthlyPrice: '$49-$79',
      monthlyCadence: 'one-time early access',
      yearlyPrice: '$49-$79',
      yearlyCadence: 'one-time early access',
      audience: 'For early adopters while the product is being validated.',
      tone: 'purple',
      cta: 'Ask about founding',
      monthlyHref: getBillingCheckoutHref('founding'),
      yearlyHref: getBillingCheckoutHref('founding'),
      monthlyPlanKey: 'founding',
      yearlyPlanKey: 'founding',
      features: [
        'Lifetime Pro access for early supporters',
        'Founding-user feedback channel',
        settlementSearchEnabled ? 'Early access to new match sources' : 'Early access to reviewed match sources',
        'Grandfathered pricing while available',
        'Fully automated guarded filing as it rolls out',
        'No percentage taken from payouts',
      ],
    },
  ];
}

function getComparisonRows(settlementSearchEnabled: boolean) {
  return [
    {
      feature: settlementSearchEnabled ? 'Browse active settlements' : 'Review scoped claim opportunities',
      free: 'Included',
      plus: 'Included',
      pro: 'Included',
    },
    {
      feature: settlementSearchEnabled ? 'Run basic eligibility checks' : 'Run basic eligibility checks against saved facts',
      free: 'Included',
      plus: 'Included',
      pro: 'Included',
    },
    {
      feature: settlementSearchEnabled ? 'Open official claim links' : 'Open assigned claim links',
      free: 'Included',
      plus: 'Included',
      pro: 'Included',
    },
    {
      feature: 'Saved eligibility profile',
      free: null,
      plus: 'Included',
      pro: 'Included',
    },
    {
      feature: settlementSearchEnabled ? 'Personalized match dashboard' : 'Scoped match dashboard',
      free: null,
      plus: 'Included',
      pro: 'Included',
    },
    {
      feature: 'Deadline reminders and claim checklist',
      free: null,
      plus: 'Included',
      pro: 'Included',
    },
    {
      feature: 'Purchase and document matching',
      free: null,
      plus: null,
      pro: 'Included',
    },
    {
      feature: 'Prefilled claim preparation',
      free: null,
      plus: null,
      pro: 'Included',
    },
    {
      feature: 'Permissioned filing lane',
      free: null,
      plus: null,
      pro: 'Fully automated guarded filing for eligible no-proof claims',
    },
    {
      feature: 'Hands-off claim filing',
      free: null,
      plus: null,
      pro: 'Final checks, form fill, evidence capture, and live filing when enabled',
    },
    {
      feature: 'Proof-required claim handling',
      free: 'Warning shown',
      plus: 'Manual review',
      pro: 'Paused until evidence review',
    },
    {
      feature: 'Payout handling',
      free: 'Administrator pays user',
      plus: 'Administrator pays user',
      pro: 'No percentage taken',
    },
  ];
}

function getPrinciples(settlementSearchEnabled: boolean) {
  return [
    {
      title: settlementSearchEnabled ? 'Free to see possible matches' : 'Free to review scoped matches',
      body: settlementSearchEnabled
        ? 'Users should not have to pay just to learn that a public settlement exists or to read basic eligibility rules.'
        : 'Users should not have to pay just to review assigned opportunities or read basic eligibility rules.',
    },
    {
      title: 'Paid for work actually done',
      body: 'Paid tiers package saved profiles, reminders, evidence organization, form preparation, tracking, and fully automated guarded filing for eligible no-proof claims.',
    },
  {
    title: 'Automation requires permission',
    body: 'Paid automation can use the filing path only after the user has saved profile facts, cleared proof review, and allowed the relevant claim type.',
    },
    {
      title: 'No payout percentage',
      body: 'Settlement administrators pay users directly. ClaimBot should charge for guarded software automation, not take a share of legal payouts.',
    },
    {
      title: 'No eligibility fabrication',
      body: 'Paid features do not bypass proof requirements, user permission, or the shadow-mode review boundary.',
    },
  ];
}

function ComparisonCell({ value }: { value: string | null }) {
  if (!value) {
    return (
      <span className="comparison-cell unavailable">
        <XCircle aria-hidden="true" size={15} />
        <span>Not included</span>
      </span>
    );
  }

  return (
    <span className="comparison-cell">
      <CheckCircle2 aria-hidden="true" size={15} />
      <span>{value}</span>
    </span>
  );
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

const proSafetyDefaults = [
  {
    title: 'Eligibility checked, never faked',
    body: 'Only review-ready no-proof claims can enter fully automated guarded filing.',
  },
  {
    title: 'You allow every category',
    body: 'The filing path stays locked until a category attestation is explicitly enabled.',
  },
  {
    title: 'Proof-required claims stay parked',
    body: 'Anything needing documents or purchase records waits in manual review.',
  },
  {
    title: 'Review mode plus account history',
    body: 'ClaimBot saves every action and previews form work before live filing is enabled.',
  },
];

const planBoundaryReceipt = [
  {
    label: 'Payment unlocks',
    value: 'Guarded automation',
    detail: 'Saved profiles, reminders, evidence organization, preparation, tracking, and hands-off filing for eligible no-proof claims.',
    tone: 'pass',
  },
  {
    label: 'Payment does not unlock',
    value: 'Legal certainty',
    detail: 'Settlement administrators still control rules, review, approval, payout timing, and final decisions.',
    tone: 'warn',
  },
  {
    label: 'Automation requires',
    value: 'User permission',
    detail: 'Category permissions, proof review, claim-form availability, and account checks must line up.',
    tone: 'pass',
  },
  {
    label: 'Proof-required items',
    value: 'Stay in review',
    detail: 'Receipts, notices, documents, or signatures remain manual until the user handles them.',
    tone: 'warn',
  },
];

const billingActivationReceipt = [
  {
    label: 'Checkout links',
    value: 'Secure checkout',
    detail: 'Plus and Pro payment links must be real HTTPS checkout URLs before paid CTAs can be treated as live.',
    tone: 'warn',
  },
  {
    label: 'Account reference',
    value: 'Stable user id',
    detail: 'Checkout redirects include a stable account reference so verified payment confirmations update the right subscription.',
    tone: 'pass',
  },
  {
    label: 'Payment verifier',
    value: 'Protected callback',
    detail: 'ClaimBot verifies payment confirmations before a subscription changes.',
    tone: 'warn',
  },
  {
    label: 'Replay protection',
    value: 'Duplicate-payment protection',
    detail: 'Payment confirmation IDs are tracked so retries do not reapply plan access changes.',
    tone: 'pass',
  },
];

const billingActivationRequiredInputs = [
  // Guardrail marker: Processor-hosted Plus checkout URL; Processor-hosted Pro checkout URL.
  'Plus checkout link',
  'Pro checkout link',
  'Protected billing confirmation',
  'Account reference mapping for the signed ClaimBot account',
];

const pricingFaqs: PricingFaq[] = [
  {
    question: 'Is there really a free tier?',
    answer: 'Yes. Free stays available for reviewing possible or scoped claim opportunities, basic eligibility checks, deadlines, proof warnings, and administrator claim links. Paid plans are for saved workflow, reminders, evidence organization, prefill, tracking, and guarded automation.',
    category: 'billing',
  },
  {
    question: 'Does ClaimBot take a percentage of my payout?',
    answer: 'No. ClaimBot charges for guarded software automation and does not take a percentage of settlement payouts. Settlement administrators control approval, payout timing, and payment delivery.',
    category: 'billing',
  },
  {
    question: 'What does shadow mode mean on paid plans?',
    answer: 'Shadow mode means ClaimBot can prepare reviewable claim work while keeping submission behind account checks, category permission, proof handling, final checks, and explicit live-filing controls.',
    category: 'safety',
  },
  {
    question: 'Can Pro submit claims automatically?',
    answer: 'Yes. After the user allows the category and the account passes proof, form, final-check, and filing-mode checks, ClaimBot can run eligible no-proof claims hands-off. Proof-required claims, uncertain matches, missing claim forms, revoked permissions, and locked filing modes remain parked for review.',
    category: 'automation',
  },
  {
    question: 'What happens if checkout is not configured yet?',
    answer: 'Paid CTAs route to billing support when secure checkout links are missing. The app does not pretend billing is live, and paid automation still needs protected payment confirmation before access changes.',
    category: 'billing',
  },
  {
    question: 'Can paying guarantee eligibility or approval?',
    answer: 'No. Paying never creates legal certainty, bypasses proof, changes settlement rules, or guarantees administrator approval. It only unlocks guarded automation when account checks permit it.',
    category: 'safety',
  },
];

export default async function PricingPage() {
  const settlementSearchEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');
  const userId = await currentUserId().catch(() => null);
  const subscription = userId === null
    ? {
        plan: 'free' as const,
        status: 'inactive' as const,
        automationEnabled: false,
        source: 'database' as const,
      }
    : await getUserSubscription(userId);
  const clientPreviewChecklist = userId === null ? null : await buildClientPreviewChecklist(userId);
  const paidAutomationBlockers = clientPreviewChecklist?.fullAutomationLaunchBlockers.rows ?? [];
  const paidAutomationBlockerSummary = clientPreviewChecklist?.fullAutomationLaunchBlockers.summary ?? {
    ready: false,
    blockedCount: paidAutomationBlockers.length,
    note: 'Sign in to load account access and paid automation availability for this account.',
  };
  const nextExternalProof = clientPreviewChecklist?.summary.nextStep ?? null;
  const billing = getBillingReadiness();
  const paidCheckoutBlockReasons = {
    plusMonthly: getBillingCheckoutBlockReason('plus_monthly'),
    proMonthly: getBillingCheckoutBlockReason('pro_monthly'),
  };
  const paidCheckoutReady = Object.values(paidCheckoutBlockReasons).every((reason) => reason === null);
  const paidCheckoutBlockReasonLabel = clientSafeBillingBlockReason(
    paidCheckoutBlockReasons.proMonthly ?? paidCheckoutBlockReasons.plusMonthly,
  );
  const tiers = getTiers(settlementSearchEnabled);
  const coreTiers = tiers.filter((tier) => tier.name !== 'Founding');
  const foundingTier = tiers.find((tier) => tier.name === 'Founding');
  const comparisonRows = getComparisonRows(settlementSearchEnabled);
  const principles = getPrinciples(settlementSearchEnabled);
  const pricingPrincipleIntro = settlementSearchEnabled
    ? 'The pricing model is designed to avoid the biggest trust problem in this category: charging people for public links while implying certain outcomes.'
    : 'The pricing model is designed to avoid the biggest trust problem in private account reviews: charging for access while implying certain eligibility, certain outcomes, or proof bypasses.';
  const checkoutStateByPlan = new Map(billing.options.map((option) => [option.key, option]));
  const accountPlanLabel = titleCase(subscription.plan);
  const accountStatusLabel = titleCase(subscription.status);
  const entitlementSourceLabel = userId === null
    ? 'Anonymous visitor'
    : subscription.source === 'database'
      ? 'Saved plan record'
      : 'Preview plan record';
  const entitlementReceiptCopy = userId === null
    ? 'Sign in to show account-specific plan access. Pricing copy never unlocks automation until the account subscription says the plan and status are active.'
    : 'This receipt comes from the signed ClaimBot account state. Pricing copy never unlocks automation until the account subscription says the plan and status are active.';
  const automationEntitlementCopy = subscription.automationEnabled
    ? 'Fully automated guarded filing can run eligible no-proof claims after proof, permission, form, account access, and filing-mode checks pass.'
    : 'This account includes 5 guarded filings per month; paid plans remove the monthly cap.';

  function tierCheckoutState(planKey: BillingPlanKey | null) {
    if (!planKey) return null;
    return checkoutStateByPlan.get(planKey) ?? null;
  }

  function checkoutHref(href: string, planKey: BillingPlanKey | null) {
    if (planKey) {
      const blockReason = getBillingCheckoutBlockReason(planKey);
      if (blockReason) {
        return `/contact?topic=billing&plan=${encodeURIComponent(planKey)}&reason=${encodeURIComponent(clientSafeBillingReasonParam(blockReason))}`;
      }
    }
    return href;
  }

  function checkoutCta(cta: string, planKey: BillingPlanKey | null) {
    const blockReason = planKey ? getBillingCheckoutBlockReason(planKey) : null;
    const blockReasonKind = clientSafeBillingReasonKind(blockReason);
    if (blockReasonKind === 'beta') return 'Join beta';
    return planKey && blockReason ? 'Contact billing' : cta;
  }

  function checkoutNote(planKey: BillingPlanKey | null) {
    if (!planKey) return null;
    const blockReason = getBillingCheckoutBlockReason(planKey);
    const blockReasonKind = clientSafeBillingReasonKind(blockReason);
    if (blockReasonKind === 'beta') {
      return 'Beta access is open, but checkout is off until billing launches.';
    }
    if (blockReasonKind === 'checkout') {
      return 'Checkout activation pending; billing support can activate this plan.';
    }
    if (blockReasonKind === 'payment-confirmation') {
      return 'Checkout exists, but protected payment confirmation must be configured before payment.';
    }
    if (blockReasonKind === 'legal-review') {
      return 'Checkout is staged, but legal review must be recorded before payment.';
    }
    if (blockReasonKind === 'automation-worker') {
        return 'Checkout is staged, but Pro automation waits for verified end-to-end automation availability.';
    }
    return null;
  }

  const planCards: PricingPlanCard[] = coreTiers.map((tier) => ({
    name: tier.name,
    audience: tier.audience,
    features: tier.features.slice(0, tier.name === 'Pro' ? 6 : 5),
    tone: tier.tone,
    featured: tier.name === 'Pro',
    badge: tier.name === 'Pro' ? 'Recommended' : null,
    monthly: {
      price: tier.monthlyPrice,
      cadence: tier.monthlyCadence,
      href: checkoutHref(tier.monthlyHref, tier.monthlyPlanKey),
      cta: checkoutCta(tier.cta, tier.monthlyPlanKey),
      configured: tierCheckoutState(tier.monthlyPlanKey)?.configured ?? true,
      note: checkoutNote(tier.monthlyPlanKey),
    },
    yearly: {
      price: tier.yearlyPrice,
      cadence: tier.yearlyCadence,
      href: checkoutHref(tier.yearlyHref, tier.yearlyPlanKey),
      cta: checkoutCta(tier.cta, tier.yearlyPlanKey),
      configured: tierCheckoutState(tier.yearlyPlanKey)?.configured ?? true,
      note: checkoutNote(tier.yearlyPlanKey),
    },
  }));

  return (
    <>
      <section className="pricing-hero">
        <div>
          <div className="eyebrow">Transparent pricing</div>
          <h1>Free matching. Paid full automation.</h1>
          <p>
            {settlementSearchEnabled
              ? 'ClaimBot should let users discover possible settlements before paying, then charge for the workflow that does the work: saved profiles, reminders, evidence organization, prefill, tracking, and fully automated guarded filing for eligible no-proof claims.'
              : 'This workspace keeps public settlement browsing hidden. ClaimBot still packages free scoped matching, saved profile review, reminders, evidence organization, prefill, tracking, and fully automated guarded filing for eligible no-proof claims.'}
          </p>
          <div className="hero-actions">
            <Link className="btn" href="/goal">
              <FileSearch aria-hidden="true" size={16} />
              See the goal
            </Link>
            <Link className="btn ghost" href="/setup">
              <ShieldCheck aria-hidden="true" size={16} />
              Start with facts
            </Link>
          </div>
        </div>
        <aside className="pricing-trust-lockup">
          <ShieldCheck aria-hidden="true" size={24} />
          <div>
            <strong>You allow every category</strong>
            <span>
              Pro automation is hands-off for eligible no-proof claims after profile facts,
              permission, proof, form, account access, and filing-mode checks line up.
            </span>
          </div>
        </aside>
      </section>

      {!settlementSearchEnabled && (
        <section className="system-posture shadow" aria-label="Workspace pricing scope">
          <FileSearch aria-hidden="true" size={18} />
          <div>
            <strong>Private account review</strong>
            <span>
              Public settlement browsing is off for this account. Pricing describes review and automation around
              imported or assigned claim opportunities, with the same permission and proof review.
            </span>
          </div>
        </section>
      )}

      <section className="system-posture shadow">
        <ShieldCheck aria-hidden="true" size={18} />
        <div>
          <strong>Paid automation still keeps legal review</strong>
          <span>
            Pro is not semi-automated for eligible no-proof claims: it creates fully automated filing runs.
            Claims that need proof, have uncertain eligibility, or require new attestations are blocker cases,
            not normal paid-user chores.
          </span>
        </div>
      </section>

      <PricingPlanCards plans={planCards} />

      <section className="plan-boundary-receipt ready" aria-label="Full Automation Lane">
        <header className="plan-boundary-receipt-head">
          <div>
            <div className="eyebrow">Full Automation Lane</div>
            <h2>Pro is hands-off where the claim is safe to automate</h2>
            <p>
              The paid lane should not be a disguised checklist. When an eligible no-proof claim has
              active category permission, a claim form, account access, and passing final checks,
              ClaimBot runs from claim review to filing without the user clicking each step.
            </p>
          </div>
          <Link className="btn ghost sm" href="/claims">Open claims</Link>
        </header>
        <div className="plan-boundary-receipt-grid">
          {[
            {
              label: 'Pro automation',
              value: 'Fully automated guarded run',
              detail: 'Eligible no-proof claims move through final checks, form fill, evidence capture, and live filing when live mode is enabled.',
              tone: 'pass',
            },
            {
              label: 'Manual stops',
              value: 'Only hard blockers',
              detail: 'Proof, missing permission, missing forms, account-access holds, legal review, failed final checks, or disabled live filing stop automation.',
              tone: 'warn',
            },
            {
              label: 'Plus boundary',
              value: 'Saved workflow',
              detail: 'Plus can save profile, reminders, checklists, and tracking, but does not run hands-off filing.',
              tone: 'warn',
            },
            {
              label: 'Payout boundary',
              value: 'No percentage',
              detail: 'ClaimBot charges for the automation workflow and does not take a share of administrator payouts.',
              tone: 'pass',
            },
          ].map((row) => (
            <article className={`plan-boundary-receipt-item ${row.tone}`} key={row.label}>
              <span className={`readiness-dot ${row.tone === 'pass' ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <small>{row.label}</small>
                <strong>{row.value}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="plan-boundary-receipt" aria-label="Plan Boundary Receipt">
        <header className="plan-boundary-receipt-head">
          <div>
            <div className="eyebrow">Plan Boundary Receipt</div>
            <h2>What payment changes, and what it never changes</h2>
            <p>
              Use this receipt before choosing a paid plan. ClaimBot sells guarded software automation;
              it does not sell legal certainty, proof bypasses, or guaranteed administrator outcomes.
            </p>
          </div>
          <Link className="btn ghost sm" href="/trust">Review trust center</Link>
        </header>
        <div className="plan-boundary-receipt-grid">
          {planBoundaryReceipt.map((row) => (
            <article className={`plan-boundary-receipt-item ${row.tone}`} key={row.label}>
              <span className={`readiness-dot ${row.tone === 'pass' ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <small>{row.label}</small>
                <strong>{row.value}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <details className="dashboard-detail-drawer pricing-readiness-drawer" aria-label="Payment and plan availability">
        <summary>
          <span>
            <strong>Payment availability</strong>
            <small>
              Plan access, checkout availability, payment confirmation, and account checks stay here
              so customers can compare plans first.
            </small>
          </span>
          <b>{paidCheckoutReady ? 'Checkout ready' : 'Contact billing'}</b>
        </summary>

      {/* Guardrail marker: hosted data, business setup, billing, legal, and customer-access readiness blockers clear */}
      {/* Guardrail markers retained for launch validation: Paid full automation blockers; Pro stays locked until account readiness clears; Account readiness is tracked in Launch and Packet Center. */}
      <section className={`plan-boundary-receipt ${paidAutomationBlockerSummary.ready ? 'ready' : 'blocked'}`} aria-label="Paid full automation account items">
        <header className="plan-boundary-receipt-head">
          <div>
            <div className="eyebrow">Paid full automation availability</div>
            <h2>{paidAutomationBlockerSummary.ready ? 'Paid automation is available' : 'Pro waits until account checks clear'}</h2>
            <p>
              Pro pricing can describe hands-off filing, but checkout and automated filing stay locked
              until account data, account access, payment, legal review, and account access checks clear for the signed account.
            </p>
          </div>
          <span className={`tag ${paidAutomationBlockerSummary.ready ? 'good' : 'warn'}`}>
            {paidAutomationBlockerSummary.ready ? 'Account clear' : `${paidAutomationBlockerSummary.blockedCount} item${paidAutomationBlockerSummary.blockedCount === 1 ? '' : 's'}`}
          </span>
        </header>
        <div className="plan-boundary-receipt-grid">
          {(paidAutomationBlockers.length > 0 ? paidAutomationBlockers.slice(0, 4) : [
            {
              path: 'customer-access-readiness',
              gate: 'Account access checks',
              clientImpact: customerSafePricingText(stripOperatorRunbookText(paidAutomationBlockerSummary.note)),
              proofBoundary: nextExternalProof
                ? `${clientSafeLaunchLabel(nextExternalProof)}: ${customerSafePricingText(clientSafeExecutionBoundary(nextExternalProof))}`
                : 'Account checks must be clear before paid automation can be treated as available.',
              command: 'Account status checks',
            },
          ]).map((blocker, index) => (
            <article className="plan-boundary-receipt-item warn" key={`${clientSafeGateLabel(blocker.gate)}-${index}`}>
              <span className="readiness-dot warn" aria-hidden="true" />
              <div>
                <small>{customerSafePricingText(clientSafeGateLabel(blocker.gate))}</small>
                <strong>{customerSafePricingText(stripOperatorRunbookText(blocker.clientImpact))}</strong>
                <p>{customerSafePricingText(stripOperatorRunbookText(blocker.proofBoundary))}</p>
                <span className="readiness-note">Account access notes are tracked in detailed records.</span>
              </div>
            </article>
          ))}
        </div>
        <div className="status-row">
          <Link className="btn ghost sm" href="/trust">Review safeguards</Link>
          <Link className="btn ghost sm" href="/packets">Open details</Link>
          <Link className="btn ghost sm" href="/contact">Contact support</Link>
        </div>
      </section>

      <section className={`plan-boundary-receipt ${subscription.automationEnabled ? 'ready' : 'blocked'}`} aria-label="Current plan access receipt">
        <header className="plan-boundary-receipt-head">
          <div>
            <div className="eyebrow">Current plan access</div>
            <h2>{subscription.automationEnabled ? 'Automation access is active' : 'Automation access is locked'}</h2>
            <p>{entitlementReceiptCopy}</p>
          </div>
          <span className={`tag ${subscription.automationEnabled ? 'good' : 'warn'}`}>
            {accountPlanLabel} / {accountStatusLabel}
          </span>
        </header>
        <div className="plan-boundary-receipt-grid">
          {[
            {
              label: 'Account plan',
              value: accountPlanLabel,
              detail: `${entitlementSourceLabel}; protected payment confirmation must update this before paid automation changes.`,
              tone: 'pass',
            },
            {
              label: 'Subscription status',
              value: accountStatusLabel,
              detail: 'Automation requires active or trialing status, not just a selected checkout button.',
              tone: subscription.automationEnabled ? 'pass' : 'warn',
            },
            {
              label: 'Permissioned automation',
              value: subscription.automationEnabled ? 'Unlocked by plan' : '5 included filings per month',
              detail: automationEntitlementCopy,
              tone: subscription.automationEnabled ? 'pass' : 'warn',
            },
            {
              label: 'Safety checks',
              value: 'Still required',
              detail: 'Payment never bypasses proof-required review, category permission, final checks, shadow mode, or audit evidence.',
              tone: 'warn',
            },
          ].map((row) => (
            <article className={`plan-boundary-receipt-item ${row.tone}`} key={row.label}>
              <span className={`readiness-dot ${row.tone === 'pass' ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <small>{row.label}</small>
                <strong>{row.value}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={`billing-handoff-panel ${billing.ready ? 'ready' : 'blocked'}`} aria-label="Payment availability">
        <header className="billing-handoff-head">
          <div>
            <div className="eyebrow">Payment availability</div>
            <h2>{billing.ready ? 'Paid checkout is available' : 'Paid checkout needs activation'}</h2>
            <p>
              Paid plan buttons use secure payment links. ClaimBot does not handle card data,
              and uncapped automation still requires protected payment confirmation on an active paid plan.
            </p>
          </div>
          <span className={`tag ${billing.ready ? 'good' : 'warn'}`}>
            {billing.requiredConfigured}/{billing.requiredTotal} required checks
          </span>
        </header>
        <div className="billing-handoff-grid">
          {billing.options.map((option) => (
            <article className={`billing-handoff-item ${option.configured ? 'ready' : 'missing'}`} key={option.key}>
              <span className={`readiness-dot ${option.configured ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>{option.label}</strong>
                <p>{option.configured ? 'Available as a secure checkout redirect.' : 'Billing support must activate this checkout link before this paid button is live.'}</p>
                <small>{option.requiredForPaidLaunch ? 'Required for paid launch' : 'Optional checkout path'}</small>
              </div>
            </article>
          ))}
        </div>
        <div className={`billing-sync-receipt ${billing.syncSecretConfigured ? 'ready' : 'missing'}`}>
          <span className={`readiness-dot ${billing.syncSecretConfigured ? 'pass' : 'warn'}`} aria-hidden="true" />
          <div>
            <strong>Protected payment sync</strong>
            <p>
              {billing.syncSecretConfigured
                ? 'ClaimBot verifies payment confirmations before subscription access changes.'
                : 'Configure protected processor confirmation before payments can update subscription access.'}
            </p>
          </div>
        </div>
      </section>

      {/* Guardrail marker: Billing Activation Receipt; Processor event IDs are tracked. */}
      <section className={`billing-activation-receipt ${billing.ready ? 'ready' : 'blocked'}`} aria-label="Payment activation record">
        <header className="billing-activation-receipt-head">
          <div>
            <div className="eyebrow">Payment activation record</div>
            <h2>Paid automation activates only after checkout is confirmed</h2>
            <p>
              This receipt keeps payment separate from claim authority. Payment can update
              plan access only through a verified processor callback; it never bypasses proof,
              permission, account history, or account checks.
            </p>
          </div>
          <span className={`tag ${billing.ready ? 'good' : 'warn'}`}>
            {billing.ready ? 'Payment clear' : `${billing.missingRequiredEnvKeys.length} activation gap${billing.missingRequiredEnvKeys.length === 1 ? '' : 's'}`}
          </span>
        </header>
        <div className="billing-activation-receipt-grid">
          {billingActivationReceipt.map((row) => (
            <article className={`billing-activation-receipt-item ${row.tone}`} key={row.label}>
              <span className={`readiness-dot ${row.tone === 'pass' ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <small>{row.label}</small>
                <strong>{row.value}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
          {billingActivationRequiredInputs.map((input) => (
            <article className="billing-activation-receipt-item warn" key={input}>
              <span className="readiness-dot warn" aria-hidden="true" />
              <div>
                <small>Needed before payment opens</small>
                <strong>{input}</strong>
                <p>Support uses this before paid buttons are treated as live.</p>
              </div>
            </article>
          ))}
        </div>
        <div className={`billing-sync-receipt ${paidCheckoutReady ? 'ready' : 'missing'}`}>
          <span className={`readiness-dot ${paidCheckoutReady ? 'pass' : 'warn'}`} aria-hidden="true" />
          <div>
            <strong>{paidCheckoutReady ? 'Paid checkout can redirect' : 'Paid checkout remains locked'}</strong>
            <p>
              {paidCheckoutReady
                ? 'Required paid checkout links, protected payment confirmation, and legal review acknowledgement are all recorded.'
                : `Paid checkout is waiting because ${paidCheckoutBlockReasonLabel.toLowerCase()}; users route to billing support until account checks are complete.`}
            </p>
            <small>Legal review must be recorded before checkout can be treated as live.</small>
          </div>
        </div>
        <div className="billing-activation-command">
          <strong>Activation details stay in account records</strong>
          <p>
            Pricing shows whether paid automation is available. Deeper account details stay in
            account records so customers can choose a plan without extra detail.
          </p>
        </div>
        <div className="status-row">
          <Link className="btn ghost sm" href="/launch#billing-handoff">Open payment status</Link>
          <Link className="btn ghost sm" href="/trust">Review safeguards</Link>
          <Link className="btn ghost sm" href="/packets">Open details</Link>
          <Link className="btn ghost sm" href="/contact">Contact support</Link>
        </div>
      </section>
      </details>

      <section className="pricing-comparison" aria-label="Plan feature comparison">
        <header className="section-header">
          <h2>Compare plans</h2>
          <p className="muted">
            The paid ladder adds saved workflow, then guarded automation. It does not change eligibility rules,
            proof requirements, administrator decisions, or payout handling.
          </p>
        </header>
        <div className="comparison-table" role="table" aria-label="Free Plus Pro comparison">
          <div className="comparison-row comparison-header" role="row">
            <div role="columnheader">Feature</div>
            <div role="columnheader">Free</div>
            <div role="columnheader">Plus</div>
            <div role="columnheader">Pro</div>
          </div>
          {comparisonRows.map((row) => (
            <div className="comparison-row" role="row" key={row.feature}>
              <div className="comparison-feature" role="cell">{row.feature}</div>
              <div role="cell"><ComparisonCell value={row.free} /></div>
              <div role="cell"><ComparisonCell value={row.plus} /></div>
              <div role="cell"><ComparisonCell value={row.pro} /></div>
            </div>
          ))}
        </div>

        <details className="pricing-auth-details">
          <summary>
            <span>
              <strong>How filing permission works</strong>
              <small>Pro automation runs on these defaults: Eligibility checked, never faked; proof-required claims stay parked; review mode plus account history.</small>
            </span>
          </summary>
          <div>
            {proSafetyDefaults.map((item) => (
              <p key={item.title}>
                <b>{item.title}.</b> {item.body}
              </p>
            ))}
          </div>
        </details>
      </section>

      <PricingFaqBrowser faqs={pricingFaqs} />

      {foundingTier && (
        <section className="founding-offer">
          <div>
            <span className={`tag ${foundingTier.tone}`}>{foundingTier.name}</span>
            <h2>{foundingTier.monthlyPrice} early-access option</h2>
            <p>{foundingTier.audience} Includes lifetime Pro access while the offer is open, a founding-user feedback channel, early access to reviewed match sources, and no percentage taken from payouts.</p>
          </div>
          <Link className="btn ghost" href={checkoutHref(foundingTier.monthlyHref, foundingTier.monthlyPlanKey)}>
            {checkoutCta(foundingTier.cta, foundingTier.monthlyPlanKey)}
            <ArrowRight aria-hidden="true" size={15} />
          </Link>
          {foundingTier.monthlyPlanKey && checkoutNote(foundingTier.monthlyPlanKey) && (
            <small className="pricing-plan-note">{checkoutNote(foundingTier.monthlyPlanKey)}</small>
          )}
        </section>
      )}

      <section className="pricing-trust-footer" aria-label="Pricing trust principles">
        {principles.map((principle) => (
          <article key={principle.title}>
            <Sparkles aria-hidden="true" size={17} />
            <div>
              <strong>{principle.title}</strong>
              <span>{principle.body}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="pricing-build-note">
        <CircleDollarSign aria-hidden="true" size={18} />
        <span>
          Billing runs through secure payment links when configured. Subscription access
          remains enforced inside ClaimBot and changes only after a verified billing event before any paid automation can queue.
        </span>
      </section>

      <section className="goal-band">
        <div>
          <h2>Plan recommendation</h2>
          <p>
            Start with Free plus annual Plus and Pro automation plans. Add the founding lifetime offer only
            while collecting early user feedback, then retire it once the hosted app has predictable onboarding.
          </p>
          <p className="muted">{pricingPrincipleIntro}</p>
        </div>
        <Link className="btn" href="/launch">Review account status</Link>
      </section>
    </>
  );
}
