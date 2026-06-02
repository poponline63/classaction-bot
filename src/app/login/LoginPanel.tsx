'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import {
  AuthError,
  acceptInvite,
  getSettings,
  getUser,
  handleAuthCallback,
  login,
  oauthLogin,
  signup,
  updateUser,
} from '@netlify/identity';
import { CircleUserRound, LockKeyhole, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  clientSafeLaunchAction,
  clientSafeLaunchLabel,
  clientSafeProofArtifactSummary,
  clientSafeRequiredInputSummary,
} from '@lib/client-safe-launch-copy';
import { canUseNetlifyIdentity } from '../identity-env';
import AuthAccessBrowser, { type AuthAccessBrowserRow } from './AuthAccessBrowser';

// Guardrail marker: Protected workspace routes open only after the hosted sign-in and signed app session line up.

type Mode = 'login' | 'signup';
type CallbackMode = 'invite' | 'recovery' | null;
type IdentitySessionUser = {
  email?: string;
  token?: {
    access_token?: string;
  };
};

type IdentitySettings = {
  disableSignup?: boolean;
  providers?: Record<string, boolean>;
};

export type ClientPreviewLoginGate = {
  clientPreviewReady: boolean;
  readyCount: number;
  totalCount: number;
  blockedCount: number;
  launchPacketReadyCount: number;
  launchPacketTotalCount: number;
  nextStep: {
    label: string;
    owner: string;
    nextAction: string;
    setupBoundary: string;
    requiredInputs: string[];
    proofArtifactCount: number;
  } | null;
};

const accessBriefRows = [
  {
    title: 'Account opens the workspace',
    body: 'Sign-in protects profile facts, evidence records, permissions, claim status, and audit history.',
  },
  {
    title: 'Live filing stays locked',
    body: 'Signing in does not enable live submissions; review mode, account checks, and saved approval still apply.',
  },
  {
    title: 'Permission is category-scoped',
    body: 'ClaimBot still requires active category permission before a match can move into automated final checks.',
  },
  {
    title: 'Proof remains user-controlled',
    body: 'Documents, signatures, purchase records, and notice letters stay manual when a settlement asks for proof.',
  },
];

const preInviteGateRows = [
  {
    label: 'Hosted account access enabled',
    detail: 'Account access must be enabled on the confirmed ClaimBot site before login links are sent.',
    status: 'Access clear',
  },
  {
    label: 'Invite-only registration confirmed',
    detail: 'Account access should start from approved invitations, with signup settings checked before links are sent.',
    status: 'Invite check',
  },
  {
    label: 'Secure app session ready',
    detail: 'Protected workspace routes open only after sign-in and account access line up.',
    status: 'Access check',
  },
  {
    label: 'Filing safety stays separate',
    detail: 'Account access never approves live filing, payout claims, legal decisions, or proof-required submissions.',
    status: 'Safety lock',
  },
];

const firstAccessPathRows = [
  {
    step: '1',
    label: 'Open protected workspace',
    body: 'Sign in to reach profile facts, saved evidence, match review, claim status, and account history.',
  },
  {
    step: '2',
    label: 'Complete facts and permissions',
    body: 'Add only facts you can review, then enable category permissions before any match can move forward.',
  },
  {
    step: '3',
    label: 'Review before filing',
    body: 'Proof-required, uncertain, unsupported, or unpermitted items stay in manual review until the blocker is resolved.',
  },
  {
    step: '4',
    label: 'Stay in shadow mode first',
    body: 'The first customer run prepares reviewable records only; live filing remains locked behind account checks.',
  },
];

async function syncAppSession(user: IdentitySessionUser | null | undefined) {
  const token = user?.token?.access_token;
  if (!token) throw new Error('Account access did not return a sign-in token.');
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to establish app session.');
}

export default function LoginPanel({ clientPreviewGate }: { clientPreviewGate: ClientPreviewLoginGate }) {
  return (
    <Suspense fallback={<LoginShellFallback />}>
      <LoginPanelContent clientPreviewGate={clientPreviewGate} />
    </Suspense>
  );
}

function LoginShellFallback() {
  return (
    <section className="auth-page">
      <div className="auth-panel">
        <div>
          <div className="eyebrow">Account access</div>
          <h1>Sign in to ClaimBot</h1>
          <p>Loading account access.</p>
        </div>
      </div>
    </section>
  );
}

