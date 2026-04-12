import { db, schema } from '@db/client';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { currentUserId } from '@lib/auth/current-user';

export const dynamic = 'force-dynamic';

const FRIENDLY_STATUS: Record<string, { label: string; icon: string; color: string }> = {
  QUEUED: { label: 'Waiting to be filed', icon: '⏳', color: 'var(--text-secondary)' },
  PREFLIGHT: { label: 'Checking eligibility...', icon: '🔍', color: 'var(--blue)' },
  FILING: { label: 'Filing your claim...', icon: '📝', color: 'var(--blue)' },
  FILED: { label: 'Claim submitted!', icon: '✅', color: 'var(--accent)' },
  FAILED: { label: 'Needs attention', icon: '⚠️', color: 'var(--warn)' },
  ABORTED: { label: 'Could not file', icon: '❌', color: 'var(--bad)' },
  PAID: { label: 'Payment received!', icon: '💰', color: 'var(--accent)' },
};

const STATUS_ORDER = ['QUEUED', 'PREFLIGHT', 'FILING', 'FILED', 'PAID'];

function getStepIndex(status: string) {
  if (status === 'FAILED' || status === 'ABORTED') return 2;
  const i = STATUS_ORDER.indexOf(status);
  return i >= 0 ? i : 0;
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function ClaimsPage() {
  const userId = await currentUserId();
  const rows = await db
    .select({ claim: schema.claims, settlement: schema.settlements })
    .from(schema.claims)
    .innerJoin(schema.settlements, eq(schema.claims.settlementId, schema.settlements.id))
    .where(eq(schema.claims.userId, userId))
    .orderBy(desc(schema.claims.queuedAt));

  return (
    <>
      <h1>My Claims</h1>
      <p className="subtitle">Track the status of your filed class action claims</p>

      {rows.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <h3>No claims yet</h3>
          <p>Go to <Link href="/settlements">My Settlements</Link> to find ones you qualify for and file a claim.</p>
        </div>
      ) : (
        rows.map(({ claim, settlement }) => {
          const status = FRIENDLY_STATUS[claim.status] ?? FRIENDLY_STATUS.QUEUED!;
          const stepIdx = getStepIndex(claim.status);
          const isFailed = claim.status === 'FAILED' || claim.status === 'ABORTED';

          return (
            <Link key={claim.id} href={`/claims/${claim.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card card-clickable">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <h3>{settlement.caseName}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 18 }}>{status.icon}</span>
                      <span style={{ fontWeight: 600, color: status.color, fontSize: 14 }}>
                        {status.label}
                      </span>
                    </div>
                    {claim.confirmationId && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        Confirmation: {claim.confirmationId}
                      </div>
                    )}
                    {isFailed && claim.lastError && (
                      <div style={{ fontSize: 12, color: 'var(--bad)', marginTop: 4 }}>
                        {claim.lastError.slice(0, 100)}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {settlement.payoutEstimate && (
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                        {settlement.payoutEstimate}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {fmtDate(claim.filedAt) ?? fmtDate(claim.queuedAt) ?? ''}
                    </div>
                  </div>
                </div>

                {/* Progress steps */}
                <div className="status-steps" style={{ marginTop: 12 }}>
                  {['Queued', 'Checking', 'Filing', 'Submitted', 'Paid'].map((label, i) => (
                    <div
                      key={label}
                      className={`status-step ${
                        i < stepIdx ? 'done' :
                        i === stepIdx ? (isFailed ? 'failed' : 'active') :
                        ''
                      }`}
                    >
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </Link>
          );
        })
      )}
    </>
  );
}
