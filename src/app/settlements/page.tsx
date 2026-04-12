import { db, schema } from '@db/client';
import { SETTLEMENT_CATEGORIES, type SettlementCategory, type SettlementStatus } from '@db/schema';
import { and, desc, eq, gte, type SQL } from 'drizzle-orm';
import Link from 'next/link';
import SearchBar from './SearchBar';

export const dynamic = 'force-dynamic';

interface SearchParams {
  category?: string;
  proof?: string;
  upcoming?: string;
  status?: string;
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return '—';
  return d.toISOString().slice(0, 10);
}

function daysUntil(d: Date | null | undefined) {
  if (!d) return null;
  const diff = Math.floor((d.getTime() - Date.now()) / 86_400_000);
  return diff;
}

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const where: SQL[] = [];
  if (searchParams.category && searchParams.category !== 'all') {
    where.push(eq(schema.settlements.category, searchParams.category as SettlementCategory));
  }
  if (searchParams.proof === 'false') {
    where.push(eq(schema.settlements.proofRequired, false));
  }
  if (searchParams.proof === 'true') {
    where.push(eq(schema.settlements.proofRequired, true));
  }
  if (searchParams.upcoming === 'true') {
    where.push(gte(schema.settlements.deadline, new Date()));
  }
  if (searchParams.status && searchParams.status !== 'all') {
    where.push(eq(schema.settlements.status, searchParams.status as SettlementStatus));
  }

  const rows = await db
    .select()
    .from(schema.settlements)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(schema.settlements.discoveredAt))
    .limit(200);

  return (
    <>
      <h1>Settlements</h1>
      <p className="muted small">{rows.length} results (max 200)</p>

      <SearchBar />

      <form className="filter-bar" method="get">
        <select name="category" defaultValue={searchParams.category ?? 'all'}>
          <option value="all">All categories</option>
          {SETTLEMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, ' ').toLowerCase()}
            </option>
          ))}
        </select>

        <select name="proof" defaultValue={searchParams.proof ?? 'any'}>
          <option value="any">Proof: any</option>
          <option value="false">No proof required</option>
          <option value="true">Proof required</option>
        </select>

        <select name="upcoming" defaultValue={searchParams.upcoming ?? 'any'}>
          <option value="any">Deadline: any</option>
          <option value="true">Deadline not passed</option>
        </select>

        <button type="submit">Apply</button>
      </form>

      {rows.length === 0 ? (
        <div className="empty">
          No settlements yet. Run <code>npm run scrape:once</code>.
        </div>
      ) : (
        rows.map((s) => {
          const dUntil = daysUntil(s.deadline);
          const deadlineClass =
            dUntil == null ? '' : dUntil < 0 ? 'bad' : dUntil < 7 ? 'warn' : 'good';
          return (
            <div key={s.id} className="card">
              <h3>
                <Link href={`/settlements/${s.id}`}>{s.caseName}</Link>
              </h3>
              <div className="small muted">
                <span className="tag">{s.category.toLowerCase().replace(/_/g, ' ')}</span>
                <span className="tag">{s.source}</span>
                {s.proofRequired ? (
                  <span className="tag warn">proof required</span>
                ) : (
                  <span className="tag good">no proof</span>
                )}
                <span className={`tag ${deadlineClass}`}>
                  deadline: {fmtDate(s.deadline)}
                  {dUntil != null ? ` (${dUntil}d)` : ''}
                </span>
              </div>
              <div className="meta">
                <span>Defendant: {s.defendant}</span>
                {s.payoutEstimate ? <span>Payout: {s.payoutEstimate}</span> : null}
                {s.administrator !== 'unknown' ? <span>Admin: {s.administrator}</span> : null}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
