import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import {
  AlertTriangle,
  ClipboardCheck,
  FileText,
  Lock,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { db, schema } from '@db/client';
import { currentUserId } from '@lib/auth/current-user';
import { getUserSubscription } from '@lib/billing/entitlements';
import { isClientFeatureEnabled } from '@lib/features';
import EligibilityCandidateBrowser, { type EligibilityCandidateRow } from './EligibilityCandidateBrowser';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<string, string> = {
  CONSUMER_PRODUCT_PURCHASE: 'Product purchases',
  SUBSCRIPTION_SERVICE: 'Subscription services',
  DATA_BREACH: 'Data breach evidence',
  ROBOCALL_TCPA: 'Calls or texts',
  DECEPTIVE_ADVERTISING: 'Advertising or labeling',
  AUTO_DEFECT: 'Vehicle issues',
  EMPLOYMENT: 'Employment',
  UNKNOWN: 'Unclassified',
};

function formatDate(value: Date | null | undefined) {
  if (!value) return 'No deadline listed';
  return value.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function reviewState(input: {
  verdict: string;
  proofRequired: boolean;
  claimFormUrl: string | null;
  authorizationActive: boolean;
  automationEntitlementActive: boolean;
  alreadyQueued: boolean;
}) {
  if (input.alreadyQueued) {
    return {
      label: 'Already tracked',
      detail: 'This record is already being tracked in claim status.',
      tone: 'pass' as const,
    };
  }
  if (input.verdict === 'INELIGIBLE') {
    return {
      label: 'Excluded by matcher',
      detail: 'Saved facts do not currently support this source record.',
      tone: 'fail' as const,
    };
  }
  if (input.proofRequired) {
    return {
      label: 'Document review required',
      detail: 'Documents, purchase records, or notices must be handled manually before claim tracking.',
      tone: 'warn' as const,
    };
  }
  if (!input.claimFormUrl) {
    return {
      label: 'Claim form missing',
      detail: 'The source record does not yet expose a usable claim form URL.',
      tone: 'warn' as const,
    };
  }
  if (!input.authorizationActive) {
    return {
      label: 'Permission needed',
      detail: 'The user must explicitly allow this category before claim tracking.',
      tone: 'warn' as const,
    };
  }
  if (!input.automationEntitlementActive) {
    return {
      label: 'Monthly limit reached',
      detail: 'Human review can continue. Free accounts include 5 guarded filings per month; paid plans remove the cap.',
      tone: 'warn' as const,
    };
  }
  return {
    label: 'Ready for review',
    detail: 'Matcher, category permission, proof, form, and plan checks are aligned for human review.',
    tone: 'pass' as const,
  };
}

export default async function EligibilityPage() {
  const userId = await currentUserId();
  const settlementSearchEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');
  const breachImportEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT');
  const subscription = await getUserSubscription(userId);
  const subscriptionPlanLabel = subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1);
  const [profileRow] = await db
    .select()
    .from(schema.profile)
    .where(eq(schema.profile.userId, userId))
    .limit(1);
  const purchases = await db
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.userId, userId))
    .orderBy(desc(schema.purchases.purchaseDate));
  const breaches = await db
    .select()
    .from(schema.dataBreachExposure)
    .where(eq(schema.dataBreachExposure.userId, userId))
    .orderBy(desc(schema.dataBreachExposure.createdAt));
  const authorizations = await db
    .select()
    .from(schema.classAuthorizations)
    .where(eq(schema.classAuthorizations.userId, userId));
  const matches = await db
    .select({
      match: schema.matches,
      settlement: schema.settlements,
      claim: schema.claims,
    })
    .from(schema.matches)
    .innerJoin(schema.settlements, eq(schema.matches.settlementId, schema.settlements.id))
    .leftJoin(schema.claims, eq(schema.claims.matchId, schema.matches.id))
    .where(eq(schema.matches.userId, userId))
    .orderBy(desc(schema.matches.updatedAt))
    .limit(12);

  const profileComplete = Boolean(
    profileRow?.legalName
    && ((profileRow.emailsJson?.length ?? 0) > 0 || (profileRow.phonesJson?.length ?? 0) > 0),
  );
  const evidenceCount = purchases.length + (breachImportEnabled ? breaches.length : 0);
  const proofReferenceCount = purchases.filter((purchase) => purchase.receiptPath).length;
  const activeAuthorizations = authorizations.filter((authorization) => authorization.enabled && !authorization.revokedAt);
  const activeAuthorizationCategories = new Set(activeAuthorizations.map((authorization) => authorization.category));
  const readyForReviewCount = matches.filter(({ claim, match, settlement }) => (
    reviewState({
      verdict: match.verdict,
      proofRequired: settlement.proofRequired,
      claimFormUrl: settlement.claimFormUrl,
      authorizationActive: Boolean(match.requiredCategory && activeAuthorizationCategories.has(match.requiredCategory)),
      automationEntitlementActive: subscription.automationEnabled,
      alreadyQueued: Boolean(claim),
    }).label === 'Ready for review'
  )).length;
  const needsManualReviewCount = matches.filter(({ claim, match, settlement }) => (
    reviewState({
      verdict: match.verdict,
      proofRequired: settlement.proofRequired,
      claimFormUrl: settlement.claimFormUrl,
      authorizationActive: Boolean(match.requiredCategory && activeAuthorizationCategories.has(match.requiredCategory)),
      automationEntitlementActive: subscription.automationEnabled,
      alreadyQueued: Boolean(claim),
    }).tone === 'warn'
  )).length;
  const automationPlanNeededCount = matches.filter(({ claim, match, settlement }) => (
    reviewState({
      verdict: match.verdict,
      proofRequired: settlement.proofRequired,
      claimFormUrl: settlement.claimFormUrl,
      authorizationActive: Boolean(match.requiredCategory && activeAuthorizationCategories.has(match.requiredCategory)),
      automationEntitlementActive: subscription.automationEnabled,
      alreadyQueued: Boolean(claim),
    }).label === 'Automation plan needed'
  )).length;
  const firstRunIncomplete = !profileComplete || evidenceCount === 0 || activeAuthorizations.length === 0;

  const intakeGates = [
    {
      label: 'Basic info',
      detail: profileComplete
        ? 'Your name and at least one contact method are saved.'
        : 'Add your name and one reachable email or phone before checking claim fit.',
      ok: profileComplete,
      icon: UserRound,
    },
    {
      label: 'Claim facts',
      detail: evidenceCount > 0
        ? `${evidenceCount} saved fact${evidenceCount === 1 ? '' : 's'} can help ClaimBot compare opportunities.`
        : 'Add purchases, subscriptions, notices, or other facts you know are true.',
      ok: evidenceCount > 0,
      icon: FileText,
    },
    {
      label: 'Your permission',
      detail: activeAuthorizations.length > 0
        ? `${activeAuthorizations.length} claim type${activeAuthorizations.length === 1 ? '' : 's'} allowed.`
        : 'Choose which claim types ClaimBot may review before tracking can start.',
      ok: activeAuthorizations.length > 0,
      icon: ShieldCheck,
    },
    {
      label: 'Paid automation',
      detail: subscription.automationEnabled
        ? `${subscriptionPlanLabel} access can run guarded automation after review checks pass.`
        : `${subscriptionPlanLabel} access includes 5 guarded filings per month. Paid plans remove the cap.`,
      ok: subscription.automationEnabled,
      icon: Lock,
    },
    {
      label: 'Proof notes',
      detail: proofReferenceCount > 0
        ? `${proofReferenceCount} proof note${proofReferenceCount === 1 ? '' : 's'} saved for review.`
        : 'Add document or purchase-record notes when a claim asks for proof.',
      ok: proofReferenceCount > 0,
      icon: ClipboardCheck,
      optional: true,
    },
  ];

  const candidateRows: EligibilityCandidateRow[] = matches.map(({ claim, match, settlement }) => {
    const requiredCategory = match.requiredCategory ?? settlement.category;
    const authorizationActive = activeAuthorizationCategories.has(requiredCategory);
    const state = reviewState({
      verdict: match.verdict,
      proofRequired: settlement.proofRequired,
      claimFormUrl: settlement.claimFormUrl,
      authorizationActive,
      automationEntitlementActive: subscription.automationEnabled,
      alreadyQueued: Boolean(claim),
    });

    return {
      id: match.id,
      settlementId: settlement.id,
      caseName: settlement.caseName,
      defendant: settlement.defendant,
      categoryLabel: CATEGORY_LABELS[settlement.category] ?? settlement.category,
      requiredCategoryLabel: CATEGORY_LABELS[requiredCategory] ?? requiredCategory,
      stateLabel: state.label,
      stateDetail: state.detail,
      stateTone: state.tone,
      matcherVerdict: match.verdict,
      confidencePercent: Math.round(match.confidence * 100),
      authorizationActive,
      proofRequired: settlement.proofRequired,
      claimFormLinked: Boolean(settlement.claimFormUrl),
      automationEntitlementActive: subscription.automationEnabled,
      alreadyQueued: Boolean(claim),
      planLabel: subscriptionPlanLabel,
      deadlineLabel: formatDate(settlement.deadline),
    };
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Claim fit</div>
          <h1>See which claims look like a fit</h1>
          <p>
            ClaimBot compares your saved facts with available claim opportunities, then shows
            what looks ready, what needs review, and what is missing.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/onboarding">Start here</Link>
          <Link className="btn ghost" href="/review">Open match review</Link>
        </div>
      </div>

      <section className="system-posture shadow" aria-label="Eligibility review boundary">
        <Lock aria-hidden="true" size={22} />
        <div>
          <strong>Review only. No claim is submitted from this page.</strong>
          <span>
            This page helps you decide what to review next. It does not invent facts,
            skip proof, or guarantee a payout.
          </span>
        </div>
      </section>

      <section className="eligibility-simple-guide" aria-label="How to use eligibility">
        <div>
          <div className="eyebrow">{firstRunIncomplete ? 'New user path' : 'Claim fit path'}</div>
          <h2>{firstRunIncomplete ? 'Start with onboarding before judging matches.' : 'Use this page to see what still needs review.'}</h2>
          <p>
            {firstRunIncomplete
              ? 'You do not need every rule first. Add facts, choose claim types, then review matches when ClaimBot finds them.'
              : 'ClaimBot shows ready matches, proof blockers, missing permissions, and plan requirements before tracking starts.'}
          </p>
        </div>
        <div className="eligibility-simple-steps">
          <Link href="/onboarding">
            <span>1</span>
            <strong>Add facts</strong>
            <small>Save the basic information ClaimBot can compare.</small>
          </Link>
          <Link href="/permissions">
            <span>2</span>
            <strong>Choose claim types</strong>
            <small>Tell ClaimBot what it may review for you.</small>
          </Link>
          <Link href="/review">
            <span>3</span>
            <strong>Review matches</strong>
            <small>Track only the claims you approve.</small>
          </Link>
        </div>
      </section>

      <section className="eligibility-command-center" aria-label="Eligibility review command center">
        <div>
          <div className="eyebrow">Readiness</div>
          <h2>Start with the cards marked Needed</h2>
          <p>
            ClaimBot works from what you save. Missing basics, missing permission,
            and proof-heavy claims stay in review before anything can be tracked.
          </p>
        </div>
        <div className="eligibility-command-stats">
          <span>
            <strong>{readyForReviewCount}</strong>
            Ready
          </span>
          <span>
            <strong>{needsManualReviewCount}</strong>
            Need review
          </span>
          <span>
            <strong>{matches.length}</strong>
            Total
          </span>
        </div>
      </section>

      <section className="stats-grid" aria-label="Eligibility intake gates">
        {intakeGates.map(({ detail, icon: Icon, label, ok, optional }) => (
          <article className={`stat-card ${ok || optional ? '' : 'needs-review'}`} key={label}>
            <Icon aria-hidden="true" size={20} />
            <div className={`stat-value ${ok ? 'green' : optional ? 'text' : 'warn'}`}>
              {ok ? 'Set' : optional ? 'Optional' : 'Needed'}
            </div>
            <p>{label}</p>
            <small>{detail}</small>
          </article>
        ))}
      </section>

      <details className="dashboard-detail-drawer eligibility-detail-drawer" aria-label="More eligibility details">
        <summary>
          <span>
            <strong>More eligibility details</strong>
            <small>Saved facts, documents, permission, plan, and source rules behind the simple status cards.</small>
          </span>
          <b>{readyForReviewCount} ready, {needsManualReviewCount} need review</b>
        </summary>
        <div className="trust-strip" aria-label="Eligibility review safeguards">
          <div className="trust-item">
            <strong>Saved facts only</strong>
            <span>Possible matches must stay tied to facts you saved in your account.</span>
          </div>
          <div className="trust-item">
            <strong>Proof stays manual</strong>
            <span>Claims that need documents or purchase records remain review items until handled.</span>
          </div>
          <div className="trust-item">
            <strong>Permission matters</strong>
            <span>Tracking requires an active permission for the claim type.</span>
          </div>
          <div className="trust-item">
            <strong>Plan check before claim tracking</strong>
            <span>Free accounts include 5 guarded filings per month. Paid plans remove the cap.</span>
          </div>
          <div className="trust-item">
            <strong>Source rules apply</strong>
            <span>The outside claim source controls its terms, forms, and deadlines.</span>
          </div>
        </div>
      </details>

      {!settlementSearchEnabled && (
        <div className="notice warn">
          <AlertTriangle aria-hidden="true" size={18} />
          <div>
            <strong>Scoped review mode</strong>
            <p>
              Public settlement browsing is hidden. This page still works for imported or
              assigned opportunities that already exist in the database.
            </p>
          </div>
        </div>
      )}

      <section className="card launch-card" aria-label="Review candidates">
        <div className="launch-card-head">
          <div>
            <div className="eyebrow">Candidate review</div>
            <h2>Possible matches</h2>
          </div>
          <Link className="btn ghost sm" href="/review">Open review</Link>
        </div>

        <EligibilityCandidateBrowser rows={candidateRows} />
      </section>

      <section className="card launch-card" aria-label="Eligibility review next step">
        <div className="launch-card-head">
          <div>
            <div className="eyebrow">Next safe action</div>
            <h2>
              {!profileComplete
                ? 'Complete name and contact'
                : evidenceCount === 0
                  ? 'Add claim facts'
                  : activeAuthorizations.length === 0
                    ? 'Choose claim types'
                    : automationPlanNeededCount > 0
                      ? 'Review automation access'
                    : readyForReviewCount > 0
                      ? 'Continue match review'
                      : 'Resolve manual blockers'}
            </h2>
          </div>
          <Link
            className="btn ghost sm"
            href={!profileComplete || evidenceCount === 0 ? '/onboarding' : activeAuthorizations.length === 0 ? '/permissions' : automationPlanNeededCount > 0 ? '/pricing' : '/review'}
          >
            Open next step
          </Link>
        </div>
        <p className="muted">
          ClaimBot moves from possible match to tracking only when your saved facts,
          permission, proof status, form access, and plan all line up for review.
        </p>
      </section>
    </>
  );
}
