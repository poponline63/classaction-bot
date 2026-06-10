// Public marketing homepage (DESIGN.md §6). Anonymous visitors to / land
// here; the signed-in dashboard stays at /. Marketing register, but every
// claim of capability stays inside the product's legal guardrails: possible
// matches, user approval, no guarantees.

import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  CheckCircle2,
  FileSearch,
  ListChecks,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';
import { count } from 'drizzle-orm';
import { db, schema } from '@db/client';
import { FREE_MONTHLY_CLAIM_LIMIT } from '@lib/billing/entitlements';
import IdentityTokenRedirect from './IdentityTokenRedirect';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'ClaimBot — Class action settlements you may qualify for',
  description:
    'Tell ClaimBot a few facts. It finds class action settlements you may qualify for and prepares the easy filings for your approval — free for your first claims every month.',
};

async function liveCounts() {
  try {
    const [settlements] = await db.select({ n: count() }).from(schema.settlements);
    const [claims] = await db.select({ n: count() }).from(schema.claims);
    return {
      settlements: settlements?.n ?? null,
      claims: claims?.n ?? null,
    };
  } catch {
    return { settlements: null, claims: null };
  }
}

const steps = [
  {
    icon: UserRoundCheck,
    title: 'Add a few facts',
    body: 'Name, contact, and the products or services you actually use. Two minutes, no documents required to start.',
  },
  {
    icon: FileSearch,
    title: 'See possible matches',
    body: 'ClaimBot compares your facts against open class action settlements and shows what you may qualify for — and why.',
  },
  {
    icon: ListChecks,
    title: 'Approve and track',
    body: 'You choose which claim types ClaimBot may handle. Approved filings are prepared and tracked from one place.',
  },
];

const trustCards = [
  {
    icon: LockKeyhole,
    title: 'Permission per claim type',
    body: 'ClaimBot never acts on a category you have not explicitly allowed. Revoke any permission at any time.',
  },
  {
    icon: ShieldCheck,
    title: 'Proof stays in your hands',
    body: 'Settlements that require receipts or documents always pause for your manual review. Nothing is invented on your behalf.',
  },
  {
    icon: ReceiptText,
    title: 'Every action receipted',
    body: 'Each step ClaimBot takes is written to your private audit log before it happens — review the full history any time.',
  },
];

