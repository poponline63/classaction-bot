// Public marketing homepage — Kimi "Never Miss A Settlement" design ported
// into the live app. Standalone marketing chrome (MktShell); every capability
// claim stays inside the product's legal guardrails.

import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Check,
  FileCheck2,
  LinkIcon,
  ListChecks,
  ScanSearch,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { count } from 'drizzle-orm';
import { db, schema } from '@db/client';
import { FREE_MONTHLY_CLAIM_LIMIT } from '@lib/billing/entitlements';
import MktShell from '../_marketing/MktShell';
import MktFaq, { type FaqItem } from '../_marketing/MktFaq';
import IdentityTokenRedirect from './IdentityTokenRedirect';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'ClaimBot — Never miss a settlement',
  description:
    'Find and file class-action claims you didn’t know you had. ClaimBot scans open settlements against your facts and prepares the easy filings for your approval. Free to start.',
};

async function settlementCount(): Promise<string> {
  try {
    const [row] = await db.select({ n: count() }).from(schema.settlements);
    return row?.n && row.n > 0 ? row.n.toLocaleString('en-US') : 'thousands of';
  } catch {
    return 'thousands of';
  }
}

const features = [
  {
    icon: ScanSearch,
    title: 'Automatic Scan',
    body: 'We monitor open class-action settlements across federal and state courts. If your saved facts fit, we surface the possible match.',
  },
  {
    icon: FileCheck2,
    title: 'Zero-Proof Filing',
    body: 'Many smaller settlements need no receipts. For those, ClaimBot can prepare the claim from the facts you provide — you approve it.',
  },
  {
    icon: Wallet,
    title: 'Payout Tracking',
    body: 'Follow every filed claim from submission to status, all in one place. Proof-required claims always stay in your hands.',
  },
];

const steps = [
  { icon: LinkIcon, n: 1, title: 'Add Your Facts', body: 'Tell ClaimBot a few things about you and what you buy — two minutes, no documents to start.' },
  { icon: ScanSearch, n: 2, title: 'AI Scan', body: 'We cross-reference open settlements against your facts and show what you may qualify for, and why.' },
  { icon: FileCheck2, n: 3, title: 'Approve & File', body: 'You choose which claim types ClaimBot may handle. It prepares and files the ones you approve.' },
  { icon: ListChecks, n: 4, title: 'Track Payouts', body: 'Watch each claim move through the workflow. We keep a full record of every action taken.' },
];

const plans = [
  {
    label: 'Scan Only', name: 'Free', price: '$0', period: '',
    desc: 'See possible matches and file on your own.', featured: false,
    features: ['Unlimited matching and review', `${FREE_MONTHLY_CLAIM_LIMIT} guarded filings per month`, 'Eligibility checker', 'Alerts for new matches'],
  },
  {
    label: 'Automatic', name: 'Plus', price: '$9', period: '/mo',
    desc: 'Everything in Free, plus hands-off filing.', featured: true,
    features: ['Everything in Free', 'Automatic guarded filing', 'Saved profile & reminders', 'Priority match alerts', 'Payout tracking dashboard'],
  },
  {
    label: 'Full Automation', name: 'Pro', price: '$19', period: '/mo',
    desc: 'Everything in Plus, uncapped, with priority.', featured: false,
    features: ['Everything in Plus', 'No monthly filing cap', 'Priority filing queue', 'Advanced payout tracking', 'Dedicated support'],
  },
];

