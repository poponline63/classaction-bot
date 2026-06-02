'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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

const suggestions = [
  'Amazon',
  'Google',
  'data breach',
  'vehicle',
  'toothpaste',
  'Hyundai',
  'Kia',
  'LastPass',
  'Robinhood',
  'Grubhub',
  'insurance',
  'bank',
];

function normalizeResults(value: unknown): SearchResult[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SearchResult => (
    typeof item === 'object'
    && item !== null
    && typeof (item as SearchResult).id === 'number'
    && typeof (item as SearchResult).caseName === 'string'
    && typeof (item as SearchResult).classDefinition === 'string'
  ));
}

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/settlements/search?q=${encodeURIComponent(query)}`);
        const data: unknown = await response.json();
        setResults(normalizeResults(data));
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="settlement-search">
      <div className="search-input-wrap">
        <Search aria-hidden="true" size={17} />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search settlements by company, category, or incident"
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <span className="search-status">Searching</span>}
      </div>

      {!query && (
        <div className="search-suggestions">
          <span>Try</span>
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => setQuery(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {open && results.length > 0 && (
        <div className="search-results">
          <div className="search-results-head">
            {results.length} result{results.length === 1 ? '' : 's'}. Select a settlement to view details.
          </div>
          {results.map((result) => (
            <Link key={result.id} href={`/settlements/${result.id}`} className="search-result">
              <div className="search-result-title">
                <span>{result.caseName}</span>
                {result.payoutEstimate && <strong>{result.payoutEstimate}</strong>}
              </div>
              <div className="status-row">
                <span className="tag">{result.category.toLowerCase().replace(/_/g, ' ')}</span>
                {result.proofRequired ? (
                  <span className="tag warn">Proof required</span>
                ) : (
                  <span className="tag good">No proof required</span>
                )}
                {result.claimFormUrl && <span className="tag blue">Claim form available</span>}
              </div>
              <p>{result.classDefinition.slice(0, 130)}...</p>
            </Link>
          ))}
        </div>
      )}

      {open && results.length === 0 && query.length >= 2 && !loading && (
        <div className="search-empty">
          No settlements found for "{query}".
        </div>
      )}
    </div>
  );
}
