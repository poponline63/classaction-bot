'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, FileText, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

type PacketTone = 'pass' | 'warn' | 'fail';
type PacketKind = 'gate' | 'artifact' | 'audit' | 'worker';

export type ClaimDetailPacketRow = {
  id: string;
  kind: PacketKind;
  title: string;
  detail: string;
  value: string;
  tone: PacketTone;
};

const PACKET_FILTERS = [
  { label: 'All packet items', value: 'all' },
  { label: 'Safety checks', value: 'gate' },
  { label: 'Records', value: 'artifact' },
  { label: 'Automation runs', value: 'worker' },
  { label: 'History events', value: 'audit' },
  { label: 'Needs review', value: 'attention' },
] as const;
// Guardrail marker: Worker jobs.

type PacketFilter = (typeof PACKET_FILTERS)[number]['value'];

function filterMatches(row: ClaimDetailPacketRow, filter: PacketFilter) {
  if (filter === 'all') return true;
  if (filter === 'attention') return row.tone !== 'pass';
  return row.kind === filter;
}

function rowIcon(row: ClaimDetailPacketRow) {
  if (row.tone === 'fail' || row.tone === 'warn') return AlertTriangle;
  if (row.kind === 'worker') return ShieldCheck;
  if (row.kind === 'artifact') return FileText;
  if (row.kind === 'audit') return ClipboardList;
  return CheckCircle2;
}

function rowKindLabel(kind: PacketKind) {
  if (kind === 'worker') return 'automation run';
  if (kind === 'audit') return 'history';
  return kind;
}

export default function ClaimDetailPacketBrowser({
  rows,
  claimId,
}: {
  rows: ClaimDetailPacketRow[];
  claimId: number;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PacketFilter>('all');
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
    <section className="claim-packet-browser" aria-label="Interactive claim detail packet browser">
      <header className="claim-packet-browser-head">
        <div>
          <div className="eyebrow">Packet browser</div>
          <h2>Search claim packet evidence without starting final checks</h2>
          <p>
            Filter real claim checks, captured records, automation runs, and recent account events before touching
            the live viewer or final-check controls. This browser is read-only.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="claim-packet-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search claim packet evidence</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search claim packet..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Claim packet filter">
          {PACKET_FILTERS.map((item) => (
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
              <div className="eyebrow">No matching packet items</div>
              <h2>Try a different check, record, history, or attention filter</h2>
            </div>
            <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear filters
            </button>
          </div>
          <p className="muted">
            Browser filters never start final checks, alter captured records, or modify the account history.
          </p>
        </section>
      ) : (
        <div className="claim-packet-browser-list" aria-label="Claim packet evidence list">
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
                        <p>{rowKindLabel(row.kind)} | {row.value}</p>
                      </div>
                    </div>
                    <div className="status-row">
                      <span className={`tag ${row.tone === 'pass' ? 'good' : row.tone === 'fail' ? 'bad' : 'warn'}`}>
                        {row.tone === 'pass' ? 'Clear' : row.tone === 'fail' ? 'Blocked' : 'Review'}
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
                        <strong>Packet type</strong>
                        <span>{rowKindLabel(row.kind)}</span>
                      </div>
                      <div>
                        <strong>Status</strong>
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
                        Read-only packet context. This view does not run the filer, change claim
                        state, bypass proof review, or grant filing authority.
                      </span>
                    </div>

                    <div className="status-row claim-packet-browser-actions">
                      <Link className="btn ghost sm" href="/audit">Account history</Link>
                      <Link className="btn ghost sm" href="/status">Claim status</Link>
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
