import Link from 'next/link';
import type { Metadata } from 'next';
import { Check, Sparkles } from 'lucide-react';
import { FREE_MONTHLY_CLAIM_LIMIT } from '@lib/billing/entitlements';
import MktShell from '../_marketing/MktShell';
import MktFaq, { type FaqItem } from '../_marketing/MktFaq';

export const metadata: Metadata = {
  title: 'Pricing — ClaimBot',
  description: 'Free matching and review, plus simple monthly plans for hands-off filing. No percentage of your payout — ever.',
};

const plans = [
  {
    label: 'Scan Only', name: 'Free', price: '$0', period: '', featured: false,
    desc: 'See possible matches and file on your own.',
    features: ['Unlimited matching and review', `${FREE_MONTHLY_CLAIM_LIMIT} guarded filings per month`, 'Eligibility checker', 'Alerts for new matches'],
  },
  {
    label: 'Automatic', name: 'Plus', price: '$9', period: '/mo', featured: true,
    desc: 'Everything in Free, plus hands-off filing.',
    features: ['Everything in Free', 'Automatic guarded filing', 'Saved profile & reminders', 'Priority match alerts', 'Payout tracking dashboard'],
  },
  {
    label: 'Full Automation', name: 'Pro', price: '$19', period: '/mo', featured: false,
    desc: 'Everything in Plus, uncapped, with priority.',
    features: ['Everything in Plus', 'No monthly filing cap', 'Priority filing queue', 'Advanced payout tracking', 'Dedicated support'],
  },
];

const faqs: FaqItem[] = [
  { q: 'Do you take a cut of my payout?', a: 'No. ClaimBot charges a flat subscription for the automated filing service and never takes a percentage of your settlement payouts. Free users can browse matches and file on their own at no cost.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Cancel any time with no cancellation fees. You keep access through the end of your billing period, then revert to the Free plan.' },
  { q: 'What does “guarded filing” mean?', a: 'Every filing passes permission, proof, claim-form, and review checks before anything is submitted, and proof-required claims always stay manual. You approve each category ClaimBot may handle.' },
];

export default function PricingPage() {
  return (
    <MktShell>
      <section className="mkt-page-hero mkt-section">
        <h1>Simple, honest pricing.</h1>
        <p>Matching and review are always free. Paid plans add hands-off filing — never a cut of your payout.</p>
      </section>

      <section className="mkt-section" style={{ paddingTop: 24 }}>
        <div className="mkt-wrap">
          <div className="mkt-grid-3">
            {plans.map((p) => (
              <article className={`mkt-card mkt-price-card ${p.featured ? 'featured' : ''}`} key={p.name}>
                {p.featured && (
                  <span className="mkt-price-popular"><Sparkles size={14} aria-hidden="true" /> Most Popular</span>
                )}
                <span className="mkt-mono">{p.label}</span>
                <div className="mkt-price-amount"><strong>{p.price}</strong><span>{p.period}</span></div>
                <p className="mkt-price-desc">{p.desc}</p>
                <ul className="mkt-price-list">
                  {p.features.map((f) => (
                    <li key={f}><Check size={16} aria-hidden="true" />{f}</li>
                  ))}
                </ul>
                <Link className={`mkt-btn mkt-btn-full ${p.featured ? 'mkt-btn-purple' : 'mkt-btn-ghost'}`} href="/login?signup=1">
                  Get Started
                </Link>
              </article>
            ))}
          </div>

          <div className="mkt-wrap-narrow" style={{ marginTop: 64 }}>
            <h2 className="mkt-h2" style={{ textAlign: 'center', marginBottom: 32 }}>Pricing questions</h2>
            <MktFaq items={faqs} />
          </div>

          <div className="mkt-wrap-narrow" style={{ marginTop: 48 }}>
            <p className="mkt-price-desc" style={{ fontSize: 13, lineHeight: 1.7 }}>
              Paid plans buy software automation, not legal outcomes. ClaimBot should charge for guarded software automation, not a No payout percentage.
            </p>
            <p className="mkt-price-desc" style={{ fontSize: 13, lineHeight: 1.7, marginTop: 10 }}>
              Settlement administrators still control rules, deadlines, proof requirements, eligibility, and payment.
            </p>
            <p className="mkt-price-desc" style={{ fontSize: 13, lineHeight: 1.7, marginTop: 10 }}>
              Paid automation still keeps legal review: proof-required claims stay manual, and ClaimBot does not sell legal certainty.
            </p>
          </div>
        </div>
      </section>
    </MktShell>
  );
}
