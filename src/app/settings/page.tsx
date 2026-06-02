import {
  deployCommands,
  getLaunchFixCommand,
  getLaunchReadiness,
  localAuthSmokeCommands,
  previewSmokeCommands,
  secretCommands,
  verificationCommands,
} from '@lib/launch-readiness';
import { db, schema } from '@db/client';
import { and, count, eq } from 'drizzle-orm';
import { currentUserId } from '@lib/auth/current-user';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import { stripOperatorRunbookText } from '@lib/client-safe-launch-copy';
import { hasTemplatePlaceholder } from '@lib/bootstrap-audit-stamp';
import { buildLaunchActionPlan, summarizeLaunchActionPlan } from '@lib/launch-action-plan';
import { AlertOctagon, CheckCircle2, ClipboardCheck, LockKeyhole, ServerCog, Settings2 } from 'lucide-react';
import CliCommandRows from '../CliCommandRows';
import LaunchReadinessCommandBar from '../LaunchReadinessCommandBar';
import SettingsForm from './SettingsForm';
import SettingsControlBrowser, { type SettingsControlRow } from './SettingsControlBrowser';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const userId = await currentUserId();
  const [launchReadiness, clientPreviewChecklist] = await Promise.all([
    getLaunchReadiness(),
    buildClientPreviewChecklist(userId),
  ]);
  const {
    blockers,
    breachImportEnabled,
    current,
    featureFlags,
    liveAck,
    liveFilingFeatureEnabled,
    mode,
    readiness,
    warnings,
  } = launchReadiness;
  const enabledFeatureCount = featureFlags.filter((flag) => flag.enabled).length;
  const proofReviewCount = (await db
    .select({ n: count() })
    .from(schema.matches)
    .where(and(eq(schema.matches.userId, userId), eq(schema.matches.verdict, 'NEEDS_REVIEW'))))[0]?.n ?? 0;
  const auditEventCount = (await db
    .select({ n: count() })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.userId, userId)))[0]?.n ?? 0;
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
  const scraperUserAgent = process.env.SCRAPER_USER_AGENT?.trim() ?? '';
  const supportEmail = process.env.CLAIMBOT_SUPPORT_EMAIL?.trim() ?? '';
  const sessionSecret = process.env.CLAIMBOT_SESSION_SECRET?.trim() ?? '';
  const authDisabled = process.env.CLAIMBOT_DISABLE_AUTH === 'true';
  const sessionSecretConfigured = Boolean(sessionSecret) && !hasTemplatePlaceholder(sessionSecret);
  const sessionSecretReady = sessionSecretConfigured && sessionSecret.length >= 32;
  const supportEmailConfigured = Boolean(supportEmail) && !hasTemplatePlaceholder(supportEmail);
  const databaseReady = Boolean(databaseUrl) && !databaseUrl.startsWith('file:') && !hasTemplatePlaceholder(databaseUrl);
  const scraperContactReady = Boolean(scraperUserAgent.includes('http')) && !hasTemplatePlaceholder(scraperUserAgent);
  const dailyCap = current.claim_filer_max_per_day ?? '20';
  const launchCanBeArmed = readiness.ok && liveFilingFeatureEnabled && mode === 'shadow';
  const clientPreviewReady = clientPreviewChecklist.summary.clientPreviewReady;
  const clientPreviewBlockedItems = clientPreviewChecklist.items.filter((item) => item.status !== 'ready');
  const paidAutomationBlockers = clientPreviewChecklist.fullAutomationLaunchBlockers.rows;
  const paidAutomationBlockerSummary = clientPreviewChecklist.fullAutomationLaunchBlockers.summary;
  const settingsActionPlan = buildLaunchActionPlan(clientPreviewChecklist.launchCriticalPath);
  const settingsActionPlanSummary = summarizeLaunchActionPlan(settingsActionPlan);
  const settingsActionPlanRows = settingsActionPlan.slice(0, 5);
  const launchPacketStackReady =
    clientPreviewChecklist.summary.launchPacketReadyCount === clientPreviewChecklist.summary.launchPacketTotalCount;
  const inviteGateClear = clientPreviewReady && mode === 'shadow' && !authDisabled && sessionSecretReady;
  const safeLaunchLabel = inviteGateClear
    ? 'Safe for client preview'
    : !clientPreviewReady
      ? 'Safety checks required'
      : mode !== 'shadow'
        ? 'Return to shadow before invite'
        : !sessionSecretReady || authDisabled
          ? 'Hosted access locked'
          : 'Review warnings before invite';
  const safeLaunchDetail = inviteGateClear
    ? 'The full client-preview checklist, launch packet stack, auth, session signing, and shadow posture line up for preview review. Live filing still needs explicit review.'
    : !clientPreviewReady
      ? `${clientPreviewChecklist.summary.blockedCount} product requirement${clientPreviewChecklist.summary.blockedCount === 1 ? '' : 's'} and ${clientPreviewChecklist.summary.launchPacketTotalCount - clientPreviewChecklist.summary.launchPacketReadyCount} setup record${clientPreviewChecklist.summary.launchPacketTotalCount - clientPreviewChecklist.summary.launchPacketReadyCount === 1 ? '' : 's'} still block client invites. ${stripOperatorRunbookText(clientPreviewChecklist.summary.nextStep?.nextAction) || 'Review the client-preview checklist before inviting clients.'}`
      : mode !== 'shadow'
        ? 'Live mode is active. Put the workspace back into shadow mode before sharing a client preview.'
        : !sessionSecretReady || authDisabled
          ? 'Hosted client access needs signed sessions and auth enabled before preview.'
          : 'No required blockers are present, but warnings should be reviewed before preview.';
  const safeLaunchReasons = [
    {
      label: 'Checklist',
      value: clientPreviewReady ? 'Clear' : `${clientPreviewChecklist.summary.readyCount}/${clientPreviewChecklist.summary.totalCount}`,
      tone: clientPreviewReady ? 'pass' : 'warn',
    },
    {
      label: 'Packets',
      value: `${clientPreviewChecklist.summary.launchPacketReadyCount}/${clientPreviewChecklist.summary.launchPacketTotalCount}`,
      tone: launchPacketStackReady ? 'pass' : 'warn',
    },
    {
      label: 'Readiness',
      value: blockers.length > 0 ? `${blockers.length} blockers` : warnings.length > 0 ? `${warnings.length} warnings` : 'Clear',
      tone: blockers.length > 0 ? 'warn' : warnings.length > 0 ? 'warn' : 'pass',
    },
    {
      label: 'Access',
      value: authDisabled ? 'Auth disabled' : sessionSecretReady ? 'Signed' : 'Secret needed',
      tone: !authDisabled && sessionSecretReady ? 'pass' : 'warn',
    },
    {
      label: 'Mode',
      value: mode === 'shadow' ? 'Shadow' : 'Live',
      tone: mode === 'shadow' ? 'pass' : 'warn',
    },
    {
      label: 'History',
      value: `${auditEventCount} events`,
      tone: 'pass',
    },
  ];
  const blockerHrefByKey: Record<string, string> = {
    'filing-mode': '#runtime-settings',
    'daily-cap': '#claim_filer_max_per_day',
  };
  const shieldRows = [
    {
      title: 'Posture lock',
      status: mode === 'live' ? 'warn' : 'pass',
      detail: mode === 'live'
        ? 'Live mode is enabled. Keep this under business-owner review and monitor the queue closely.'
        : 'Shadow mode is active. ClaimBot prepares and audits claim work before submission.',
      meta: mode === 'live' ? 'Live active' : 'Shadow active',
    },
    {
      title: 'Identity & auth gates',
      status: authDisabled || !sessionSecretConfigured ? 'warn' : 'pass',
      detail: authDisabled
        ? 'Hosted access must require a signed app session before client invitations.'
        : sessionSecretConfigured
          ? 'Auth is required and session signing is configured for protected client access.'
          : 'Add a session signing secret before using hosted authentication with clients.',
      meta: authDisabled ? 'Auth disabled' : sessionSecretConfigured ? 'Auth required' : 'Secret needed',
    },
    {
      title: 'Runtime guardrails',
      status: blockers.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass',
      detail: `Cap ${dailyCap}/day, ${blockers.length} blocker${blockers.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`,
      meta: blockers.length > 0 ? 'Fix blockers' : warnings.length > 0 ? 'Review warnings' : 'Clear',
    },
    {
      title: 'Arm launch',
      status: launchCanBeArmed ? 'pass' : 'warn',
      detail: launchCanBeArmed
        ? 'Hosted checks are clear for a shadow-mode client preview. Live filing still needs explicit review.'
        : liveFilingFeatureEnabled
          ? 'Resolve readiness issues and prove a shadow launch before enabling live filing.'
          : 'Live filing controls are locked by feature flag for this deployment.',
      meta: launchCanBeArmed ? 'Preview ready' : 'Locked',
    },
  ];
  const hostedHandoffRows = [
    {
      key: 'DATABASE_URL',
      readinessKey: 'database',
      label: 'Database connection string',
      configured: databaseReady,
      pendingLabel: 'Awaiting database',
      hint: 'Use a hosted database URL for persistent client records. Local file storage is development-only.',
      securityNote: 'Store the value in Netlify environment variables. Do not commit it to the repo.',
    },
    {
      key: 'SCRAPER_USER_AGENT',
      readinessKey: 'scraper-contact',
      label: 'Scraper contact identity',
      configured: scraperContactReady,
      pendingLabel: 'Awaiting contact URL',
      hint: 'Include a contact URL so hosted scraping identifies the business clearly.',
      securityNote: 'Use a public contact route or support page, not a personal secret.',
    },
    {
      key: 'CLAIMBOT_SUPPORT_EMAIL',
      readinessKey: 'support-contact',
      label: 'Support email address',
      configured: supportEmailConfigured,
      pendingLabel: 'Awaiting mailbox',
      hint: 'Route access, privacy, scraper, and safety questions to a monitored inbox.',
      securityNote: 'This may be visible to users. Use a client-support mailbox.',
    },
    {
      key: 'CLAIMBOT_SESSION_SECRET',
      readinessKey: 'session-secret',
      label: 'Session signing secret',
      configured: sessionSecretReady,
      pendingLabel: 'Awaiting secret',
      hint: 'Use a long random value so hosted app sessions can be signed safely.',
      securityNote: 'Minimum 32 characters. Do not reuse it across environments.',
    },
  ];
  const hostedEnvConfiguredCount = hostedHandoffRows.filter((row) => row.configured).length;
  const launchControlRows = [
    {
      label: 'Blocker review',
      detail: blockers.length > 0
        ? `${blockers.length} hosted blocker${blockers.length === 1 ? '' : 's'} must be fixed before client preview.`
        : 'Hosted readiness has no required blockers.',
      tone: blockers.length > 0 ? 'warn' : 'pass',
    },
    {
      label: 'Environment handoff',
      detail: `${hostedEnvConfiguredCount}/${hostedHandoffRows.length} production environment values are configured or ready for handoff.`,
      tone: hostedEnvConfiguredCount === hostedHandoffRows.length ? 'pass' : 'warn',
    },
    {
      label: 'Client invite',
      detail: inviteGateClear
        ? 'Client preview can stay behind signed access, account-scoped proof, launch packets, and shadow posture.'
        : 'Client invite remains locked until the client-preview checklist, launch packet stack, auth, session signing, and shadow posture pass.',
      tone: inviteGateClear ? 'pass' : 'warn',
    },
    {
      label: 'Shadow guardrails',
      detail: mode === 'shadow'
        ? 'Shadow mode is active; outputs remain reviewable before any live filing posture is considered.'
        : 'Live mode is active and needs business-owner review before client-facing use.',
      tone: mode === 'shadow' ? 'pass' : 'warn',
    },
  ];
  const settingsSectionCards = [
    {
      href: '#runtime-settings',
      label: 'Operational Modes',
      title: mode === 'shadow' ? 'Shadow mode active' : 'Live mode needs review',
      detail: mode === 'shadow'
        ? `Daily cap ${dailyCap}. Forms stay in preparation and audit review before submission.`
        : `Daily cap ${dailyCap}. Live posture must stay behind business-owner review and setup evidence.`,
      tone: mode === 'shadow' ? 'pass' : 'warn',
      icon: Settings2,
    },
    {
      href: '#pre-invite-gate',
      label: 'Security & Compliance',
      title: inviteGateClear ? 'Invite gate can be reviewed' : 'Invite gate locked',
      detail: inviteGateClear
        ? 'Client-preview checklist, launch packets, auth, session signing, and shadow posture line up for preview review.'
        : 'Client access stays blocked until the client-preview checklist, launch packets, auth, session signing, and shadow posture pass.',
      tone: inviteGateClear ? 'pass' : 'warn',
      icon: LockKeyhole,
    },
    {
      href: '#hosted-environment',
      label: 'Hosted Environment',
      title: `${hostedEnvConfiguredCount}/${hostedHandoffRows.length} env values ready`,
      detail: blockers.length > 0
        ? `${blockers.length} hosted blocker${blockers.length === 1 ? '' : 's'} still need setup fixes.`
        : 'Hosted environment values and production gates have no required blockers.',
      tone: hostedEnvConfiguredCount === hostedHandoffRows.length && blockers.length === 0 ? 'pass' : 'warn',
      icon: ServerCog,
    },
    {
      href: '#launch-checklist',
      label: 'Client Controls',
      title: `${enabledFeatureCount} feature flags enabled`,
      detail: `${proofReviewCount} proof or match review item${proofReviewCount === 1 ? '' : 's'} pending; ${auditEventCount} audit event${auditEventCount === 1 ? '' : 's'} recorded.`,
      tone: proofReviewCount === 0 ? 'pass' : 'warn',
      icon: ClipboardCheck,
    },
  ];
  const settingsControlRows: SettingsControlRow[] = [
    {
      key: 'filing-posture',
      label: 'Filing posture',
      value: mode === 'shadow' ? 'Shadow' : 'Live guarded',
      detail: mode === 'shadow'
        ? 'Shadow mode is active, so form work stays reviewable before submission.'
        : 'Live mode is active and should stay under business-owner review before client-facing use.',
      tone: mode === 'shadow' ? 'pass' : 'warn',
      group: 'runtime',
      href: '#runtime-settings',
      action: 'Open runtime settings',
      evidence: `Current claim_filer_mode=${mode}; daily cap ${dailyCap}.`,
    },
    {
      key: 'hosted-readiness',
      label: 'Hosted launch readiness',
      value: blockers.length > 0 ? `${blockers.length} blockers` : warnings.length > 0 ? `${warnings.length} warnings` : 'Clear',
      detail: blockers.length > 0
        ? 'Hosted blockers must be cleared before client preview or live filing consideration.'
        : warnings.length > 0
          ? 'Required blockers are clear, but warnings still need review before promotion.'
          : 'Hosted readiness has no required blockers or warnings.',
      tone: blockers.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass',
      group: 'hosted',
      href: '#launch-checklist',
      action: 'Open launch checklist',
      evidence: `${blockers.length} blocker${blockers.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`,
    },
    {
      key: 'client-access',
      label: 'Client access gate',
      value: inviteGateClear ? 'Preview gated' : 'Invite locked',
      detail: inviteGateClear
        ? 'Signed sessions, auth policy, shadow mode, client-preview checklist, and packet proof line up for preview review.'
        : 'Client invite remains locked until the client-preview checklist, packet proof, auth, session signing, and shadow posture pass.',
      tone: inviteGateClear ? 'pass' : 'warn',
      group: 'access',
      href: '#pre-invite-gate',
      action: 'Review invite gate',
      evidence: `Client preview checklist ${clientPreviewChecklist.summary.readyCount}/${clientPreviewChecklist.summary.totalCount}; launch packets ${clientPreviewChecklist.summary.launchPacketReadyCount}/${clientPreviewChecklist.summary.launchPacketTotalCount}; next proof ${clientPreviewChecklist.summary.nextStep?.label ?? 'none'}.`,
    },
    {
      key: 'hosted-env',
      label: 'Hosted environment handoff',
      value: `${hostedEnvConfiguredCount}/${hostedHandoffRows.length} ready`,
      detail: 'Production database, scraper contact, support email, and session secret must be configured outside the repo.',
      tone: hostedEnvConfiguredCount === hostedHandoffRows.length ? 'pass' : 'warn',
      group: 'hosted',
      href: '#hosted-environment',
      action: 'Review env handoff',
      evidence: 'Values are masked in-app and should be stored in Netlify environment variables.',
    },
    {
      key: 'operator-action-plan',
      label: 'Setup action plan',
      value: `${settingsActionPlanSummary.blockedSteps} blocked`,
      detail: settingsActionPlanSummary.nextStep
        ? `Next setup item: ${settingsActionPlanSummary.nextStep.label}.`
        : 'No launch action plan blocker is currently recorded.',
      tone: settingsActionPlanSummary.blockedSteps > 0 ? 'warn' : 'pass',
      group: 'hosted',
      href: '#operator-action-plan',
      action: 'Review action plan',
      evidence: settingsActionPlanSummary.nextStep
        ? `${settingsActionPlanSummary.nextStep.owner}: ${settingsActionPlanSummary.nextStep.executionBoundary}`
        : 'Launch action plan is clear.',
    },
    {
      key: 'feature-posture',
      label: 'Client feature posture',
      value: `${enabledFeatureCount} enabled`,
      detail: 'Feature flags can hide settlement browsing, breach intake, and live filing independently for client deployments.',
      tone: liveFilingFeatureEnabled && mode === 'live' ? 'warn' : 'pass',
      group: 'features',
      href: '#launch-checklist',
      action: 'Review feature flags',
      evidence: featureFlags.map((flag) => `${flag.key}=${flag.enabled ? 'true' : 'false'}`).join(', '),
    },
    {
      key: 'proof-audit',
      label: 'Proof review and audit',
      value: `${proofReviewCount} review / ${auditEventCount} audit`,
      detail: 'Proof and uncertain matcher records stay visible while audit events record reviewed activity.',
      tone: proofReviewCount > 0 ? 'warn' : 'pass',
      group: 'audit',
      href: '/review',
      action: 'Open review queue',
      evidence: `${proofReviewCount} NEEDS_REVIEW match${proofReviewCount === 1 ? '' : 'es'}; ${auditEventCount} history event${auditEventCount === 1 ? '' : 's'}.`,
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Runtime controls</div>
          <h1>Settings</h1>
          <p>
            Configure notifications, breach imports, filing mode, and daily safety limits.
            Changes are stored immediately after saving.
          </p>
        </div>
      </div>

      <section className={`safe-launch-indicator ${inviteGateClear ? 'ready' : 'blocked'}`} aria-label="Safe Launch Indicator">
        <div className="safe-launch-main">
          <span className={`safe-launch-icon ${inviteGateClear ? 'ready' : 'blocked'}`} aria-hidden="true">
            {inviteGateClear ? <CheckCircle2 size={22} /> : <AlertOctagon size={22} />}
          </span>
          <div>
            <div className="eyebrow">Safe Launch Indicator</div>
            <h2>{safeLaunchLabel}</h2>
            <p>{safeLaunchDetail}</p>
          </div>
        </div>
        <div className="safe-launch-reasons" aria-label="Safe launch status reasons">
          {safeLaunchReasons.map((reason) => (
            <div className={`safe-launch-reason ${reason.tone}`} key={reason.label}>
              <span>{reason.label}</span>
              <strong>{reason.value}</strong>
            </div>
          ))}
        </div>
        <a className="btn ghost sm" href={inviteGateClear ? '#pre-invite-gate' : '#launch-checklist'}>
          {inviteGateClear ? 'Review invite gate' : 'Open required fixes'}
        </a>
      </section>

      <LaunchReadinessCommandBar
        blockers={blockers}
        warnings={warnings}
        mode={mode}
        liveAck={liveAck}
        liveFilingFeatureEnabled={liveFilingFeatureEnabled}
        blockerHref="#launch-checklist"
      />

      <SettingsControlBrowser rows={settingsControlRows} />

      <section className="settings-section-index" aria-label="Settings Section Index">
        <header className="settings-section-index-head">
          <div>
            <div className="eyebrow">Settings navigator</div>
            <h2>Pick the control area before changing runtime behavior.</h2>
          </div>
          <span className={`mode-badge ${mode === 'live' ? 'live' : 'shadow'}`}>
            {mode === 'live' ? 'Live guarded' : 'Shadow default'}
          </span>
        </header>
        <div className="settings-section-index-grid">
          {settingsSectionCards.map(({ icon: Icon, ...item }) => (
            <a className={`settings-section-index-card ${item.tone}`} href={item.href} key={item.label}>
              <span className={`settings-section-index-icon ${item.tone}`} aria-hidden="true">
                <Icon size={18} />
              </span>
              <div>
                <span>{item.label}</span>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className={`launch-control-center ${blockers.length > 0 || !inviteGateClear ? 'blocked' : 'ready'}`} aria-label="Launch Control Center">
        <header className="launch-control-center-head">
          <div>
            <div className="eyebrow">Launch &amp; handoff</div>
            <h2>Launch Control Center</h2>
            <p>
              A single setup view that connects required fixes, production environment handoff,
              client invite readiness, and shadow-mode guardrails before hosted access is shared.
            </p>
          </div>
          <a className="btn" href="#launch-checklist">Run Pre-Launch Verification</a>
        </header>
        <div className="launch-control-center-grid">
          {launchControlRows.map((row) => (
            <article className={`launch-control-center-item ${row.tone}`} key={row.label}>
              <span className={`readiness-dot ${row.tone}`} aria-hidden="true" />
              <div>
                <strong>{row.label}</strong>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="operator-action-plan" className="launch-proof-matrix" aria-label="Settings setup action plan">
        <header className="launch-proof-matrix-head">
          <div>
            <div className="eyebrow">Business setup handoff</div>
            <h2>
              {settingsActionPlanSummary.blockedSteps === 0
                ? 'External action plan is clear'
                : `${settingsActionPlanSummary.blockedSteps} setup item${settingsActionPlanSummary.blockedSteps === 1 ? '' : 's'} still need evidence`}
            </h2>
            <p>
              Settings mirrors the same client-preview critical path used by Launch and Packet Center.
              Each row separates Codex-runnable validation from external account, billing, legal,
              database, Identity, or deployment work.
            </p>
          </div>
          <span className={`tag ${settingsActionPlanSummary.blockedSteps === 0 ? 'good' : 'warn'}`}>
            {settingsActionPlanSummary.confirmedSteps}/{settingsActionPlanSummary.totalSteps} clear
          </span>
        </header>
        <details className="dashboard-detail-drawer">
          <summary>
            <span>
              <strong>Show setup handoff details</strong>
              <small>Detailed owner notes and commands stay collapsed by default.</small>
            </span>
          </summary>
          <div className="launch-proof-matrix-grid">
            {settingsActionPlanRows.map((step) => (
              <article className={`launch-proof-matrix-row ${step.status}`} key={step.key}>
                <div className="launch-proof-matrix-index">{step.order}</div>
                <div className="launch-proof-matrix-main">
                  <div className="launch-proof-matrix-title">
                    <strong>{step.label}</strong>
                    <span className={`tag ${step.status === 'confirmed' ? 'good' : 'warn'}`}>
                      {step.status === 'confirmed' ? 'Clear' : `${step.blockerCount} blocker${step.blockerCount === 1 ? '' : 's'}`}
                    </span>
                  </div>
                  <p><b>Owner:</b> {step.owner === 'operator' ? 'business owner' : step.owner}</p>
                  <p><b>Objective:</b> {stripOperatorRunbookText(step.objective)}</p>
                  <p><b>Execution boundary:</b> {stripOperatorRunbookText(step.executionBoundary)}</p>
                  <p><b>Required inputs:</b> {step.requiredInputs.join(', ')}</p>
                  <p><b>Next:</b> {stripOperatorRunbookText(step.nextAction)}</p>
                </div>
                <div className="launch-proof-matrix-action">
                  <span>Setup details</span>
                  <details className="dashboard-detail-drawer compact-proof-drawer">
                    <summary>Show setup command</summary>
                    <code>{step.commands[0] ?? 'npm run launch:handoff'}</code>
                  </details>
                  <a className="btn ghost sm" href="/launch">Open Launch</a>
                </div>
              </article>
            ))}
          </div>
        </details>
        {settingsActionPlan.length > settingsActionPlanRows.length && (
          <p className="muted small">
            +{settingsActionPlan.length - settingsActionPlanRows.length} more action-plan step{settingsActionPlan.length - settingsActionPlanRows.length === 1 ? '' : 's'} in the launch handoff export.
          </p>
        )}
        <div className="status-row">
          <a className="btn ghost sm" href="/api/audit/external-activation-workbook">Export activation workbook</a>
          <a className="btn ghost sm" href="/api/audit/launch-handoff">Export launch handoff</a>
          <a className="btn ghost sm" href="/api/audit/support-packet">Export support packet</a>
        </div>
      </section>

      <section className="launch-proof-matrix" aria-label="Settings paid full automation blockers">
        <header className="launch-proof-matrix-head">
          <div>
            <div className="eyebrow">Paid automation readiness</div>
            <h2>{paidAutomationBlockerSummary.ready ? 'Paid automation is ready' : 'Paid automation needs setup'}</h2>
            <p>
              Paid hands-off filing stays off until hosted data, business setup, billing, legal review,
              and hosted preview checks are ready.
            </p>
          </div>
          <span className={`tag ${paidAutomationBlockerSummary.ready ? 'good' : 'warn'}`}>
            {paidAutomationBlockerSummary.blockedCount} blocker{paidAutomationBlockerSummary.blockedCount === 1 ? '' : 's'}
          </span>
        </header>
        <div className="launch-proof-matrix-grid">
          {(paidAutomationBlockers.length === 0 ? [{
            gate: 'Full automation proof chain',
            owner: 'deployment',
            clientImpact: paidAutomationBlockerSummary.note,
            command: 'npm run launch:handoff',
            path: 'data/launch-handoff-report.md',
          }] : paidAutomationBlockers).slice(0, 5).map((blocker, index) => (
            <article className={`launch-proof-matrix-row ${paidAutomationBlockers.length === 0 ? 'confirmed' : 'blocked'}`} key={blocker.path}>
              <div className="launch-proof-matrix-index">{paidAutomationBlockers.length === 0 ? 'OK' : index + 1}</div>
              <div className="launch-proof-matrix-main">
                <div className="launch-proof-matrix-title">
                  <strong>{blocker.gate}</strong>
                  <span className={`tag ${paidAutomationBlockers.length === 0 ? 'good' : 'warn'}`}>{blocker.owner}</span>
                </div>
                <p><b>Customer impact:</b> {blocker.clientImpact}</p>
              </div>
              <div className="launch-proof-matrix-action">
                <span>Setup evidence</span>
                <a className="btn ghost sm" href="/packets">Open packets</a>
              </div>
            </article>
          ))}
        </div>
        <div className="status-row">
          <a className="btn ghost sm" href="/api/audit/client-preview-checklist">Export client preview checklist</a>
          <a className="btn ghost sm" href="/api/audit/launch-handoff">Export launch handoff</a>
          <a className="btn ghost sm" href="/api/audit/support-packet">Export support packet</a>
        </div>
      </section>

      <section id="pre-invite-gate" className={`pre-invite-gate ${inviteGateClear ? 'ready' : 'blocked'}`} aria-label="Pre-Invite Readiness Gate">
        <header className="pre-invite-gate-head">
          <div>
            <div className="eyebrow">Client invite readiness</div>
            <h2>Invite clients when the account is ready</h2>
            <p>
              This summary keeps the important client-ready checks in one place: account setup,
              review mode, proof review, sign-in, and account history.
            </p>
          </div>
          <button className="btn" type="button" disabled={!inviteGateClear}>
            {inviteGateClear ? 'Invite client preview' : 'Invite locked'}
          </button>
        </header>
        <div className="pre-invite-gate-grid">
          <article className={`pre-invite-gate-item ${clientPreviewReady ? 'pass' : 'warn'}`}>
            <span className={`readiness-dot ${clientPreviewReady ? 'pass' : 'warn'}`} aria-hidden="true" />
            <div>
              <strong>Client Preview Checklist</strong>
              <p>
                {clientPreviewReady
                  ? 'All product requirements and hosted setup checks are clear for this account.'
                  : `${clientPreviewChecklist.summary.readyCount}/${clientPreviewChecklist.summary.totalCount} product requirements are ready; next proof is ${clientPreviewChecklist.summary.nextStep?.label ?? 'not recorded'}.`}
              </p>
            </div>
          </article>
          <article className={`pre-invite-gate-item ${launchPacketStackReady ? 'pass' : 'warn'}`}>
            <span className={`readiness-dot ${launchPacketStackReady ? 'pass' : 'warn'}`} aria-hidden="true" />
            <div>
              <strong>Launch Packet Stack</strong>
              <p>
                {clientPreviewChecklist.summary.launchPacketReadyCount}/{clientPreviewChecklist.summary.launchPacketTotalCount} packets are ready.
                Export the checklist and launch handoff before sending any invite.
              </p>
            </div>
          </article>
          <article className={`pre-invite-gate-item ${mode === 'shadow' ? 'pass' : 'warn'}`}>
            <span className={`readiness-dot ${mode === 'shadow' ? 'pass' : 'warn'}`} aria-hidden="true" />
            <div>
              <strong>Shadow Mode</strong>
              <p>{mode === 'shadow' ? 'Active for client preview. Live filing remains locked behind explicit review.' : 'Live mode is active; invite preview needs business-owner review.'}</p>
            </div>
          </article>
          <article className={`pre-invite-gate-item ${proofReviewCount === 0 ? 'pass' : 'warn'}`}>
            <span className={`readiness-dot ${proofReviewCount === 0 ? 'pass' : 'warn'}`} aria-hidden="true" />
            <div>
              <strong>Proof Review</strong>
              <p>{proofReviewCount} match{proofReviewCount === 1 ? '' : 'es'} need review before the queue should be treated as clean.</p>
            </div>
          </article>
          <article className={`pre-invite-gate-item ${authDisabled || !sessionSecretReady ? 'warn' : 'pass'}`}>
            <span className={`readiness-dot ${authDisabled || !sessionSecretReady ? 'warn' : 'pass'}`} aria-hidden="true" />
            <div>
              <strong>Auth Policy</strong>
              <p>{authDisabled ? 'Auth is disabled; client invite must stay locked.' : sessionSecretReady ? 'Session signing is configured for hosted access.' : 'Session secret must be at least 32 characters.'}</p>
            </div>
          </article>
          <article className="pre-invite-gate-item pass">
            <span className="readiness-dot pass" aria-hidden="true" />
            <div>
              <strong>Account History</strong>
              <p>{auditEventCount} account event{auditEventCount === 1 ? '' : 's'} recorded; activity history remains part of the workflow.</p>
            </div>
          </article>
        </div>
        {clientPreviewBlockedItems.length > 0 && (
          <div className="status-row compact" aria-label="Blocked client preview checklist requirements">
            {clientPreviewBlockedItems.map((item) => (
              <span className="tag warn" key={item.key}>{item.label}</span>
            ))}
          </div>
        )}
        <div className="status-row">
          <a className="btn ghost sm" href="/api/audit/client-preview-checklist">Export client preview checklist</a>
          <a className="btn ghost sm" href="/api/audit/launch-handoff">Export launch handoff</a>
          <a className="btn ghost sm" href="/launch">Open Launch Readiness</a>
        </div>
      </section>

      <section className={`go-live-shield ${readiness.ok ? 'ready' : 'blocked'}`} aria-label="Before going live">
        <header className="go-live-shield-head">
          <div>
            <div className="eyebrow">Hosted setup</div>
            <h2>Before going live</h2>
            <p>
              Use this checkpoint before inviting clients or touching live filing controls. Shadow mode,
              authorization, proof review, and account history stay visible even when the deployment is healthy.
            </p>
          </div>
          <a className="btn ghost" href="#runtime-settings">Review runtime settings</a>
        </header>
        <div className="go-live-shield-grid">
          {shieldRows.map((row) => (
            <article className={`go-live-shield-item ${row.status}`} key={row.title}>
              <span className={`readiness-dot ${row.status}`} aria-hidden="true" />
              <div>
                <div className="go-live-shield-item-head">
                  <strong>{row.title}</strong>
                  <span className={`tag ${row.status === 'pass' ? 'good' : 'warn'}`}>{row.meta}</span>
                </div>
                <p>{row.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-section section-flush">
        <header className="section-header">
          <h2>Control room</h2>
          <p className="muted">
            Review the safety posture before changing runtime settings. Hosted deployments should remain
            in shadow mode until auth, support contact, evidence review, and hosted setup checks are verified.
          </p>
        </header>
        <div className="stats-grid" aria-label="Settings control summary">
          <div className="stat-card">
            <div className="stat-label">Filing posture</div>
            <div className={`stat-value ${mode === 'live' ? 'warn' : 'green'}`}>
              {mode === 'live' ? 'Live' : 'Shadow'}
            </div>
          </div>
          <div className={`stat-card hosted-blockers-card ${blockers.length > 0 ? 'needs-review' : ''}`}>
            <div className="stat-label">Hosted blockers</div>
            <div className={`stat-value ${blockers.length > 0 ? 'warn' : 'green'}`}>{blockers.length}</div>
            {blockers.length > 0 ? (
              <details className="blocker-details">
                <summary>Show exact fixes</summary>
                <div className="blocker-list">
                  {blockers.map((item) => (
                    <div className="blocker-row" key={item.key}>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.action ?? item.detail}</small>
                        {getLaunchFixCommand(item.key) && (
                          <details className="dashboard-detail-drawer compact-proof-drawer">
                            <summary>Show setup command</summary>
                            <code className="inline-fix-command">{getLaunchFixCommand(item.key)}</code>
                          </details>
                        )}
                      </span>
                      <a className="fix-link" href={blockerHrefByKey[item.key] ?? '#launch-checklist'}>Open task</a>
                    </div>
                  ))}
                </div>
              </details>
            ) : (
              <p className="stat-note">Hosted checks are clear.</p>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Warnings</div>
            <div className={`stat-value ${warnings.length > 0 ? 'warn' : 'text'}`}>{warnings.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Daily cap</div>
            <div className="stat-value text">{dailyCap}</div>
          </div>
        </div>
        <div className="trust-strip">
          <div className="trust-item">
            <strong>Shadow default</strong>
            <span>Claim forms are prepared and audited before any live submission path is considered.</span>
          </div>
          <div className="trust-item">
            <strong>{enabledFeatureCount} feature flags enabled</strong>
            <span>Client deployments can hide settlement browsing, breach intake, or live filing independently.</span>
          </div>
          <div className="trust-item">
            <strong>{authDisabled ? 'Auth disabled' : 'Auth required'}</strong>
            <span>
              {authDisabled
                ? 'Only use this posture for local development or an intentionally private environment.'
                : sessionSecretConfigured
                  ? 'Session signing is configured; keep the secret in hosted environment variables.'
                  : 'A hosted session secret is still required before client access.'}
            </span>
          </div>
          <div className="trust-item">
            <strong>{supportEmailConfigured ? 'Support contact set' : 'Support contact missing'}</strong>
            <span>Client-facing help and contact pages should point to a real monitored mailbox.</span>
          </div>
        </div>
      </section>

      <section id="hosted-environment" className="hosted-handoff-panel" aria-label="Hosted deployment handoff">
        <div className="hosted-handoff-head">
          <div>
            <div className="eyebrow">Netlify env</div>
            <h2>Hosted Deployment Handoff</h2>
            <p>
              Runtime controls are active. Complete these environment values in Netlify to finalize
              hosted configuration. Values are masked here and never committed to source.
            </p>
          </div>
          <span className={`tag ${hostedHandoffRows.every((row) => row.configured) ? 'good' : 'warn'}`}>
            {hostedHandoffRows.filter((row) => row.configured).length}/{hostedHandoffRows.length} configured
          </span>
        </div>
        <div className="hosted-handoff-grid">
          {hostedHandoffRows.map((row) => (
            <article className={`hosted-handoff-row ${row.configured ? 'configured' : 'pending'}`} key={row.key}>
              <div className="hosted-handoff-row-head">
                <div>
                  <strong>{row.label}</strong>
                  <code>{row.key}</code>
                </div>
                <span className={`tag ${row.configured ? 'good' : 'warn'}`}>
                  {row.configured ? 'Configured' : row.pendingLabel}
                </span>
              </div>
              <div className="masked-env-value" aria-label={`${row.key} masked value`}>****************</div>
              <p>{row.hint}</p>
              <small>{row.securityNote}</small>
              {getLaunchFixCommand(row.readinessKey) && (
                <details className="dashboard-detail-drawer compact-proof-drawer">
                  <summary>Show setup command</summary>
                  <code className="inline-fix-command">{getLaunchFixCommand(row.readinessKey)}</code>
                </details>
              )}
            </article>
          ))}
        </div>
        <div className="hosted-handoff-footer">
          Secrets are injected at runtime. Never commit <code>.env</code> files or live credentials to git.
        </div>
      </section>

      <div className="settings-grid">
        <SettingsForm
          discordWebhookConfigured={Boolean(current.discord_webhook_url)}
          hibpApiKeyConfigured={Boolean(current.hibp_api_key)}
          initialMode={mode}
          initialLiveAck={liveAck}
          initialMaxPerDay={current.claim_filer_max_per_day ?? '20'}
          breachImportEnabled={breachImportEnabled}
          liveFilingFeatureEnabled={liveFilingFeatureEnabled}
        />

        <aside className="notice warn">
          <h3>Live filing guardrails</h3>
          <p>
            Live mode should only submit review-ready claims with a category authorization, a passing
            matcher verdict, and no proof requirement. Keep shadow mode on while testing a new client intake or settlement source.
          </p>
          <div className="status-row">
            <span className={`tag ${mode === 'live' ? 'warn' : 'good'}`}>
              Current mode: {mode === 'live' ? 'live' : 'shadow'}
            </span>
            <span className={`tag ${liveAck ? 'warn' : 'good'}`}>
              Live ack: {liveAck ? 'reviewed' : 'not set'}
            </span>
            <span className="tag">Account history enabled</span>
            <span className="tag">Daily cap enforced</span>
          </div>
        </aside>

        <aside className={`card readiness-card ${readiness.ok ? 'ready' : 'blocked'}`}>
          <div className="readiness-head">
            <div>
              <div className="eyebrow">Hosted readiness</div>
              <h3>{readiness.ok ? 'Ready for hosted shadow mode' : 'Deployment needs attention'}</h3>
              <p className="muted small">Evaluates the production deployment target, not the relaxed local dev runtime.</p>
            </div>
            <span className={`tag ${readiness.ok ? 'good' : 'warn'}`}>
              {readiness.ok ? 'No blockers' : `${readiness.failures.length} blocker${readiness.failures.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="readiness-list">
            {readiness.items.map((item) => (
              <div className="readiness-item" key={item.key}>
                <span className={`readiness-dot ${item.status}`} aria-hidden="true" />
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                  {item.action && <p><b>Next:</b> {item.action}</p>}
                  {item.status !== 'pass' && getLaunchFixCommand(item.key) && (
                    <details className="dashboard-detail-drawer compact-proof-drawer">
                      <summary>Show setup command</summary>
                      <code className="inline-fix-command">{getLaunchFixCommand(item.key)}</code>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <aside className="card launch-card" id="launch-checklist">
          <div className="readiness-head">
            <div>
              <div className="eyebrow">Launch checklist</div>
              <h3>Before inviting clients</h3>
            </div>
            <span className={`tag ${blockers.length > 0 ? 'warn' : warnings.length > 0 ? 'yellow' : 'good'}`}>
              {blockers.length > 0
                ? `${blockers.length} fix needed`
                : warnings.length > 0
                  ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`
                  : 'Ready'}
            </span>
          </div>
          <p className="muted small">
            The dedicated launch page has the full business setup checklist and production readiness status.
          </p>
          <p>
            <a className="btn ghost" href="/launch">Open launch checklist</a>
          </p>
          <details className="dashboard-detail-drawer">
            <summary>
              <span>
                <strong>Show technical setup steps</strong>
                <small>For the business owner before client invites.</small>
              </span>
            </summary>
            <div className="launch-steps" aria-label="Hosted launch checklist">
              <div>
                <strong>1. Generate the session secret</strong>
                <p>Run this once, then paste the generated value into the CLAIMBOT_SESSION_SECRET command.</p>
                <CliCommandRows commands={secretCommands} compact />
              </div>
              <div>
                <strong>2. Set production environment</strong>
                <p>Use placeholders only here. Store real secrets in Netlify, never in the repo.</p>
                <CliCommandRows commands={deployCommands} />
              </div>
              <div>
                <strong>3. Verify the checks</strong>
                <p>Run these after the production env exists and before a client preview.</p>
                <CliCommandRows commands={verificationCommands} compact />
              </div>
              <div>
                <strong>4. Prove hosted access locally</strong>
                <p>The hosted auth smoke starts an isolated auth-required local server unless you point it at a deployed URL.</p>
                <CliCommandRows commands={localAuthSmokeCommands} compact />
              </div>
              <div>
                <strong>5. Smoke the deployed preview</strong>
                <p>Use the deployed session secret only in your local terminal so signed-session checks are real.</p>
                <CliCommandRows commands={previewSmokeCommands} compact />
              </div>
              <div>
                <strong>6. Keep first launch in shadow mode</strong>
                <p>Review profile facts, permissions, proof-required matches, account history, and claim-tracking output before enabling any live filing controls.</p>
              </div>
            </div>
          </details>
        </aside>

        <aside className="card readiness-card">
          <div className="readiness-head">
            <div>
              <div className="eyebrow">Client feature flags</div>
              <h3>Deployment switches</h3>
            </div>
            <span className="tag blue">{featureFlags.filter((flag) => flag.enabled).length} enabled</span>
          </div>
          <div className="readiness-list">
            {featureFlags.map((flag) => (
              <div className="readiness-item" key={flag.key}>
                <span className={`readiness-dot ${flag.enabled ? 'pass' : 'warn'}`} aria-hidden="true" />
                <div>
                  <strong>{flag.label}</strong>
                  <p>{flag.description}</p>
                  <p><b>Env:</b> {flag.key}={flag.enabled ? 'true' : 'false'}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
