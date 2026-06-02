'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

type AuditTone = 'good' | 'blue' | 'purple' | 'warn';

export type AuditTrailBrowserRow = {
  id: number;
  eventLabel: string;
  eventType: string;
  actor: string;
  actorTone: string;
  entityType: string;
  entityId: number;
  occurredAt: string;
  occurredAtIso: string;
  payloadSummary: string;
  eventTone: AuditTone;
  needsAttention: boolean;
};

const AUDIT_FILTERS = [
  { label: 'All events', value: 'all' },
  { label: 'Claims', value: 'claim' },
  { label: 'Permissions', value: 'authorization' },
  { label: 'Needs attention', value: 'attention' },
  { label: 'System', value: 'system' },
] as const;

type AuditFilter = (typeof AUDIT_FILTERS)[number]['value'];

function filterMatches(row: AuditTrailBrowserRow, filter: AuditFilter) {
  if (filter === 'all') return true;
  if (filter === 'attention') return row.needsAttention;
  if (filter === 'system') return row.actor === 'system' || row.entityType === 'system';
  return row.entityType === filter;
}

function iconForRow(row: AuditTrailBrowserRow) {
  if (row.needsAttention) return AlertTriangle;
  if (row.eventTone === 'good') return CheckCircle2;
  if (row.eventTone === 'purple') return ShieldCheck;
  return ClipboardList;
}

export default function AuditTrailBrowser({ rows, supportPacketHref }: {
  rows: AuditTrailBrowserRow[];
  supportPacketHref: string;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AuditFilter>('all');
  const [expanded, setExpanded] = useState<number | null>(rows[0]?.id ?? null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!filterMatches(row, filter)) return false;
      if (!normalizedQuery) return true;
      return [
        row.eventLabel,
        row.eventType,
        row.actor,
        row.entityType,
        String(row.entityId),
        row.payloadSummary,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, rows]);

  return (
    <section className="audit-browser" aria-label="Interactive account history browser">
      <header className="audit-browser-head">
        <div>
          <div className="eyebrow">Account history browser</div>
          <h2>Search append-only events without changing the record</h2>
          <p>
            Filter real account-history entries by actor, entity, event type, payload summary, or attention state.
            This browser is read-only; support exports and server filters remain separate below.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="audit-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search audit events</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search audit events..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Audit event filter">
          {AUDIT_FILTERS.map((item) => (
            <button
              className={filter === item.value ? 'active' : undefined}
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <section className="card launch-card">
          <div className="launch-card-head">
            <div>
              <div className="eyebrow">No account-history events yet</div>
              <h2>The first verified action creates the first append-only trace</h2>
            </div>
            <Link className="btn ghost sm" href="/review">Open review queue</Link>
          </div>
          <p className="muted">
            Account history starts after profile intake, permission changes, matching, tracking, billing, or
            support-export actions write a real event.
          </p>
        </section>
      ) : filteredRows.length === 0 ? (
        <section className="card launch-card">
          <div className="launch-card-head">
            <div>
              <div className="eyebrow">No matching account-history events</div>
              <h2>Try a different actor, entity, event type, payload, or attention filter</h2>
            </div>
            <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear filters
            </button>
          </div>
          <p className="muted">
            Browser filters do not edit events, hide support evidence, or change export scope.
          </p>
        </section>
      ) : (
        <div className="audit-browser-list" aria-label="Audit event list">
          {filteredRows.map((row) => {
            const Icon = iconForRow(row);
            const isExpanded = expanded === row.id;
            return (
              <article className="card audit-browser-card" key={row.id}>
                <button
                  className="audit-browser-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : row.id)}
                >
                  <div className="workflow-card-main">
                    <div className="audit-browser-title">
                      <span className={`status-tracker-icon ${row.eventTone}`} aria-hidden="true">
                        <Icon size={18} />
                      </span>
                      <div>
                        <h2>{row.eventLabel}</h2>
                        <p>{row.entityType} #{row.entityId} | actor {row.actor} | {row.occurredAt}</p>
                      </div>
                    </div>
                    <div className="status-row">
                      <span className={`tag ${row.eventTone}`}>{row.eventType}</span>
                      <span className={`tag ${row.actorTone}`}>Actor: {row.actor}</span>
                      <span className="small muted">{row.payloadSummary || 'Payload contains structured review context'}</span>
                    </div>
                  </div>
                  <div className="workflow-card-actions">
                    <span className="small muted">{row.needsAttention ? 'Attention event' : 'Trace event'}</span>
                    <ChevronRight className={isExpanded ? 'expanded' : undefined} aria-hidden="true" size={18} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="audit-browser-expanded">
                    <div className="audit-browser-grid">
                      <div>
                        <strong>Actor</strong>
                        <span>{row.actor}</span>
                      </div>
                      <div>
                        <strong>Entity</strong>
                        <span>{row.entityType} #{row.entityId}</span>
                      </div>
                      <div>
                        <strong>Timestamp</strong>
                        <span>{row.occurredAtIso}</span>
                      </div>
                      <div>
                        <strong>Attention state</strong>
                        <span>{row.needsAttention ? 'Needs support review' : 'No attention flag'}</span>
                      </div>
                    </div>

                    <div className="audit-browser-proof">
                      <ShieldCheck aria-hidden="true" size={16} />
                      <span>
                        Read-only trace context. Browser filtering never edits the append-only record,
                        grants filing permission, changes proof posture, or bypasses permission.
                      </span>
                    </div>

                    <div className="status-row audit-browser-actions">
                      <a className="btn ghost sm" href={supportPacketHref}>Export support packet</a>
                      <Link className="btn ghost sm" href="/packets">Packet Center</Link>
                      <Link className="btn ghost sm" href="/claims">Claim Queue</Link>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
