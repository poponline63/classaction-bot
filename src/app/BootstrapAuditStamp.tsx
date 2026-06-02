import { getBootstrapAuditStamp } from '@lib/bootstrap-audit-stamp';

type FilingMode = 'shadow' | 'live';

const globalBootstrapAudit = globalThis as typeof globalThis & {
  __claimbotBootstrapAuditDigest?: string;
};

export default function BootstrapAuditStamp({ filingMode }: { filingMode: FilingMode }) {
  const stamp = getBootstrapAuditStamp({ filingMode });
  const setupStatus = stamp.missingEnvKeys.length === 0
    ? 'Account checks complete'
    : `${stamp.missingEnvKeys.length} account check${stamp.missingEnvKeys.length === 1 ? '' : 's'} need attention`;
  const safetyStatus = stamp.shadowModeState === 'enforced'
    ? 'Safe review mode active'
    : 'Reviewed live mode';

  if (globalBootstrapAudit.__claimbotBootstrapAuditDigest !== stamp.digest) {
    globalBootstrapAudit.__claimbotBootstrapAuditDigest = stamp.digest;
    console.info(`[claimbot-bootstrap] ${stamp.summary}; digest=${stamp.digest}`);
  }

  return (
    <footer className={`bootstrap-audit-stamp ${stamp.shadowModeState}`} aria-label="Account safety status">
      <div>
        <span className="bootstrap-audit-kicker">Account safety</span>
        <strong>{safetyStatus}</strong>
        <p>
          {setupStatus}. Account access is {stamp.authGateState === 'active' ? 'active' : 'under review'}.
        </p>
      </div>
      <span
        className="bootstrap-audit-record"
        title="Non-secret account safety record. Detailed records stay in Account history and Packet Center."
      >
        Safety record saved
      </span>
    </footer>
  );
}
