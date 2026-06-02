'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, FileText, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

type PacketTone = 'pass' | 'warn' | 'fail';
type StatusTone = 'blue' | 'green' | 'yellow' | 'red';

type PacketArtifact = {
  label: string;
  captured: boolean;
};

export type PacketBrowserRow = {
  id: number;
  caseName: string;
  defendant: string;
  queuedAt: string;
  statusLabel: string;
  statusDetail: string;
  statusTone: StatusTone;
  readinessLabel: string;
  readinessDetail: string;
  readinessTone: PacketTone;
  authorizationLabel: string;
  matcherLabel: string;
  artifactCount: number;
  auditCount: number;
  workerJobId: number | null;
  workerJobStatus: string | null;
  workerJobTone: PacketTone;
  workerJobAttempts: number | null;
  workerJobMaxAttempts: number | null;
  workerJobMode: string | null;
  workerJobCadence: string | null;
  workerJobLastError: string | null;
  artifacts: PacketArtifact[];
};

const PACKET_FILTERS = [
  { label: 'All packets', value: 'all' },
  { label: 'Ready', value: 'ready' },
  { label: 'Proof review', value: 'proof' },
  { label: 'Needs review', value: 'attention' },
] as const;

type PacketFilter = (typeof PACKET_FILTERS)[number]['value'];

function filterMatches(row: PacketBrowserRow, filter: PacketFilter) {
  if (filter === 'all') return true;
  if (filter === 'ready') return row.readinessTone === 'pass';
  if (filter === 'attention') return row.statusTone === 'yellow' || row.statusTone === 'red' || row.readinessTone === 'fail';
  return row.readinessLabel.toLowerCase().includes('proof');
}

export default function PacketCenterBrowser({ rows }: { rows: PacketBrowserRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PacketFilter>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!filterMatches(row, filter)) return false;
      if (!normalizedQuery) return true;
      return [
        row.caseName,
        row.defendant,
        row.statusLabel,
        row.readinessLabel,
        row.authorizationLabel,
        row.matcherLabel,
        row.workerJobStatus ?? '',
        row.workerJobMode ?? '',
        row.workerJobCadence ?? '',
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, rows]);

  return (
    <section className="packet-browser" aria-label="Interactive claim packet browser">
      <header className="packet-browser-head">
        <div>
          <div className="eyebrow">Packet browser</div>
          <h2>Find a claim packet to review</h2>
          <p>
            Search by case, company, status, or automation state. ClaimBot keeps proof and permission
            checks running in the background.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="packet-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search claim packets</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search packets..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Packet filter">
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

      {rows.length === 0 ? (
        <section className="card launch-card">
          <div className="launch-card-head">
            <div>
              <div className="eyebrow">No packets yet</div>
              <h2>Packet preparation starts after review tracks a claim</h2>
            </div>
            <Link className="btn ghost sm" href="/review">Start review</Link>
          </div>
          <p className="muted">
            ClaimBot keeps this page empty until a reviewed match passes category permission,
            proof posture, form availability, and claim-tracking acknowledgement.
          </p>
        </section>
      ) : filteredRows.length === 0 ? (
        <section className="card launch-card">
          <div className="launch-card-head">
            <div>
              <div className="eyebrow">No matching packets</div>
              <h2>Try a different packet name, defendant, check, or filter</h2>
            </div>
            <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear filters
            </button>
          </div>
          <p className="muted">
            Filters only change the Packet Center view. They do not change claim state, proof posture, or filing authority.
          </p>
        </section>
      ) : (
        <div className="packet-list" aria-label="Claim packet list">
          {filteredRows.map((row) => {
            const isExpanded = expanded === row.id;
            return (
              <article className={`card packet-card ${row.readinessTone}`} key={row.id}>
                <button
                  className="packet-card-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : row.id)}
                >
                  <div className="workflow-card-main">
                    <div className="packet-card-title">
                      <span className={`status-tracker-icon ${row.statusTone}`} aria-hidden="true">
                        <FileText size={18} />
                      </span>
                      <div>
                        <h2>{row.caseName}</h2>
                        <p>{row.defendant} | tracked {row.queuedAt}</p>
                      </div>
                    </div>
                    <div className="status-row">
                      <span className={`tag ${row.statusTone}`}>{row.statusLabel}</span>
                      <span className={`tag ${row.readinessTone === 'pass' ? 'good' : row.readinessTone === 'fail' ? 'bad' : 'warn'}`}>
                        {row.readinessLabel}
                      </span>
                      <span className={`tag ${row.workerJobTone === 'pass' ? 'good' : row.workerJobTone === 'fail' ? 'bad' : 'warn'}`}>
                        {row.workerJobId ? `Automation ${row.workerJobStatus}` : 'Automation idle'}
                      </span>
                      <span className="small muted">{row.readinessDetail}</span>
                    </div>
                  </div>
                  <div className="workflow-card-actions">
                    <span className="small muted">{row.artifactCount}/4 records</span>
                    <ChevronRight className={isExpanded ? 'expanded' : undefined} aria-hidden="true" size={18} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="packet-card-expanded">
                    <div className="packet-card-grid">
                      <div>
                        <strong>Permission</strong>
                        <span>{row.authorizationLabel}</span>
                      </div>
                      <div>
                        <strong>Matcher</strong>
                        <span>{row.matcherLabel}</span>
                      </div>
                      <div>
                        <strong>Evidence records</strong>
                        <span>{row.artifactCount}/4 captured</span>
                      </div>
                      <div>
                        <strong>Account history</strong>
                        <span>{row.auditCount} claim event{row.auditCount === 1 ? '' : 's'}</span>
                      </div>
                      <div>
                        <strong>Automation run</strong>
                        <span>
                          {row.workerJobId
                            ? `#${row.workerJobId} ${row.workerJobStatus}; ${row.workerJobAttempts}/${row.workerJobMaxAttempts ?? '?'} attempts`
                            : 'No background filing run attached'}
                        </span>
                      </div>
                      <div>
                        <strong>Automation schedule</strong>
                        <span>{row.workerJobCadence ?? 'No automatic schedule recorded'}</span>
                      </div>
                    </div>

                    {row.workerJobId && (
                      <div className="notice status-boundary-note">
                        <ShieldCheck aria-hidden="true" size={18} />
                        <div>
                          <strong>Paid automation run receipt</strong>
                          <p>
                            Automation run #{row.workerJobId} is {row.workerJobStatus ?? 'unknown'} in
                            {row.workerJobMode ? ` ${row.workerJobMode}` : ' guarded'} mode.
                          </p>
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

                    <div className="packet-artifact-row" aria-label="Packet evidence record status">
                      {row.artifacts.map((artifact) => (
                        <span className={artifact.captured ? 'pass' : 'warn'} key={artifact.label}>
                          {artifact.captured ? <CheckCircle2 aria-hidden="true" size={13} /> : <AlertTriangle aria-hidden="true" size={13} />}
                          {artifact.label}
                        </span>
                      ))}
                    </div>

                    <div className="status-row packet-browser-actions">
                      <Link className="btn ghost sm" href={`/claims/${row.id}`}>Open packet</Link>
                      <a className="btn ghost sm" href={`/api/claims/${row.id}/audit-export`}>Download packet record</a>
                      <Link className="btn ghost sm" href="/audit">
                        <ShieldCheck aria-hidden="true" size={14} />
                        Account history
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
