'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, DollarSign, FileText, Search, ShieldCheck, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

type TimelineTone = 'blue' | 'green' | 'yellow' | 'red';

type StatusTimelineRow = {
  id: number;
  caseName: string;
  administrator: string;
  category: string;
  defendant: string;
  deadline: string;
  payoutEstimate: string;
  proofRequired: boolean;
  claimFormReady: boolean;
  status: string;
  statusLabel: string;
  statusDetail: string;
  statusTone: TimelineTone;
  queuedAt: string;
  filedAt: string;
  paidAt: string;
  matcherVerdict: string;
  confidencePercent: number;
  classAuthorizationId: number;
  confirmationLabel: string;
  lastError: string | null;
  workerJobId: number | null;
  workerJobStatus: string | null;
  workerJobTone: TimelineTone;
  workerJobAttempts: number | null;
  workerJobMaxAttempts: number | null;
  workerJobMode: string | null;
  workerJobCadence: string | null;
  workerJobCreatedAt: string;
  workerJobUpdatedAt: string;
  workerJobLastError: string | null;
  matchedAt: string;
  currentStep: number;
  failed: boolean;
};

const TIMELINE_STAGES = [
  {
    key: 'MATCHED',
    label: 'Shadow Match',
    detail: 'Matcher produced a potential fit from saved facts.',
  },
  {
    key: 'REVIEWED',
    label: 'Review check',
    detail: 'Eligibility, confidence, and proof posture stay visible.',
  },
  {
    key: 'AUTHORIZED',
    label: 'Permission',
    detail: 'Category attestation is attached to the claim record.',
  },
  {
    key: 'QUEUED',
    label: 'Tracking',
    detail: 'Reviewed match is staged for guarded final checks.',
  },
  {
    key: 'PREFLIGHT',
    label: 'Final Checks',
    detail: 'Permission, proof, deadline, form, and mode checks run.',
  },
  {
    key: 'FILING',
    label: 'Form prep',
    detail: 'Claim form or interaction record is prepared.',
  },
  {
    key: 'FILED',
    label: 'Recorded',
    detail: 'Preparation, shadow evidence, or live submission result is stored.',
  },
  {
    key: 'PAID',
    label: 'Paid',
    detail: 'Payment is recorded when the user or support confirms it.',
  },
];

const STATUS_FILTERS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Recorded', value: 'recorded' },
  { label: 'Needs review', value: 'attention' },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

function filterMatches(row: StatusTimelineRow, filter: StatusFilter) {
  if (filter === 'all') return true;
  if (filter === 'active') return ['QUEUED', 'PREFLIGHT', 'FILING'].includes(row.status);
  if (filter === 'recorded') return ['FILED', 'PAID'].includes(row.status);
  return ['FAILED', 'ABORTED'].includes(row.status);
}

function statusIcon(status: string) {
  if (status === 'PAID') return DollarSign;
  if (status === 'FILED') return CheckCircle2;
  if (status === 'FAILED') return AlertTriangle;
  if (status === 'ABORTED') return XCircle;
  if (status === 'FILING') return FileText;
  return Clock;
}

function stageClass(row: StatusTimelineRow, index: number) {
  if (row.failed && index === row.currentStep) return 'failed';
  if (index < row.currentStep) return 'done';
  if (index === row.currentStep) return 'active';
  return '';
}

