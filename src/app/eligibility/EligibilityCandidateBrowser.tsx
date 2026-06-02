'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, FileText, Lock, Search, ShieldCheck, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

type EligibilityTone = 'pass' | 'warn' | 'fail';

export type EligibilityCandidateRow = {
  id: number;
  settlementId: number;
  caseName: string;
  defendant: string;
  categoryLabel: string;
  requiredCategoryLabel: string;
  stateLabel: string;
  stateDetail: string;
  stateTone: EligibilityTone;
  matcherVerdict: string;
  confidencePercent: number;
  authorizationActive: boolean;
  proofRequired: boolean;
  claimFormLinked: boolean;
  automationEntitlementActive: boolean;
  alreadyQueued: boolean;
  planLabel: string;
  deadlineLabel: string;
};

const CANDIDATE_FILTERS = [
  { label: 'All candidates', value: 'all' },
  { label: 'Ready', value: 'ready' },
  { label: 'Documents needed', value: 'proof' },
  { label: 'Needs action', value: 'attention' },
  { label: 'Excluded', value: 'excluded' },
] as const;

type CandidateFilter = (typeof CANDIDATE_FILTERS)[number]['value'];

function filterMatches(row: EligibilityCandidateRow, filter: CandidateFilter) {
  if (filter === 'all') return true;
  if (filter === 'ready') return row.stateTone === 'pass' && !row.alreadyQueued;
  if (filter === 'proof') return row.proofRequired;
  if (filter === 'excluded') return row.stateTone === 'fail';
  return row.stateTone === 'warn';
}

function GateStep({
  active,
  icon,
  label,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <span className={active ? 'done' : 'blocked'}>
      {icon}
      {label}
    </span>
  );
}

export default function EligibilityCandidateBrowser({ rows }: { rows: EligibilityCandidateRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CandidateFilter>('all');
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
        row.requiredCategoryLabel,
        row.stateLabel,
        row.matcherVerdict,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, rows]);

  return (
    <section className="eligibility-browser" aria-label="Interactive eligibility candidate browser">
      <header className="eligibility-browser-head">
        <div>
          <div className="eyebrow">Possible matches</div>
          <h2>Search matches by status and deadline</h2>
          <p>
            Filter real matcher records by readiness, document needs, blocked steps, case,
            defendant, category, or matcher verdict.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="eligibility-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search eligibility candidates</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search candidates..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Eligibility candidate filter">
          {CANDIDATE_FILTERS.map((item) => (
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
        <div className="eligibility-empty-state">
          <Search aria-hidden="true" size={28} />
          <h3>No matcher records yet</h3>
          <p>
            Run discovery or add your facts so ClaimBot can compare saved facts with source
            records. Nothing is tracked from an empty review state.
          </p>
          <div className="page-actions">
            <Link className="btn" href="/setup">Start with facts</Link>
            <Link className="btn ghost" href="/settlements">Review sources</Link>
          </div>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="eligibility-empty-state">
          <AlertTriangle aria-hidden="true" size={28} />
          <h3>No matching candidates</h3>
          <p>
            Try a different case, defendant, category, verdict, or check filter. Filters only
            change this view; they do not alter saved facts, permissions, or claim state.
          </p>
          <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="eligibility-candidate-list">
          {filteredRows.map((row) => {
            const isExpanded = expanded === row.id;
            const eligibleMatcher = row.matcherVerdict === 'ELIGIBLE';
            const gatesReady = eligibleMatcher
              && row.authorizationActive
              && !row.proofRequired
              && row.claimFormLinked
              && row.automationEntitlementActive;

            return (
              <article className={`eligibility-candidate ${row.stateTone}`} key={row.id}>
                <button
                  className="eligibility-candidate-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : row.id)}
                >
                  <div className="eligibility-candidate-main">
                    <span className={`readiness-dot ${row.stateTone}`} aria-hidden="true" />
                    <div>
                      <h3>{row.caseName}</h3>
                      <p>{row.defendant} | {row.categoryLabel}</p>
                    </div>
                  </div>
                  <div className="eligibility-candidate-meta">
                    <span className={`tag ${row.stateTone === 'pass' ? 'good' : row.stateTone === 'fail' ? 'bad' : 'warn'}`}>
                      {row.stateLabel}
                    </span>
                    <span>{row.stateDetail}</span>
                  </div>
                  <div className="eligibility-candidate-actions">
                    <small>Deadline: {row.deadlineLabel}</small>
                    <ChevronRight className={isExpanded ? 'expanded' : undefined} aria-hidden="true" size={18} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="eligibility-candidate-expanded">
                    <div className="eligibility-gate-rail" aria-label="Eligibility check rail">
                      <GateStep
                        active={eligibleMatcher}
                        icon={eligibleMatcher ? <CheckCircle2 aria-hidden="true" size={13} /> : <XCircle aria-hidden="true" size={13} />}
                        label={`Matcher ${row.matcherVerdict.replace(/_/g, ' ')} (${row.confidencePercent}%)`}
                      />
                      <GateStep
                        active={row.authorizationActive}
                        icon={<ShieldCheck aria-hidden="true" size={13} />}
                        label={`Permission ${row.authorizationActive ? 'active' : 'needed'}`}
                      />
                      <GateStep
                        active={!row.proofRequired}
                        icon={<ClipboardCheck aria-hidden="true" size={13} />}
                        label={row.proofRequired ? 'Document review needed' : 'No document flag'}
                      />
                      <GateStep
                        active={row.claimFormLinked}
                        icon={<FileText aria-hidden="true" size={13} />}
                        label={row.claimFormLinked ? 'Claim form linked' : 'Claim form missing'}
                      />
                      <GateStep
                        active={row.automationEntitlementActive}
                        icon={<Lock aria-hidden="true" size={13} />}
                        label={row.automationEntitlementActive ? `${row.planLabel} active` : 'Pro required'}
                      />
                    </div>

                    <div className="eligibility-candidate-grid">
                      <div>
                        <strong>Required category</strong>
                        <span>{row.requiredCategoryLabel}</span>
                      </div>
                      <div>
                        <strong>Tracking state</strong>
                        <span>{row.alreadyQueued ? 'Already tracked' : gatesReady ? 'Ready for human review' : 'Blocked until checks align'}</span>
                      </div>
                      <div>
                        <strong>Before tracking</strong>
                        <span>Review is available here. Tracking still requires document, permission, and plan checks.</span>
                      </div>
                    </div>

                    <div className="eligibility-candidate-actions">
                      <Link className="btn ghost sm" href={`/settlements/${row.settlementId}`}>Review source</Link>
                      <Link className="btn ghost sm" href={row.authorizationActive ? '/review' : '/permissions'}>
                        {row.authorizationActive ? 'Open match review' : 'Manage permission'}
                      </Link>
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
