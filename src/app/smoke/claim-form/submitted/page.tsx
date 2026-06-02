import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ClaimBot Worker Smoke Submitted',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SmokeClaimSubmittedPage() {
  return (
    <main className="smoke-claim-form-page">
      <section className="smoke-claim-form-shell">
        <div className="smoke-claim-form-kicker">Worker smoke fixture</div>
        <h1>Smoke Claim Submitted</h1>
        <p>
          Confirmation number: CLAIMBOT-SMOKE-123456. This page exists so live-mode
          fixture checks have a deterministic confirmation target, but launch worker
          proof should run in shadow mode.
        </p>
      </section>
    </main>
  );
}
