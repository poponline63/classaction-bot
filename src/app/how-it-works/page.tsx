import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, ClipboardCheck, FileText, Lock, ScanSearch, Shield, UserCircle, Wallet } from 'lucide-react';
import MktShell from '../_marketing/MktShell';

export const metadata: Metadata = {
  title: 'How ClaimBot works — From facts to filed claims',
  description:
    'Add your facts, ClaimBot scans open class-action settlements for possible matches, you approve, and it prepares and tracks the filings. You stay in control of every step.',
};

const steps = [
  { n: '01', icon: UserCircle, title: 'Add your facts', body: 'Tell ClaimBot your name, email, and the products or services you’ve used. No documents needed to start — just a few quick details so it knows what to look for.' },
  { n: '02', icon: ScanSearch, title: 'AI scans open settlements', body: 'ClaimBot cross-references active class-action settlements against the facts you provided and surfaces the ones you may qualify for — and explains why.' },
  { n: '03', icon: ClipboardCheck, title: 'You approve matches', body: 'Review every possible match before anything moves forward. You decide which claims to pursue. Uncertain, expired, or proof-required claims stay in your review queue.' },
  { n: '04', icon: Wallet, title: 'It files & tracks payouts', body: 'For claims you approve, ClaimBot prepares and submits the filings, then tracks each one’s status so you always know where things stand.' },
];

const safety = [
  { icon: ClipboardCheck, title: 'You approve every claim', body: 'Nothing is filed without your explicit approval. ClaimBot prepares the paperwork; you give the green light.' },
  { icon: FileText, title: 'Proof-required claims stay manual', body: 'Settlements that require receipts, documents, or extra evidence always pause for your review. ClaimBot never fabricates proof on your behalf.' },
  { icon: Lock, title: 'Every action is logged', body: 'A complete, append-only record captures every step ClaimBot takes. Review the full history of your claims at any time.' },
];

export default function HowItWorksPage() {
  return (
    <MktShell>
      <section className="mkt-page-hero mkt-section">
        <h1>From facts to filed claims,<br /><span className="mkt-accent">on autopilot.</span></h1>
        <p>ClaimBot finds class-action settlements you may qualify for, prepares the filings, and tracks your payouts — while you stay in control of every step.</p>
        <Link className="mkt-btn mkt-btn-light" href="/login?signup=1" style={{ marginTop: 36 }}>
          Check what you qualify for
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
      </section>

      <section className="mkt-section" style={{ paddingTop: 24 }}>
        <div className="mkt-wrap">
          <span className="mkt-eyebrow">How It Works</span>
          <h2 className="mkt-h2" style={{ marginTop: 12 }}>Four steps. Zero surprises.</h2>
          <div className="mkt-grid-2">
            {steps.map((s) => (
              <article className="mkt-card mkt-step-card mkt-reveal" key={s.n}>
                <div className="mkt-step-head">
                  <span className="mkt-step-num">{s.n}</span>
                  <span className="mkt-icon-box"><s.icon size={24} aria-hidden="true" /></span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <div className="mkt-shot" aria-hidden="true">
                  <s.icon size={28} />
                  <span className="mkt-mono">Screenshot</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mkt-section" style={{ paddingTop: 24 }}>
        <div className="mkt-wrap">
          <span className="mkt-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Shield size={16} aria-hidden="true" /> Trust &amp; Safety
          </span>
          <h2 className="mkt-h2" style={{ marginTop: 12 }}>What keeps you safe</h2>
          <div className="mkt-grid-3">
            {safety.map((f) => (
              <article className="mkt-card mkt-trust-card mkt-reveal" key={f.title}>
                <span className="mkt-icon-box"><f.icon size={22} aria-hidden="true" /></span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mkt-cta-band">
        <h2>Find out what you may be owed.</h2>
        <p>It takes about two minutes to add your facts and see possible matches.</p>
        <Link className="mkt-btn mkt-btn-purple" href="/login?signup=1">
          Check what you qualify for
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
      </section>
    </MktShell>
  );
}
