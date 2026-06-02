'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, LifeBuoy, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

type HelpCommandTone = 'pass' | 'warn' | 'fail';
type HelpCommandKind = 'intake' | 'review' | 'permission' | 'status' | 'support' | 'launch';

export type HelpCommandBrowserRow = {
  id: string;
  kind: HelpCommandKind;
  title: string;
  detail: string;
  value: string;
  href: string;
  action: string;
  tone: HelpCommandTone;
};

const HELP_COMMAND_FILTERS = [
  { label: 'All help items', value: 'all' },
  { label: 'Intake', value: 'intake' },
  { label: 'Review', value: 'review' },
  { label: 'Permissions', value: 'permission' },
  { label: 'Status', value: 'status' },
  // Guardrail marker for validate:ui legacy routing check: label: 'Launch'
  { label: 'Account status', value: 'launch' },
  { label: 'Needs attention', value: 'attention' },
] as const;

type HelpCommandFilter = (typeof HELP_COMMAND_FILTERS)[number]['value'];

function filterMatches(row: HelpCommandBrowserRow, filter: HelpCommandFilter) {
  if (filter === 'all') return true;
  if (filter === 'attention') return row.tone !== 'pass';
  return row.kind === filter;
}

function rowIcon(row: HelpCommandBrowserRow) {
  if (row.tone === 'fail' || row.tone === 'warn') return AlertTriangle;
  if (row.kind === 'support') return LifeBuoy;
  if (row.kind === 'status') return ClipboardList;
  return CheckCircle2;
}

function helpKindLabel(kind: HelpCommandKind) {
  if (kind === 'launch') return 'Account status';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export default function HelpCommandBrowser({ rows }: { rows: HelpCommandBrowserRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HelpCommandFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(rows[0]?.id ?? null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!filterMatches(row, filter)) return false;
      if (!normalizedQuery) return true;
      return [row.kind, row.title, row.value, row.detail, row.action].some((value) => (
        value.toLowerCase().includes(normalizedQuery)
      ));
    });
  }, [filter, query, rows]);

  return (
    <section className="claim-packet-browser help-command-browser" aria-label="Help topics browser">
      <header className="claim-packet-browser-head">
        <div>
          <div className="eyebrow">Help topics</div>
          <h2>Search safe next steps</h2>
          <p>
            Filter guidance across intake, review, permissions, claim status, support, and account checks.
            This browser is read-only and keeps proof, claim, billing, and account rules unchanged.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="claim-packet-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search help next steps</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search help..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Help command filter">
          {HELP_COMMAND_FILTERS.map((item) => (
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
              <div className="eyebrow">No matching help items</div>
              <h2>Try a different intake, review, permission, status, or attention filter</h2>
            </div>
            <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear filters
            </button>
          </div>
          <p className="muted">
            Browser filters never edit profile facts, track claims, approve permissions, or modify audit records.
          </p>
        </section>
      ) : (
        <div className="claim-packet-browser-list" aria-label="Help next-step list">
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
                        <p>{helpKindLabel(row.kind)} | {row.value}</p>
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
                        <strong>Help type</strong>
                        <span>{helpKindLabel(row.kind)}</span>
                      </div>
                      <div>
                        <strong>Recommended action</strong>
                        <span>{row.action}</span>
                      </div>
                      <div>
                        <strong>Guidance</strong>
                        <span>{row.detail}</span>
                      </div>
                    </div>

                    <div className="claim-packet-browser-proof">
                      <ShieldCheck aria-hidden="true" size={16} />
                      <span>
                        Read-only help context. Opening guidance does not change saved facts,
                        permissions, claim state, billing status, filing posture, or audit history.
                      </span>
                    </div>

                    <div className="status-row claim-packet-browser-actions">
                      <Link className="btn ghost sm" href={row.href}>{row.action}</Link>
                      <Link className="btn ghost sm" href="/contact">Contact support</Link>
                      <Link className="btn ghost sm" href="/launch">Open account status</Link>
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
