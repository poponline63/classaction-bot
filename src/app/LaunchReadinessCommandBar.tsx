import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';
import type { HostedReadinessItem } from '@lib/hosted-readiness';

type LaunchReadinessCommandBarProps = {
  blockers: HostedReadinessItem[];
  liveAck: boolean;
  liveFilingFeatureEnabled: boolean;
  mode: string;
  warnings: HostedReadinessItem[];
  blockerHref?: string;
};

function getNetlifyEnvUrl() {
  const dashboardUrl = process.env.NETLIFY_SITE_DASHBOARD_URL?.trim();
  if (dashboardUrl) return dashboardUrl;

  const siteSlug = process.env.NETLIFY_SITE_SLUG?.trim() || process.env.NETLIFY_SITE_NAME?.trim();
  return siteSlug
    ? `https://app.netlify.com/sites/${encodeURIComponent(siteSlug)}/configuration/env`
    : 'https://app.netlify.com/';
}

export default function LaunchReadinessCommandBar({
  blockers,
  blockerHref = '/launch#production-gates',
  liveAck,
  liveFilingFeatureEnabled,
  mode,
  warnings,
}: LaunchReadinessCommandBarProps) {
  const blockerCount = blockers.length;
  const filingLocked = blockerCount > 0 || !liveAck || !liveFilingFeatureEnabled || mode !== 'live';
  const cta = blockerCount > 0
    ? { label: `Resolve ${blockerCount} blocker${blockerCount === 1 ? '' : 's'}`, href: blockerHref }
    : !liveAck
      ? { label: 'Review live acknowledgment', href: '/settings#runtime-settings' }
      : liveFilingFeatureEnabled && mode === 'shadow'
        ? { label: 'Review live filing controls', href: '/settings#runtime-settings' }
        : { label: 'Review launch checklist', href: '/launch' };

  return (
    <section className={`launch-command-bar ${blockerCount > 0 ? 'blocked' : 'ready'}`} aria-label="Launch readiness command bar">
      <div className="launch-command-pipeline" aria-label="Canonical launch state">
        <span>
          <b>Posture</b>
          <strong className={mode === 'live' ? 'warn' : 'green'}>{mode === 'live' ? 'Live' : 'Shadow'}</strong>
        </span>
        <span>
          <b>Blockers</b>
          <strong className={blockerCount > 0 ? 'warn' : 'green'}>{blockerCount}</strong>
        </span>
        <span>
          <b>Compliance</b>
          <strong className={liveAck ? 'green' : 'warn'}>{liveAck ? 'Reviewed' : 'Unsigned'}</strong>
        </span>
        <span>
          <b>Filing</b>
          <strong className={filingLocked ? 'warn' : 'green'}>{filingLocked ? 'Locked' : 'Live review'}</strong>
        </span>
      </div>
      <div className="launch-command-action">
        <small>
          {blockerCount > 0
            ? `${blockerCount} hosted gate${blockerCount === 1 ? '' : 's'} must be fixed before client launch.`
            : warnings.length > 0
              ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'} remain; keep onboarding in shadow mode.`
              : 'Hosted gates are clear; keep client onboarding in shadow mode until live review is explicitly signed.'}
        </small>
        <div className="status-row">
          {cta.href.startsWith('#') ? (
            <a className="btn sm" href={cta.href}>
              {cta.label}
              <ArrowRight aria-hidden="true" size={14} />
            </a>
          ) : (
            <Link className="btn sm" href={cta.href}>
              {cta.label}
              <ArrowRight aria-hidden="true" size={14} />
            </Link>
          )}
          {blockerCount > 0 && (
            <a className="btn ghost sm" href={getNetlifyEnvUrl()} target="_blank" rel="noreferrer">
              Netlify env
              <ExternalLink aria-hidden="true" size={13} />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
