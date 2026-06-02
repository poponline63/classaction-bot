'use client';

import { AlertTriangle, CheckCircle2, ChevronRight, ReceiptText, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

type PurchaseEvidenceTone = 'green' | 'blue' | 'yellow';

export type PurchaseEvidenceBrowserRow = {
  id: number;
  merchant: string;
  productName: string;
  categoryLabel: string;
  purchaseDateLabel: string;
  amountLabel: string;
  sourceLabel: string;
  proofLabel: string;
  proofStaged: boolean;
  hasAmount: boolean;
  matcherDetail: string;
  evidenceTone: PurchaseEvidenceTone;
};

const PURCHASE_FILTERS = [
  { label: 'All evidence', value: 'all' },
  { label: 'Document saved', value: 'proof' },
  { label: 'Document needed', value: 'needs-proof' },
  { label: 'With amount', value: 'amount' },
  { label: 'Manual', value: 'manual' },
] as const;

type PurchaseFilter = (typeof PURCHASE_FILTERS)[number]['value'];

function filterMatches(row: PurchaseEvidenceBrowserRow, filter: PurchaseFilter) {
  if (filter === 'all') return true;
  if (filter === 'proof') return row.proofStaged;
  if (filter === 'needs-proof') return !row.proofStaged;
  if (filter === 'amount') return row.hasAmount;
  return row.sourceLabel.toLowerCase() === 'manual';
}

export default function PurchaseEvidenceBrowser({ rows }: { rows: PurchaseEvidenceBrowserRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PurchaseFilter>('all');
  const [expanded, setExpanded] = useState<number | null>(rows[0]?.id ?? null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!filterMatches(row, filter)) return false;
      if (!normalizedQuery) return true;
      return [
        row.merchant,
        row.productName,
        row.categoryLabel,
        row.purchaseDateLabel,
        row.amountLabel,
        row.sourceLabel,
        row.proofLabel,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, rows]);

  return (
    <section className="purchase-browser" aria-label="Interactive purchase evidence browser">
      <header className="purchase-browser-head">
        <div>
          <div className="eyebrow">Evidence browser</div>
          <h2>Search purchase facts without changing saved evidence</h2>
          <p>
            Filter real purchase evidence by merchant, category, date, amount, document status, or source.
            This browser is read-only; add and delete actions remain in the guarded forms below.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="purchase-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search purchase evidence</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search purchase evidence..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Purchase evidence filter">
          {PURCHASE_FILTERS.map((item) => (
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
              <div className="eyebrow">No purchase evidence</div>
              <h2>Add verified purchases before relying on merchant or class-period matching</h2>
            </div>
            <a className="btn ghost sm" href="#purchase-evidence-intake">Add evidence</a>
          </div>
          <p className="muted">
            Empty evidence is not a negative eligibility finding. ClaimBot waits for user-provided
            facts instead of fabricating merchant, date, amount, or proof details.
          </p>
        </section>
      ) : filteredRows.length === 0 ? (
        <section className="card launch-card">
          <div className="launch-card-head">
            <div>
              <div className="eyebrow">No matching purchase evidence</div>
              <h2>Try a different merchant, category, document status, or amount filter</h2>
            </div>
            <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear filters
            </button>
          </div>
          <p className="muted">
            Browser filters never delete evidence, change matcher inputs, or bypass proof-required review.
          </p>
        </section>
      ) : (
        <div className="purchase-browser-list" aria-label="Purchase evidence list">
          {filteredRows.map((row) => {
            const isExpanded = expanded === row.id;
            return (
              <article className="card purchase-browser-card" key={row.id}>
                <button
                  className="purchase-browser-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : row.id)}
                >
                  <div className="workflow-card-main">
                    <div className="purchase-browser-title">
                      <span className={`status-tracker-icon ${row.evidenceTone}`} aria-hidden="true">
                        <ReceiptText size={18} />
                      </span>
                      <div>
                        <h2>{row.merchant}</h2>
                        <p>{row.productName} | {row.categoryLabel} | {row.purchaseDateLabel}</p>
                      </div>
                    </div>
                    <div className="status-row">
                      <span className={`tag ${row.proofStaged ? 'good' : 'warn'}`}>{row.proofLabel}</span>
                      <span className="tag blue">{row.sourceLabel}</span>
                      <span className="small muted">{row.matcherDetail}</span>
                    </div>
                  </div>
                  <div className="workflow-card-actions">
                    <span className="small muted">{row.amountLabel}</span>
                    <ChevronRight className={isExpanded ? 'expanded' : undefined} aria-hidden="true" size={18} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="purchase-browser-expanded">
                    <div className="purchase-browser-grid">
                      <div>
                        <strong>Merchant</strong>
                        <span>{row.merchant}</span>
                      </div>
                      <div>
                        <strong>Product or service</strong>
                        <span>{row.productName}</span>
                      </div>
                      <div>
                        <strong>Class-period anchor</strong>
                        <span>{row.purchaseDateLabel}</span>
                      </div>
                      <div>
                        <strong>Document status</strong>
                        <span>{row.proofLabel}</span>
                      </div>
                    </div>

                    <div className="purchase-browser-proof">
                      <ShieldCheck aria-hidden="true" size={16} />
                      <span>
                        Evidence browser is read-only. Purchase facts improve matching context, but
                        they do not create eligibility, satisfy proof-required claims, or authorize filing.
                      </span>
                    </div>

                    <div className="purchase-browser-gates" aria-label="Purchase evidence gate summary">
                      <span className={row.proofStaged ? 'pass' : 'warn'}>
                        {row.proofStaged ? <CheckCircle2 aria-hidden="true" size={13} /> : <AlertTriangle aria-hidden="true" size={13} />}
                        Document
                      </span>
                      <span className={row.hasAmount ? 'pass' : 'warn'}>
                        {row.hasAmount ? <CheckCircle2 aria-hidden="true" size={13} /> : <AlertTriangle aria-hidden="true" size={13} />}
                        Amount
                      </span>
                      <span className="pass">
                        <CheckCircle2 aria-hidden="true" size={13} />
                        Manual review
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
