import Link from 'next/link';
import { db, schema } from '@db/client';
import { ensureSingleUser } from '@db/seed';
import { eq, count, and } from 'drizzle-orm';
import { getSetting } from '@lib/settings';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const userId = await ensureSingleUser();
  const setupDone = await getSetting('setup_completed');

  // Stats
  const totalSettlements = (await db.select({ n: count() }).from(schema.settlements))[0]?.n ?? 0;

  const eligibleMatches = (await db.select({ n: count() }).from(schema.matches)
    .where(and(eq(schema.matches.userId, userId), eq(schema.matches.verdict, 'ELIGIBLE'))))[0]?.n ?? 0;

  const totalClaims = (await db.select({ n: count() }).from(schema.claims)
    .where(eq(schema.claims.userId, userId)))[0]?.n ?? 0;

  const filedClaims = (await db.select({ n: count() }).from(schema.claims)
    .where(and(eq(schema.claims.userId, userId), eq(schema.claims.status, 'FILED'))))[0]?.n ?? 0;

  const paidClaims = (await db.select({ n: count() }).from(schema.claims)
    .where(and(eq(schema.claims.userId, userId), eq(schema.claims.status, 'PAID'))))[0]?.n ?? 0;

  const purchases = (await db.select({ n: count() }).from(schema.purchases)
    .where(eq(schema.purchases.userId, userId)))[0]?.n ?? 0;

  const breaches = (await db.select({ n: count() }).from(schema.dataBreachExposure)
    .where(eq(schema.dataBreachExposure.userId, userId)))[0]?.n ?? 0;

  // Eligible but not yet filed
  const unfiled = eligibleMatches - totalClaims;

  return (
    <>
      {/* Setup Banner */}
      {!setupDone && (
        <Link href="/setup" style={{ display: 'block', textDecoration: 'none', marginBottom: 20 }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.1), rgba(96, 165, 250, 0.1))',
            border: '1px solid var(--accent-border)',
            borderRadius: 16, padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h3 style={{ color: 'var(--accent)', margin: 0 }}>Complete your setup to start earning</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '4px 0 0' }}>
                Tell us about your purchases and breaches so we can match you with settlements
              </p>
            </div>
            <span className="btn">Finish Setup</span>
          </div>
        </Link>
      )}

      <h1>Dashboard</h1>
      <p className="subtitle">Your class action claim tracker at a glance</p>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Settlements Found</div>
          <div className="stat-value">{totalSettlements}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">You Qualify For</div>
          <div className="stat-value green">{eligibleMatches}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Claims Filed</div>
          <div className="stat-value">{filedClaims}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Payments Received</div>
          <div className="stat-value green">{paidClaims}</div>
        </div>
      </div>

      {/* Action Items */}
      {unfiled > 0 && (
        <div>
          <h2>Action needed</h2>
          <Link href="/settlements" style={{ textDecoration: 'none' }}>
            <div className="action-card">
              <div className="action-icon">🎯</div>
              <div className="action-text">
                <h4>{unfiled} settlement{unfiled > 1 ? 's' : ''} ready to claim</h4>
                <p>You qualify — click to review and file your claims</p>
              </div>
              <span className="btn sm">View</span>
            </div>
          </Link>
        </div>
      )}

      {purchases === 0 && breaches === 0 && (
        <div>
          <h2>Get started</h2>
          <Link href="/setup" style={{ textDecoration: 'none' }}>
            <div className="action-card">
              <div className="action-icon">📝</div>
              <div className="action-text">
                <h4>Set up your profile</h4>
                <p>Add your purchases and data breaches to find settlements you qualify for</p>
              </div>
              <span className="btn sm">Start</span>
            </div>
          </Link>
        </div>
      )}

      {/* How It Works */}
      <h2>How it works</h2>
      <div className="how-it-works">
        <div className="how-step">
          <div className="icon">🔍</div>
          <h4>We scan for settlements</h4>
          <p>Every day we check for new class action settlements you could claim money from</p>
        </div>
        <div className="how-step">
          <div className="icon">🎯</div>
          <h4>We match your profile</h4>
          <p>Based on your purchases and data breaches, we find the ones you qualify for</p>
        </div>
        <div className="how-step">
          <div className="icon">💰</div>
          <h4>We file your claims</h4>
          <p>We auto-fill the claim forms with your info — you just review and confirm</p>
        </div>
      </div>

      {/* Profile Summary */}
      <h2>Your profile</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Link href="/profile" style={{ textDecoration: 'none' }}>
          <div className="card card-clickable">
            <div style={{ fontSize: 24, marginBottom: 6 }}>🛍️</div>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{purchases}</div>
            <div className="muted small">Purchases recorded</div>
          </div>
        </Link>
        <Link href="/profile" style={{ textDecoration: 'none' }}>
          <div className="card card-clickable">
            <div style={{ fontSize: 24, marginBottom: 6 }}>🔓</div>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{breaches}</div>
            <div className="muted small">Data breaches on file</div>
          </div>
        </Link>
        <Link href="/settlements" style={{ textDecoration: 'none' }}>
          <div className="card card-clickable">
            <div style={{ fontSize: 24, marginBottom: 6 }}>📋</div>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{totalSettlements}</div>
            <div className="muted small">Settlements tracked</div>
          </div>
        </Link>
      </div>
    </>
  );
}
