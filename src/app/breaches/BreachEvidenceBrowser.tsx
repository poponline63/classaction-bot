'use client';

import { AlertTriangle, CheckCircle2, ChevronRight, Search, ShieldCheck, Siren } from 'lucide-react';
import { useMemo, useState } from 'react';

type BreachEvidenceTone = 'green' | 'blue' | 'yellow';

export type BreachEvidenceBrowserRow = {
  id: number;
  breachName: string;
  email: string;
  breachDateLabel: string;
  sourceLabel: string;
  dataClassLabel: string;
  dataClassCount: number;
  matcherDetail: string;
  proofDetail: string;
  imported: boolean;
  dated: boolean;
  evidenceTone: BreachEvidenceTone;
};

const BREACH_FILTERS = [
  { label: 'All exposures', value: 'all' },
  { label: 'HIBP imports', value: 'hibp' },
  { label: 'Manual', value: 'manual' },
  { label: 'Dated', value: 'dated' },
  { label: 'Needs date', value: 'needs-date' },
] as const;

type BreachFilter = (typeof BREACH_FILTERS)[number]['value'];

function filterMatches(row: BreachEvidenceBrowserRow, filter: BreachFilter) {
  if (filter === 'all') return true;
  if (filter === 'hibp') return row.imported;
  if (filter === 'manual') return !row.imported;
  if (filter === 'dated') return row.dated;
  return !row.dated;
}

export default function BreachEvidenceBrowser({ rows }: { rows: BreachEvidenceBrowserRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BreachFilter>('all');
  const [expanded, setExpanded] = useState<number | null>(rows[0]?.id ?? null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!filterMatches(row, filter)) return false;
      if (!normalizedQuery) return true;
      return [
        row.breachName,
        row.email,
        row.breachDateLabel,
        row.sourceLabel,
        row.dataClassLabel,
        row.matcherDetail,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, rows]);

  return (
    <section className="breach-browser" aria-label="Interactive breach evidence browser">
      <header className="breach-browser-head">
        <div>
          <div className="eyebrow">Exposure browser</div>
          <h2>Search breach facts without changing saved exposure evidence</h2>
          <p>
            Filter real breach exposure records by breach name, exposed email, source, incident date,
            or data-class context. This browser is read-only; add and delete actions stay in the guarded forms below.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="breach-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search breach evidence</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search breach evidence..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Breach evidence filter">
          {BREACH_FILTERS.map((item) => (
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
              <div className="eyebrow">No exposure evidence</div>
              <h2>Add verified breach notices before relying on data-breach matching</h2>
            </div>
            <a className="btn ghost sm" href="#breach-evidence-intake">Add exposure</a>
          </div>
          <p className="muted">
            Empty breach evidence is not a negative eligibility finding. ClaimBot waits for verified
            exposure facts instead of inventing breach notices, emails, dates, or proof documents.
          </p>
        </section>
      ) : filteredRows.length === 0 ? (
        <section className="card launch-card">
          <div className="launch-card-head">
            <div>
              <div className="eyebrow">No matching exposure evidence</div>
              <h2>Try a different breach name, email, source, date, or data-class filter</h2>
            </div>
            <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear filters
            </button>
          </div>
          <p className="muted">
            Browser filters never delete exposure evidence, change matcher inputs, or bypass proof-required review.
          </p>
        </section>
      ) : (
        <div className="breach-browser-list" aria-label="Breach exposure evidence list">
          {filteredRows.map((row) => {
            const isExpanded = expanded === row.id;
            return (
              <article className="card breach-browser-card" key={row.id}>
                <button
                  className="breach-browser-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : row.id)}
                >
                  <div className="workflow-card-main">
                    <div className="breach-browser-title">
                      <span className={`status-tracker-icon ${row.evidenceTone}`} aria-hidden="true">
                        <Siren size={18} />
                      </span>
                      <div>
                        <h2>{row.breachName}</h2>
                        <p>{row.email} | {row.sourceLabel} | {row.breachDateLabel}</p>
                      </div>
                    </div>
                    <div className="status-row">
                      <span className={`tag ${row.imported ? 'blue' : 'warn'}`}>{row.sourceLabel}</span>
                      <span className={`tag ${row.dated ? 'good' : 'warn'}`}>{row.dated ? 'Date recorded' : 'Date not recorded'}</span>
                      <span className="small muted">{row.matcherDetail}</span>
                    </div>
                  </div>
                  <div className="workflow-card-actions">
                    <span className="small muted">{row.dataClassLabel}</span>
                    <ChevronRight className={isExpanded ? 'expanded' : undefined} aria-hidden="true" size={18} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="breach-browser-expanded">
                    <div className="breach-browser-grid">
                      <div>
                        <strong>Breach</strong>
                        <span>{row.breachName}</span>
                      </div>
                      <div>
                        <strong>Exposed email</strong>
                        <span>{row.email}</span>
                      </div>
                      <div>
                        <strong>Incident date</strong>
                        <span>{row.breachDateLabel}</span>
                      </div>
                      <div>
                        <strong>Data classes</strong>
                        <span>{row.dataClassLabel}</span>
                      </div>
                      <div>
                        <strong>Proof posture</strong>
                        <span>{row.proofDetail}</span>
                      </div>
                    </div>

                    <div className="breach-browser-proof">
                      <ShieldCheck aria-hidden="true" size={16} />
                      <span>
                        Exposure browser is read-only. Breach facts improve matching context, but they
                        do not replace administrator proof, create eligibility, or authorize filing.
                      </span>
                    </div>

                    <div className="breach-browser-gates" aria-label="Breach evidence gate summary">
                      <span className={row.imported ? 'pass' : 'warn'}>
                        {row.imported ? <CheckCircle2 aria-hidden="true" size={13} /> : <AlertTriangle aria-hidden="true" size={13} />}
                        Source
                      </span>
                      <span className={row.dated ? 'pass' : 'warn'}>
                        {row.dated ? <CheckCircle2 aria-hidden="true" size={13} /> : <AlertTriangle aria-hidden="true" size={13} />}
                        Date
                      </span>
                      <span className={row.dataClassCount > 0 ? 'pass' : 'warn'}>
                        {row.dataClassCount > 0 ? <CheckCircle2 aria-hidden="true" size={13} /> : <AlertTriangle aria-hidden="true" size={13} />}
                        Data classes
                      </span>
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
