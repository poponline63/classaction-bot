'use client';

import { AlertTriangle, CheckCircle2, ChevronRight, LockKeyhole, Search, ServerCog, Settings2, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

type SettingsTone = 'pass' | 'warn' | 'fail';
type SettingsGroup = 'runtime' | 'access' | 'hosted' | 'features' | 'audit';

export type SettingsControlRow = {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: SettingsTone;
  group: SettingsGroup;
  href: string;
  action: string;
  evidence: string;
};

const SETTINGS_FILTERS = [
  { label: 'All controls', value: 'all' },
  { label: 'Runtime', value: 'runtime' },
  { label: 'Access', value: 'access' },
  { label: 'Hosted', value: 'hosted' },
  { label: 'Needs attention', value: 'attention' },
] as const;

type SettingsFilter = (typeof SETTINGS_FILTERS)[number]['value'];

function filterMatches(row: SettingsControlRow, filter: SettingsFilter) {
  if (filter === 'all') return true;
  if (filter === 'attention') return row.tone !== 'pass';
  return row.group === filter;
}

function ControlIcon({ group, tone }: { group: SettingsGroup; tone: SettingsTone }) {
  if (tone !== 'pass') return <AlertTriangle aria-hidden="true" size={18} />;
  if (group === 'runtime') return <Settings2 aria-hidden="true" size={18} />;
  if (group === 'hosted') return <ServerCog aria-hidden="true" size={18} />;
  if (group === 'access') return <LockKeyhole aria-hidden="true" size={18} />;
  return <ShieldCheck aria-hidden="true" size={18} />;
}

export default function SettingsControlBrowser({ rows }: { rows: SettingsControlRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SettingsFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(rows[0]?.key ?? null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!filterMatches(row, filter)) return false;
      if (!normalizedQuery) return true;
      return [
        row.label,
        row.value,
        row.detail,
        row.action,
        row.evidence,
        row.group,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, rows]);

  return (
    <section className="settings-control-browser" aria-label="Interactive settings control browser">
      <header className="settings-control-browser-head">
        <div>
          <div className="eyebrow">Control browser</div>
          <h2>Search runtime and launch controls before changing settings</h2>
          <p>
            Review filing posture, hosted environment, auth access, feature flags, proof review,
            and audit evidence. This browser is read-only; saved settings still go through the guarded form below.
          </p>
        </div>
        <span className="tag blue">
          {filteredRows.length}/{rows.length} visible
        </span>
      </header>

      <div className="settings-control-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search settings controls</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search settings controls..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Settings control filter">
          {SETTINGS_FILTERS.map((item) => (
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
        <div className="settings-control-empty">
          <CheckCircle2 aria-hidden="true" size={28} />
          <h3>No matching controls</h3>
          <p>
            Try a different status, environment, feature, or runtime term. Filters only change this
            view and do not save settings, enable live filing, or push hosted secrets.
          </p>
          <button className="btn ghost sm" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="settings-control-list">
          {filteredRows.map((row) => {
            const isExpanded = expanded === row.key;
            return (
              <article className={`settings-control-card ${row.tone}`} key={row.key}>
                <button
                  className="settings-control-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : row.key)}
                >
                  <div className="settings-control-title">
                    <span className={`status-tracker-icon ${row.tone === 'pass' ? 'green' : row.tone === 'fail' ? 'red' : 'yellow'}`} aria-hidden="true">
                      <ControlIcon group={row.group} tone={row.tone} />
                    </span>
                    <div>
                      <h3>{row.label}</h3>
                      <p>{row.detail}</p>
                    </div>
                  </div>
                  <div className="settings-control-status">
                    <span className={`tag ${row.tone === 'pass' ? 'good' : row.tone === 'fail' ? 'bad' : 'warn'}`}>{row.value}</span>
                    <span className="tag">{row.group}</span>
                  </div>
                  <div className="workflow-card-actions">
                    <span className="small muted">{row.action}</span>
                    <ChevronRight className={isExpanded ? 'expanded' : undefined} aria-hidden="true" size={18} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="settings-control-expanded">
                    <div>
                      <strong>Evidence</strong>
                      <span>{row.evidence}</span>
                    </div>
                    <div>
                      <strong>Boundary</strong>
                      <span>Read-only review. Runtime changes still require the settings form and hosted secrets are never printed.</span>
                    </div>
                    <a className="btn ghost sm" href={row.href}>{row.action}</a>
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
