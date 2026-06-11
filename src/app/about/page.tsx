import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, ClipboardCheck, FileText, Lock, ShieldCheck } from 'lucide-react';
import MktShell from '../_marketing/MktShell';

export const metadata: Metadata = {
  title: 'About ClaimBot — Class-action money, recovered',
  description:
    'Billions in class-action settlement money goes unclaimed every year. ClaimBot makes sure yours doesn’t — safely, with you in control of every claim.',
};

const values = [
  { icon: ClipboardCheck, title: 'You stay in control', body: 'ClaimBot prepares claims; you approve them. No category is ever handled without your explicit permission.' },
  { icon: FileText, title: 'Honesty over hype', body: 'We surface possible matches, not promises. Proof-required claims stay manual, and we never invent facts on your behalf.' },
  { icon: Lock, title: 'A record of everything', body: 'Every action is written to a private, append-only log before it happens, so you can always see exactly what was done.' },
  { icon: ShieldCheck, title: 'Safe by default', body: 'Claims move through permission, proof, and review checks before anything is filed. Caution is the default, not the exception.' },
];

export default function AboutPage() {
  return (
    <MktShell>
      <section className="mkt-page-hero mkt-section">
        <h1>Class-action money,<br /><span className="mkt-accent">recovered.</span></h1>
        <p>Billions of dollars in class-action settlements go unclaimed every year — simply because people never know they qualify. ClaimBot exists to change that.</p>
      </section>

      <section className="mkt-section" style={{ paddingTop: 24 }}>
        <div className="mkt-about-statement">
          <p>
            We built ClaimBot on a simple idea: finding and filing the claims you’re owed
            shouldn’t take legal expertise or hours of paperwork. Tell us a few facts, and
            ClaimBot does the searching and the forms — while you approve every step and keep
            the proof in your own hands.
          </p>
        </div>
      </section>

      <section className="mkt-section" style={{ paddingTop: 24 }}>
        <div className="mkt-wrap">
          <span className="mkt-eyebrow">What we stand for</span>
          <h2 className="mkt-h2" style={{ marginTop: 12 }}>How we keep you safe</h2>
          <div className="mkt-grid-2">
            {values.map((v) => (
              <article className="mkt-card mkt-trust-card mkt-reveal" key={v.title}>
                <span className="mkt-icon-box"><v.icon size={22} aria-hidden="true" /></span>
                <h3>{v.title}</h3>
                <p>{v.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mkt-cta-band">
        <h2>See what you may qualify for.</h2>
        <p>Free to start. No card required. You approve every claim.</p>
        <Link className="mkt-btn mkt-btn-purple" href="/login?signup=1">
          Get started
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
      </section>
    </MktShell>
  );
}
