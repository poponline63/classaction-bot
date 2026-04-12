import { db, schema } from '@db/client';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { currentUserId } from '@lib/auth/current-user';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 16).replace('T', ' ') : '—';
}

const STATUS_TAG: Record<string, string> = {
  QUEUED: '',
  PREFLIGHT: '',
  FILING: '',
  FILED: 'good',
  FAILED: 'bad',
  ABORTED: 'warn',
  PAID: 'good',
};

export default async function ClaimsPage() {
  const userId = await currentUserId();
  const rows = await db
    .select({
      claim: schema.claims,
      settlement: schema.settlements,
    })
    .from(schema.claims)
    .innerJoin(schema.settlements, eq(schema.claims.settlementId, schema.settlements.id))
    .where(eq(schema.claims.userId, userId))
    .orderBy(desc(schema.claims.queuedAt));

  return (
    <>
      <h1>Claims</h1>
      <p className="muted small">
        Mode: <code>{process.env.CLAIM_FILER_MODE ?? 'shadow'}</code>. Shadow mode fills
        forms but stops before clicking submit. Flip to <code>live</code> only after
        verifying shadow runs per administrator.
      </p>

      {rows.length === 0 ? (
        <div className="empty">
          No claims yet. Enable an authorization, find an ELIGIBLE match on{' '}
          <Link href="/review">/review</Link>, and click <em>File this claim</em>.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Queued</th>
              <th>Case</th>
              <th>Status</th>
              <th>Filed</th>
              <th>Confirmation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ claim, settlement }) => (
              <tr key={claim.id}>
                <td>{fmtDate(claim.queuedAt)}</td>
                <td>
                  <Link href={`/claims/${claim.id}`}>{settlement.caseName}</Link>
                </td>
                <td>
                  <span className={`tag ${STATUS_TAG[claim.status] ?? ''}`}>
                    {claim.status}
                  </span>
                </td>
                <td>{fmtDate(claim.filedAt)}</td>
                <td className="small muted">{claim.confirmationId ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
