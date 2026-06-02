'use client';

import { AlertTriangle, CheckCircle2, ChevronRight, History, Lock, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

type AuthorizationStatus = 'active' | 'shadow' | 'revoked';

export type AuthorizationBrowserRow = {
  category: string;
  label: string;
  status: AuthorizationStatus;
  statusLabel: string;
  statusDetail: string;
  version: number;
  authorizedAt: string | null;
  revokedAt: string | null;
  attestationPreview: string;
};

const AUTHORIZATION_FILTERS = [
  { label: 'All categories', value: 'all' },
  { label: 'Permission saved', value: 'active' },
  { label: 'Review only', value: 'shadow' },
  { label: 'Paused', value: 'revoked' },
  { label: 'Updated text', value: 'updated' },
] as const;

type AuthorizationFilter = (typeof AUTHORIZATION_FILTERS)[number]['value'];

function filterMatches(row: AuthorizationBrowserRow, filter: AuthorizationFilter) {
  if (filter === 'all') return true;
  if (filter === 'updated') return row.version > 1;
  return row.status === filter;
}

function statusTone(status: AuthorizationStatus) {
  if (status === 'active') return 'pass';
  if (status === 'revoked') return 'fail';
  return 'warn';
}

function StatusIcon({ status }: { status: AuthorizationStatus }) {
  if (status === 'active') return <CheckCircle2 aria-hidden="true" size={18} />;
  if (status === 'revoked') return <AlertTriangle aria-hidden="true" size={18} />;
  return <Lock aria-hidden="true" size={18} />;
}

export default function AuthorizationCommandBrowser({ rows }: { rows: AuthorizationBrowserRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AuthorizationFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(rows[0]?.category ?? null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!filterMatches(row, filter)) return false;
      if (!normalizedQuery) return true;
      return [
        row.category,
        row.label,
        row.statusLabel,
        row.statusDetail,
        row.attestationPreview,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, rows]);

  return (
    <section className="authorization-browser" aria-label="Interactive permission browser">
      <header className="authorization-browser-head">
        <div>
          <div className="eyebrow">Permission browser</div>
          <h2>Search claim permissions before automation</h2>
          <p>
            Review every allowed category, paused record, attestation version, and review-only
            boundary before a match is allowed near paid full automation.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="authorization-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search claim permissions</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search claim permissions..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Permission filter">
          {AUTHORIZATION_FILTERS.map((item) => (
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
        <div className="authorization-browser-empty">
          <AlertTriangle aria-hidden="true" size={28} />
          <h3>No matching permissions</h3>
          <p>
            Try a different category, status, or attestation term. Filters only change this view;
            they do not save, pause, or allow any category.
          </p>
          <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="authorization-browser-list">
          {filteredRows.map((row) => {
            const isExpanded = expanded === row.category;
            const tone = statusTone(row.status);

            return (
              <article className={`authorization-browser-card ${tone}`} key={row.category}>
                <button
                  className="authorization-browser-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : row.category)}
                >
                  <div className="authorization-browser-title">
                    <span className={`status-tracker-icon ${tone === 'pass' ? 'green' : tone === 'fail' ? 'red' : 'yellow'}`} aria-hidden="true">
                      <StatusIcon status={row.status} />
                    </span>
                    <div>
                      <h3>{row.label}</h3>
                      <p>{row.statusDetail}</p>
                    </div>
                  </div>
                  <div className="authorization-browser-status">
                    <span className={`tag ${tone === 'pass' ? 'good' : tone === 'fail' ? 'bad' : 'warn'}`}>
                      {row.statusLabel}
                    </span>
                    <span className="tag">Version {row.version}</span>
                    {row.authorizedAt && <span className="small muted">Authorized {row.authorizedAt}</span>}
                  </div>
                  <div className="workflow-card-actions">
                    <span className="small muted">{row.revokedAt ? `Revoked ${row.revokedAt}` : 'History-ready'}</span>
                    <ChevronRight className={isExpanded ? 'expanded' : undefined} aria-hidden="true" size={18} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="authorization-browser-expanded">
                    <div className="authorization-browser-gates" aria-label="Permission check summary">
                      <span className={row.status === 'active' ? 'pass' : 'warn'}>
                        <ShieldCheck aria-hidden="true" size={13} />
                        {row.status === 'active' ? 'Permission active' : 'Permission locked'}
                      </span>
                      <span className={row.version > 1 ? 'pass' : 'warn'}>
                        <History aria-hidden="true" size={13} />
                        {row.version > 1 ? 'Updated attestation' : 'Default attestation'}
                      </span>
                      <span className={row.status !== 'revoked' ? 'pass' : 'warn'}>
                        <Lock aria-hidden="true" size={13} />
                        {row.status === 'revoked' ? 'Paused categories stay blocked' : 'Pause-aware final checks'}
                      </span>
                    </div>

                    <blockquote>{row.attestationPreview}</blockquote>

                    <div className="status-row authorization-browser-actions">
                      <a className="btn ghost sm" href={`#authorization-${row.category}`}>Open permission controls</a>
                      <a className="btn ghost sm" href="/review">Review matches</a>
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
