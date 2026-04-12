import Link from 'next/link';
import { db, schema } from '@db/client';
import { ensureSingleUser } from '@db/seed';
import { eq, count, and, desc } from 'drizzle-orm';
import { getSetting } from '@lib/settings';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const userId = await ensureSingleUser();
  const setupDone = await getSetting('setup_completed');

  // Stats
  const totalSettlements = (await db.select({ n: count() }).from(schema.settlements))[0]?.n ?? 0;

  const eligibleMatches = (await db.select({ n: count() }).from(schema.matches)
    .where(and(eq(schema.matches.userId, userId), eq(schema.matches.verdict, 'ELIGIBLE'))))[0]?.n ?? 0;

  const filedClaims = (await db.select({ n: count() }).from(schema.claims)
    .where(and(eq(schema.claims.userId, userId), eq(schema.claims.status, 'FILED'))))[0]?.n ?? 0;

  const queuedClaims = (await db.select({ n: count() }).from(schema.claims)
    .where(and(eq(schema.claims.userId, userId), eq(schema.claims.status, 'QUEUED'))))[0]?.n ?? 0;

  const paidClaims = (await db.select({ n: count() }).from(schema.claims)
    .where(and(eq(schema.claims.userId, userId), eq(schema.claims.status, 'PAID'))))[0]?.n ?? 0;

  const purchases = (await db.select({ n: count() }).from(schema.purchases)
    .where(eq(schema.purchases.userId, userId)))[0]?.n ?? 0;

  const breaches = (await db.select({ n: count() }).from(schema.dataBreachExposure)
    .where(eq(schema.dataBreachExposure.userId, userId)))[0]?.n ?? 0;

  // Recent claims for activity feed
  const recentClaims = await db
    .select({ claim: schema.claims, settlement: schema.settlements })
    .from(schema.claims)
    .innerJoin(schema.settlements, eq(schema.claims.settlementId, schema.settlements.id))
    .where(eq(schema.claims.userId, userId))
    .orderBy(desc(schema.claims.queuedAt))
    .limit(5);

  const FRIENDLY_STATUS: Record<string, { label: string; icon: string }> = {
    QUEUED: { label: 'Waiting to file', icon: '⏳' },
    PREFLIGHT: { label: 'Checking...', icon: '🔍' },
    FILING: { label: 'Filing...', icon: '📝' },
    FILED: { label: 'Submitted', icon: '✅' },
    FAILED: { label: 'Needs attention', icon: '⚠️' },
    ABORTED: { label: 'Could not file', icon: '❌' },
    PAID: { label: 'Paid!', icon: '💰' },
  };

  return (
    <>
      {/* Setup Banner */}
      {!setupDone && (
        <Link href="/setup" style={{ display: 'block', textDecoration: 'none', marginBottom: 20 }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.12), rgba(96, 165, 250, 0.08))',
            border: '1px solid var(--accent-border)',
            borderRadius: 16, padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h3 style={{ color: 'var(--accent)', margin: 0 }}>Set up your profile to start claiming money</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '4px 0 0' }}>
                Takes 2 minutes — we'll automatically find and file claims for you
              </p>
            </div>
            <span className="btn">Get Started</span>
          </div>
        </Link>
      )}

      <h1>Dashboard</h1>
      <p className="subtitle">ClaimBot is working for you around the clock</p>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Settlements Scanned</div>
          <div className="stat-value">{totalSettlements}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">You Qualify For</div>
          <div className="stat-value green">{eligibleMatches}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Claims Filed For You</div>
          <div className="stat-value green">{filedClaims + queuedClaims}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Payments Received</div>
          <div className="stat-value green">{paidClaims}</div>
        </div>
      </div>

      {/* What ClaimBot is doing */}
      {(filedClaims > 0 || queuedClaims > 0) && (
        <>
          <h2>What ClaimBot did for you</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {queuedClaims > 0 && (
              <div className="action-card">
                <div className="action-icon">⏳</div>
                <div className="action-text">
                  <h4>{queuedClaims} claim{queuedClaims > 1 ? 's' : ''} in queue</h4>
                  <p>These will be filed automatically — no action needed from you</p>
                </div>
              </div>
            )}
            {filedClaims > 0 && (
              <div className="action-card">
                <div className="action-icon">✅</div>
                <div className="action-text">
                  <h4>{filedClaims} claim{filedClaims > 1 ? 's' : ''} filed for you</h4>
                  <p>Submitted and waiting for settlement payouts</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Recent activity */}
      {recentClaims.length > 0 && (
        <>
          <h2>Recent activity</h2>
          {recentClaims.map(({ claim, settlement }) => {
            const st = FRIENDLY_STATUS[claim.status] ?? FRIENDLY_STATUS.QUEUED!;
            return (
              <Link key={claim.id} href={`/claims/${claim.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card card-clickable" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20 }}>{st.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{settlement.caseName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{st.label}</div>
                  </div>
                  {settlement.payoutEstimate && (
                    <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>
                      {settlement.payoutEstimate}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </>
      )}

      {/* Empty state — no activity yet */}
      {recentClaims.length === 0 && setupDone && (
        <>
          <h2>Your claims</h2>
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            <h3>Scanning for eligible settlements...</h3>
            <p className="muted">ClaimBot checks for new settlements daily. When we find ones you qualify for, we'll automatically file claims for you.</p>
          </div>
        </>
      )}

      {/* How it works — only show if no activity yet */}
      {recentClaims.length === 0 && (
        <>
          <h2>How ClaimBot works</h2>
          <div className="how-it-works">
            <div className="how-step">
              <div className="icon">🔍</div>
              <h4>We scan daily</h4>
              <p>Every night we check for new class action settlements across the web</p>
            </div>
            <div className="how-step">
              <div className="icon">🎯</div>
              <h4>We match your profile</h4>
              <p>We cross-reference your purchases and breaches to find what you qualify for</p>
            </div>
            <div className="how-step">
              <div className="icon">💰</div>
              <h4>We file automatically</h4>
              <p>We fill out and submit the claim forms for you — you just wait for the check</p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
