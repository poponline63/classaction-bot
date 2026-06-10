import Link from 'next/link';
import { db, schema } from '@db/client';
import { and, count, desc, eq } from 'drizzle-orm';
import { isClientFeatureEnabled } from '@lib/features';
import { currentMode } from '@lib/claim-filer/submit';
import { currentUserId } from '@lib/auth/current-user';
import { getMonthlyClaimAllowance, getUserSubscription } from '@lib/billing/entitlements';
import { evaluateQueueReadiness } from '@lib/claim-filer/queue-readiness';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import { buildLaunchActionPlan } from '@lib/launch-action-plan';
import {
  clientSafeExecutionBoundary,
  clientSafeGateLabel,
  clientSafeLaunchAction,
  clientSafeLaunchLabel,
  clientSafeOwnerLabel,
  clientSafeProofArtifactSummary,
  clientSafeRequiredInputSummary,
  stripOperatorRunbookText,
} from '@lib/client-safe-launch-copy';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Database,
  Eye,
  FileCheck2,
  Lock,
  MonitorCheck,
  SearchCheck,
  ShieldCheck,
} from 'lucide-react';
import ProofGateBanner from '../ProofGateBanner';

export const dynamic = 'force-dynamic';

// Guardrail markers: Setup details stay in Launch and Packet Center; Hands-off paid filing still blocked; Setup handoff.

