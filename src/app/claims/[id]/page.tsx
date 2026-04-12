import { db, schema } from '@db/client';
import { eq, desc, and } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUserId } from '@lib/auth/current-user';
import { runFileClaim } from '../../actions';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date | null | undefined) {
  return d ? d.toISOString() : '—';
}

export default async function ClaimDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const userId = await currentUserId();
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const rows = await db
    .select({
      claim: schema.claims,
      settlement: schema.settlements,
      match: schema.matches,
      auth: schema.classAuthorizations,
    })
    .from(schema.claims)
    .innerJoin(schema.settlements, eq(schema.claims.settlementId, schema.settlements.id))
    .innerJoin(schema.matches, eq(schema.claims.matchId, schema.matches.id))
    .innerJoin(
      schema.classAuthorizations,
      eq(schema.claims.classAuthorizationId, schema.classAuthorizations.id),
    )
    .where(and(eq(schema.claims.id, id), eq(schema.claims.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) notFound();

  const { claim, settlement, match, auth } = row;

  const audit = await db
    .select()
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.entityType, 'claim'),
        eq(schema.auditLog.entityId, claim.id),
      ),
    )
    .orderBy(desc(schema.auditLog.occurredAt));

  return (
    <>
      <p className="small">
        <Link href="/claims">&larr; Back to claims</Link>
      </p>
      <h1>
        Claim #{claim.id}{' '}
        <span className={`tag ${
          claim.status === 'FILED' ? 'good' : claim.status === 'FAILED' || claim.status === 'ABORTED' ? 'bad' : ''
        }`}>
          {claim.status}
        </span>
      </h1>
      <p className="muted small">{settlement.caseName}</p>

      <div className="card">
        <div className="meta">
          <span><b>Queued:</b> {fmtDate(claim.queuedAt)}</span>
          <span><b>Filed:</b> {fmtDate(claim.filedAt)}</span>
          <span><b>Confirmation:</b> {claim.confirmationId ?? '—'}</span>
          <span><b>Retries:</b> {claim.retryCount}</span>
        </div>
      </div>

      <h2>Authorization used</h2>
      <div className="card">
        <div className="meta">
          <span><b>Category:</b> {auth.category}</span>
          <span><b>Version:</b> {auth.attestationVersion}</span>
          <span><b>Enabled:</b> {auth.enabled ? 'yes' : 'no'}</span>
          <span><b>Authorized at:</b> {fmtDate(auth.authorizedAt)}</span>
        </div>
        <p style={{ fontSize: 12, marginTop: 8 }} className="muted">
          {auth.attestationText}
        </p>
      </div>

      <h2>Submitted attestation (verbatim from DOM)</h2>
      <div className="card">
        {claim.submittedAttestationText ? (
          <p style={{ fontSize: 13 }}>{claim.submittedAttestationText}</p>
        ) : (
          <p className="muted small">No attestation captured yet — claim has not reached the attestation step.</p>
        )}
      </div>

      <h2>Screenshots</h2>
      <div className="card small">
        <p>Empty form: <code>{claim.screenshotEmptyFormPath ?? '—'}</code></p>
        <p>Filled form: <code>{claim.screenshotFilledFormPath ?? '—'}</code></p>
        <p>Confirmation: <code>{claim.screenshotConfirmationPath ?? '—'}</code></p>
      </div>

      {claim.lastError ? (
        <>
          <h2>Last error</h2>
          <div className="card">
            <p className="small" style={{ color: 'var(--bad)' }}>{claim.lastError}</p>
          </div>
        </>
      ) : null}

      <h2>Match reasoning</h2>
      <div className="card small">
        <p>Verdict at queue time: <span className={`tag verdict-${match.verdict}`}>{match.verdict} ({match.confidence.toFixed(2)})</span></p>
      </div>

      <h2>Audit trail</h2>
      <div className="card small">
        {audit.length === 0 ? (
          <p className="muted">No events.</p>
        ) : (
          <ul>
            {audit.map((a) => (
              <li key={a.id}>
                <code>{a.occurredAt.toISOString()}</code> — <b>{a.eventType}</b>{' '}
                <span className="muted">by {a.actor}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(claim.status === 'QUEUED' ||
        claim.status === 'PREFLIGHT' ||
        claim.status === 'FAILED' ||
        claim.status === 'ABORTED') ? (
        <form action={runFileClaim} style={{ marginTop: 16 }}>
          <input type="hidden" name="claimId" value={claim.id} />
          <button className="btn" type="submit">
            Run filer now
          </button>
        </form>
      ) : null}
    </>
  );
}
