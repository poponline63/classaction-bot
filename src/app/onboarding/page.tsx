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
import { isClientFeatureEnabled } from '@lib/features';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const userId = await currentUserId();
  const breachImportEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT');
  const settlementSearchEnabled = isClientFeatureEnabled('CLAIMBOT_FEATURE_SETTLEMENT_SEARCH');

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
  const primaryAction = !factsReady
    ? { href: '/setup', label: 'Start with facts' }
    : !reviewReady
      ? { href: settlementSearchEnabled ? '/settlements' : '/review', label: 'Find matches' }
      : !permissionsReady
        ? { href: '/permissions', label: 'Choose permissions' }
        : { href: '/review', label: 'Review matches' };

  const onboardingSteps = [
    {
      title: 'Add your facts',
      detail: 'Save your name, contact info, purchases, subscriptions, and notices you already have.',
      href: '/setup',
      action: 'Start with facts',
      icon: UserRound,
      status: factsReady ? 'done' : 'current',
      statusLabel: factsReady ? 'Started' : 'Start here',
    },
    {
      title: 'Find possible matches',
      detail: settlementSearchEnabled
        ? 'ClaimBot compares saved facts with claim sources and shows what looks relevant.'
        : 'ClaimBot reviews assigned claim opportunities against the facts saved in your account.',
      href: settlementSearchEnabled ? '/settlements' : '/review',
      action: settlementSearchEnabled ? 'Find claims' : 'Open review',
      icon: SearchCheck,
      status: !factsReady ? 'locked' : reviewReady ? 'done' : 'current',
      statusLabel: !factsReady ? 'After facts' : reviewReady ? 'Matches found' : 'Next step',
    },
    {
      title: 'Review and track',
      detail: 'Choose allowed categories, review possible matches, then track only claims you approve.',
      href: permissionsReady ? '/review' : '/permissions',
      action: permissionsReady ? 'Review matches' : 'Set permissions',
      icon: ClipboardCheck,
      status: permissionsReady ? 'done' : factsReady ? 'current' : 'locked',
      statusLabel: permissionsReady ? 'Ready' : factsReady ? 'Needs choice' : 'After facts',
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Start here</div>
          <h1>Get ClaimBot ready in three simple steps</h1>
          <p>
            Add facts, choose what ClaimBot may review, then check possible matches.
            New users can start here and ignore the extra account pages until later.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" href={primaryAction.href}>
            {primaryAction.label}
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
          <Link className="btn ghost" href="/help">Get help</Link>
        </div>
      </div>

      <section className="system-posture shadow" aria-label="Onboarding boundary">
        <LockKeyhole aria-hidden="true" size={22} />
        <div>
          <strong>Nothing is submitted from onboarding.</strong>
          <span>
            Onboarding only saves facts, starts review, and helps you choose what ClaimBot may handle.
          </span>
        </div>
      </section>

      <section className="onboarding-quickstart" aria-label="Onboarding quickstart">
        <div className="onboarding-quickstart-copy">
          <div className="eyebrow">Simple path</div>
          <h2>Most users only need this page first.</h2>
          <p>
            Start with facts, choose permissions, then review possible matches. The deeper
            account pages stay available, but new users should not need them on day one.
          </p>
        </div>
        <div className="onboarding-status-card">
          <span>{factsReady ? 'Basics started' : 'Facts needed'}</span>
          <strong>{evidenceCount}</strong>
          <small>saved evidence record{evidenceCount === 1 ? '' : 's'}</small>
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

      <div className="trust-strip" aria-label="Onboarding safeguards">
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
          <h2>Keep using the same three-part workflow.</h2>
          <p>
            Add facts when something changes, review possible matches when ClaimBot finds them,
            and track only the claims you want to move forward.
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
            <strong>More onboarding details</strong>
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
