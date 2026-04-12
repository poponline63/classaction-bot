import { db, schema } from '@db/client';
import type { ReasoningTrace } from '@lib/matcher/types';
import { and, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { currentUserId } from '@lib/auth/current-user';
import { triggerMatcher, queueClaimFromMatch } from '../actions';

export const dynamic = 'force-dynamic';

interface SearchParams {
  verdict?: string;
}

function fmtDate(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : '—';
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const userId = await currentUserId();

  const verdictFilter = searchParams.verdict ?? 'ELIGIBLE';

  const rows = await db
    .select({
      match: schema.matches,
      settlement: schema.settlements,
    })
    .from(schema.matches)
    .innerJoin(schema.settlements, eq(schema.matches.settlementId, schema.settlements.id))
    .where(
      verdictFilter === 'all'
        ? eq(schema.matches.userId, userId)
        : and(
            eq(schema.matches.userId, userId),
            eq(
              schema.matches.verdict,
              verdictFilter as 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_REVIEW',
            ),
          ),
    )
    .orderBy(desc(schema.matches.confidence), desc(schema.matches.updatedAt))
    .limit(200);

  // Totals for the tab bar
  const allRows = await db
    .select({ verdict: schema.matches.verdict })
    .from(schema.matches)
    .where(eq(schema.matches.userId, userId));
  const counts = { ELIGIBLE: 0, INELIGIBLE: 0, NEEDS_REVIEW: 0, all: allRows.length };
  for (const r of allRows) counts[r.verdict as keyof typeof counts]++;

  return (
    <>
      <h1>Review queue</h1>
      <p className="muted small">
        The matcher produces verdicts for every settlement. ELIGIBLE with an active
        authorization is what the filer sees. Strong NEEDS_REVIEW usually means the
        matcher has partial evidence — resolve by adding a purchase / breach / address.
      </p>

      <form action={triggerMatcher} className="inline-form" style={{ marginTop: 10 }}>
        <button className="btn" type="submit">
          Re-run matcher
        </button>
      </form>

      <div className="filter-bar">
        <Link
          className="tag"
          href="/review?verdict=ELIGIBLE"
          style={{ opacity: verdictFilter === 'ELIGIBLE' ? 1 : 0.5 }}
        >
          ELIGIBLE ({counts.ELIGIBLE})
        </Link>
        <Link
          className="tag"
          href="/review?verdict=NEEDS_REVIEW"
          style={{ opacity: verdictFilter === 'NEEDS_REVIEW' ? 1 : 0.5 }}
        >
          NEEDS REVIEW ({counts.NEEDS_REVIEW})
        </Link>
        <Link
          className="tag"
          href="/review?verdict=INELIGIBLE"
          style={{ opacity: verdictFilter === 'INELIGIBLE' ? 1 : 0.5 }}
        >
          INELIGIBLE ({counts.INELIGIBLE})
        </Link>
        <Link
          className="tag"
          href="/review?verdict=all"
          style={{ opacity: verdictFilter === 'all' ? 1 : 0.5 }}
        >
          all ({counts.all})
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          No matches yet. Set up your profile, purchases, and authorizations, then click{' '}
          <em>Re-run matcher</em>.
        </div>
      ) : (
        rows.map(({ match, settlement }) => {
          const trace = match.reasoningJson as ReasoningTrace | null;
          return (
            <div key={match.id} className="card">
              <h3>
                <Link href={`/settlements/${settlement.id}`}>{settlement.caseName}</Link>{' '}
                <span className={`tag verdict-${match.verdict}`}>
                  {match.verdict} ({match.confidence.toFixed(2)})
                </span>
              </h3>
              <div className="small muted">
                <span className="tag">{settlement.category.toLowerCase().replace(/_/g, ' ')}</span>
                {settlement.proofRequired ? (
                  <span className="tag warn">proof required</span>
                ) : (
                  <span className="tag good">no proof</span>
                )}
                <span className="tag">deadline: {fmtDate(settlement.deadline)}</span>
              </div>
              {trace?.evidence && trace.evidence.length > 0 ? (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  {trace.evidence.map((e, i) => (
                    <div key={i} style={{ marginTop: 4 }}>
                      <span
                        className={`tag verdict-${e.verdict}`}
                        style={{ fontSize: 10 }}
                      >
                        {e.ruleName} · {e.verdict} · {e.confidence.toFixed(2)}
                      </span>{' '}
                      <span className="muted">{e.reason}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {match.verdict === 'ELIGIBLE' && !settlement.proofRequired ? (
                <form action={queueClaimFromMatch} className="inline-form" style={{ marginTop: 10 }}>
                  <input type="hidden" name="matchId" value={match.id} />
                  <button className="btn" type="submit">
                    File this claim
                  </button>
                </form>
              ) : null}
            </div>
          );
        })
      )}
    </>
  );
}