export default function StatusTimelineBrowser({ rows }: { rows: StatusTimelineRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!filterMatches(row, filter)) return false;
      if (!normalizedQuery) return true;
      return [
        row.caseName,
        row.administrator,
        row.category,
        row.statusLabel,
        row.workerJobStatus ?? '',
        row.workerJobMode ?? '',
        row.matcherVerdict,
        row.confirmationLabel,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, rows]);

  return (
    <section className="status-browser" aria-label="Interactive claim status tracker">
      <header className="status-browser-head">
        <div>
          <div className="eyebrow">Timeline browser</div>
          <h2>Search claim status history</h2>
          <p>
            Filter real user-owned claims by workflow state, case, administrator, category, or recorded result.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="status-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search claim statuses</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search claim statuses..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Status filter">
          {STATUS_FILTERS.map((item) => (
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
        <div className="card launch-card">
          <div className="launch-card-head">
            <div>
              <div className="eyebrow">No claim statuses yet</div>
              <h2>The timeline opens after review starts tracking a claim</h2>
            </div>
            <Link className="btn ghost sm" href="/review">Start review</Link>
          </div>
          <p className="muted">
            ClaimBot intentionally keeps this page empty until a Shadow Match passes review,
            category permission, proof review, and claim-tracking acknowledgement.
          </p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="card launch-card">
          <div className="launch-card-head">
            <div>
              <div className="eyebrow">No matching statuses</div>
              <h2>Try a different case, administrator, category, or status filter</h2>
            </div>
            <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear filters
            </button>
          </div>
          <p className="muted">
            Filters only change this view. They do not alter claim state, account records, or filing posture.
          </p>
        </div>
      ) : (
        <div className="status-timeline-list">
          {filteredRows.map((row) => {
            const Icon = statusIcon(row.status);
            const isExpanded = expanded === row.id;
            return (
              <article className="card status-tracker-card" key={row.id}>
                <button
                  className="status-tracker-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : row.id)}
                >
                  <div className="workflow-card-main">
                    <div className="status-tracker-title">
                      <span className={`status-tracker-icon ${row.statusTone}`} aria-hidden="true">
                        <Icon size={18} />
                      </span>
                      <div>
                        <h2>{row.caseName}</h2>
                        <p>{row.administrator} | {row.category}</p>
                      </div>
                    </div>
                    <div className="status-row">
                      <span className={`tag ${row.statusTone}`}>{row.statusLabel}</span>
                      <span className={`tag ${row.workerJobTone}`}>
                        {row.workerJobId ? `Automation ${row.workerJobStatus}` : 'Automation idle'}
                      </span>
                      <span className="small muted">{row.statusDetail}</span>
                    </div>
                  </div>
                  <div className="workflow-card-actions">
                    <span className="small muted">Stage {Math.min(row.currentStep + 1, TIMELINE_STAGES.length)}/{TIMELINE_STAGES.length}</span>
                    <span className="small muted">Tracked {row.queuedAt}</span>
                    <ChevronRight className={isExpanded ? 'expanded' : undefined} aria-hidden="true" size={18} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="status-tracker-expanded">
                    <div className="status-steps claim-status-steps" aria-label="Claim status rail">
                      {TIMELINE_STAGES.map((stage, index) => (
                        <div
                          className={`status-step ${stageClass(row, index)}`}
                          key={stage.key}
                          title={stage.detail}
                        >
                          {stage.label}
                        </div>
                      ))}
                    </div>

                    <div className="status-visual-timeline" aria-label="Detailed status timeline">
                      {TIMELINE_STAGES.map((stage, index) => (
                        <div className={`status-visual-stage ${stageClass(row, index)}`} key={stage.key}>
                          <span className="status-visual-dot" aria-hidden="true">
                            {index < row.currentStep ? <CheckCircle2 size={12} /> : null}
                          </span>
                          <div>
                            <strong>{stage.label}</strong>
                            <span>{stage.detail}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="status-tracker-meta">
                      <div>
                        <strong>Automation run</strong>
                        <span>
                          {row.workerJobId
                            ? `Run #${row.workerJobId} is ${row.workerJobStatus ?? 'unknown'}`
                            : 'No background filing run attached'}
                        </span>
                      </div>
                      <div>
                        <strong>Automation schedule</strong>
                        <span>{row.workerJobCadence ?? 'No automatic schedule recorded'}</span>
                      </div>
                      <div>
                        <strong>Automation attempts</strong>
                        <span>
                          {row.workerJobAttempts == null
                            ? 'Not recorded'
                            : `${row.workerJobAttempts}/${row.workerJobMaxAttempts ?? '?'} attempts`}
                        </span>
                      </div>
                      <div>
                        <strong>Automation updated</strong>
                        <span>{row.workerJobUpdatedAt}</span>
                      </div>
                      <div>
                        <strong>Matcher verdict</strong>
                        <span>{row.matcherVerdict} at {row.confidencePercent}% confidence</span>
                      </div>
                      <div>
                        <strong>Matched</strong>
                        <span>{row.matchedAt}</span>
                      </div>
                      <div>
                        <strong>Permission</strong>
                        <span>Permission record #{row.classAuthorizationId}</span>
                      </div>
                      <div>
                        <strong>Claim form</strong>
                        <span>{row.claimFormReady ? 'Claim form URL attached' : 'Claim form missing'}</span>
                      </div>
                      <div>
                        <strong>Deadline</strong>
                        <span>{row.deadline}</span>
                      </div>
                      <div>
                        <strong>Estimated payout</strong>
                        <span>{row.payoutEstimate}</span>
                      </div>
                      <div>
                        <strong>Proof posture</strong>
                        <span>{row.proofRequired ? 'Proof-required; manual evidence review remains active' : 'No source-level proof flag recorded'}</span>
                      </div>
                      <div>
                        <strong>Recorded result</strong>
                        <span>{row.confirmationLabel}</span>
                      </div>
                    </div>

                    <div className="notice status-boundary-note">
                      <ShieldCheck aria-hidden="true" size={18} />
                      <div>
                          <strong>Manual approval remains active</strong>
                          <p>
                          This timeline tracks workflow state and automation run history for {row.defendant}. It does not
                          promise eligibility, legal outcome, payout, or external submission.
                        </p>
                      </div>
                    </div>

                    {row.workerJobId && (
                      <div className="notice">
                        <FileText aria-hidden="true" size={18} />
                        <div>
                          {/* Guardrail marker: Paid automation run receipt */}
                          <strong>Paid automation run history</strong>
                          <p>
                            Automation run #{row.workerJobId} is {row.workerJobStatus ?? 'unknown'} in
                            {row.workerJobMode ? ` ${row.workerJobMode}` : ' guarded'} mode. Created {row.workerJobCreatedAt}.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="status-row status-tracker-links">
                      <Link className="btn ghost sm" href={`/claims/${row.id}`}>Open claim</Link>
                      <Link className="btn ghost sm" href="/audit">View account history</Link>
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
                    {row.workerJobLastError && (
                      <div className="notice warn">
                        <AlertTriangle aria-hidden="true" size={18} />
                        <div>
                          <strong>Automation run error</strong>
                          <p>{row.workerJobLastError.slice(0, 180)}</p>
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
