'use client';

import {
  CheckCircle2,
  Eye,
  FileText,
  History,
  Lock,
  Server,
  ShieldCheck,
} from 'lucide-react';

type TrustSectionIcon = 'eye' | 'history' | 'shield' | 'lock' | 'server';
type TrustSectionTone = 'safety' | 'audit' | 'hosted';

export type TrustBrowserSection = {
  id: string;
  title: string;
  body: string;
  tone: TrustSectionTone;
  icon: TrustSectionIcon;
};

export type TrustBrowserAuditEvent = {
  id: number;
  eventType: string;
  actor: string;
  entityType: string;
  occurredAt: string;
};

const iconMap = {
  eye: Eye,
  history: History,
  shield: ShieldCheck,
  lock: Lock,
  server: Server,
} satisfies Record<TrustSectionIcon, typeof Eye>;

export default function TrustComplianceBrowser({
  auditEvents,
  sections,
}: {
  auditEvents: TrustBrowserAuditEvent[];
  sections: TrustBrowserSection[];
}) {
  return (
    <section className="trust-compliance-browser trust-simple-panel" aria-label="Safety basics">
      <header className="trust-simple-panel-head">
        <div>
          <div className="eyebrow">Safety basics</div>
          <h2>The simple version</h2>
          <p>
            Four rules cover the customer-facing trust promise.
          </p>
        </div>
        <span className="tag blue">{sections.length} rules</span>
      </header>

      <div className="trust-simple-grid">
        {sections.map((section) => {
          const Icon = iconMap[section.icon];
          return (
            <article className={`trust-simple-card ${section.tone}`} key={section.id}>
              <span className={`status-tracker-icon ${section.tone === 'hosted' ? 'blue' : section.tone === 'audit' ? 'purple' : 'green'}`} aria-hidden="true">
                <Icon size={18} />
              </span>
              <div>
                <small>{section.tone === 'hosted' ? 'Account protection' : section.tone === 'audit' ? 'Traceable activity' : 'Claim safety'}</small>
                <h2>{section.title}</h2>
                <p>{section.body}</p>
              </div>
            </article>
          );
        })}
      </div>

      <details className="dashboard-detail-drawer trust-browser-audit" aria-label="Recent account activity">
        <summary>
          <span>
            <strong>Recent account activity</strong>
            <small>Support can use this history without showing private claim evidence here.</small>
          </span>
          <b>{auditEvents.length} events</b>
        </summary>
        <section className="card launch-card">
          <div className="launch-card-head">
            <div>
              <div className="eyebrow">Account history</div>
              <h2>Recent workspace events</h2>
            </div>
            <span className="tag good">Recorded</span>
          </div>
          {auditEvents.length > 0 ? (
            <div className="settings-list">
              {auditEvents.map((event) => (
                <div className="settings-row" key={event.id}>
                  <div>
                    <strong>{event.eventType.replace(/_/g, ' ')}</strong>
                    <span>{event.entityType} event by {event.actor} on {event.occurredAt}</span>
                  </div>
                  <FileText aria-hidden="true" size={17} />
                </div>
              ))}
            </div>
          ) : (
            <div className="notice">
              <CheckCircle2 aria-hidden="true" size={18} />
              <div>
                <strong>Activity history is ready</strong>
                <p>
                  Account, claim review, billing, and support actions will appear here after the workspace starts recording events.
                </p>
              </div>
            </div>
          )}
        </section>
      </details>
    </section>
  );
}
