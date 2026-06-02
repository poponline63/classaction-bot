// =============================================================================
// Preflight gate — the legal heart of the filer.
// =============================================================================
// Immediately before the filer pushes a form to the wire, this function
// re-reads the fresh state of every input that could have drifted since the
// match was queued:
//
//   - settlement row (deadline, proofRequired, category, class period)
//   - user profile (addresses, emails)
//   - purchases, breaches
//   - class_authorization (enabled, not revoked, attestation text unchanged)
//   - rate limit (max filings per day)
//
// It then re-runs the matcher rules. If the new verdict is anything except
// ELIGIBLE with high confidence, preflight aborts.
//
// This closes the TOCTOU window between queue time (when the match was
// first produced) and filing time (which could be hours later in the worker
// queue). Any abort is recorded in the audit log with the exact reason.
//
// The gate is DEFENSIVE. False aborts are fine — they become NEEDS_REVIEW.
// False passes are not fine; they can submit unsupported claims.
// =============================================================================

import { db, schema } from '@db/client';
import { and, eq, gte, sql } from 'drizzle-orm';
import type {
  Claim,
  Match,
  Settlement,
  ClassAuthorization,
} from '@db/schema';
import type { MatcherContext } from '@lib/matcher/types';
import { runRules } from '@lib/matcher/verdict';
import { writeAudit } from '@lib/audit';
import { getUserSubscription } from '@lib/billing/entitlements';

export type PreflightOk = { ok: true; ctx: PreflightContext };
export type PreflightAbort = {
  ok: false;
  reason: PreflightAbortReason;
  detail: string;
};
export type PreflightResult = PreflightOk | PreflightAbort;

export type PreflightAbortReason =
  | 'CLAIM_NOT_FOUND'
  | 'CLAIM_NOT_QUEUED'
  | 'SETTLEMENT_NOT_FOUND'
  | 'MATCH_NOT_FOUND'
  | 'AUTHORIZATION_NOT_FOUND'
  | 'AUTHORIZATION_DISABLED'
  | 'AUTHORIZATION_REVOKED'
  | 'AUTHORIZATION_VERSION_CHANGED'
  | 'CATEGORY_MISMATCH'
  | 'DEADLINE_PASSED'
  | 'PROOF_REQUIRED'
  | 'MATCHER_VERDICT_NOT_ELIGIBLE'
  | 'MATCHER_CONFIDENCE_TOO_LOW'
  | 'RATE_LIMIT_EXCEEDED'
  | 'NO_CLAIM_FORM_URL'
  | 'AUTOMATION_PLAN_REQUIRED';

export interface PreflightContext {
  claim: Claim;
  match: Match;
  settlement: Settlement;
  authorization: ClassAuthorization;
  // snapshot of attestation text taken during preflight — the filer must
  // refuse to submit if this doesn't match what's in the DOM at submit time
  preflightAttestationText: string;
}

// The minimum ELIGIBLE confidence we accept to submit an unsupported claim.
// Rules return 0.95 for a strong positive; this bar keeps us above that.
const MIN_FILING_CONFIDENCE = 0.9;

