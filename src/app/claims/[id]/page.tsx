import { db, schema } from '@db/client';
import { eq, desc, and } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUserId } from '@lib/auth/current-user';
import { runFileClaim } from '../../actions';
import LiveViewer from './LiveViewer';

export const dynamic = 'force-dynamic';

const FRIENDLY_STATUS: Record<string, { label: string; icon: string; color: string; desc: string }> = {
  QUEUED: { label: 'Waiting to be filed', icon: '⏳', color: 'var(--text-secondary)', desc: 'This claim is in the queue and will be filed automatically.' },
  PREFLIGHT: { label: 'Checking eligibility', icon: '🔍', color: 'var(--blue)', desc: 'We\'re verifying your eligibility one more time before filing.' },
  FILING: { label: 'Filing your claim', icon: '📝', color: 'var(--blue)', desc: 'We\'re filling out and submitting the claim form right now.' },
  FILED: { label: 'Claim submitted!', icon: '✅', color: 'var(--accent)', desc: 'Your claim has been submitted. You\'ll receive payment when the settlement pays out.' },
  FAILED: { label: 'Needs attention', icon: '⚠️', color: 'var(--warn)', desc: 'Something went wrong. You can retry or we\'ll try again automatically.' },
  ABORTED: { label: 'Could not file', icon: '❌', color: 'var(--bad)', desc: '' },
  PAID: { label: 'Payment received!', icon: '💰', color: 'var(--accent)', desc: 'You\'ve been paid for this claim.' },
};

// Translate technical abort reasons into plain English
const ABORT_EXPLANATIONS: Record<string, string> = {
  AUTHORIZATION_DISABLED: 'The category authorization for this type of settlement is turned off. Go to My Profile → Authorizations to enable it, then retry.',
  AUTHORIZATION_REVOKED: 'The category authorization was revoked. Go to My Profile → Authorizations to re-enable it, then retry.',
  AUTHORIZATION_NOT_FOUND: 'No authorization found for this settlement category. Go to My Profile → Authorizations to enable it, then retry.',
  CATEGORY_MISMATCH: 'The authorization category doesn\'t match this settlement. This usually fixes itself if you enable the correct category in My Profile → Authorizations.',
  DEADLINE_PASSED: 'The claim deadline has passed — this settlement is no longer accepting claims.',
  PROOF_REQUIRED: 'This settlement requires proof of purchase (receipts, etc.) which we can\'t auto-file yet.',
  NO_CLAIM_FORM_URL: 'We couldn\'t find a claim form for this settlement. It may not be available yet.',
  MATCHER_VERDICT_NOT_ELIGIBLE: 'After re-checking your profile, it looks like you may not qualify for this settlement anymore. Check that your purchases and profile info are up to date.',
  MATCHER_CONFIDENCE_TOO_LOW: 'We\'re not confident enough that you qualify. Add more details to your profile to improve the match.',
  RATE_LIMIT_EXCEEDED: 'Too many claims filed today. This claim will be filed tomorrow automatically.',
  CLAIM_NOT_FOUND: 'Claim record not found. This is unusual — try filing again.',
  CLAIM_NOT_QUEUED: 'This claim has already been processed.',
  SETTLEMENT_NOT_FOUND: 'Settlement record not found. This is unusual.',
  MATCH_NOT_FOUND: 'Match record not found. Try running the matcher again from the dashboard.',
};

function getAbortExplanation(error: string | null): string {
  if (!error) return 'An unknown error occurred.';
  for (const [key, explanation] of Object.entries(ABORT_EXPLANATIONS)) {
    if (error.includes(key)) return explanation;
  }
  return error;
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
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
  const status = FRIENDLY_STATUS[claim.status] ?? FRIENDLY_STATUS.QUEUED!;
  const isFailed = claim.status === 'FAILED' || claim.status === 'ABORTED';
  const canRetry = isFailed || claim.status === 'QUEUED';

  return (
    <>
      <p className="small">
        <Link href="/claims">← Back to my claims</Link>
      </p>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{settlement.caseName}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <span style={{ fontSize: 24 }}>{status.icon}</span>
            <span style={{ fontWeight: 700, color: status.color, fontSize: 16 }}>{status.label}</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>{status.desc}</p>
        </div>
        {settlement.payoutEstimate && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Estimated payout</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)' }}>{settlement.payoutEstimate}</div>
          </div>
        )}
      </div>

      {/* Error explanation for aborted/failed claims */}
      {isFailed && claim.lastError && (
        <div className="card" style={{
          borderColor: 'var(--bad)',
          background: 'var(--bad-bg)',
          marginBottom: 16,
        }}>
          <h3 style={{ color: 'var(--bad)', fontSize: 15, marginBottom: 6 }}>
            {claim.status === 'ABORTED' ? '❌ Why this claim couldn\'t be filed' : '⚠️ What went wrong'}
          </h3>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            {getAbortExplanation(claim.lastError)}
          </p>
          {canRetry && (
            <form action={runFileClaim} style={{ marginTop: 12 }}>
              <input type="hidden" name="claimId" value={claim.id} />
              <button className="btn" type="submit">🔄 Try again</button>
            </form>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Timeline</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 14 }}>📋</span>
            <span style={{ fontSize: 13 }}><b>Queued:</b> {fmtDate(claim.queuedAt)}</span>
          </div>
          {claim.filedAt && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 14 }}>✅</span>
              <span style={{ fontSize: 13 }}><b>Filed:</b> {fmtDate(claim.filedAt)}</span>
            </div>
          )}
          {claim.confirmationId && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 14 }}>🔖</span>
              <span style={{ fontSize: 13 }}><b>Confirmation #:</b> {claim.confirmationId}</span>
            </div>
          )}
          {claim.paidAt && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 14 }}>💰</span>
              <span style={{ fontSize: 13 }}><b>Paid:</b> {fmtDate(claim.paidAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Live viewer — lets users watch the bot fill and submit the form */}
      <LiveViewer claimId={claim.id} initialStatus={claim.status} />

      {/* Settlement link */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>Settlement details</h3>
            <p className="muted small">{settlement.classDefinition.slice(0, 200)}</p>
          </div>
          <Link href={`/settlements/${settlement.id}`} className="btn ghost sm">View settlement</Link>
        </div>
      </div>
    </>
  );
}
