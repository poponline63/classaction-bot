'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';

type QueueTone = 'blue' | 'green' | 'yellow' | 'red';

export type ClaimsQueueBrowserRow = {
  id: number;
  caseName: string;
  defendant: string;
  administrator: string;
  category: string;
  status: string;
  statusLabel: string;
  statusDetail: string;
  statusTone: QueueTone;
  queuedAt: string;
  filedAt: string;
  paidAt: string;
  payoutEstimate: string;
  confirmationLabel: string;
  lastError: string | null;
  matcherLabel: string;
  confidenceLabel: string;
  classAuthorizationId: number;
  trackingLabel: string;
  currentStep: number;
  failed: boolean;
};

const QUEUE_FILTERS = [
  { label: 'All claims', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Recorded', value: 'recorded' },
  { label: 'Needs attention', value: 'attention' },
  { label: 'Paid', value: 'paid' },
] as const;

const QUEUE_STAGES = ['Tracked', 'Checking', 'Preparing', 'Completed', 'Paid'];

type QueueFilter = (typeof QUEUE_FILTERS)[number]['value'];

function filterMatches(row: ClaimsQueueBrowserRow, filter: QueueFilter) {
  if (filter === 'all') return true;
  if (filter === 'active') return ['QUEUED', 'PREFLIGHT', 'FILING'].includes(row.status);
  if (filter === 'recorded') return ['FILED', 'PAID'].includes(row.status);
  if (filter === 'paid') return row.status === 'PAID';
  return ['FAILED', 'ABORTED'].includes(row.status);
}

function statusIcon(status: string) {
  if (status === 'PAID') return DollarSign;
  if (status === 'FILED') return CheckCircle2;
  if (status === 'FAILED' || status === 'ABORTED') return AlertTriangle;
  if (status === 'FILING') return FileText;
  return Clock;
}

export default function ClaimsQueueBrowser({ rows }: { rows: ClaimsQueueBrowserRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!filterMatches(row, filter)) return false;
      if (!normalizedQuery) return true;
      return [
        row.caseName,
        row.defendant,
        row.administrator,
        row.category,
        row.statusLabel,
        row.matcherLabel,
        row.trackingLabel,
        row.confirmationLabel,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, rows]);

  return (
    <section className="queue-browser" aria-label="Interactive claim tracker">
      <header className="queue-browser-head">
        <div>
          <div className="eyebrow">Claim tracker</div>
          <h2>Search tracked claims</h2>
          <p>
            Filter your claim records by status, case, administrator, category, match result,
            tracking record, or recorded confirmation while permission and proof rules stay unchanged.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="queue-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search claims</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search claims..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Claim tracking filter">
          {QUEUE_FILTERS.map((item) => (
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
              <div className="eyebrow">No tracked claims yet</div>
              <h2>Claims appear here after review creates a guarded record</h2>
            </div>
            <Link className="btn ghost sm" href="/review">Start review</Link>
          </div>
          <p className="muted">
            This browser is read-only. It never starts filing, bypasses proof review,
            or changes permission state.
          </p>
        </section>
      ) : filteredRows.length === 0 ? (
        <section className="card launch-card">
          <div className="launch-card-head">
            <div>
              <div className="eyebrow">No matching claim records</div>
              <h2>Try a different case, tracking ID, administrator, or status filter</h2>
            </div>
            <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear filters
            </button>
          </div>
          <p className="muted">
            Browser filters do not alter claim state. Filing actions still require the guarded claim detail route.
          </p>
        </section>
      ) : (
        <div className="queue-browser-list" aria-label="Claim tracking records">
          {filteredRows.map((row) => {
            const Icon = statusIcon(row.status);
            const isExpanded = expanded === row.id;
            return (
              <article className="card queue-browser-card" key={row.id}>
                <button
                  className="queue-browser-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : row.id)}
                >
                  <div className="workflow-card-main">
                    <div className="queue-browser-title">
                      <span className={`status-tracker-icon ${row.statusTone}`} aria-hidden="true">
                        <Icon size={18} />
                      </span>
                      <div>
                        <h2>{row.caseName}</h2>
                        <p>{row.defendant} | {row.administrator} | tracked {row.queuedAt}</p>
                      </div>
                    </div>
                    <div className="status-row">
                      <span className={`tag ${row.statusTone}`}>{row.statusLabel}</span>
                      <span className="tag blue">{row.matcherLabel}</span>
                      <span className="small muted">{row.statusDetail}</span>
                    </div>
                  </div>
                  <div className="workflow-card-actions">
                    <span className="small muted">{row.trackingLabel}</span>
                    <ChevronRight className={isExpanded ? 'expanded' : undefined} aria-hidden="true" size={18} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="queue-browser-expanded">
                    <div className="status-steps claim-status-steps">
                      {QUEUE_STAGES.map((label, index) => (
                        <div
                          key={label}
                          className={`status-step ${
                            index < row.currentStep
                              ? 'done'
                              : index === row.currentStep
                                ? row.failed ? 'failed' : 'active'
                                : ''
                          }`}
                        >
                          {label}
                        </div>
                      ))}
                    </div>

                    <div className="queue-browser-grid">
                      <div>
                        <strong>Allowed filing lane</strong>
                        <span>Permission record #{row.classAuthorizationId}</span>
                      </div>
                      <div>
                        <strong>Matcher evidence</strong>
                        <span>{row.matcherLabel} | {row.confidenceLabel}</span>
                      </div>
                      <div>
                        <strong>Recorded result</strong>
                        <span>{row.confirmationLabel}</span>
                      </div>
                      <div>
                        <strong>Payment and estimate</strong>
                        <span>{row.paidAt} | {row.payoutEstimate}</span>
                      </div>
                    </div>

                    <div className="queue-browser-proof">
                      <ShieldCheck aria-hidden="true" size={16} />
                      <span>
                        {/* Guardrail marker: Trust-lock receipt remains an internal audit concept; customers see safety context. */}
                        Safety context: read-only claim history. Proof-required claims, paused
                        permissions, missing forms, and disabled live filing still block dispatch.
                      </span>
                    </div>

                    <div className="status-row queue-browser-actions">
                      <Link className="btn ghost sm" href={`/claims/${row.id}`}>Open guarded detail</Link>
                      <Link className="btn ghost sm" href="/packets">Packet center</Link>
                      <Link className="btn ghost sm" href="/audit">Account history</Link>
                    </div>

                    {row.lastError && (
                      <div className="notice warn">
                        <AlertTriangle aria-hidden="true" size={18} />
                        <div>
                          <strong>Last error</strong>
                          <p>{row.lastError.slice(0, 180)}</p>
                        </div>
                      </div>
                    )}
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