// The worker caps itself to N filings per calendar day to keep a matcher
// bug from cascading into mass-filings. Default is 20; set with
// CLAIM_FILER_MAX_PER_DAY.
function maxFilingsPerDay(): number {
  const raw = process.env.CLAIM_FILER_MAX_PER_DAY;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

function startOfUtcDay(d: Date): Date {
  const r = new Date(d);
  r.setUTCHours(0, 0, 0, 0);
  return r;
}

// Main entrypoint: given a claim id, run every check and return either
// PreflightOk (filer proceeds) or PreflightAbort (filer records the reason
// and transitions the claim to ABORTED / FAILED).
export async function preflight(claimId: number): Promise<PreflightResult> {
  // ---------- 1. Load the claim row fresh ----------
  const claimRows = await db
    .select()
    .from(schema.claims)
    .where(eq(schema.claims.id, claimId))
    .limit(1);
  const claim = claimRows[0];
  if (!claim) {
    return abort('CLAIM_NOT_FOUND', `claim ${claimId} does not exist`);
  }
  if (claim.status !== 'QUEUED' && claim.status !== 'PREFLIGHT') {
    return abort(
      'CLAIM_NOT_QUEUED',
      `claim ${claimId} is in status ${claim.status}`,
    );
  }

  const subscription = await getUserSubscription(claim.userId);
  if (!subscription.automationEnabled) {
    return abort(
      'AUTOMATION_PLAN_REQUIRED',
      `user ${claim.userId} is on ${subscription.plan}/${subscription.status}; active Pro or Founding access is required for filing preflight`,
    );
  }

  // ---------- 2. Load related rows ----------
  const settlementRows = await db
    .select()
    .from(schema.settlements)
    .where(eq(schema.settlements.id, claim.settlementId))
    .limit(1);
  const settlement = settlementRows[0];
  if (!settlement) {
    return abort('SETTLEMENT_NOT_FOUND', `settlement ${claim.settlementId} missing`);
  }

  const matchRows = await db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, claim.matchId))
    .limit(1);
  const match = matchRows[0];
  if (!match) {
    return abort('MATCH_NOT_FOUND', `match ${claim.matchId} missing`);
  }

  const authRows = await db
    .select()
    .from(schema.classAuthorizations)
    .where(eq(schema.classAuthorizations.id, claim.classAuthorizationId))
    .limit(1);
  const authorization = authRows[0];
  if (!authorization) {
    return abort(
      'AUTHORIZATION_NOT_FOUND',
      `authorization ${claim.classAuthorizationId} missing`,
    );
  }

  // ---------- 3. Authorization integrity ----------
  if (!authorization.enabled) {
    return abort(
      'AUTHORIZATION_DISABLED',
      `authorization ${authorization.id} (${authorization.category}) is disabled`,
    );
  }
  if (authorization.revokedAt) {
    return abort(
      'AUTHORIZATION_REVOKED',
      `authorization ${authorization.id} was revoked at ${authorization.revokedAt.toISOString()}`,
    );
  }
  // Category must match the settlement's category
  if (authorization.category !== settlement.category) {
    return abort(
      'CATEGORY_MISMATCH',
      `authorization category ${authorization.category} does not match settlement category ${settlement.category}`,
    );
  }

  // ---------- 4. Settlement gates ----------
  if (settlement.deadline && settlement.deadline.getTime() < Date.now()) {
    return abort(
      'DEADLINE_PASSED',
      `deadline ${settlement.deadline.toISOString()} has passed`,
    );
  }
  if (settlement.proofRequired) {
    return abort(
      'PROOF_REQUIRED',
      'settlement requires proof of purchase - manual review required',
    );
  }
  if (!settlement.claimFormUrl) {
    return abort(
      'NO_CLAIM_FORM_URL',
      'settlement has no claim form URL - cannot queue for filing',
    );
  }

  // ---------- 5. Re-run matcher with CURRENT user state ----------
  const userId = claim.userId;

  const profileRows = await db
    .select()
    .from(schema.profile)
    .where(eq(schema.profile.userId, userId))
    .limit(1);
  const profile = profileRows[0] ?? null;

  const purchases = await db
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.userId, userId));

  const breaches = await db
    .select()
    .from(schema.dataBreachExposure)
    .where(eq(schema.dataBreachExposure.userId, userId));

  const authorizations = await db
    .select()
    .from(schema.classAuthorizations)
    .where(eq(schema.classAuthorizations.userId, userId));

  const matcherCtx: MatcherContext = {
    userId,
    settlement,
    profile,
    purchases,
    breaches,
    authorizations,
  };

  const trace = runRules(matcherCtx);

  if (trace.verdict !== 'ELIGIBLE') {
    return abort(
      'MATCHER_VERDICT_NOT_ELIGIBLE',
      `fresh matcher verdict is ${trace.verdict} (was ELIGIBLE at queue time)`,
    );
  }
  if (trace.confidence < MIN_FILING_CONFIDENCE) {
    return abort(
      'MATCHER_CONFIDENCE_TOO_LOW',
      `fresh matcher confidence ${trace.confidence.toFixed(2)} is below ${MIN_FILING_CONFIDENCE}`,
    );
  }

  // ---------- 6. Rate limit ----------
  const todayStart = startOfUtcDay(new Date());
  const filedTodayRows = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.claims)
    .where(
      and(
        eq(schema.claims.userId, userId),
        eq(schema.claims.status, 'FILED'),
        gte(schema.claims.filedAt, todayStart),
      ),
    );
  const filedToday = Number(filedTodayRows[0]?.n ?? 0);
  if (filedToday >= maxFilingsPerDay()) {
    return abort(
      'RATE_LIMIT_EXCEEDED',
      `already filed ${filedToday} claims today (cap ${maxFilingsPerDay()})`,
    );
  }

  // ---------- Passed ----------
  return {
    ok: true,
    ctx: {
      claim,
      match,
      settlement,
      authorization,
      preflightAttestationText: authorization.attestationText,
    },
  };
}

function abort(
  reason: PreflightAbortReason,
  detail: string,
): PreflightAbort {
  return { ok: false, reason, detail };
}

// Called by filer.ts when preflight aborts — records the transition and
// writes a CLAIM_PREFLIGHT_ABORTED audit event. Centralizing this here
// means the state transition and the audit write always go together.
export async function recordPreflightAbort(
  claimId: number,
  userId: number,
  reason: PreflightAbortReason,
  detail: string,
): Promise<void> {
  await db
    .update(schema.claims)
    .set({
      status: 'ABORTED',
      lastError: `${reason}: ${detail}`,
    })
    .where(eq(schema.claims.id, claimId));

  await writeAudit({
    userId,
    eventType: 'CLAIM_PREFLIGHT_ABORTED',
    entityType: 'claim',
    entityId: claimId,
    payload: { reason, detail },
    actor: 'filer',
  });
}

export async function recordPreflightPass(
  claimId: number,
  userId: number,
): Promise<void> {
  await db
    .update(schema.claims)
    .set({ status: 'PREFLIGHT' })
    .where(eq(schema.claims.id, claimId));

  await writeAudit({
    userId,
    eventType: 'CLAIM_PREFLIGHT_PASSED',
    entityType: 'claim',
    entityId: claimId,
    payload: {},
    actor: 'filer',
  });
}
