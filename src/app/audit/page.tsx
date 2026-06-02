import { readRecentAudit } from '@lib/audit';
import { buildAuditCheckpoint } from '@lib/audit/support-packet';
import { currentUserId } from '@lib/auth/current-user';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';
import { clientSafeLaunchAction } from '@lib/client-safe-launch-copy';
import Link from 'next/link';
import { OperationalZeroState } from '../OperationalZeroState';
import AuditTrailBrowser, { type AuditTrailBrowserRow } from './AuditTrailBrowser';

export const dynamic = 'force-dynamic';

interface SearchParams {
  actor?: string;
  entity?: string;
  severity?: string;
}

function eventLabel(eventType: string) {
  return eventType.toLowerCase().replace(/_/g, ' ');
}

function actorTone(actor: string) {
  if (actor === 'user') return 'good';
  if (actor === 'filer') return 'blue';
  if (actor === 'matcher') return 'purple';
  if (actor === 'scraper') return 'blue';
  return '';
}

function eventTone(eventType: string): AuditTrailBrowserRow['eventTone'] {
  if (eventType.includes('FAILED') || eventType.includes('REVOKED')) return 'warn';
  if (eventType.includes('ABORTED')) return 'warn';
  if (eventType.includes('COMPLETED') || eventType.includes('GRANTED') || eventType.includes('FILED')) return 'good';
  if (eventType.includes('VERDICT') || eventType.includes('MATCH')) return 'purple';
  return 'blue';
}

function isAttentionEvent(eventType: string) {
  return eventType.includes('FAILED') || eventType.includes('REVOKED') || eventType.includes('ABORTED');
}

function filterHref(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== 'all') sp.set(key, value);
  }
  const query = sp.toString();
  return query ? `/audit?${query}` : '/audit';
}

function summarizePayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const entries = Object.entries(payload as Record<string, unknown>)
    .filter(([, value]) => value != null && typeof value !== 'object')
    .slice(0, 4);
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(' | ');
}

