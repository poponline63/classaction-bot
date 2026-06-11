import type { Metadata } from 'next';
import { hasTemplatePlaceholder } from '@lib/bootstrap-audit-stamp';
import { LifeBuoy, Mail, ShieldCheck } from 'lucide-react';
import MktShell from '../_marketing/MktShell';

export const metadata: Metadata = {
  title: 'Contact ClaimBot — Support, safety, and privacy',
  description: 'Reach ClaimBot support, ask a question before signing up, or make a privacy request.',
};

function supportEmail() {
  const email = process.env.CLAIMBOT_SUPPORT_EMAIL?.trim();
  if (!email || hasTemplatePlaceholder(email)) return null;
  return email;
}

export default function ContactPage() {
  const email = supportEmail();

  return (
    <MktShell>
      <section className="mkt-page-hero mkt-section">
        <h1>Get in touch.</h1>
        <p>Questions before you sign up, help with your account, or a privacy request — we’re here.</p>
      </section>

      <section className="mkt-section" style={{ paddingTop: 24 }}>
        <div className="mkt-wrap">
          <div className="mkt-grid-3">
            <article className="mkt-card mkt-trust-card">
              <span className="mkt-icon-box"><Mail size={22} aria-hidden="true" /></span>
              <h3>Email support</h3>
              <p>
                {email
                  ? <>Reach a person at <a className="mkt-accent" href={`mailto:${email}`}>{email}</a>. We aim to reply within one business day.</>
                  : 'A monitored support mailbox is published on the live site. We aim to reply within one business day.'}
              </p>
            </article>

            <article className="mkt-card mkt-trust-card">
              <span className="mkt-icon-box"><LifeBuoy size={22} aria-hidden="true" /></span>
              <h3>Privacy request route</h3>
              <p>
                For profile data corrections, deletion/export requests, or other data-handling questions,
                use the privacy request form on our <a className="mkt-accent" href="/privacy-policy">Privacy Policy</a> page.
              </p>
            </article>

            <article className="mkt-card mkt-trust-card">
              <span className="mkt-icon-box"><ShieldCheck size={22} aria-hidden="true" /></span>
              <h3>Safety and privacy</h3>
              <p>
                ClaimBot keeps you in control. Settlement administrators and site operators make all final
                eligibility and payout decisions; ClaimBot only prepares the claims you approve.
              </p>
            </article>
          </div>

          <div className="mkt-cta-band" style={{ padding: '56px 0 0' }}>
            <h2 style={{ fontSize: 24 }}>Looking for answers first?</h2>
            <p>Most questions are covered in our FAQ.</p>
            <a className="mkt-btn mkt-btn-ghost" href="/faq">Read the FAQ</a>
          </div>
        </div>
      </section>
    </MktShell>
  );
}
