'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, KeyRound, LockKeyhole, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

type AuthAccessTone = 'pass' | 'warn' | 'fail';
type AuthAccessKind = 'identity' | 'route' | 'provider' | 'safety';

export type AuthAccessBrowserRow = {
  id: string;
  kind: AuthAccessKind;
  title: string;
  detail: string;
  value: string;
  tone: AuthAccessTone;
};

const AUTH_ACCESS_FILTERS = [
  { label: 'All access items', value: 'all' },
  { label: 'Account access', value: 'identity' },
  { label: 'Next page', value: 'route' },
  { label: 'Sign-in methods', value: 'provider' },
  { label: 'Safety checks', value: 'safety' },
  { label: 'Needs attention', value: 'attention' },
] as const;

type AuthAccessFilter = (typeof AUTH_ACCESS_FILTERS)[number]['value'];

function filterMatches(row: AuthAccessBrowserRow, filter: AuthAccessFilter) {
  if (filter === 'all') return true;
  if (filter === 'attention') return row.tone !== 'pass';
  return row.kind === filter;
}

function rowIcon(row: AuthAccessBrowserRow) {
  if (row.tone === 'fail' || row.tone === 'warn') return AlertTriangle;
  if (row.kind === 'identity') return LockKeyhole;
  if (row.kind === 'route') return KeyRound;
  return CheckCircle2;
}

export default function AuthAccessBrowser({ rows }: { rows: AuthAccessBrowserRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AuthAccessFilter>('all');
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
    <section className="claim-packet-browser auth-access-browser" aria-label="Account access detail browser">
      <header className="claim-packet-browser-head">
        <div>
          <div className="eyebrow">Account access details</div>
          {/* Guardrail marker: Check sign-in readiness before entering the workspace. */}
          <h2>Check account access before entering the workspace</h2>
          <p>
            Review account access, the next page after sign-in, available sign-in methods, and safety checks.
            This view is read-only and cannot create sessions, accounts, or claim authority.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="claim-packet-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search account access details</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search account access..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Account access filter">
          {AUTH_ACCESS_FILTERS.map((item) => (
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
              <div className="eyebrow">No matching access details</div>
              <h2>Try a different account, page, sign-in method, safety, or attention filter</h2>
            </div>
            <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear filters
            </button>
          </div>
          <p className="muted">
            Filters never sign in users, create accounts, change account state, or grant filing authority.
          </p>
        </section>
      ) : (
        <div className="claim-packet-browser-list" aria-label="Account access detail list">
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
                        {row.tone === 'pass' ? 'Ready' : row.tone === 'fail' ? 'Blocked' : 'Review'}
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
                        <strong>Access type</strong>
                        <span>{row.kind}</span>
                      </div>
                      <div>
                        <strong>Current state</strong>
                        <span>{row.value}</span>
                      </div>
                      <div>
                        <strong>Review detail</strong>
                        <span>{row.detail}</span>
                      </div>
                    </div>

                    <div className="claim-packet-browser-proof">
                      <ShieldCheck aria-hidden="true" size={16} />
                      <span>
                        Read-only access context. Sign-in opens the private workspace only; proof,
                        permission, review mode, billing, and account checks still apply.
                      </span>
                    </div>

                    <div className="status-row claim-packet-browser-actions">
                      <Link className="btn ghost sm" href="/launch">Account details</Link>
                      <Link className="btn ghost sm" href="/trust">Trust Center</Link>
                      <Link className="btn ghost sm" href="/help">Help</Link>
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
