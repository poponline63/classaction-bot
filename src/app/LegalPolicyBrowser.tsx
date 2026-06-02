'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, FileText, LockKeyhole, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

type LegalPolicyTone = 'pass' | 'warn' | 'fail';
type LegalPolicyKind = 'boundary' | 'data' | 'control' | 'operator' | 'safety';

export type LegalPolicyBrowserRow = {
  id: string;
  kind: LegalPolicyKind;
  title: string;
  detail: string;
  value: string;
  tone: LegalPolicyTone;
};

const LEGAL_POLICY_FILTERS = [
  { label: 'All policy items', value: 'all' },
  { label: 'Product boundaries', value: 'boundary' },
  { label: 'Data handling', value: 'data' },
  { label: 'User controls', value: 'control' },
  { label: 'Business duties', value: 'operator' },
  { label: 'Needs review', value: 'attention' },
] as const;

type LegalPolicyFilter = (typeof LEGAL_POLICY_FILTERS)[number]['value'];

function filterMatches(row: LegalPolicyBrowserRow, filter: LegalPolicyFilter) {
  if (filter === 'all') return true;
  if (filter === 'attention') return row.tone !== 'pass';
  return row.kind === filter;
}

function rowIcon(row: LegalPolicyBrowserRow) {
  if (row.tone === 'fail' || row.tone === 'warn') return AlertTriangle;
  if (row.kind === 'data') return LockKeyhole;
  if (row.kind === 'control') return ShieldCheck;
  if (row.kind === 'operator') return FileText;
  return CheckCircle2;
}

function policyKindLabel(kind: LegalPolicyKind) {
  return kind === 'operator' ? 'business' : kind;
}

export default function LegalPolicyBrowser({
  rows,
  title,
  description,
}: {
  rows: LegalPolicyBrowserRow[];
  title: string;
  description: string;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LegalPolicyFilter>('all');
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
    <section className="claim-packet-browser legal-policy-browser" aria-label={`${title} policy browser`}>
      <header className="claim-packet-browser-head">
        <div>
          <div className="eyebrow">Policy browser</div>
          <h2>{title}</h2>
          <p>{description} This browser is read-only and does not change account, claim, privacy, or filing state.</p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="claim-packet-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search policy boundaries</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search policy boundaries..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Legal policy filter">
          {LEGAL_POLICY_FILTERS.map((item) => (
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
              <div className="eyebrow">No matching policy items</div>
              <h2>Try a different boundary, data, control, business, or review filter</h2>
            </div>
            <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear filters
            </button>
          </div>
          <p className="muted">
            Browser filters never submit claims, erase records, approve legal eligibility, or modify account history.
          </p>
        </section>
      ) : (
        <div className="claim-packet-browser-list" aria-label="Legal policy boundary list">
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
                        <p>{policyKindLabel(row.kind)} | {row.value}</p>
                      </div>
                    </div>
                    <div className="status-row">
                      <span className={`tag ${row.tone === 'pass' ? 'good' : row.tone === 'fail' ? 'bad' : 'warn'}`}>
                        {row.tone === 'pass' ? 'Published' : row.tone === 'fail' ? 'Blocked' : 'Review'}
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
                        <strong>Policy type</strong>
                        <span>{policyKindLabel(row.kind)}</span>
                      </div>
                      <div>
                        <strong>Boundary</strong>
                        <span>{row.value}</span>
                      </div>
                      <div>
                        <strong>Detail</strong>
                        <span>{row.detail}</span>
                      </div>
                    </div>

                    <div className="claim-packet-browser-proof">
                      <ShieldCheck aria-hidden="true" size={16} />
                      <span>
                        Read-only policy context. ClaimBot still requires truthful user facts,
                        proof review, active permission, account history, and account checks.
                      </span>
                    </div>

                    <div className="status-row claim-packet-browser-actions">
                      <Link className="btn ghost sm" href="/trust">Trust Center</Link>
                      <Link className="btn ghost sm" href="/privacy-policy">Privacy</Link>
                      <Link className="btn ghost sm" href="/terms">Terms</Link>
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
