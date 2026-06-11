import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import MktShell from '../_marketing/MktShell';
import MktFaq, { type FaqItem } from '../_marketing/MktFaq';

export const metadata: Metadata = {
  title: 'ClaimBot FAQ — Safety, filing, and billing',
  description:
    'Answers about how ClaimBot keeps your data safe, how filing works, proof requirements, payouts, and billing.',
};

const safety: FaqItem[] = [
  { q: 'Is my data safe with ClaimBot?', a: 'Your information is used only to find and prepare claims you approve, and it’s never sold. ClaimBot works from the facts you provide and keeps a private, append-only record of every action taken on your account.' },
  { q: 'What if I don’t qualify for a settlement?', a: 'ClaimBot only surfaces possible matches based on the facts you save. If your facts don’t fit, it won’t show the settlement — you only review claims that look like a fit.' },
  { q: 'Does ClaimBot give legal advice?', a: 'No. ClaimBot is not a law firm and does not provide legal advice. It helps you find and file claims using your own facts; settlement administrators make all final eligibility and payout decisions.' },
];

const filing: FaqItem[] = [
  { q: 'What proof do I need to file a claim?', a: 'Many smaller settlements require no proof of purchase — just basic contact information. Settlements that do require receipts or documents always pause for your manual review; ClaimBot never invents proof on your behalf.' },
  { q: 'Do I approve claims before they’re filed?', a: 'Yes. Nothing is filed without your explicit approval, and you choose which claim categories ClaimBot may handle. You can revoke any permission at any time.' },
  { q: 'How long until I receive a payout?', a: 'Settlement checks are issued by the settlement administrators, not ClaimBot, and timing varies by case and court approval. ClaimBot tracks each claim’s status so you can follow it, but we can’t guarantee amounts or timing.' },
];

const billing: FaqItem[] = [
  { q: 'How does ClaimBot make money?', a: 'A simple subscription for the automated filing service. We do NOT take a percentage of your settlement payouts. Free users can browse possible matches and file on their own at no cost.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Cancel any time with no cancellation fees. You keep access through the end of your billing period, then revert to the Free plan.' },
];

function Group({ title, items }: { title: string; items: FaqItem[] }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <span className="mkt-eyebrow">{title}</span>
      <div style={{ marginTop: 16 }}><MktFaq items={items} /></div>
    </div>
  );
}

export default function FaqPage() {
  return (
    <MktShell>
      <section className="mkt-page-hero mkt-section">
        <h1>Questions, answered.</h1>
        <p>Everything you might want to know before you start. Still stuck? Reach out any time.</p>
      </section>

      <section className="mkt-section" style={{ paddingTop: 24 }}>
        <div className="mkt-wrap-narrow">
          <Group title="Safety &amp; Privacy" items={safety} />
          <Group title="How filing works" items={filing} />
          <Group title="Billing" items={billing} />

          <div className="mkt-cta-band" style={{ padding: '48px 0 0' }}>
            <h2 style={{ fontSize: 24 }}>Still have questions?</h2>
            <p>We’re happy to help before you sign up.</p>
            <Link className="mkt-btn mkt-btn-ghost" href="/contact">
              Contact us
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </MktShell>
  );
}
