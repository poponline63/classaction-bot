'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileSearch,
  LockKeyhole,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';

type SettlementBrowserTone = 'green' | 'blue' | 'yellow' | 'red';

export type SettlementDiscoveryBrowserRow = {
  id: number;
  caseName: string;
  defendant: string;
  categoryLabel: string;
  sourceLabel: string;
  sourceUrl: string;
  discoveredAt: string;
  deadlineLabel: string;
  payoutLabel: string;
  matchLabel: string;
  matchDetail: string;
  readinessLabel: string;
  readinessDetail: string;
  readinessTone: SettlementBrowserTone;
  authorizationActive: boolean;
  proofRequired: boolean;
  claimFormAvailable: boolean;
  automationEntitlementActive: boolean;
  claimQueued: boolean;
};

const DISCOVERY_FILTERS = [
  { label: 'All records', value: 'all' },
  { label: 'Possible match', value: 'eligible' },
  { label: 'Needs review', value: 'review' },
  { label: 'Ready', value: 'ready' },
  { label: 'Blocked checks', value: 'blocked' },
] as const;

type DiscoveryFilter = (typeof DISCOVERY_FILTERS)[number]['value'];

function filterMatches(row: SettlementDiscoveryBrowserRow, filter: DiscoveryFilter) {
  if (filter === 'all') return true;
  if (filter === 'eligible') return row.matchLabel === 'Possible match';
  if (filter === 'review') return row.matchLabel === 'Needs review' || row.readinessLabel === 'Review first';
  if (filter === 'ready') return row.readinessLabel === 'Ready for final checks';
  return !row.authorizationActive || row.proofRequired || !row.claimFormAvailable || !row.automationEntitlementActive;
}

function readinessIcon(row: SettlementDiscoveryBrowserRow) {
  if (row.readinessLabel === 'Ready for final checks') return CheckCircle2;
  if (!row.authorizationActive || !row.automationEntitlementActive) return LockKeyhole;
  if (row.proofRequired || !row.claimFormAvailable) return AlertTriangle;
  return FileSearch;
}

export default function SettlementDiscoveryBrowser({ rows }: { rows: SettlementDiscoveryBrowserRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DiscoveryFilter>('all');
  const [expanded, setExpanded] = useState<number | null>(rows[0]?.id ?? null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!filterMatches(row, filter)) return false;
      if (!normalizedQuery) return true;
      return [
        row.caseName,
        row.defendant,
        row.categoryLabel,
        row.sourceLabel,
        row.matchLabel,
        row.readinessLabel,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, rows]);

  return (
    <section className="settlement-browser" aria-label="Interactive settlement discovery browser">
      <header className="settlement-browser-head">
        <div>
          <div className="eyebrow">Discovery browser</div>
          <h2>Search source records without implying claim permission</h2>
          <p>
            Filter real settlement catalog rows by source, category, matcher posture, queue readiness,
            proof status, permission, form availability, and paid automation checks.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="settlement-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search settlement source records</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search source records..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Settlement discovery filter">
          {DISCOVERY_FILTERS.map((item) => (
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
              <div className="eyebrow">No source records</div>
              <h2>Discovery opens after the hosted source catalog is loaded</h2>
            </div>
            <Link className="btn ghost sm" href="/launch">Open account status</Link>
          </div>
          <p className="muted">
            Browser filters are read-only. Empty discovery means source data is missing, not evidence that
            no claim can pertain to an account.
          </p>
        </section>
      ) : filteredRows.length === 0 ? (
        <section className="card launch-card">
          <div className="launch-card-head">
            <div>
              <div className="eyebrow">No matching source records</div>
              <h2>Try a different case, defendant, source, category, or check filter</h2>
            </div>
            <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear filters
            </button>
          </div>
          <p className="muted">
            Filters only change this discovery view. Claim forms remain server-rendered below and still
            require trust-lock acknowledgement.
          </p>
        </section>
      ) : (
        <div className="settlement-browser-list" aria-label="Settlement source record list">
          {filteredRows.map((row) => {
            const Icon = readinessIcon(row);
            const isExpanded = expanded === row.id;
            return (
              <article className="card settlement-browser-card" key={row.id}>
                <button
                  className="settlement-browser-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : row.id)}
                >
                  <div className="workflow-card-main">
                    <div className="settlement-browser-title">
                      <span className={`status-tracker-icon ${row.readinessTone}`} aria-hidden="true">
                        <Icon size={18} />
                      </span>
                      <div>
                        <h2>{row.caseName}</h2>
                        <p>{row.defendant} | {row.sourceLabel} | discovered {row.discoveredAt}</p>
                      </div>
                    </div>
                    <div className="status-row">
                      <span className="tag">{row.categoryLabel}</span>
                      <span className={`tag ${row.readinessTone}`}>{row.readinessLabel}</span>
                      <span className="small muted">{row.matchDetail}</span>
                    </div>
                  </div>
                  <div className="workflow-card-actions">
                    <span className="small muted">{row.deadlineLabel}</span>
                    <ChevronRight className={isExpanded ? 'expanded' : undefined} aria-hidden="true" size={18} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="settlement-browser-expanded">
                    <div className="settlement-browser-grid">
                      <div>
                        <strong>Matcher boundary</strong>
                        <span>{row.matchLabel} | {row.matchDetail}</span>
                      </div>
                      <div>
                        <strong>Claim readiness</strong>
                        <span>{row.readinessLabel} | {row.readinessDetail}</span>
                      </div>
                      <div>
                        <strong>Value note</strong>
                        <span>{row.payoutLabel}</span>
                      </div>
                      <div>
                        <strong>Claim state</strong>
                        <span>{row.claimQueued ? 'Claim already tracked' : 'No claim tracked yet'}</span>
                      </div>
                    </div>

                    <div className="settlement-browser-gates" aria-label="Settlement check summary">
                      <span className={row.authorizationActive ? 'pass' : 'warn'}>
                        {row.authorizationActive ? <CheckCircle2 aria-hidden="true" size={13} /> : <LockKeyhole aria-hidden="true" size={13} />}
                        Permission
                      </span>
                      <span className={row.proofRequired ? 'warn' : 'pass'}>
                        {row.proofRequired ? <AlertTriangle aria-hidden="true" size={13} /> : <CheckCircle2 aria-hidden="true" size={13} />}
                        Proof
                      </span>
                      <span className={row.claimFormAvailable ? 'pass' : 'warn'}>
                        {row.claimFormAvailable ? <CheckCircle2 aria-hidden="true" size={13} /> : <AlertTriangle aria-hidden="true" size={13} />}
                        Form
                      </span>
                      <span className={row.automationEntitlementActive ? 'pass' : 'warn'}>
                        {row.automationEntitlementActive ? <CheckCircle2 aria-hidden="true" size={13} /> : <LockKeyhole aria-hidden="true" size={13} />}
                        Plan
                      </span>
                    </div>

                    <div className="settlement-browser-proof">
                      <ShieldCheck aria-hidden="true" size={16} />
                      <span>
                        Discovery browser is read-only. Source records do not create eligibility,
                        claim permission, legal advice, payout certainty, or filing authority.
                      </span>
                    </div>

                    <div className="status-row settlement-browser-actions">
                      <Link className="btn ghost sm" href={`/settlements/${row.id}`}>Open detail</Link>
                      <a className="btn ghost sm" href={row.sourceUrl} target="_blank" rel="noopener noreferrer">Open source</a>
                      <Link className="btn ghost sm" href="/review">Review matches</Link>
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