function fmtDate(d: Date | null | undefined) {
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No scan yet';
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function customerSafeGoalStatusText(value: string) {
  return value
    .replace(/\baccount readiness\b/gi, 'account checks')
    .replace(/\bcustomer access readiness\b/gi, 'customer access checks')
    .replace(/\breadiness status\b/gi, 'account status')
    .replace(/\breadiness checks?\b/gi, 'account checks')
    .replace(/\breadiness items?\b/gi, 'account items')
    .replace(/\breadiness note\b/gi, 'account detail')
    .replace(/\bfull automation readiness\b/gi, 'full automation checks')
    .replace(/\bLaunch and Packet Center readiness\b/gi, 'account status checks');
}

export default async function GoalPage() {
  const userId = await currentUserId();
  const mode = await currentMode();
  const [subscription, clientPreviewChecklist] = await Promise.all([
    getUserSubscription(userId),
    buildClientPreviewChecklist(userId),
  ]);
  const claimAllowance = await getMonthlyClaimAllowance(userId, { subscription });
  const isLive = mode === 'live';
  const breachImportEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT');
  const settlementSearchEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');
  const goalHeadline = settlementSearchEnabled
    ? 'Find matches and track claims.'
    : 'Review assigned claims.';
  const submissionBoundary = 'Nothing is submitted unless live filing is explicitly enabled and you have allowed that claim type.';
  const goalSubtitle = settlementSearchEnabled
    ? 'ClaimBot compares public settlement notices with your saved facts, then shows the matches that need review or tracking.'
    : 'This workspace compares assigned claim opportunities with your saved facts, then shows the matches that need review or tracking.';
  const steps = settlementSearchEnabled
    ? [
        'Set up profile',
        'Review matches',
        'Track claims',
      ]
    : [
        'Set up profile',
        'Review matches',
        'Track claims',
      ];
  const operatingCharter = [
    {
      title: 'Desktop workspace',
      detail: 'Use the hosted web app from a desktop now; the same responsive app stays ready for mobile workflows later.',
      tone: 'pass',
    },
    {
      title: settlementSearchEnabled ? 'Continuous discovery' : 'Scoped match intake',
      detail: settlementSearchEnabled
        ? 'ClaimBot tracks settlement sources and compares them only against facts already saved in the profile.'
        : 'Public settlement browsing is hidden for this deployment; assigned matches still flow through review.',
      tone: settlementSearchEnabled ? 'pass' : 'warn',
    },
    {
      title: 'Claim tracking',
      detail: isLive
        ? 'Live filing is enabled, but final checks still confirm permission, proof rules, forms, and rate limits first.'
        : 'Tracked claims enter preparation and audit review without live submission by default.',
      tone: isLive ? 'warn' : 'pass',
    },
    {
      title: 'Hard automation boundary',
      detail: 'The paid lane is full guarded automation for eligible no-proof claims; proof-required claims stay manual.',
      tone: 'pass',
    },
  ];
  const safeguards = [
    {
      title: 'Eligibility profile first',
      body: breachImportEnabled
        ? settlementSearchEnabled
          ? 'The app uses purchases, subscriptions, breach exposure, addresses, and other profile facts to decide whether a settlement may pertain to the user.'
          : 'The app uses purchases, subscriptions, breach exposure, addresses, and other profile facts to review scoped matches without exposing public search.'
        : settlementSearchEnabled
          ? 'The app uses purchases, subscriptions, addresses, and other profile facts to decide whether a settlement may pertain to the user.'
          : 'The app uses purchases, subscriptions, addresses, and other profile facts to review scoped matches without exposing public search.',
      icon: Database,
    },
    {
      title: 'User permission required',
      body: 'ClaimBot cannot move a claim type forward unless the user has allowed it and saved a matching attestation.',
      icon: Lock,
    },
    {
      title: 'Shadow mode by default',
      body: 'Forms can be prepared and checked without clicking submit unless live filing is explicitly enabled.',
      icon: Eye,
    },
    {
      title: 'Proof-required claims stay in review',
      body: 'Claims that need documents, purchase records, or manual evidence stay out of the automated filing path and should be reviewed by the user.',
      icon: FileCheck2,
    },
  ];
  const controlContract = [
    {
      title: 'Shadow defaults',
      body: 'ClaimBot can scan, match, and prepare work in read-only mode before anything is submitted.',
      icon: Eye,
    },
    {
      title: 'Proof check',
      body: 'Claims asking for documents, purchase records, or manual evidence stay out of the automated filing path.',
      icon: FileCheck2,
    },
    {
      title: 'Explicit permission',
      body: 'Paid automation still follows the categories, attestations, and filing posture the user has approved.',
      icon: CheckCircle2,
    },
    {
      title: 'Account history',
      body: 'Every scan, match, queue decision, and filing attempt is visible for review and support help.',
      icon: ClipboardList,
    },
  ];

  const profile = (await db
    .select()
    .from(schema.profile)
    .where(eq(schema.profile.userId, userId))
    .limit(1))[0];
  const profileComplete = Boolean(profile?.legalName && ((profile.emailsJson?.length ?? 0) > 0 || (profile.phonesJson?.length ?? 0) > 0));

  const activeAuthorizationRows = await db
    .select({ category: schema.classAuthorizations.category })
    .from(schema.classAuthorizations)
    .where(and(
      eq(schema.classAuthorizations.userId, userId),
      eq(schema.classAuthorizations.enabled, true),
    ));
  const activeAttestations = activeAuthorizationRows.length;
  const activeAuthorizationCategories = new Set(activeAuthorizationRows.map((row) => row.category));

  const eligibleMatches = (await db
    .select({ n: count() })
    .from(schema.matches)
    .where(and(eq(schema.matches.userId, userId), eq(schema.matches.verdict, 'ELIGIBLE'))))[0]?.n ?? 0;

  const needsReview = (await db
    .select({ n: count() })
    .from(schema.matches)
    .where(and(eq(schema.matches.userId, userId), eq(schema.matches.verdict, 'NEEDS_REVIEW'))))[0]?.n ?? 0;

  const queuedClaims = (await db
    .select({ n: count() })
    .from(schema.claims)
    .where(and(eq(schema.claims.userId, userId), eq(schema.claims.status, 'QUEUED'))))[0]?.n ?? 0;

  const existingClaims = await db
    .select({ matchId: schema.claims.matchId })
    .from(schema.claims)
    .where(eq(schema.claims.userId, userId));
  const existingClaimMatchIds = new Set(existingClaims.map((claim) => claim.matchId));

  const totalSettlements = (await db.select({ n: count() }).from(schema.settlements))[0]?.n ?? 0;
  const lastSettlement = (await db
    .select({ discoveredAt: schema.settlements.discoveredAt })
    .from(schema.settlements)
    .orderBy(desc(schema.settlements.discoveredAt))
    .limit(1))[0];

  const matchWorkAvailable = eligibleMatches + needsReview > 0;
  const reviewRows = await db
    .select({
      match: schema.matches,
      settlement: schema.settlements,
    })
    .from(schema.matches)
    .innerJoin(schema.settlements, eq(schema.matches.settlementId, schema.settlements.id))
    .where(eq(schema.matches.userId, userId))
    .limit(300);
  const queueReadinessRows = reviewRows.map(({ match, settlement }) => evaluateQueueReadiness({
    verdict: match.verdict,
    proofRequired: settlement.proofRequired,
    claimFormUrl: settlement.claimFormUrl,
    hasActiveAuthorization: activeAuthorizationCategories.has(settlement.category),
    hasAutomationEntitlement: subscription.automationEnabled || claimAllowance.allowed,
    existingClaimId: existingClaimMatchIds.has(match.id) ? match.id : null,
  }));
  const automationQueueReadyCount = queueReadinessRows.filter((row) => row.canQueue).length;
  const automationProofLockedCount = queueReadinessRows.filter((row) => row.label === 'Proof required').length;
  const automationPlanLockedCount = queueReadinessRows.filter((row) => row.label === 'Automation plan needed').length;
  const automationReceiptRows = [
    {
      title: 'Plan access',
      detail: subscription.automationEnabled
        ? `${titleCase(subscription.plan)} access can run eligible no-proof claims hands-off after review checks pass.`
        : `${titleCase(subscription.plan)} access includes 5 guarded filings per month; paid plans remove the cap.`,
      tone: subscription.automationEnabled ? 'pass' : 'warn',
    },
    {
      title: 'Profile facts',
      detail: profileComplete
        ? 'Name and contact facts are available for matching and form preparation.'
        : 'Finish intake before ClaimBot can produce reliable matches or prepared claim forms.',
      tone: profileComplete ? 'pass' : 'warn',
    },
    {
      title: 'Category permission',
      detail: activeAttestations > 0
        ? `${activeAttestations} allowed categor${activeAttestations === 1 ? 'y' : 'ies'} can be checked before claim tracking.`
        : 'Automation stays locked until the user saves at least one category attestation.',
      tone: activeAttestations > 0 ? 'pass' : 'warn',
    },
    {
      title: 'Ready for final checks',
      detail: automationQueueReadyCount > 0
        ? `${automationQueueReadyCount} reviewed match${automationQueueReadyCount === 1 ? '' : 'es'} can enter guarded final checks.`
        : 'No reviewed match currently clears plan, proof, permission, and form checks.',
      tone: automationQueueReadyCount > 0 ? 'pass' : 'warn',
    },
  ];
  const automationStatusLabel = subscription.automationEnabled
    ? automationQueueReadyCount > 0
      ? 'Automation lane ready'
      : 'Automation entitled'
    : 'Automation locked';
  const clientPreviewReady = clientPreviewChecklist.summary.clientPreviewReady;
  const launchPacketStackReady =
    clientPreviewChecklist.summary.launchPacketReadyCount === clientPreviewChecklist.summary.launchPacketTotalCount;
  const nextExternalProof = clientPreviewChecklist.summary.nextStep;
  const paidAutomationBlockers = clientPreviewChecklist.fullAutomationLaunchBlockers.rows;
  const paidAutomationBlockerSummary = clientPreviewChecklist.fullAutomationLaunchBlockers.summary;
  const paidAutomationReady = clientPreviewChecklist.fullAutomationLaunchBlockers.summary.ready;
  const currentStep =
    !profileComplete ? 0 :
    queuedClaims > 0 || (activeAttestations > 0 && !matchWorkAvailable) ? 2 :
    1;
  const currentStepLabel = steps[currentStep] ?? steps[0];
  const nextFocus = !profileComplete
    ? {
        href: '/setup',
        action: 'Finish intake',
        detail: 'Save the profile facts ClaimBot needs before matching or queue review.',
      }
    : settlementSearchEnabled && totalSettlements === 0
      ? {
          href: '/launch',
          action: 'Open account status',
          detail: 'Populate settlement sources before users expect discovery results.',
        }
      : matchWorkAvailable
        ? {
            href: '/review',
            action: 'Review matches',
            detail: 'Resolve uncertain items and keep proof-required claims in manual review.',
          }
        : activeAttestations === 0
          ? {
              href: '/permissions',
              action: 'Save permissions',
              detail: 'Enable category attestations before anything can move into claim tracking.',
            }
          : {
              href: '/claims',
              action: 'Check claim readiness',
              detail: 'Review final-check posture, shadow mode, and account history before filing work.',
            };
  const focusDockCards = [
    {
      label: 'Current step',
      value: currentStepLabel,
      detail: `${currentStep + 1}/${steps.length}`,
      tone: 'blue',
      icon: MonitorCheck,
    },
    {
      label: 'Next action',
      value: nextFocus.action,
      detail: nextFocus.detail,
      tone: 'pass',
      icon: ArrowRight,
      href: nextFocus.href,
    },
    {
      label: 'Safety posture',
      value: isLive ? 'Live guarded' : 'Shadow safe',
      detail: isLive
        ? 'Live mode still checks proof, permission, forms, and history.'
        : 'Claims can be prepared, but not submitted.',
      tone: isLive ? 'warn' : 'pass',
      icon: Lock,
      href: '/settings',
    },
    {
      label: 'Automation lane',
      value: subscription.automationEnabled ? 'Available' : 'Paid plan needed',
      detail: subscription.automationEnabled
        ? 'Eligible no-proof claims can use full guarded automation.'
        : 'Free and Plus stay review-focused; Pro unlocks hands-off no-proof filing after review clears.',
      tone: subscription.automationEnabled ? 'pass' : 'warn',
      icon: ShieldCheck,
      href: subscription.automationEnabled ? '/claims' : '/pricing',
    },
  ];
  const goalActionNavigatorRows = steps.map((step, index) => {
    const status =
      index < currentStep ? 'done' :
      index === currentStep ? 'current' :
      'queued';
    const hrefs = [
      '/setup',
      '/review',
      '/claims',
    ];
    const descriptions = settlementSearchEnabled
      ? [
          profileComplete
            ? 'Your basic facts are saved.'
            : 'Add name, contact, and eligibility facts first.',
          matchWorkAvailable
            ? `${eligibleMatches + needsReview} match${eligibleMatches + needsReview === 1 ? '' : 'es'} need a decision.`
            : totalSettlements > 0
              ? 'ClaimBot can compare saved facts with available settlements.'
              : 'Matches appear after profile facts and source intake are ready.',
          queuedClaims > 0
            ? `${queuedClaims} claim${queuedClaims === 1 ? '' : 's'} being tracked.`
            : 'Track claims after review, proof, and permission checks.',
        ]
      : [
          profileComplete
            ? 'Your basic facts are saved.'
            : 'Add name, contact, and eligibility facts first.',
          matchWorkAvailable
            ? `${eligibleMatches + needsReview} match${eligibleMatches + needsReview === 1 ? '' : 'es'} need a decision.`
            : 'Review starts when assigned opportunities match saved facts.',
          queuedClaims > 0
            ? `${queuedClaims} claim${queuedClaims === 1 ? '' : 's'} being tracked.`
            : 'Track claims after review, proof, and permission checks.',
        ];

    return {
      step,
      status,
      href: hrefs[index] ?? '/goal',
      description: descriptions[index] ?? 'Continue through the guarded claim workflow.',
    };
  });
  const clientPreviewGateRows = [
    {
      title: 'Account checks',
      detail: `${clientPreviewChecklist.summary.readyCount}/${clientPreviewChecklist.summary.totalCount} ready across the guided workflow, account access, billing, trust, and deployment checks.`,
      tone: clientPreviewChecklist.summary.blockedCount === 0 ? 'pass' : 'warn',
    },
    {
      title: 'Account status',
      detail: `${clientPreviewChecklist.summary.launchPacketReadyCount}/${clientPreviewChecklist.summary.launchPacketTotalCount} account checks are ready before account access.`,
      tone: launchPacketStackReady ? 'pass' : 'warn',
    },
    {
      title: 'Needed next',
      detail: nextExternalProof
        ? `${clientSafeLaunchLabel(nextExternalProof)}: ${clientSafeLaunchAction(nextExternalProof)}`
        : 'No outside account step is currently recorded.',
      tone: nextExternalProof ? 'warn' : 'pass',
    },
    {
      title: 'Account match evidence',
      detail: `Readiness is tied to ClaimBot account #${clientPreviewChecklist.accountScope.accountId}; each account needs its own match refresh record.`,
      tone: 'pass',
    },
  ];
  const launchActionPlanRows = buildLaunchActionPlan(clientPreviewChecklist.launchCriticalPath);
  const blockedLaunchActionPlanRows = launchActionPlanRows.filter((item) => item.status !== 'confirmed');
  const launchProofResolverRows = blockedLaunchActionPlanRows.slice(0, 5);
  const launchProofResolverReadyCount =
    launchActionPlanRows.filter((item) => item.status === 'confirmed').length;

  return (
    <>
      <section className={`system-posture ${isLive ? 'live' : 'shadow'}`}>
        <SearchCheck aria-hidden="true" size={18} />
        <div>
          <strong>{isLive ? 'Live filing enabled' : 'Shadow mode active'}</strong>
          <span>
            {isLive
              ? 'Live mode is guarded; review-ready claims must clear permission, proof, form, and account-history checks before submission.'
              : 'Forms may be prepared for review, but claims are not submitted.'}
          </span>
        </div>
      </section>

      <section className="goal-action-navigator" aria-label="Goal Action Navigator">
        <header className="goal-action-navigator-head">
          <div>
            <div className="operating-charter-kicker">Action Navigator</div>
            <h2>Three steps: set up profile, review matches, track claims.</h2>
          </div>
          <p>
            Current step: <strong>{currentStepLabel}</strong>. {submissionBoundary}
          </p>
        </header>
        <div className="goal-action-navigator-grid" role="list">
          {goalActionNavigatorRows.map((item, index) => (
            <Link
              aria-current={item.status === 'current' ? 'step' : undefined}
              className={`goal-action-navigator-item ${item.status}`}
              href={item.href}
              key={item.step}
              role="listitem"
            >
              <span className={`goal-action-navigator-icon ${item.status}`} aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <small>
                  Step {index + 1} - {item.status === 'current' ? 'Current' : item.status === 'done' ? 'Ready' : 'Next'}
                </small>
                <strong>{item.step}</strong>
                <p>{item.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="goal-focus-dock" aria-label="Goal Focus Dock">
        <header className="goal-focus-dock-head">
          <div>
            <div className="operating-charter-kicker">Next best action</div>
            <h2>One clear next move, plus the status that matters.</h2>
          </div>
          <Link className="btn sm" href={nextFocus.href}>
            {nextFocus.action}
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </header>
        <div className="goal-focus-dock-grid">
          {focusDockCards.map(({ icon: Icon, ...item }) => {
            const card = (
              <>
                <span className={`goal-focus-dock-icon ${item.tone}`} aria-hidden="true">
                  <Icon size={18} />
                </span>
                <div>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <p>{item.detail}</p>
                </div>
              </>
            );

            return item.href ? (
              <Link className={`goal-focus-dock-item ${item.tone}`} href={item.href} key={item.label}>
                {card}
              </Link>
            ) : (
              <article className={`goal-focus-dock-item ${item.tone}`} key={item.label}>
                {card}
              </article>
            );
          })}
        </div>
      </section>

      <details className="dashboard-detail-drawer goal-supporting-drawer" aria-label="More workflow details">
        <summary>
          <span>
            <strong>More workflow details</strong>
            <small>Optional status, safety rules, and automation checks.</small>
          </span>
          <b>{clientPreviewChecklist.summary.readyCount}/{clientPreviewChecklist.summary.totalCount} requirements ready</b>
        </summary>

      <ProofGateBanner surface="goal" />

      {/* Guardrail markers: Hands-off paid filing still blocked. Customer access waits for readiness. Customer access readiness. Open readiness status. Required inputs: */}
      <section className={`goal-automation-receipt ${clientPreviewReady ? 'ready' : 'locked'}`} aria-label="Account access readiness">
        <header className="goal-automation-receipt-head">
          <div>
            <div className="operating-charter-kicker">Account access</div>
            <h2>{clientPreviewReady ? 'Account access checks are clear' : 'Account access waits for checks'}</h2>
            <p>
              This account view confirms whether the hosted app is ready for customers.
              Deeper account details stay out of the normal goal flow.
            </p>
          </div>
          <div className="goal-automation-plan-lockup">
            <span className={`tag ${clientPreviewReady ? 'good' : 'warn'}`}>
              {clientPreviewChecklist.summary.readyCount}/{clientPreviewChecklist.summary.totalCount} requirements
            </span>
            <small>{clientPreviewChecklist.summary.launchPacketReadyCount}/{clientPreviewChecklist.summary.launchPacketTotalCount} packets</small>
          </div>
        </header>
        <div className="goal-automation-receipt-grid">
          {clientPreviewGateRows.map((item) => (
            <article className={`goal-automation-receipt-item ${item.tone}`} key={item.title}>
              <span className={`readiness-dot ${item.tone}`} aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="goal-automation-receipt-footer">
          {nextExternalProof ? (
            <>
              <span>Needed next: {clientSafeRequiredInputSummary(nextExternalProof.requiredInputs, 3)}</span>
              <span>Why this waits: {customerSafeGoalStatusText(clientSafeExecutionBoundary(nextExternalProof))}</span>
            </>
          ) : (
            <span>Outside account steps are clear for this account.</span>
          )}
          <Link className="btn ghost sm" href="/launch">Open account status</Link>
          <Link className="btn ghost sm" href="/packets">Open details</Link>
        </div>
      </section>

      {/* Guardrail marker: Paid automation readiness */}
      <section className={`goal-automation-receipt ${paidAutomationBlockerSummary.ready ? 'ready' : 'locked'}`} aria-label="Paid automation readiness">
        <header className="goal-automation-receipt-head">
          <div>
            <div className="operating-charter-kicker">Paid automation checks</div>
            <h2>{paidAutomationBlockerSummary.ready ? 'Paid automation checks are clear' : 'Hands-off paid filing waits for account checks'}</h2>
            <p>
              Eligible no-proof claims can use hands-off filing only after account checks, billing,
              legal review, permissions, proof rules, and final checks all clear.
            </p>
          </div>
          <div className="goal-automation-plan-lockup">
            <span className={`tag ${paidAutomationBlockerSummary.ready ? 'good' : 'warn'}`}>
              {paidAutomationBlockerSummary.blockedCount} item{paidAutomationBlockerSummary.blockedCount === 1 ? '' : 's'}
            </span>
            <small>account checked</small>
          </div>
        </header>
        <div className="goal-automation-receipt-grid">
          {(paidAutomationBlockers.length === 0 ? [{
            gate: 'Full automation readiness chain',
            owner: 'deployment',
            clientImpact: customerSafeGoalStatusText(stripOperatorRunbookText(paidAutomationBlockerSummary.note)),
            command: 'Account status checks',
            path: 'launch-handoff-report',
          }] : paidAutomationBlockers).slice(0, 5).map((blocker, index) => (
            <article className={`goal-automation-receipt-item ${paidAutomationBlockers.length === 0 ? 'pass' : 'warn'}`} key={`${clientSafeGateLabel(blocker.gate)}-${index}`}>
              <span className={`readiness-dot ${paidAutomationBlockers.length === 0 ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>{clientSafeGateLabel(blocker.gate)}</strong>
                <p>{customerSafeGoalStatusText(stripOperatorRunbookText(blocker.clientImpact))}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="goal-automation-receipt-footer">
          <span>Why this waits: paid full automation remains locked until every account check has saved status.</span>
          {paidAutomationBlockers.length > 5 && (
            <span>{paidAutomationBlockers.length - 5} more account check{paidAutomationBlockers.length - 5 === 1 ? '' : 's'} stay in detailed records.</span>
          )}
          <Link className="btn ghost sm" href="/packets">Open details</Link>
          <Link className="btn ghost sm" href="/launch">Open account status</Link>
        </div>
      </section>

      <details className="dashboard-detail-drawer goal-readiness-detail-drawer" aria-label="Account status details">
        <summary>
          <span>
            {/* Guardrail markers: Account readiness details. What still needs setup. */}
            <strong>More account check details</strong>
            <small>
              Keep the goal page focused. Open this only when you need the account-readiness reasons.
            </small>
          </span>
          <b>{clientPreviewReady ? 'Access clear' : `${blockedLaunchActionPlanRows.length} checks left`}</b>
        </summary>

        <section className="goal-launch-proof-resolver" aria-label="Account status detail rows">
          <header className="goal-launch-proof-resolver-head">
            <div>
              <div className="operating-charter-kicker">Account status details</div>
              <h2>Why account access may still wait</h2>
              <p>
                These account items explain the remaining checks without crowding the main goal workflow.
              </p>
            </div>
            <div className="goal-automation-plan-lockup">
              <span className={`tag ${clientPreviewReady ? 'good' : 'warn'}`}>
                {clientPreviewReady ? 'Access clear' : `${blockedLaunchActionPlanRows.length} checks left`}
              </span>
              <small>{launchProofResolverReadyCount}/{launchActionPlanRows.length} clear</small>
            </div>
          </header>
          <div className="goal-launch-proof-resolver-grid">
            {launchProofResolverRows.length > 0 ? launchProofResolverRows.map((item, index) => (
              <article className="goal-launch-proof-resolver-item" key={`${clientSafeLaunchLabel(item)}-${index}`}>
                <span className="goal-launch-proof-resolver-index" aria-hidden="true">{index + 1}</span>
                <div>
                  <small>{clientSafeOwnerLabel(item.owner)}</small>
                  <strong>{clientSafeLaunchLabel(item)}</strong>
                  <p>{clientSafeLaunchAction(item)}</p>
                  <div className="goal-launch-proof-resolver-meta">
                    <span>Needed next: {clientSafeRequiredInputSummary(item.requiredInputs, 2)}</span>
                    <span>Account status: {customerSafeGoalStatusText(clientSafeProofArtifactSummary(item))}</span>
                  </div>
                  <div className="goal-launch-proof-resolver-commands" aria-label={`${clientSafeLaunchLabel(item)} account status details`}>
                    <span>Account details</span>
                    <small>Detailed records stay out of the main goal flow.</small>
                  </div>
                </div>
              </article>
            )) : (
              <article className="goal-launch-proof-resolver-item clear">
                <span className="goal-launch-proof-resolver-index" aria-hidden="true">
                  <CheckCircle2 size={16} />
                </span>
                <div>
                  <small>Account access readiness</small>
                  <strong>Account access checks are clear</strong>
                  <p>Readiness checks, sign-in, payment, legal review, and published-site checks are currently clear.</p>
                </div>
              </article>
            )}
          </div>
          <div className="goal-launch-proof-resolver-footer">
            <span>Account checks: accounts, payment links, legal review, and hosted sign-in must be real before account access.</span>
            <Link className="btn ghost sm" href="/launch">Open full account status</Link>
          </div>
        </section>
      </details>

      <section className={`goal-automation-receipt ${subscription.automationEnabled ? 'ready' : 'locked'}`} aria-label="Paid automation readiness receipt">
        <header className="goal-automation-receipt-head">
          <div>
            <div className="operating-charter-kicker">Paid Automation Receipt</div>
            <h2>{automationStatusLabel}</h2>
            <p>
              Payment can unlock full guarded automation, but filing still depends on saved facts,
              category permission, proof rules, claim-form availability, account access checks, and shadow/live filing posture.
            </p>
          </div>
          <div className="goal-automation-plan-lockup">
            <span className={`tag ${subscription.automationEnabled ? 'good' : 'warn'}`}>
              {titleCase(subscription.plan)}
            </span>
            <small>{subscription.status}</small>
          </div>
        </header>
        <div className="goal-automation-receipt-grid">
          {automationReceiptRows.map((item) => (
            <article className={`goal-automation-receipt-item ${item.tone}`} key={item.title}>
              <span className={`readiness-dot ${item.tone}`} aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="goal-automation-receipt-footer">
          <span>{automationProofLockedCount} proof-required match{automationProofLockedCount === 1 ? '' : 'es'} stay manual.</span>
          <span>{automationPlanLockedCount} match{automationPlanLockedCount === 1 ? '' : 'es'} wait on this month's filing allowance.</span>
          <Link className="btn ghost sm" href={subscription.automationEnabled ? '/review' : '/pricing'}>
            {subscription.automationEnabled ? 'Review claim checks' : 'View automation plans'}
          </Link>
        </div>
      </section>

      <section className="stats-grid goal-command-metrics" aria-label="Match and claim counts">
        <div className="stat-card">
          <div className="stat-label">Ready for review</div>
          <div className="stat-value green">{eligibleMatches}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Needs your review</div>
          <div className="stat-value warn">{needsReview}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Being tracked</div>
          <div className="stat-value blue">{queuedClaims}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{settlementSearchEnabled ? 'Last discovery scan' : 'Last source update'}</div>
          <div className="stat-value text">{fmtDate(lastSettlement?.discoveredAt)}</div>
        </div>
      </section>

      <section className="dashboard-hero goal-command-header">
        <div className="hero-main">
          <div className="eyebrow">Operating goal</div>
          <h1>{goalHeadline}</h1>
          <div className="hero-boundary-lockup" role="note">
            <Lock aria-hidden="true" size={17} />
            <strong>{submissionBoundary}</strong>
          </div>
          <p className="subtitle">{goalSubtitle}</p>
          {isLive && (
            <div className="compliance-box">
              Live filing is on for this deployment. Claim dispatch still depends on permission,
              proof checks, final checks, filing posture, and activity records.
            </div>
          )}
          <div className="hero-actions">
            <Link className="btn" href={profileComplete && eligibleMatches > 0 ? '/review' : '/setup'}>
              {profileComplete && eligibleMatches > 0 ? 'Review matches' : 'Build eligibility profile'}
            </Link>
            <Link className="btn ghost" href="/pricing">See automation plans</Link>
            {profileComplete || !settlementSearchEnabled ? (
              <Link className="btn ghost" href="/profile">Update profile</Link>
            ) : (
              <Link className="btn ghost" href="/settlements">Browse settlements</Link>
            )}
          </div>
        </div>
        <aside className="readiness-card ready" aria-label="Account status and filing mode">
          <div className="readiness-head">
            <div>
              <div className="eyebrow">Account status</div>
              <h3>What can run now?</h3>
            </div>
            <span className={`mode-badge ${isLive ? 'live' : 'shadow'}`}>{isLive ? 'Live' : 'Shadow'}</span>
          </div>
          <div className="readiness-list">
            <div className="readiness-item">
              <span className={`readiness-dot ${profileComplete ? 'pass' : 'fail'}`} aria-hidden="true" />
              <div>
                <strong>Eligibility profile</strong>
                <p>{profileComplete ? 'Profile facts are available for matching.' : 'Required before reliable matching.'}</p>
              </div>
            </div>
            <div className="readiness-item">
              <span className={`readiness-dot ${activeAttestations > 0 ? 'pass' : 'warn'}`} aria-hidden="true" />
              <div>
                <strong>Attestations stored</strong>
                <p>{activeAttestations} categor{activeAttestations === 1 ? 'y is' : 'ies are'} allowed.</p>
              </div>
            </div>
            <div className="readiness-item">
              <span className="readiness-dot pass" aria-hidden="true" />
              <div>
                <strong>Filing posture</strong>
                <p>{isLive ? 'Live filing enabled.' : 'Shadow mode prepares forms without submitting.'}</p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <details className="dashboard-detail-drawer goal-safety-drawer" aria-label="Goal safety rules">
        <summary>
          <span>
            <strong>Safety rules</strong>
            <small>Permission, proof, shadow mode, and mobile access details.</small>
          </span>
          <b>{isLive ? 'Live guarded' : 'Shadow safe'}</b>
        </summary>

      <section className="goal-control-contract" aria-label="User control contract">
        <header className="goal-control-contract-head">
          <div>
            <div className="operating-charter-kicker">User-control contract</div>
            <h2>Automation With Guardrails You Can See.</h2>
          </div>
          <p>
            Paid users can get a faster workflow, but the app still works from saved facts,
            proof rules, explicit permission, and an auditable claim record.
          </p>
        </header>
        <div className="goal-control-contract-grid">
          {controlContract.map(({ icon: Icon, ...item }) => (
            <article className="goal-control-contract-item" key={item.title}>
              <span className="goal-control-contract-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="operating-charter" aria-label="ClaimBot operating charter">
        <header className="operating-charter-head">
          <div>
            <div className="operating-charter-kicker">App basics</div>
            <h2>Desktop today. Mobile later.</h2>
            <p>
              ClaimBot can work continuously in the background, but every filing path is constrained
              by saved facts, permission, proof review, and the current filing posture.
            </p>
          </div>
          <span className={`mode-badge ${isLive ? 'live' : 'shadow'}`}>
            {isLive ? 'Live guarded' : 'PWA ready'}
          </span>
        </header>
        <div className="operating-charter-grid">
          {operatingCharter.map((item) => (
            <article className={`operating-charter-item ${item.tone}`} key={item.title}>
              <span className={`readiness-dot ${item.tone}`} aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {!settlementSearchEnabled && (
        <section className="dashboard-section">
          <div className="notice warn notice-followup">
            <h3>Public settlement search is hidden</h3>
            <p>
              This workspace can still review imported or assigned matches,
              but the public settlement browsing surface is not part of the user workflow.
            </p>
            <div className="status-row">
              <Link className="btn ghost sm" href="/review">Review scoped matches</Link>
              <Link className="btn ghost sm" href="/profile">Update profile evidence</Link>
              <Link className="btn ghost sm" href="/permissions">Manage permissions</Link>
            </div>
          </div>
        </section>
      )}

      <section className="dashboard-section">
        <header className="section-header">
          <h2>Automation boundary</h2>
          <p className="muted">
            ClaimBot automates discovery, matching, form preparation, and allowed no-proof filing for paid users.
            It does not fabricate eligibility, and it will not bypass claims that require proof or manual evidence.
          </p>
        </header>
        <div className="safeguard-grid">
          {safeguards.map(({ icon: Icon, ...item }) => (
            <article className="safeguard-card" key={item.title} aria-label={`${item.title}. ${item.body}`}>
              <Icon aria-hidden="true" size={22} />
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      </details>

      </details>

    </>
  );
}