const reviewPacketRows = [
  {
    tone: 'pass',
    title: 'Append-only trace',
    detail: 'Actor, entity, event type, timestamp, and payload stay together for support review.',
  },
  {
    tone: 'pass',
    title: 'Permission evidence',
    detail: 'Category grants and revocations remain visible before claim tracking or final checks.',
  },
  {
    tone: 'pass',
    title: 'Digest-backed claim exports',
    detail: 'Claim detail pages can download a SHA-256 audit snapshot for tamper-evident review.',
  },
  {
    tone: 'warn',
    title: 'Attention list',
    detail: 'Failed, revoked, and aborted events are filterable before support follow-up.',
  },
  {
    tone: 'pass',
    title: 'Launch evidence included',
    detail: 'Support packet JSON includes masked hosted readiness, Identity setup, verification commands, and safety boundaries.',
  },
  {
    tone: 'pass',
    title: 'Plan check evidence',
    detail: 'The export records the current plan boundary so Free and Plus review tools stay separate from the Pro/Founding filing lane.',
  },
];

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const userId = await currentUserId();
  const [events, clientPreviewChecklist] = await Promise.all([
    readRecentAudit(userId, 200),
    buildClientPreviewChecklist(userId),
  ]);
  const actorFilter = searchParams.actor ?? 'all';
  const entityFilter = searchParams.entity ?? 'all';
  const severityFilter = searchParams.severity ?? 'all';
  const filteredEvents = events.filter((event) => {
    if (actorFilter !== 'all' && event.actor !== actorFilter) return false;
    if (entityFilter !== 'all' && event.entityType !== entityFilter) return false;
    if (severityFilter === 'attention' && !isAttentionEvent(event.eventType)) return false;
    return true;
  });
  const checkpoint = buildAuditCheckpoint(filteredEvents);
  const actorCount = new Set(events.map((event) => event.actor)).size;
  const entityCount = new Set(events.map((event) => `${event.entityType}:${event.entityId}`)).size;
  const attentionCount = events.filter((event) => isAttentionEvent(event.eventType)).length;
  const claimEventCount = events.filter((event) => event.entityType === 'claim').length;
  const authorizationEventCount = events.filter((event) => event.entityType === 'authorization').length;
  const lastEvent = events[0];
  const actorOptions = Array.from(new Set(events.map((event) => event.actor))).sort();
  const entityOptions = Array.from(new Set(events.map((event) => event.entityType))).sort();
  const supportPacketParams = new URLSearchParams();
  if (actorFilter !== 'all') supportPacketParams.set('actor', actorFilter);
  if (entityFilter !== 'all') supportPacketParams.set('entity', entityFilter);
  if (severityFilter !== 'all') supportPacketParams.set('severity', severityFilter);
  const supportPacketHref = `/api/audit/support-packet${supportPacketParams.toString() ? `?${supportPacketParams.toString()}` : ''}`;
  const auditBrowserRows: AuditTrailBrowserRow[] = events.map((event) => ({
    id: event.id,
    eventLabel: eventLabel(event.eventType),
    eventType: event.eventType,
    actor: event.actor,
    actorTone: actorTone(event.actor),
    entityType: event.entityType,
    entityId: event.entityId,
    occurredAt: event.occurredAt.toLocaleString(),
    occurredAtIso: event.occurredAt.toISOString(),
    payloadSummary: summarizePayload(event.payloadJson) ?? '',
    eventTone: eventTone(event.eventType),
    needsAttention: isAttentionEvent(event.eventType),
  }));
  const blockedAuditLaunchActionRows = clientPreviewChecklist.launchActionPlan.rows
    .filter((item) => item.status !== 'confirmed');
  const auditLaunchActionRows = (blockedAuditLaunchActionRows.length > 0
    ? blockedAuditLaunchActionRows
    : clientPreviewChecklist.launchActionPlan.rows)
    .slice(0, 3);
  const paidAutomationBlockers = clientPreviewChecklist.fullAutomationLaunchBlockers.rows;
  const paidAutomationBlockerSummary = clientPreviewChecklist.fullAutomationLaunchBlockers.summary;
  const trustHandoffRows = [
    {
      label: 'Checkpoint',
      value: checkpoint.short,
      detail: 'Filtered event fingerprint for support comparison.',
    },
    {
      label: 'Filters',
      value: [
        `actor:${actorFilter}`,
        `entity:${entityFilter}`,
        `severity:${severityFilter}`,
      ].join(' | '),
      detail: 'Handoff keeps the same read-only account-history view the business owner reviewed.',
    },
    {
      label: 'Proof disposition',
      value: `${attentionCount} attention event${attentionCount === 1 ? '' : 's'}`,
      detail: 'Failed, revoked, or aborted events stay visible before support follow-up.',
    },
    {
      label: 'Support scope',
      value: `${filteredEvents.length} event${filteredEvents.length === 1 ? '' : 's'}`,
      detail: 'Export is read-only JSON; it does not grant write access to account history.',
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Account history</div>
          <div className="audit-title-row">
            <h1>Account history</h1>
            <span className="audit-stream-chip">Review record active</span>
          </div>
          <p>
            Review saved activity for source checks, matcher decisions, permission changes,
            claim tracking, and final-check outcomes.
          </p>
        </div>
      </div>

      {events.length === 0 && (
        <OperationalZeroState
          variant="audit"
          meta="Zero events recorded. The next verified action creates the first append-only trace."
          actions={(
            <>
              <Link className="btn" href="/review">Open review</Link>
              <Link className="btn ghost" href="/permissions">Review permissions</Link>
            </>
          )}
        />
      )}

      <section className="dashboard-section section-flush">
        <header className="section-header">
          <h2>Trace review</h2>
          <p className="muted">
            Use filters to narrow support review by actor, entity, or attention-needed events while
            preserving the append-only event sequence.
          </p>
        </header>
        <div className="stats-grid" aria-label="Audit trace summary">
          <div className="stat-card">
            <div className="stat-label">Claim events</div>
            <Link className="stat-value stat-value-link blue" href={filterHref({ entity: 'claim', actor: actorFilter, severity: severityFilter })}>
              {claimEventCount}
            </Link>
          </div>
          <div className="stat-card">
            <div className="stat-label">Permission events</div>
            <Link className="stat-value stat-value-link green" href={filterHref({ entity: 'authorization', actor: actorFilter, severity: severityFilter })}>
              {authorizationEventCount}
            </Link>
          </div>
          <div className={`stat-card ${attentionCount > 0 ? 'needs-review' : ''}`}>
            <div className="stat-label">Needs attention</div>
            <Link className={`stat-value stat-value-link ${attentionCount > 0 ? 'warn' : 'text'}`} href={filterHref({ severity: 'attention', actor: actorFilter, entity: entityFilter })}>
              {attentionCount}
            </Link>
          </div>
          <div className="stat-card">
            <div className="stat-label">Last event</div>
            <div className="stat-value text">{lastEvent ? lastEvent.eventType.replace(/_/g, ' ') : 'None'}</div>
          </div>
        </div>
      </section>

      <div className="trust-strip">
        <div className="trust-item">
          <strong>{events.length} recent events</strong>
          <span>Showing the latest records for this user.</span>
        </div>
        <div className="trust-item">
          <strong>{actorCount} actor type{actorCount === 1 ? '' : 's'}</strong>
          <span>User, matcher, filer, and automation events stay separated.</span>
        </div>
        <div className="trust-item">
          <strong>{entityCount} linked entit{entityCount === 1 ? 'y' : 'ies'}</strong>
          <span>Each event records the affected claim, match, or permission.</span>
        </div>
        <div className="trust-item">
          <strong>Review ready</strong>
          <span>Useful for client support and filing traceability.</span>
        </div>
      </div>

      <AuditTrailBrowser rows={auditBrowserRows} supportPacketHref={supportPacketHref} />

      <section className="audit-review-packet" aria-label="Audit review packet">
        <div className="audit-review-head">
          <div>
            <div className="eyebrow">Support packet</div>
            <h2>Account history packet</h2>
            <p>
              Start here when a client asks what happened. The packet ties lifecycle evidence to the
              event timeline below and masked setup evidence without changing the append-only record.
            </p>
          </div>
          <Link className="btn ghost" href="/claims">Find claim exports</Link>
          <a className="btn ghost" href={supportPacketHref}>Export support packet (JSON)</a>
        </div>
        <div className="audit-review-grid">
          {reviewPacketRows.map((row) => (
            <div key={row.title} className="audit-review-item">
              <span className={`readiness-dot ${row.tone}`} aria-hidden="true" />
              <div>
                <strong>{row.title}</strong>
                <p>{row.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="audit-launch-action-plan" aria-label="Audit launch action plan">
        <header className="audit-launch-action-plan-head">
          <div>
            <div className="eyebrow">Client preview action plan</div>
            <h2>Blocked workstreams are audit-visible</h2>
            <p>
              The audit surface mirrors the client-preview checklist so support and legal can see which
              external workstreams still block launch, who owns them, and which business input is needed next.
            </p>
          </div>
          <span className={`tag ${clientPreviewChecklist.launchActionPlan.summary.blockedSteps === 0 ? 'good' : 'warn'}`}>
            {clientPreviewChecklist.launchActionPlan.summary.blockedSteps}/{clientPreviewChecklist.launchActionPlan.summary.totalSteps} blocked
          </span>
        </header>
        <div className="status-action-plan-grid audit-launch-action-plan-grid">
          {auditLaunchActionRows.map((step) => (
            <article className="status-action-plan-item audit-launch-action-plan-item" key={step.key}>
              <small>{step.owner === 'operator' ? 'Setup' : `${step.owner} setup`}</small>
              <strong>{step.label}</strong>
              <p>{clientSafeLaunchAction(step)}</p>
              <p><b>Execution boundary:</b> {step.executionBoundary}</p>
              <p><b>Required inputs:</b> {step.requiredInputs.slice(0, 2).join(', ')}</p>
              <details className="dashboard-detail-drawer compact-proof-drawer" aria-label={`${step.label} setup command`}>
                <summary>
                  <span>
                    <strong>Setup command</strong>
                    <small>For business-owner setup only.</small>
                  </span>
                </summary>
                <code className="inline-fix-command">{step.commands[0] ?? 'npm run launch:handoff'}</code>
              </details>
            </article>
          ))}
        </div>
        <div className="status-row">
          <Link className="btn ghost sm" href="/api/audit/client-preview-checklist">Export client preview checklist</Link>
          <Link className="btn ghost sm" href="/api/audit/netlify-launch-doctor">Export Netlify doctor</Link>
          <Link className="btn ghost sm" href="/api/audit/launch-handoff">Export launch handoff</Link>
          <Link className="btn ghost sm" href="/launch">Open setup proof</Link>
        </div>
      </section>

      <section className="audit-launch-action-plan" aria-label="Audit paid full automation blockers">
        <header className="audit-launch-action-plan-head">
          <div>
            <div className="eyebrow">Paid full automation setup lock</div>
            <h2>{paidAutomationBlockerSummary.ready ? 'Automation launch blockers are clear' : 'Hands-off paid filing is still locked'}</h2>
            <p>
              Account history keeps the Pro automation promise tied to packet evidence. Hosted data,
              business setup, paid entitlement, legal review, and preview proof must clear before
              eligible no-proof claims can run hands-off.
            </p>
          </div>
          <span className={`tag ${paidAutomationBlockerSummary.ready ? 'good' : 'warn'}`}>
            {paidAutomationBlockerSummary.blockedCount} blocker{paidAutomationBlockerSummary.blockedCount === 1 ? '' : 's'}
          </span>
        </header>
        <div className="status-action-plan-grid audit-launch-action-plan-grid">
          {(paidAutomationBlockers.length === 0 ? [{
            gate: 'Full automation proof chain',
            owner: 'deployment',
            clientImpact: paidAutomationBlockerSummary.note,
            command: 'npm run launch:handoff',
            path: 'data/launch-handoff-report.md',
          }] : paidAutomationBlockers).slice(0, 5).map((blocker) => (
            <article className="status-action-plan-item audit-launch-action-plan-item" key={blocker.path}>
              <small>{blocker.owner} gate</small>
              <strong>{blocker.gate}</strong>
              <p>{blocker.clientImpact}</p>
              <details className="dashboard-detail-drawer compact-proof-drawer" aria-label={`${blocker.gate} packet command`}>
                <summary>
                  <span>
                    <strong>Packet command</strong>
                    <small>For Launch, Packet Center, Account History, or Settings proof work only.</small>
                  </span>
                </summary>
                <code className="inline-fix-command">{blocker.command}</code>
              </details>
            </article>
          ))}
        </div>
        <div className="status-row">
          <Link className="btn ghost sm" href="/api/audit/client-preview-checklist">Export client preview checklist</Link>
          <Link className="btn ghost sm" href="/api/audit/support-packet">Export support packet</Link>
          <Link className="btn ghost sm" href="/packets">Open Packet Center</Link>
        </div>
      </section>

      <section className="audit-checkpoint-bar" aria-label="Append-only checkpoint">
        <div>
          <strong>Append-only checkpoint</strong>
          <span>
            This fingerprint is generated from the current filtered audit sequence. It changes only when
            committed events or filters change.
          </span>
        </div>
        <code title="This fingerprint helps detect accidental audit packet changes.">
          {checkpoint.short}
        </code>
      </section>

      <section className="audit-trust-handoff" aria-label="Trust Handoff manifest">
        <header className="audit-trust-handoff-head">
          <div>
            <div className="eyebrow">Trust handoff</div>
            <h2>Read-only support context</h2>
            <p>
              Share this reviewed context with support without changing the append-only event record.
              The handoff preserves filters, checkpoint, attention status, and export scope.
            </p>
          </div>
          <a className="btn ghost" href={supportPacketHref}>Export current handoff</a>
        </header>
        <div className="audit-trust-handoff-grid">
          {trustHandoffRows.map((row) => (
            <article className="audit-trust-handoff-item" key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
              <p>{row.detail}</p>
            </article>
          ))}
        </div>
        <p className="audit-trust-handoff-note">
          Shadow-mode artifacts remain review context only. Support exports do not authorize filing,
          alter proof review, or bypass category permission.
        </p>
      </section>

      <form className="filter-bar" method="get" aria-label="Audit filters">
        <select name="actor" defaultValue={actorFilter}>
          <option value="all">All actors</option>
          {actorOptions.map((actor) => (
            <option key={actor} value={actor}>{actor}</option>
          ))}
        </select>
        <select name="entity" defaultValue={entityFilter}>
          <option value="all">All entities</option>
          {entityOptions.map((entity) => (
            <option key={entity} value={entity}>{entity}</option>
          ))}
        </select>
        <select name="severity" defaultValue={severityFilter}>
          <option value="all">All event types</option>
          <option value="attention">Needs attention</option>
        </select>
        <button type="submit">Filter</button>
        {(actorFilter !== 'all' || entityFilter !== 'all' || severityFilter !== 'all') && (
          <Link className="btn ghost sm" href="/audit">Clear filters</Link>
        )}
      </form>

      {events.length === 0 ? (
        <div className="empty">
          <h3>No audit events yet</h3>
          <p>Run intake, matching, or final claim checks to generate traceable records. The preview below shows the immutable event shape before real records exist.</p>
          <article className="audit-event-card audit-event-preview" aria-label="Audit event format preview">
            <span className="audit-event-dot blue" aria-hidden="true" />
            <div className="audit-event-body">
              <div className="audit-event-head">
                <div>
                  <h3>preview format only</h3>
                  <p>claim #pending</p>
                </div>
                <time dateTime="2026-05-25T00:00:00.000Z">ISO timestamp</time>
              </div>
              <div className="status-row">
                <span className="tag blue">EVENT_TYPE</span>
                <span className="tag">Actor: system</span>
                <span className="tag">Entity: claim</span>
                <span className="tag purple">Digest: sha256:preview</span>
              </div>
              <div className="audit-payload">
                payload: source_id | matcher_verdict | permission_version | proof_gate | filing_mode
              </div>
              <p className="muted small audit-preview-note">
                This row is not written to the audit log. It shows clients what the first real append-only record will contain.
              </p>
            </div>
          </article>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="empty">
          <h3>No audit events match these filters</h3>
          <p>Clear filters or choose a different actor/entity combination.</p>
        </div>
      ) : (
        <div className="audit-timeline">
          {filteredEvents.map((event) => {
            const payloadSummary = summarizePayload(event.payloadJson);
            return (
              <article key={event.id} className="audit-event-card">
                <span className={`audit-event-dot ${eventTone(event.eventType)}`} aria-hidden="true" />
                <div className="audit-event-body">
                  <div className="audit-event-head">
                    <div>
                      <h3>{eventLabel(event.eventType)}</h3>
                      <p>
                        {event.entityType} #{event.entityId}
                      </p>
                    </div>
                    <time dateTime={event.occurredAt.toISOString()}>
                      {event.occurredAt.toLocaleString()}
                    </time>
                  </div>
                  <div className="status-row">
                    <span className={`tag ${eventTone(event.eventType)}`}>{event.eventType}</span>
                    <span className={`tag ${actorTone(event.actor)}`}>Actor: {event.actor}</span>
                    <span className="tag">Entity: {event.entityType}</span>
                  </div>
                  {payloadSummary && (
                    <div className="audit-payload">
                      {payloadSummary}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
