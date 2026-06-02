import Link from 'next/link';

export default function AppFooter() {
  return (
    <footer className="site-footer" aria-label="Product support and legal links">
      <div className="footer-inner">
        <div>
          <strong>ClaimBot</strong>
          <p>
            Settlement discovery, review, and claim preparation with permission,
            proof review, account history, and shadow-mode safeguards.
          </p>
        </div>
        <nav aria-label="Support links">
          <Link href="/pricing">Pricing</Link>
          <Link href="/help">Help</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <nav aria-label="Legal links">
          <Link href="/privacy-policy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/status">Status</Link>
        </nav>
        <div className="footer-posture">
          <span className="mode-badge shadow">Shadow default</span>
          <span>Live filing requires explicit review and account checks.</span>
          <span>ClaimBot is not legal advice and does not guarantee eligibility or payment.</span>
        </div>
      </div>
    </footer>
  );
}