export default async function WelcomePage() {
  const counts = await liveCounts();
  const settlementCount = counts.settlements != null && counts.settlements > 0
    ? counts.settlements.toLocaleString('en-US')
    : '250+';

  return (
    <div className="welcome-page">
      <IdentityTokenRedirect />
      <header className="welcome-nav" aria-label="ClaimBot">
        <Link className="welcome-brand" href="/welcome">
          <ShieldCheck aria-hidden="true" size={22} />
          <span>ClaimBot</span>
        </Link>
        <nav className="welcome-nav-links" aria-label="Public navigation">
          <Link href="/pricing">Pricing</Link>
          <Link href="/help">Help</Link>
          <Link className="welcome-nav-signin" href="/login">Sign in</Link>
        </nav>
      </header>

      <main>
        <section className="welcome-hero" aria-label="What ClaimBot does">
          <div className="welcome-hero-copy">
            <h1>Money from class actions you never knew you were part of.</h1>
            <p>
              Tell ClaimBot a few facts. It finds settlements you may qualify for and
              prepares the easy filings for your approval — free for your first
              {' '}{FREE_MONTHLY_CLAIM_LIMIT} claims every month.
            </p>
            <div className="welcome-hero-actions">
              <Link className="btn lg" href="/login?signup=1">
                Check what you qualify for
                <ArrowRight aria-hidden="true" size={18} />
              </Link>
              <a className="btn ghost lg" href="#how-it-works">How it works</a>
            </div>
            <span className="welcome-hero-footnote">
              Free to start. No card required. You approve every claim.
            </span>
          </div>

          <div className="welcome-hero-visual" aria-hidden="true">
            <div className="welcome-mock">
              <div className="welcome-mock-bar">
                <i /><i /><i />
              </div>
              <div className="welcome-mock-body">
                <div className="welcome-mock-row">
                  <strong>Possible matches</strong>
                  <span className="welcome-mock-chip good">3 ready to review</span>
                </div>
                <div className="welcome-mock-card">
                  <span>Wireless earbuds settlement</span>
                  <em>You may qualify · no proof needed</em>
                </div>
                <div className="welcome-mock-card">
                  <span>Data breach notice 2024</span>
                  <em>You may qualify · email matched</em>
                </div>
                <div className="welcome-mock-card muted">
                  <span>Grocery label settlement</span>
                  <em>Needs one receipt · stays manual</em>
                </div>
                <div className="welcome-mock-cta">Review matches</div>
              </div>
            </div>
          </div>
        </section>

        <section className="welcome-proof" aria-label="ClaimBot by the numbers">
          <div>
            <strong>{settlementCount}</strong>
            <span>Open settlements tracked and refreshed daily</span>
          </div>
          <div>
            <strong>{FREE_MONTHLY_CLAIM_LIMIT}/mo</strong>
            <span>Guarded filings included on the free plan</span>
          </div>
          <div>
            <strong>100%</strong>
            <span>Of filings reviewed against your approvals before anything moves</span>
          </div>
        </section>

        <section className="welcome-steps" id="how-it-works" aria-label="How ClaimBot works">
          <div className="welcome-section-head">
            <h2>Three steps. You stay in charge of all of them.</h2>
            <p>ClaimBot does the searching and the paperwork; every decision stays yours.</p>
          </div>
          <div className="welcome-steps-grid">
            {steps.map((step, index) => (
              <article className="welcome-step-card" key={step.title}>
                <span className="welcome-step-num" aria-hidden="true">{index + 1}</span>
                <step.icon aria-hidden="true" size={22} />
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="welcome-trust" aria-label="Safety boundaries">
          <div className="welcome-section-head">
            <h2>Nothing is filed without you.</h2>
            <p>
              ClaimBot is built around explicit permission, manual proof, and a full
              audit trail — not blind automation.
            </p>
          </div>
          <div className="welcome-trust-grid">
            {trustCards.map((card) => (
              <article className="welcome-trust-card" key={card.title}>
                <card.icon aria-hidden="true" size={20} />
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="welcome-pricing" aria-label="Pricing summary">
          <div className="welcome-section-head">
            <h2>Honest pricing, visible up front.</h2>
            <p>Matching and review are always free. Paid plans remove the monthly filing cap.</p>
          </div>
          <div className="welcome-pricing-grid">
            <article className="welcome-price-card">
              <span className="welcome-price-plan">Free</span>
              <strong>$0</strong>
              <ul>
                <li><CheckCircle2 aria-hidden="true" size={16} /> Unlimited matching and review</li>
                <li><CheckCircle2 aria-hidden="true" size={16} /> {FREE_MONTHLY_CLAIM_LIMIT} guarded filings per month</li>
                <li><CheckCircle2 aria-hidden="true" size={16} /> Full audit history</li>
              </ul>
              <Link className="btn ghost full" href="/login?signup=1">Start free</Link>
            </article>
            <article className="welcome-price-card featured">
              <span className="welcome-price-plan">Paid plans</span>
              <strong>From $29<small>/yr</small></strong>
              <ul>
                <li><CheckCircle2 aria-hidden="true" size={16} /> Everything in Free</li>
                <li><CheckCircle2 aria-hidden="true" size={16} /> No monthly filing cap</li>
                <li><CheckCircle2 aria-hidden="true" size={16} /> Saved profiles, reminders, prefill</li>
              </ul>
              <Link className="btn full" href="/pricing">Compare plans</Link>
            </article>
          </div>
        </section>

        <section className="welcome-final" aria-label="Get started">
          <h2>Find out what you may be owed.</h2>
          <p>It takes about two minutes to add your facts and see possible matches.</p>
          <Link className="btn lg" href="/login?signup=1">
            Check what you qualify for
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </section>
      </main>

      <footer className="welcome-footer" aria-label="Legal">
        <p>
          ClaimBot is not a law firm and does not provide legal advice. It does not
          guarantee eligibility, approval, payout amounts, or payout timing. Matches
          are possibilities based on facts you provide; settlement administrators
          make all final decisions. Proof-required claims always remain manual.
        </p>
        <nav aria-label="Legal pages">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy-policy">Privacy</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <span>© {new Date().getFullYear()} ClaimBot</span>
      </footer>
    </div>
  );
}
