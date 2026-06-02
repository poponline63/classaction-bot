import Link from 'next/link';
import { and, count, eq } from 'drizzle-orm';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  LockKeyhole,
  SearchCheck,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { db, schema } from '@db/client';
import { currentUserId } from '@lib/auth/current-user';
import { getUserSubscription } from '@lib/billing/entitlements';
import { isClientFeatureEnabled } from '@lib/features';
import SetupWizard from '../setup/SetupWizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const userId = await currentUserId();
  const breachImportEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT');
  const settlementSearchEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');
  const subscription = await getUserSubscription(userId);

  const [profile] = await db
    .select()
    .from(schema.profile)
    .where(eq(schema.profile.userId, userId))
    .limit(1);
  const profileComplete = Boolean(
    profile?.legalName
    && ((profile.emailsJson?.length ?? 0) > 0 || (profile.phonesJson?.length ?? 0) > 0),
  );
  const purchases = (await db
    .select({ n: count() })
    .from(schema.purchases)
    .where(eq(schema.purchases.userId, userId)))[0]?.n ?? 0;
  const breaches = breachImportEnabled
    ? (await db
      .select({ n: count() })
      .from(schema.dataBreachExposure)
      .where(eq(schema.dataBreachExposure.userId, userId)))[0]?.n ?? 0
    : 0;
  const activePermissions = (await db
    .select({ n: count() })
    .from(schema.classAuthorizations)
    .where(and(
      eq(schema.classAuthorizations.userId, userId),
      eq(schema.classAuthorizations.enabled, true),
    )))[0]?.n ?? 0;
  const matches = (await db
    .select({ n: count() })
    .from(schema.matches)
    .where(eq(schema.matches.userId, userId)))[0]?.n ?? 0;

  const evidenceCount = purchases + breaches;
  const factsReady = profileComplete && evidenceCount > 0;
  const reviewReady = matches > 0;
  const permissionsReady = activePermissions > 0;
  const completedSteps = [factsReady, permissionsReady, reviewReady].filter(Boolean).length;

  const onboardingSteps = [
    {
      title: 'Fill out basic info',
      detail: 'Start with name, contact details, and a mailing address so ClaimBot can compare records correctly.',
      href: '#onboarding-intake',
      action: 'Enter basic info',
      icon: UserRound,
      status: factsReady ? 'done' : 'current',
      statusLabel: profileComplete ? 'Saved' : 'Start here',
    },
    {
      title: 'Add purchase or notice facts',
      detail: 'Add products, subscriptions, breach notices, or other facts that can support possible matches.',
      href: '#onboarding-intake',
      action: 'Add facts',
      icon: FileText,
      status: evidenceCount > 0 ? 'done' : profileComplete ? 'current' : 'locked',
      statusLabel: evidenceCount > 0 ? 'Saved' : profileComplete ? 'Next' : 'After basic info',
    },
    {
      title: 'Check possible matches',
      detail: 'ClaimBot compares saved facts with claim records and shows claims you may qualify for.',
      href: factsReady && permissionsReady ? (settlementSearchEnabled ? '/settlements' : '/review') : '#onboarding-intake',
      action: factsReady && permissionsReady ? 'Check matches' : 'Finish intake',
      icon: SearchCheck,
      status: !factsReady || !permissionsReady ? 'locked' : reviewReady ? 'done' : 'current',
      statusLabel: !factsReady || !permissionsReady ? 'After intake' : reviewReady ? 'Matches found' : 'Ready to check',
    },
  ];

  return (
    <>
      <section className="onboarding-welcome" aria-label="ClaimBot onboarding">
        <div className="onboarding-welcome-copy">
          <div className="eyebrow">Start here</div>
          <h1>Fill out basic info. ClaimBot checks for claims you may match.</h1>
          <p>
            Onboarding is the intake form. Add real facts about you, purchases, subscriptions,
            and notices, then ClaimBot can compare them against claim opportunities.
          </p>
          <div className="onboarding-welcome-actions">
            <Link className="btn" href="#onboarding-intake">
              Fill out basic info
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
            <Link className="btn ghost" href="#how-it-works">What happens next</Link>
          </div>
        </div>
        <div className="onboarding-progress-panel" aria-label="Onboarding progress">
          <span>Setup progress</span>
          <strong>{completedSteps}/3</strong>
          <small>
            {completedSteps === 0
              ? 'Start with facts'
              : completedSteps === 3
                ? 'Ready to review matches'
                : 'Keep going from the next step'}
          </small>
          <div className="onboarding-progress-bars" aria-hidden="true">
            {[factsReady, permissionsReady, reviewReady].map((done, index) => (
              <i className={done ? 'done' : ''} key={index} />
            ))}
          </div>
        </div>
      </section>

      <section className="system-posture shadow" aria-label="Onboarding boundary">
        <LockKeyhole aria-hidden="true" size={22} />
        <div>
          <strong>Nothing is submitted from onboarding.</strong>
          <span>
            Onboarding saves facts and permissions so ClaimBot can find possible matches.
            It does not guarantee eligibility or file a claim from this page.
          </span>
        </div>
      </section>

      <section className="onboarding-explainer" id="how-it-works" aria-label="How ClaimBot works">
        <div className="onboarding-explainer-lead">
          <div className="eyebrow">What happens next</div>
          <h2>Basic info turns into possible claim matches.</h2>
          <p>
            ClaimBot looks for possible matches based on the information you save. If a claim needs proof,
            has missing facts, or needs permission, it stays in review.
          </p>
        </div>
        <div className="onboarding-explainer-grid">
          <div>
            <strong>1. You fill out intake</strong>
            <span>Name, contact info, purchases, subscriptions, data notices, and proof notes.</span>
          </div>
          <div>
            <strong>2. ClaimBot checks fit</strong>
            <span>Saved facts are compared with claim records and permission settings.</span>
          </div>
          <div>
            <strong>3. You see possible matches</strong>
            <span>ClaimBot shows claims you may qualify for and what still needs review.</span>
          </div>
        </div>
      </section>

      <section className="onboarding-step-grid" aria-label="Three onboarding steps">
        {onboardingSteps.map(({ action, detail, href, icon: Icon, status, statusLabel, title }, index) => (
          <Link
            className={`onboarding-step-card ${status}`}
            href={href}
            key={title}
            aria-current={status === 'current' ? 'step' : undefined}
          >
            <div className="onboarding-step-head">
              <span className="onboarding-step-number">{index + 1}</span>
              <Icon aria-hidden="true" size={20} />
            </div>
            <div>
              <small>{statusLabel}</small>
              <h2>{title}</h2>
              <p>{detail}</p>
            </div>
            <span className="onboarding-step-action">
              {action}
              <ArrowRight aria-hidden="true" size={15} />
            </span>
          </Link>
        ))}
      </section>

      <section className="onboarding-intake-panel" id="onboarding-intake" aria-label="Onboarding intake form">
        <div className="onboarding-intake-head">
          <div>
            <div className="eyebrow">Intake form</div>
            <h2>Start by filling out the basic information below.</h2>
            <p>
              After intake, ClaimBot can check for possible matches. The result is a review list,
              not a legal guarantee or payout promise.
            </p>
          </div>
        </div>
        <SetupWizard
          breachImportEnabled={breachImportEnabled}
          settlementSearchEnabled={settlementSearchEnabled}
          startWithProfile
          subscription={{
            automationEnabled: subscription.automationEnabled,
            plan: subscription.plan,
            status: subscription.status,
          }}
        />
      </section>

      <div className="trust-strip onboarding-safeguards" aria-label="Onboarding safeguards">
        <div className="trust-item">
          <strong>Saved facts only</strong>
          <span>ClaimBot uses what you provide. It does not invent purchases, notices, or dates.</span>
        </div>
        <div className="trust-item">
          <strong>Proof stays manual</strong>
          <span>Receipt, document, or uncertain claims stay in review until handled.</span>
        </div>
        <div className="trust-item">
          <strong>Permission required</strong>
          <span>Claim categories stay blocked until you choose what ClaimBot may handle.</span>
        </div>
        <div className="trust-item">
          <strong>Account history</strong>
          <span>Your saved changes and claim activity are visible from your account.</span>
        </div>
      </div>

      <section className="onboarding-next-panel" aria-label="What happens after onboarding">
        <div>
          <div className="eyebrow">After onboarding</div>
          <h2>ClaimBot can start checking for possible matches.</h2>
          <p>
            Add facts when something changes, review possible matches when ClaimBot finds them,
            and track only the claims you approve.
          </p>
        </div>
        <div className="onboarding-next-list">
          <Link href="/profile">
            <FileText aria-hidden="true" size={18} />
            <span>
              <strong>Update facts</strong>
              <small>Name, contact details, purchases, subscriptions, and notices.</small>
            </span>
          </Link>
          <Link href="/eligibility">
            <ShieldCheck aria-hidden="true" size={18} />
            <span>
              <strong>Check claim fit</strong>
              <small>See evidence, blockers, and possible matches before anything moves forward.</small>
            </span>
          </Link>
          <Link href="/claims">
            <CheckCircle2 aria-hidden="true" size={18} />
            <span>
              <strong>Track approved claims</strong>
              <small>Follow the claims you approve from review into status tracking.</small>
            </span>
          </Link>
        </div>
      </section>

      <details className="dashboard-detail-drawer onboarding-detail-drawer" aria-label="More onboarding details">
        <summary>
          <span>
            <strong>Optional account pages</strong>
            <small>Pricing, trust, support, and account controls for users who want more context.</small>
          </span>
          <b>{activePermissions} permission{activePermissions === 1 ? '' : 's'} active</b>
        </summary>
        <div className="help-grid">
          <Link className="help-card" href="/pricing">
            <h2>Paid automation</h2>
            <p>Compare free review with paid convenience before choosing a plan.</p>
            <span>View pricing</span>
          </Link>
          <Link className="help-card" href="/trust">
            <h2>Trust and safety</h2>
            <p>See the plain-language boundaries around facts, review, and claim tracking.</p>
            <span>Open trust page</span>
          </Link>
          <Link className="help-card" href="/contact">
            <h2>Support</h2>
            <p>Ask for help when getting started, matching, or claim status is unclear.</p>
            <span>Contact support</span>
          </Link>
          <Link className="help-card" href="/settings">
            <h2>Account controls</h2>
            <p>Manage the settings that affect account access and review behavior.</p>
            <span>Open settings</span>
          </Link>
        </div>
      </details>
    </>
  );
}
