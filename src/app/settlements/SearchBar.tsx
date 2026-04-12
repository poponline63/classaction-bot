// @ts-nocheck
'use client';

import { useState, useEffect, useRef } from 'react';

interface SearchResult {
  id: number;
  caseName: string;
  defendant: string;
  category: string;
  classDefinition: string;
  payoutEstimate: string | null;
  proofRequired: boolean;
  claimFormUrl: string | null;
  deadline: string | null;
}

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/settlements/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Suggested searches
  const suggestions = [
    'Amazon', 'Google', 'data breach', 'vehicle', 'toothpaste',
    'Hyundai', 'Kia', 'LastPass', 'Robinhood', 'Grubhub',
    'beef', 'sealy', 'insurance', 'bank', 'hospital',
  ];

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: 16 }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settlements... (e.g. Amazon, data breach, vehicle)"
          style={{
            width: '100%',
            padding: '12px 16px 12px 40px',
            background: '#12151a',
            border: '1px solid #1f242c',
            borderRadius: 12,
            color: '#e6e8eb',
            fontSize: 14,
            outline: 'none',
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8a94a6', fontSize: 16 }}>
          🔍
        </span>
        {loading && (
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#8a94a6', fontSize: 12 }}>
            searching...
          </span>
        )}
      </div>

      {/* Suggestion chips */}
      {!query && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#8a94a6', marginRight: 4 }}>Try:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setQuery(s)}
              style={{
                padding: '3px 10px', borderRadius: 12, fontSize: 11,
                background: '#1c2230', color: '#8a94a6', border: 'none',
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Results dropdown */}
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: '#12151a', border: '1px solid #1f242c', borderRadius: 12,
          maxHeight: 400, overflowY: 'auto', marginTop: 4,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          <div style={{ padding: '8px 14px', fontSize: 11, color: '#8a94a6', borderBottom: '1px solid #1f242c' }}>
            {results.length} result{results.length !== 1 ? 's' : ''} — click to view details
          </div>
          {results.map((r) => (
            <a
              key={r.id}
              href={`/settlements/${r.id}`}
              style={{
                display: 'block', padding: '12px 14px', textDecoration: 'none',
                color: '#e6e8eb', borderBottom: '1px solid #1f242c',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#1c2230')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{r.caseName}</span>
                {r.payoutEstimate && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                    {r.payoutEstimate}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#8a94a6', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="tag" style={{ fontSize: 10 }}>{r.category.toLowerCase().replace(/_/g, ' ')}</span>
                {r.proofRequired
                  ? <span className="tag warn" style={{ fontSize: 10 }}>proof required</span>
                  : <span className="tag good" style={{ fontSize: 10 }}>no proof</span>
                }
                {r.claimFormUrl && <span className="tag good" style={{ fontSize: 10 }}>has form</span>}
              </div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 4, lineHeight: 1.4 }}>
                {r.classDefinition.slice(0, 120)}...
              </div>
            </a>
          ))}
        </div>
      )}
      {open && results.length === 0 && query.length >= 2 && !loading && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#12151a', border: '1px solid #1f242c', borderRadius: 12,
          padding: '16px 14px', marginTop: 4, textAlign: 'center', color: '#8a94a6', fontSize: 13,
        }}>
          No settlements found for "{query}"
        </div>
      )}
    </div>
  );
}
