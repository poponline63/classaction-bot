import Link from 'next/link';
import { db, schema } from '@db/client';
import { ensureSingleUser } from '@db/seed';
import { eq, gte, count } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  await ensureSingleUser();

  const now = new Date();

  const totalRows = await db
    .select({ n: count() })
    .from(schema.settlements);
  const total = totalRows[0]?.n ?? 0;

  const discoveredRows = await db
    .select({ n: count() })
    .from(schema.settlements)
    .where(eq(schema.settlements.status, 'DISCOVERED'));
  const discovered = discoveredRows[0]?.n ?? 0;

  const upcomingRows = await db
    .select({ n: count() })
    .from(schema.settlements)
    .where(gte(schema.settlements.deadline, now));
  const upcoming = upcomingRows[0]?.n ?? 0;

  return (
    <>
      <h1>Dashboard</h1>
      <p className="muted">Phase 1 — Discover</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
        <div className="card">
          <div className="muted small">Total settlements</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{total}</div>
        </div>
        <div className="card">
          <div className="muted small">Discovered (unreviewed)</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{discovered}</div>
        </div>
        <div className="card">
          <div className="muted small">Deadline not yet passed</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{upcoming}</div>
        </div>
      </div>

      <h2>Quick links</h2>
      <ul>
        <li><Link href="/settlements">Browse settlements</Link></li>
        <li><Link href="/settlements?proof=false">Auto-fileable (no proof required)</Link></li>
      </ul>

      <h2>Phase 1 verification</h2>
      <ol className="muted">
        <li>Run <code>npm run db:generate && npm run db:migrate</code> to create the DB.</li>
        <li>Run <code>npm run scrape:once</code> to do a one-shot scrape.</li>
        <li>Refresh this page — the counts should be non-zero.</li>
        <li>Start PM2 with <code>pm2 start ecosystem.config.cjs</code> and let the 03:15 cron run overnight.</li>
      </ol>
    </>
  );
}
