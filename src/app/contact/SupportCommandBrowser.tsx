'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, LifeBuoy, Mail, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

type SupportCommandTone = 'pass' | 'warn' | 'fail';
type SupportCommandKind = 'channel' | 'billing' | 'privacy' | 'history' | 'audit' | 'safety';

export type SupportCommandBrowserRow = {
  id: string;
  kind: SupportCommandKind;
  title: string;
  detail: string;
  value: string;
  tone: SupportCommandTone;
};

const SUPPORT_COMMAND_FILTERS = [
  { label: 'All support items', value: 'all' },
  { label: 'Channels', value: 'channel' },
  { label: 'Billing', value: 'billing' },
  { label: 'Privacy', value: 'privacy' },
  { label: 'History', value: 'history' },
  { label: 'Needs attention', value: 'attention' },
] as const;

type SupportCommandFilter = (typeof SUPPORT_COMMAND_FILTERS)[number]['value'];

function filterMatches(row: SupportCommandBrowserRow, filter: SupportCommandFilter) {
  if (filter === 'all') return true;
  if (filter === 'attention') return row.tone !== 'pass';
  return row.kind === filter;
}

function rowIcon(row: SupportCommandBrowserRow) {
  if (row.tone === 'fail' || row.tone === 'warn') return AlertTriangle;
  if (row.kind === 'channel') return Mail;
  if (row.kind === 'billing') return LifeBuoy;
  return CheckCircle2;
}

export default function SupportCommandBrowser({
  rows,
  supportHref,
}: {
  rows: SupportCommandBrowserRow[];
  supportHref: string | null;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SupportCommandFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(rows[0]?.id ?? null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!filterMatches(row, filter)) return false;
      if (!normalizedQuery) return true;
      return [row.kind, row.title, row.value, row.detail].some((value) => (
        value.toLowerCase().includes(normalizedQuery)
      ));
    });
  }, [filter, query, rows]);

  return (
    <section className="claim-packet-browser support-command-browser" aria-label="Support routing browser">
      <header className="claim-packet-browser-head">
        <div>
          <div className="eyebrow">Support routing</div>
          <h2>Find the right support path</h2>
          <p>
            Filter support channels, billing help, privacy routes, audit context, and safety
            boundaries before sending a question. This browser is read-only.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="claim-packet-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search support routing</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search support routing..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Support command filter">
          {SUPPORT_COMMAND_FILTERS.map((item) => (
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

      {filteredRows.length === 0 ? (
        <section className="card launch-card">
          <div className="launch-card-head">
            <div>
              <div className="eyebrow">No matching support items</div>
              <h2>Try a different channel, billing, privacy, audit, or attention filter</h2>
            </div>
            <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear filters
            </button>
          </div>
          <p className="muted">
            Browser filters never edit profile facts, claim records, privacy requests, billing state, or audit events.
          </p>
        </section>
      ) : (
        <div className="claim-packet-browser-list" aria-label="Support routing list">
          {filteredRows.map((row) => {
            const Icon = rowIcon(row);
            const isExpanded = expanded === row.id;
            return (
              <article className="card claim-packet-browser-card" key={row.id}>
                <button
                  className="claim-packet-browser-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : row.id)}
                >
                  <div className="workflow-card-main">
                    <div className="claim-packet-browser-title">
                      <span className={`status-tracker-icon ${row.tone}`} aria-hidden="true">
                        <Icon size={18} />
                      </span>
                      <div>
                        <h2>{row.title}</h2>
                        <p>{row.kind} | {row.value}</p>
                      </div>
                    </div>
                    <div className="status-row">
                      <span className={`tag ${row.tone === 'pass' ? 'good' : row.tone === 'fail' ? 'bad' : 'warn'}`}>
                        {row.tone === 'pass' ? 'Ready' : row.tone === 'fail' ? 'Blocked' : 'Attention'}
                      </span>
                      <span className="small muted">{row.detail}</span>
                    </div>
                  </div>
                  <div className="workflow-card-actions">
                    <ChevronRight className={isExpanded ? 'expanded' : undefined} aria-hidden="true" size={18} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="claim-packet-browser-expanded">
                    <div className="claim-packet-browser-grid">
                      <div>
                        <strong>Support type</strong>
                        <span>{row.kind}</span>
                      </div>
                      <div>
                        <strong>Current state</strong>
                        <span>{row.value}</span>
                      </div>
                      <div>
                        <strong>Routing detail</strong>
                        <span>{row.detail}</span>
                      </div>
                    </div>

                    <div className="claim-packet-browser-proof">
                      <ShieldCheck aria-hidden="true" size={16} />
                      <span>
                        Read-only support context. Support can route questions with audit context,
                        but cannot override proof, permission, billing, privacy, or account rules.
                      </span>
                    </div>

                    <div className="status-row claim-packet-browser-actions">
                      {supportHref ? (
                        <a className="btn ghost sm" href={supportHref}>
                          {supportHref.startsWith('mailto:') ? 'Email support' : 'Open support'}
                        </a>
                      ) : (
                        <Link className="btn ghost sm" href="/settings">Set support contact</Link>
                      )}
                      <Link className="btn ghost sm" href="/audit">Activity history</Link>
                      <Link className="btn ghost sm" href="/privacy-policy">Privacy</Link>
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