function LoginPanelContent({ clientPreviewGate }: { clientPreviewGate: ClientPreviewLoginGate }) {
  const searchParams = useSearchParams();
  const next = useMemo(() => searchParams.get('next') || '/', [searchParams]);
  const [mode, setMode] = useState<Mode>('login');
  const [callbackMode, setCallbackMode] = useState<CallbackMode>(null);
  const [inviteToken, setInviteToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [identityReady, setIdentityReady] = useState(true);
  const [identitySettings, setIdentitySettings] = useState<IdentitySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const signupEnabled = identityReady && identitySettings?.disableSignup !== true;
  const googleEnabled = identityReady && identitySettings?.providers?.google === true;
  const handlingInvite = callbackMode === 'invite';
  const handlingRecovery = callbackMode === 'recovery';
  const authTitle = handlingInvite
    ? 'Accept your ClaimBot invitation'
    : handlingRecovery
      ? 'Set a new ClaimBot password'
      : mode === 'login'
        ? 'Sign in to ClaimBot'
        : 'Create your ClaimBot account';
  const primaryLabel = handlingInvite
    ? 'Accept invitation'
    : handlingRecovery
      ? 'Set password'
      : mode === 'login'
        ? 'Sign in'
        : 'Create account';
  const accessBrowserRows: AuthAccessBrowserRow[] = [
  {
    id: 'identity-runtime',
    kind: 'identity',
      title: identityReady ? 'Sign-in is available' : 'Sign-in needs account setup',
      detail: identityReady
        ? 'ClaimBot can load account settings and open the private workspace.'
        : 'Sign-in becomes available after the site is deployed securely and account access is enabled.',
      value: identityReady ? 'Sign-in ready' : 'Sign-in unavailable',
      tone: identityReady ? 'pass' : 'fail',
    },
    {
      id: 'identity-registration',
      kind: 'identity',
      title: signupEnabled ? 'Registration controls available' : 'Invite-only access posture',
      detail: signupEnabled
        ? 'Signup is available according to account access settings; email confirmation may still be required.'
        : 'Registration is disabled or unavailable, so users should enter through an invitation.',
      value: signupEnabled ? 'Signup enabled' : 'Invite-only',
      tone: signupEnabled ? 'pass' : 'warn',
    },
    {
      id: 'route-next',
      kind: 'route',
      title: 'Protected route check',
      detail: `After session exchange, ClaimBot redirects to ${next}. The destination does not change filing mode or bypass review checks.`,
      value: next,
      tone: 'pass',
    },
    {
      id: 'provider-google',
      kind: 'provider',
      title: googleEnabled ? 'Google provider enabled' : 'Google provider not enabled',
      detail: googleEnabled
        ? 'Account access settings expose Google sign-in for this deployment.'
        : 'Email/password remains available when account access is ready; Google appears only after the provider is enabled.',
      value: googleEnabled ? 'OAuth ready' : 'Email/password only',
      tone: googleEnabled ? 'pass' : 'warn',
    },
    {
      id: 'safety-shadow',
      kind: 'safety',
      title: 'Shadow-mode default remains active',
      detail: 'Signing in opens private review tools only. Live filing remains locked behind feature flags, saved approval, account history, and account checks.',
      value: 'Shadow review only',
      tone: 'pass',
    },
    {
      id: 'safety-authority',
      kind: 'safety',
      title: 'Claim permission is still separate',
      detail: 'Category permissions, proof review, plan checks, and final checks still decide whether any claim can move forward.',
      value: 'Permission required',
      tone: 'pass',
    },
    {
      id: 'client-preview-gate',
      kind: 'safety',
      title: clientPreviewGate.clientPreviewReady ? 'Account access checks are clear' : 'Account access still needs checks',
      detail: clientPreviewGate.nextStep
        ? `Needed next: ${clientSafeLaunchLabel(clientPreviewGate.nextStep)}. ${clientSafeLaunchAction(clientPreviewGate.nextStep)}`
        : 'The account checklist is clear for this workspace.',
      value: clientPreviewGate.clientPreviewReady ? 'Access ready' : `${clientPreviewGate.blockedCount} account checks`,
      tone: clientPreviewGate.clientPreviewReady ? 'pass' : 'warn',
    },
  ];

  useEffect(() => {
    let active = true;
    async function init() {
      if (!canUseNetlifyIdentity()) {
        setIdentityReady(false);
        return;
      }
      try {
        const settings = await getSettings();
        if (!active) return;
        setIdentitySettings(settings as IdentitySettings);
        if ((settings as IdentitySettings).disableSignup) setMode('login');
        const callback = await handleAuthCallback();
        if (callback?.type === 'invite' && callback.token) {
          setCallbackMode('invite');
          setInviteToken(callback.token);
          setMessage('Set a password to accept your invitation. ClaimBot will keep the first run in shadow mode.');
          return;
        }
        if (callback?.type === 'recovery' && callback.user) {
          setCallbackMode('recovery');
          setMessage('Enter a new password to finish account recovery.');
          return;
        }
        const user = callback?.user ?? await getUser();
        if (user) {
          await syncAppSession(user as IdentitySessionUser);
          window.location.href = next;
        }
      } catch {
        setIdentityReady(false);
      }
    }

    void init();
    return () => {
      active = false;
    };
  }, [next]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUseNetlifyIdentity()) {
      setIdentityReady(false);
      setError('Sign-in is available after the site is deployed securely.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (handlingInvite) {
        if (!inviteToken) throw new Error('Invitation token is missing.');
        const user = await acceptInvite(inviteToken, password);
        await syncAppSession(user as IdentitySessionUser);
        window.location.href = next;
        return;
      }

      if (handlingRecovery) {
        const user = await updateUser({ password });
        await syncAppSession(user as IdentitySessionUser);
        window.location.href = next;
        return;
      }

      if (mode === 'login') {
        const user = await login(email, password);
        await syncAppSession(user as IdentitySessionUser);
        window.location.href = next;
        return;
      }

      if (!signupEnabled) {
        setMode('login');
        setError('Registration is invite-only for this deployment. Use your email invitation, then sign in.');
        return;
      }

      const user = await signup(email, password, { full_name: name });
      const emailVerified = (user as { emailVerified?: boolean }).emailVerified;
      if (emailVerified) {
        await syncAppSession(user as IdentitySessionUser);
        window.location.href = next;
        return;
      }
      setMessage('Check your email to confirm the account, then sign in.');
    } catch (err) {
      if (err instanceof AuthError) {
        setError(err.status === 401 ? 'Invalid email or password.' : err.message);
      } else {
        setError('Account sign-in is not available in this environment yet.');
        setIdentityReady(false);
      }
    } finally {
      setSaving(false);
    }
  }

  const accountEntry = (
    <>
      <form className="form login-entry-form" onSubmit={submit}>
        {mode === 'signup' && !callbackMode && (
          <div>
            <label htmlFor="name">Name</label>
            <input id="name" type="text" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
        )}
        {!callbackMode && (
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
        )}
        <div>
          <label htmlFor="password">{handlingInvite || handlingRecovery ? 'New password' : 'Password'}</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>

        {error && <div className="notice warn">{error}</div>}
        {message && <div className="notice">{message}</div>}

        <div className="auth-submit-brief" aria-label="Sign-in safety boundary">
          <ShieldCheck aria-hidden="true" size={18} />
          <div>
            <strong>Secure workspace access</strong>
            <p>
              Sign-in opens your private review workspace. Paid automation still requires your saved
              permission, proof checks, account checks, and an activity record before any filing job can run.
            </p>
          </div>
        </div>

        <button className="btn" type="submit" disabled={saving || !identityReady}>
          {mode === 'login' ? <LogIn aria-hidden="true" size={16} /> : <UserPlus aria-hidden="true" size={16} />}
          {saving ? 'Working...' : primaryLabel}
        </button>
        {googleEnabled && !callbackMode ? (
          <button className="btn ghost" type="button" disabled={!identityReady} onClick={() => oauthLogin('google')}>
            Continue with Google
          </button>
        ) : !callbackMode ? (
          <div className="auth-provider-note">
            Google sign-in appears here after the provider is enabled for this site.
          </div>
        ) : null}
      </form>

      {callbackMode ? (
        <button
          className="link-button"
          type="button"
          onClick={() => {
            setCallbackMode(null);
            setInviteToken('');
            setPassword('');
            setMessage('');
            setMode('login');
          }}
        >
          Return to sign in
        </button>
      ) : signupEnabled ? (
        <button className="link-button" type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
      ) : (
        <div className="offline-note">
          Registration is invite-only for this deployment. Use your invitation email, then sign in
          without changing the filing checks.
        </div>
      )}
    </>
  );

  return (
    <section className="auth-page">
      <div className="auth-panel">
        <div>
          <div className="eyebrow">Account access</div>
          <h1>{authTitle}</h1>
          <p>
            Sign in to your private ClaimBot workspace to review matches, profile facts, saved
            evidence, permissions, and claim activity.
          </p>
        </div>

        {!identityReady && (
          <div className="notice warn login-access-warning">
            <strong>Sign-in is waiting on account access.</strong>
            <p>
              The live site must have secure account access enabled before customers get login links.
              You can still preview this workspace locally while account checks are unfinished.
            </p>
          </div>
        )}

        {accountEntry}

        <section className="login-simple-after-signin" aria-label="After sign-in summary">
          <div>
            <div className="access-brief-kicker">After sign-in</div>
            <h2>One sign-in, three things stay true.</h2>
          </div>
          <div className="login-simple-after-signin-grid">
            <div>
              <strong>Private workspace</strong>
              <span>Review profile facts, matches, permissions, and claim status.</span>
            </div>
            <div>
              <strong>Review mode first</strong>
              <span>Signing in does not turn on live filing.</span>
            </div>
            <div>
              <strong>Proof stays manual</strong>
              <span>Documents, purchase records, and uncertain claims still pause for review.</span>
            </div>
          </div>
        </section>

        <details className="dashboard-detail-drawer login-access-details" aria-label="More access and safety details">
          <summary>
            <span>
              <strong>More access details</strong>
              <small>Account access, first access path, and review-mode boundaries.</small>
            </span>
            <b>{clientPreviewGate.clientPreviewReady ? 'Ready' : `${clientPreviewGate.blockedCount} items`}</b>
          </summary>

        <section className="login-client-preview-gate" aria-label="Login account access">
          <div className="login-client-preview-gate-head">
            <div>
              {/* Guardrail markers: Login readiness. Login invites wait for account readiness. */}
              <div className="access-brief-kicker">Login access</div>
              <h2>{clientPreviewGate.clientPreviewReady ? 'Login invites can use the cleared account status' : 'Login invites wait for account checks'}</h2>
              <p>
                This login page uses the same account checklist shown in status, Pricing,
                Trust, and the paid automation locks.
              </p>
            </div>
            <span className={`tag ${clientPreviewGate.clientPreviewReady ? 'good' : 'warn'}`}>
              {clientPreviewGate.readyCount}/{clientPreviewGate.totalCount} account checks
            </span>
          </div>
          <div className="login-client-preview-gate-grid">
            <div>
              <strong>Account access</strong>
              <span>{clientPreviewGate.clientPreviewReady ? 'Ready' : `${clientPreviewGate.blockedCount} checks left`}</span>
            </div>
            <div>
              <strong>Account checks</strong>
              <span>{clientPreviewGate.launchPacketReadyCount}/{clientPreviewGate.launchPacketTotalCount} ready</span>
            </div>
            <div>
              <strong>Needed next</strong>
              <span>{clientPreviewGate.nextStep ? clientSafeLaunchLabel(clientPreviewGate.nextStep) : 'No outside account step'}</span>
            </div>
          </div>
          {clientPreviewGate.nextStep && (
            <div className="login-client-preview-next-step">
              <strong>Next action: {clientSafeLaunchAction(clientPreviewGate.nextStep)}</strong>
              <p>Why this waits: {clientPreviewGate.nextStep.setupBoundary}</p>
              <div className="login-client-preview-lists">
                <span>Needed next: {clientSafeRequiredInputSummary(clientPreviewGate.nextStep.requiredInputs, 4)}</span>
                <span>Current status: {clientSafeProofArtifactSummary(clientPreviewGate.nextStep)}</span>
              </div>
            </div>
          )}
          <div className="status-row">
            <Link className="btn ghost sm" href="/launch">Open account status</Link>
            <Link className="btn ghost sm" href="/packets">Open details</Link>
            <Link className="btn ghost sm" href="/contact">Contact support</Link>
          </div>
        </section>

        <section className="pre-invite-auth-gate" aria-label="Pre-invite access check">
          <div className="pre-invite-auth-gate-head">
            <div>
              <div className="access-brief-kicker">Pre-invite access check</div>
              <h2>Do not send login links until account access is confirmed</h2>
              <p>
                This page depends on confirmed account access. It can explain the sign-in boundary now,
                but login links wait until account checks are recorded.
              </p>
            </div>
            <Link className="btn ghost sm" href="/launch#production-gates">Open account checks</Link>
          </div>
          <div className="pre-invite-auth-gate-grid">
            {preInviteGateRows.map((row) => (
              <article className="pre-invite-auth-gate-item" key={row.label}>
                <span>{row.status}</span>
                <strong>{row.label}</strong>
                <p>{row.detail}</p>
            </article>
          ))}
          </div>
        </section>

          <AuthAccessBrowser rows={accessBrowserRows} />

        <details className="dashboard-detail-drawer login-first-access-drawer" aria-label="First access and safety details">
          <summary>
            <span>
              <strong>First access path</strong>
              <small>First access path, account safeguards, and review-mode boundaries.</small>
            </span>
            <b>Shadow-first</b>
          </summary>

          <section className="first-access-path" aria-label="First Access Path">
            <div className="first-access-path-head">
              <div>
                <div className="access-brief-kicker">First Access Path</div>
                <h2>What happens after sign-in</h2>
                <p>
                  Account access starts a guided review workspace. It does not decide legal outcomes
                  or bypass permission, proof, account checks, or activity records.
                </p>
              </div>
              <span className="tag blue">Shadow-first</span>
            </div>
            <div className="first-access-path-grid">
              {firstAccessPathRows.map((row) => (
                <article className="first-access-path-item" key={row.step}>
                  <span aria-hidden="true">{row.step}</span>
                  <div>
                    <strong>{row.label}</strong>
                    <p>{row.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="access-brief" aria-label="First access brief">
            <div className="access-brief-head">
              <div>
                <div className="access-brief-kicker">First access brief</div>
                <h2>Protected access, unchanged filing checks</h2>
              </div>
              <Link className="btn ghost sm" href="/launch">Review account status</Link>
            </div>
            <div className="access-brief-grid">
              {accessBriefRows.map((row) => (
                <div className="access-brief-item" key={row.title}>
                  <span className="readiness-dot pass" aria-hidden="true" />
                  <div>
                    <strong>{row.title}</strong>
                    <p>{row.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="auth-trust-grid" aria-label="Account access safeguards">
            <div className="auth-trust-item">
              <ShieldCheck aria-hidden="true" size={18} />
              <div>
                <strong>Protected workspace</strong>
                <span>Profile facts, matches, claims, and audit records require an authenticated account.</span>
              </div>
            </div>
            <div className="auth-trust-item">
              <LockKeyhole aria-hidden="true" size={18} />
              <div>
                <strong>Signed app session</strong>
                <span>Sign-in opens a protected app session before private routes load.</span>
              </div>
            </div>
            <div className="auth-trust-item">
              <CircleUserRound aria-hidden="true" size={18} />
              <div>
                <strong>User control first</strong>
                <span>Claim submissions still require permission, evidence checks, and account checks.</span>
              </div>
            </div>
            <div className="auth-trust-item">
              <ShieldCheck aria-hidden="true" size={18} />
              <div>
                <strong>Shadow-mode default</strong>
                <span>Signing in does not turn on live filing; the app stays in review mode until account checks pass.</span>
              </div>
            </div>
          </div>

          <div className="offline-note">
            Signing in protects the private workspace, but it does not change filing mode. ClaimBot
            still requires matcher review, category permission, proof review, and account checks
            before any live filing path is considered.
          </div>
        </details>
        </details>

        <div className="auth-panel-links">
          <Link className="btn ghost sm" href="/launch">Account details</Link>
          <Link className="btn ghost sm" href="/privacy-policy">Privacy policy</Link>
          <Link className="btn ghost sm" href="/terms">Terms</Link>
        </div>
      </div>
    </section>
  );
}
