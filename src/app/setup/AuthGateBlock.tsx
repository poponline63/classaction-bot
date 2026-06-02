import Link from 'next/link';
import { LockKeyhole, ShieldCheck } from 'lucide-react';

// Guardrail marker: Hosted access setup required.
// Session-signing commands stay in Launch, Packet Center, Audit, or Settings.
export default function AuthGateBlock() {
  return (
    <>
      <div className="page-header setup-auth-gate-header">
        <div>
          <div className="eyebrow">Protected intake</div>
          <h1>Fact intake is not available yet.</h1>
          <p>
            ClaimBot needs protected sign-in before it can save profile facts, evidence records,
            permissions, or audit entries.
          </p>
        </div>
        <span className="tag warn">Action required</span>
      </div>

      <section className="setup-auth-gate" aria-label="Protected intake access">
        <div className="setup-auth-gate-icon" aria-hidden="true">
          <LockKeyhole size={22} />
        </div>
        <div className="setup-auth-gate-copy">
          <div className="eyebrow">Protected intake</div>
          <h2>Sign-in protection must be ready before customers can continue.</h2>
          <p>
            Fact intake stays closed until the hosted app can protect user sessions. This prevents
            profile intake from running in a half-configured workspace.
          </p>
          <div className="setup-auth-gate-grid">
            <div>
              <ShieldCheck aria-hidden="true" size={17} />
              <span>
                <strong>Profile creation halted</strong>
                <small>No hosted intake records are created until session signing is ready.</small>
              </span>
            </div>
            <div>
              <ShieldCheck aria-hidden="true" size={17} />
              <span>
                <strong>Shadow mode preserved</strong>
                <small>Fixing auth does not enable live filing or proof bypasses.</small>
              </span>
            </div>
            <div>
              <ShieldCheck aria-hidden="true" size={17} />
              <span>
                <strong>Audit boundary intact</strong>
                <small>Fact intake resumes only after protected access can be verified.</small>
              </span>
            </div>
          </div>
          <div className="setup-auth-secret-command">
            <strong>Protected account access required</strong>
            <p>
              Session-signing steps stay in account records so fact intake does not
              expose internal account steps to customers. The missing access-signing check is tracked in account status.
            </p>
          </div>
          <div className="page-actions">
            <Link className="btn" href="/launch">Open account status</Link>
            <Link className="btn ghost" href="/settings#launch-checklist">Review account settings</Link>
          </div>
        </div>
      </section>
    </>
  );
}
