import { db, schema } from '@db/client';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date | null | undefined) {
  if (!d) return '—';
  return d.toISOString().slice(0, 10);
}

export default async function SettlementDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const rows = await db
    .select()
    .from(schema.settlements)
    .where(eq(schema.settlements.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) notFound();

  return (
    <>
      <p className="small">
        <Link href="/settlements">&larr; Back to settlements</Link>
      </p>
      <h1>{row.caseName}</h1>

      <div className="card">
        <div className="meta">
          <span><b>Category:</b> {row.category}</span>
          <span><b>Status:</b> {row.status}</span>
          <span><b>Source:</b> {row.source}</span>
          <span><b>Administrator:</b> {row.administrator}</span>
          <span><b>CAPTCHA:</b> {row.captchaType}</span>
        </div>
      </div>

      <h2>Class definition</h2>
      <div className="card">
        <p>{row.classDefinition}</p>
      </div>

      <h2>Dates</h2>
      <div className="card">
        <div className="meta">
          <span><b>Class period:</b> {fmtDate(row.classPeriodStart)} → {fmtDate(row.classPeriodEnd)}</span>
          <span><b>Deadline:</b> {fmtDate(row.deadline)}</span>
          <span><b>Proof required:</b> {row.proofRequired ? 'yes' : 'no'}</span>
        </div>
      </div>

      <h2>Payout</h2>
      <div className="card">
        <div className="meta">
          <span><b>Estimate:</b> {row.payoutEstimate ?? '—'}</span>
          <span><b>Structure:</b> {row.payoutStructure ?? '—'}</span>
        </div>
      </div>

      <h2>Links</h2>
      <div className="card">
        <p>
          <b>Source:</b>{' '}
          <a href={row.sourceUrl} target="_blank" rel="noreferrer">
            {row.sourceUrl}
          </a>
        </p>
        {row.claimFormUrl ? (
          <p>
            <b>Claim form:</b>{' '}
            <a href={row.claimFormUrl} target="_blank" rel="noreferrer">
              {row.claimFormUrl}
            </a>
          </p>
        ) : null}
      </div>
    </>
  );
}