const faqs: FaqItem[] = [
  { q: 'Is my data safe with ClaimBot?', a: 'Your information is used only to find and prepare claims you approve, and it’s never sold. ClaimBot works from the facts you provide and keeps a private, append-only record of every action taken on your account.' },
  { q: 'How does ClaimBot make money?', a: 'A simple subscription for the automated filing service. We do NOT take a percentage of your settlement payouts. Free users can browse possible matches and file on their own at no cost.' },
  { q: 'What proof do I need to file a claim?', a: 'Many smaller settlements require no proof of purchase — just basic contact information. Settlements that do require receipts or documents always pause for your manual review; ClaimBot never invents proof on your behalf.' },
  { q: 'How long until I receive a payout?', a: 'Settlement checks are issued by the settlement administrators, not ClaimBot, and timing varies by case and court approval. ClaimBot tracks each claim’s status so you can follow it, but we can’t guarantee amounts or timing.' },
  { q: 'What if I don’t qualify for a settlement?', a: 'ClaimBot only surfaces possible matches based on the facts you save. If your facts don’t fit, it won’t show the settlement — you only review claims that look like a fit.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Cancel any time with no cancellation fees. You keep access through the end of your billing period, then revert to the Free plan.' },
];

export default async function WelcomePage() {
  const settlements = await settlementCount();

  return (
    <MktShell>
      <IdentityTokenRedirect />
      {/* Hero */}
      <section className="mkt-hero">
        <h1>Never Miss A Settlement</h1>
        <p className="mkt-hero-sub">
          Find and file claims you didn&rsquo;t know you had. Automated. Zero upfront cost.
        </p>
        <Link className="mkt-btn mkt-btn-light mkt-hero-cta" href="/login?signup=1">
          Check What You Qualify For
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
        <p className="mkt-hero-foot">Free to start. No card required. You approve every claim.</p>
        <div className="mkt-scroll" aria-hidden="true">
          <span className="mkt-mono">Scroll to enter</span>
          <span className="mkt-scroll-line" />
        </div>
      </section>

      {/* Features */}
      <section className="mkt-section">
        <div className="mkt-wrap">
          <span className="mkt-eyebrow">Settlement Velocity</span>
          <h2 className="mkt-h2" style={{ marginTop: 12 }}>{settlements} active settlements. One scan.</h2>
          <div className="mkt-grid-3">
            {features.map((f) => (
              <article className="mkt-card mkt-feature mkt-reveal" key={f.title}>
                <span className="mkt-feature-icon"><f.icon size={22} aria-hidden="true" /></span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mkt-section" id="how-it-works">
        <div className="mkt-wrap">
          <h2 className="mkt-h2" style={{ textAlign: 'center' }}>From facts to filed claims, on autopilot.</h2>
          <div className="mkt-grid-4">
            {steps.map((s) => (
              <div className="mkt-step mkt-reveal" key={s.n}>
                <span className="mkt-step-node"><s.icon size={24} aria-hidden="true" /></span>
                <span className="mkt-mono" style={{ color: 'var(--purple)' }}>Step {s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="mkt-section" id="pricing">
        <div className="mkt-wrap">
          <h2 className="mkt-h2" style={{ textAlign: 'center' }}>No hidden fees. Ever.</h2>
          <div className="mkt-grid-3">
            {plans.map((p) => (
              <article className={`mkt-card mkt-price-card mkt-reveal ${p.featured ? 'featured' : ''}`} key={p.name}>
                {p.featured && (
                  <span className="mkt-price-popular"><Sparkles size={14} aria-hidden="true" /> Most Popular</span>
                )}
                <span className="mkt-mono">{p.label}</span>
                <div className="mkt-price-amount"><strong>{p.price}</strong><span>{p.period}</span></div>
                <p className="mkt-price-desc">{p.desc}</p>
                <ul className="mkt-price-list">
                  {p.features.map((feat) => (
                    <li key={feat}><Check size={16} aria-hidden="true" />{feat}</li>
                  ))}
                </ul>
                <Link className={`mkt-btn mkt-btn-full ${p.featured ? 'mkt-btn-purple' : 'mkt-btn-ghost'}`} href="/login?signup=1">
                  Get Started
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mkt-section" id="faq">
        <div className="mkt-wrap-narrow">
          <h2 className="mkt-h2" style={{ textAlign: 'center', marginBottom: 40 }}>Frequently asked questions</h2>
          <MktFaq items={faqs} />
        </div>
      </section>
    </MktShell>
  );
}
