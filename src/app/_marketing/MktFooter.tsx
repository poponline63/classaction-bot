import Link from 'next/link';
import { Shield } from 'lucide-react';

const links = [
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Pricing', href: '/welcome#pricing' },
  { label: 'FAQ', href: '/faq' },
  { label: 'About', href: '/about' },
  { label: 'Privacy', href: '/privacy-policy' },
  { label: 'Terms', href: '/terms' },
];

export default function MktFooter() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-footer-inner">
        <div className="mkt-footer-top">
          <div className="mkt-footer-brand">
            <Shield size={20} aria-hidden="true" />
            <div>
              <strong>ClaimBot</strong>
              <p>Automated class-action recovery</p>
            </div>
          </div>
          <nav className="mkt-footer-nav" aria-label="Footer">
            {links.map((l) => (
              <Link key={l.href} href={l.href}>{l.label}</Link>
            ))}
          </nav>
          <span className="mkt-footer-copy">© {new Date().getFullYear()} ClaimBot</span>
        </div>
        <div className="mkt-footer-legal">
          <p>
            ClaimBot is not a law firm and does not provide legal advice. It does not guarantee
            eligibility, approval, payout amounts, or payout timing. Matches are possibilities based
            on facts you provide; settlement administrators make all final decisions. Proof-required
            claims always remain manual.
          </p>
        </div>
      </div>
    </footer>
  );
}
