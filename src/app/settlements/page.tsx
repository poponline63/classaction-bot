import { db, schema } from '@db/client';
import { SETTLEMENT_CATEGORIES, type SettlementCategory, type SettlementStatus } from '@db/schema';
import { and, desc, eq, gte, type SQL } from 'drizzle-orm';
import Link from 'next/link';
import { currentUserId } from '@lib/auth/current-user';
import { queueClaimFromMatch } from '../actions';
import SearchBar from './SearchBar';

export const dynamic = 'force-dynamic';

interface SearchParams {
  category?: string;
  proof?: string;
  upcoming?: string;
  status?: string;
  show?: string;
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(d: Date | null | undefined) {
  if (!d) return null;
  return Math.floor((d.getTime() - Date.now()) / 86_400_000);
}

function deadlineBadge(d: Date | null | undefined) {
  const days = daysUntil(d);
  if (days === null) return null;
  if (days < 0) return { text: 'Expired', cls: 'bad' };
  if (days < 7) return { text: `${days}d left`, cls: 'bad' };
  if (days < 30) return { text: `${days}d left`, cls: 'warn' };
  return { text: `${days}d left`, cls: 'green' };
}

const FRIENDLY_CATEGORIES: Record<string, string> = {
  CONSUMER_PRODUCT_PURCHASE: '🛍️ Product Purchase',
  SUBSCRIPTION_SERVICE: '📱 Subscription',
  DATA_BREACH: '🔓 Data Breach',
  ROBOCALL_TCPA: '📞 Unwanted Calls',
  DECEPTIVE_ADVERTISING: '📢 False Advertising',
  AUTO_DEFECT: '🚗 Vehicle Issue',
  EMPLOYMENT: '💼 Employment',
  UNKNOWN: '📋 Other',
};

export default async function SettlementsPage({ searchParams }: { searchParams: SearchParams }) {
  const userId = await currentUserId();
  // Default to "eligible" so users see what's relevant, not 200 random ones
  const showFilter = searchParams.show ?? 'eligible';

  const where: SQL[] = [];
  if (searchParams.category && searchParams.category !== 'all') {
    where.push(eq(schema.settlements.category, searchParams.category as SettlementCategory));
  }
  if (searchParams.proof === 'false') where.push(eq(schema.settlements.proofRequired, false));
  if (searchParams.proof === 'true') where.push(eq(schema.settlements.proofRequired, true));
  if (searchParams.upcoming === 'true') where.push(gte(schema.settlements.deadline, new Date()));

  const settlements = await db
    .select()
    .from(schema.settlements)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(schema.settlements.discoveredAt))
    .limit(200);

  // Load matches for this user to show eligibility inline
  const matches = await db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.userId, userId));
  const matchMap = new Map(matches.map(m => [m.settlementId, m]));

  // Load existing claims to know which are already filed
  const claims = await db
    .select()
    .from(schema.claims)
    .where(eq(schema.claims.userId, userId));
  const claimByMatch = new Map(claims.map(c => [c.matchId, c]));

  // Filter by eligibility
  let filtered = settlements;
  if (showFilter === 'eligible') {
    filtered = settlements.filter(s => matchMap.get(s.id)?.verdict === 'ELIGIBLE');
  } else if (showFilter === 'review') {
    filtered = settlements.filter(s => matchMap.get(s.id)?.verdict === 'NEEDS_REVIEW');
  }

  const eligibleCount = settlements.filter(s => matchMap.get(s.id)?.verdict === 'ELIGIBLE').length;
  const reviewCount = settlements.filter(s => matchMap.get(s.id)?.verdict === 'NEEDS_REVIEW').length;

  return (
    <>
      <h1>My Settlements</h1>
      <p className="subtitle">
        {settlements.length} settlements tracked — {eligibleCount} you qualify for
      </p>

      <SearchBar />

      {/* Eligibility filter tabs */}
      <div className="tabs">
        <Link href="/settlements?show=all" className={`tab ${showFilter === 'all' ? 'active' : ''}`}>
          All ({settlements.length})
        </Link>
        <Link href="/settlements?show=eligible" className={`tab ${showFilter === 'eligible' ? 'active' : ''}`}>
          ✓ You qualify ({eligibleCount})
        </Link>
        <Link href="/settlements?show=review" className={`tab ${showFilter === 'review' ? 'active' : ''}`}>
          ? Might qualify ({reviewCount})
        </Link>
      </div>

      {/* Category filter */}
      <form className="filter-bar" method="get">
        <input type="hidden" name="show" value={showFilter} />
        <select name="category" defaultValue={searchParams.category ?? 'all'}>
          <option value="all">All categories</option>
          {SETTLEMENT_CATEGORIES.map(c => (
            <option key={c} value={c}>{FRIENDLY_CATEGORIES[c] ?? c}</option>
          ))}
        </select>
        <select name="proof" defaultValue={searchParams.proof ?? 'any'}>
          <option value="any">Any proof status</option>
          <option value="false">No proof needed (easy)</option>
          <option value="true">Proof required</option>
        </select>
        <button type="submit">Filter</button>
      </form>

      {filtered.length === 0 ? (
        <div className="empty">
          <h3>No settlements match your filters</h3>
          <p>Try changing the filters above or <Link href="/setup">complete your profile</Link> to find more matches.</p>
        </div>
      ) : (
        filtered.map(s => {
          const match = matchMap.get(s.id);
          const claim = match ? claimByMatch.get(match.id) : null;
          const deadline = deadlineBadge(s.deadline);
          const canFile = match?.verdict === 'ELIGIBLE' && !s.proofRequired && !claim;

          return (
            <div key={s.id} className="card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <h3>
                    <Link href={`/settlements/${s.id}`}>{s.caseName}</Link>
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
                    {s.classDefinition.slice(0, 140)}...
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <span className="tag">{FRIENDLY_CATEGORIES[s.category] ?? s.category}</span>
                    {!s.proofRequired ? (
                      <span className="tag green">No proof needed</span>
                    ) : (
                      <span className="tag yellow">Proof required</span>
                    )}
                    {deadline && <span className={`tag ${deadline.cls}`}>{deadline.text}</span>}
                    {match?.verdict === 'ELIGIBLE' && (
                      <span className="tag green" style={{ fontWeight: 700 }}>✓ You qualify</span>
                    )}
                    {match?.verdict === 'NEEDS_REVIEW' && (
                      <span className="tag yellow">? Might qualify</span>
                    )}
                    {claim && (
                      <span className="tag blue">Claim filed</span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 100 }}>
                  {s.payoutEstimate && (
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>
                      {s.payoutEstimate}
                    </div>
                  )}
                  {canFile && (
                    <form action={queueClaimFromMatch} style={{ marginTop: 8 }}>
                      <input type="hidden" name="matchId" value={match!.id} />
                      <button className="btn sm" type="submit">File claim</button>
                    </form>
                  )}
                  {claim && (
                    <Link href={`/claims/${claim.id}`} className="btn sm ghost" style={{ marginTop: 8, display: 'inline-block' }}>
                      View claim
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
