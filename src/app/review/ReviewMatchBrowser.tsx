'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, FileSearch, FileText, Lock, Search, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

type ReviewTone = 'pass' | 'warn' | 'fail';

export type ReviewMatchBrowserRow = {
  id: number;
  settlementId: number;
  caseName: string;
  defendant: string;
  categoryLabel: string;
  verdictLabel: string;
  confidencePercent: number;
  readinessLabel: string;
  readinessDetail: string;
  readinessTone: ReviewTone;
  deadlineLabel: string;
  proofRequired: boolean;
  authorizationActive: boolean;
  claimFormLinked: boolean;
  automationEntitlementActive: boolean;
  alreadyQueued: boolean;
  evidenceCount: number;
  settlementSearchEnabled: boolean;
  planLabel: string;
};

const REVIEW_FILTERS = [
  { label: 'All matches', value: 'all' },
  { label: 'Ready to track', value: 'ready' },
  { label: 'Proof review', value: 'proof' },
  { label: 'Needs action', value: 'attention' },
  { label: 'Tracking', value: 'queued' },
] as const;

type ReviewFilter = (typeof REVIEW_FILTERS)[number]['value'];

function filterMatches(row: ReviewMatchBrowserRow, filter: ReviewFilter) {
  if (filter === 'all') return true;
  if (filter === 'ready') return row.readinessLabel === 'Ready for final checks';
  if (filter === 'proof') return row.proofRequired;
  if (filter === 'queued') return row.alreadyQueued;
  return row.readinessTone !== 'pass' && !row.alreadyQueued;
}

function friendlyReadinessLabel(label: string) {
  if (label === 'Ready for final checks') return 'Ready to track';
  if (label === 'Already tracked') return 'Already tracked';
  if (label === 'Permission needed') return 'Permission needed';
  return label;
}

function friendlyReadinessDetail(detail: string) {
  return detail
    .replace(/\bauthorization\b/gi, 'permission')
    .replace(/\bauthorizations\b/gi, 'permissions')
    .replace(/\bqueueing\b/gi, 'tracking')
    .replace(/\bqueued\b/gi, 'tracked')
    .replace(/\bqueue\b/gi, 'track')
    .replace(/\bpreflight\b/gi, 'final checks');
}

function GateChip({
  ok,
  icon,
  label,
}: {
  ok: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <span className={ok ? 'pass' : 'warn'}>
      {icon}
      {label}
    </span>
  );
}

export default function ReviewMatchBrowser({ rows }: { rows: ReviewMatchBrowserRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!filterMatches(row, filter)) return false;
      if (!normalizedQuery) return true;
      return [
        row.caseName,
        row.defendant,
        row.categoryLabel,
        row.verdictLabel,
        friendlyReadinessLabel(row.readinessLabel),
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, rows]);

  return (
    <section className="review-match-browser" aria-label="Interactive review match browser">
      <header className="review-match-browser-head">
        <div>
          <div className="eyebrow">Review browser</div>
          <h2>Search match results before tracking claims</h2>
          <p>
            Filter real matches by readiness, proof status, permission, form availability,
            verdict, case, defendant, or category. Claim actions remain guarded below.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="review-match-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search review matches</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search review matches..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Review match filter">
          {REVIEW_FILTERS.map((item) => (
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
        <div className="review-match-empty">
          <FileSearch aria-hidden="true" size={28} />
          <h3>No authorized matches are waiting yet</h3>
          <p>
            Run the matcher after intake so ClaimBot can produce reviewable evidence. Nothing is
            submitted automatically from an empty review state.
          </p>
          <div className="page-actions">
            <Link className="btn" href="/profile">Refine criteria</Link>
            <Link className="btn ghost" href="/permissions">Manage permissions</Link>
          </div>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="review-match-empty">
          <AlertTriangle aria-hidden="true" size={28} />
          <h3>No matching review items</h3>
          <p>
            Try a different search term or filter. Browser filters do not modify matcher evidence,
            permissions, claim records, or claim state.
          </p>
          <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="review-match-list">
          {filteredRows.map((row) => {
            const isExpanded = expanded === row.id;
            return (
              <article className={`review-match-card ${row.readinessTone}`} key={row.id}>
                <button
                  className="review-match-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : row.id)}
                >
                  <div className="review-match-title">
                    <span className={`status-tracker-icon ${row.readinessTone === 'pass' ? 'green' : row.readinessTone === 'fail' ? 'red' : 'yellow'}`} aria-hidden="true">
                      {row.readinessTone === 'pass' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                    </span>
                    <div>
                      <h3>{row.caseName}</h3>
                      <p>{row.defendant} | {row.categoryLabel}</p>
                    </div>
                  </div>
                  <div className="review-match-status">
                    <span className={`tag ${row.readinessTone === 'pass' ? 'good' : row.readinessTone === 'fail' ? 'bad' : 'warn'}`}>
                      {friendlyReadinessLabel(row.readinessLabel)}
                    </span>
                    <span className="tag">{row.verdictLabel} ({row.confidencePercent}%)</span>
                    <span className="small muted">{row.deadlineLabel}</span>
                  </div>
                  <div className="workflow-card-actions">
                    <span className="small muted">{row.evidenceCount} evidence trace{row.evidenceCount === 1 ? '' : 's'}</span>
                    <ChevronRight className={isExpanded ? 'expanded' : undefined} aria-hidden="true" size={18} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="review-match-expanded">
                    <div className="review-match-gates" aria-label="Review check state">
                      <GateChip
                        ok={row.verdictLabel === 'eligible'}
                        icon={<FileSearch aria-hidden="true" size={13} />}
                        label={`Matcher ${row.verdictLabel}`}
                      />
                      <GateChip
                        ok={row.authorizationActive}
                        icon={<ShieldCheck aria-hidden="true" size={13} />}
                        label={row.authorizationActive ? 'Permission active' : 'Permission needed'}
                      />
                      <GateChip
                        ok={!row.proofRequired}
                        icon={<ClipboardCheck aria-hidden="true" size={13} />}
                        label={row.proofRequired ? 'Manual proof review' : 'No proof flag'}
                      />
                      <GateChip
                        ok={row.claimFormLinked}
                        icon={<FileText aria-hidden="true" size={13} />}
                        label={row.claimFormLinked ? 'Claim form linked' : 'Claim form missing'}
                      />
                      <GateChip
                        ok={row.automationEntitlementActive}
                        icon={<Lock aria-hidden="true" size={13} />}
                        label={row.automationEntitlementActive ? `${row.planLabel} active` : 'Pro required'}
                      />
                    </div>

                    <div className="review-match-detail-grid">
                      <div>
                        <strong>Readiness detail</strong>
                        <span>{friendlyReadinessDetail(row.readinessDetail)}</span>
                      </div>
                      <div>
                        <strong>Claim tracking</strong>
                        <span>{row.alreadyQueued ? 'Already appears in claim tracking' : 'Tracking action stays below with a visible safety check'}</span>
                      </div>
                      <div>
                        <strong>Review boundary</strong>
                        <span>Browser review is read-only; tracking still requires the visible safety acknowledgement form.</span>
                      </div>
                    </div>

                    <div className="status-row review-match-actions">
                      <a className="btn ghost sm" href={`#match-${row.id}`}>Open match card</a>
                      {row.settlementSearchEnabled && (
                        <Link className="btn ghost sm" href={`/settlements/${row.settlementId}`}>Review source</Link>
                      )}
                      <Link className="btn ghost sm" href={row.authorizationActive ? '/claims' : '/permissions'}>
                        {row.authorizationActive ? 'Open claims' : 'Manage permission'}
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
