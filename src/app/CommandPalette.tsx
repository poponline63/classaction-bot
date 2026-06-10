'use client';

// Global ⌘K command palette (DESIGN.md §4 Search). One search pattern for the
// whole workspace: jump to pages instantly, find settlements by name or
// defendant. Read-and-navigate only — it triggers no filing action.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileSearch, Search } from 'lucide-react';

type SettlementHit = {
  id: number;
  caseName: string;
  defendant: string;
  proofRequired: boolean;
};

type PaletteItem = {
  key: string;
  group: 'Pages' | 'Settlements';
  label: string;
  detail: string;
  href: string;
};

const PAGES: Array<{ label: string; detail: string; href: string; keywords: string }> = [
  { label: 'Home', detail: 'Next action, pipeline, attention list', href: '/', keywords: 'dashboard overview' },
  { label: 'Start Here', detail: 'Onboarding and basic facts', href: '/onboarding', keywords: 'onboarding intake setup profile facts' },
  { label: 'Profile', detail: 'Your saved facts', href: '/profile', keywords: 'name contact email address facts' },
  { label: 'Review matches', detail: 'Possible matches waiting on you', href: '/review', keywords: 'matches eligible needs review approve' },
  { label: 'Claims', detail: 'Tracked claims and progress', href: '/claims', keywords: 'tracking filed prepared status' },
  { label: 'Claim status', detail: 'Timeline and final checks', href: '/status', keywords: 'timeline progress checks' },
  { label: 'Find claims', detail: 'Browse open settlements', href: '/settlements', keywords: 'settlements browse search discover' },
  { label: 'Eligibility', detail: 'What looks like a fit and why', href: '/eligibility', keywords: 'fit readiness needed' },
  { label: 'Permissions', detail: 'Claim types ClaimBot may handle', href: '/permissions', keywords: 'authorize categories allow consent' },
  { label: 'Purchases', detail: 'Evidence records', href: '/purchases', keywords: 'evidence receipts products' },
  { label: 'Activity history', detail: 'Your full account history', href: '/audit', keywords: 'audit log events history' },
  { label: 'Pricing', detail: 'Free and paid plans', href: '/pricing', keywords: 'plans upgrade billing cost' },
  { label: 'Settings', detail: 'Workspace configuration', href: '/settings', keywords: 'configuration preferences' },
  { label: 'Trust & safety', detail: 'How ClaimBot stays bounded', href: '/trust', keywords: 'safety boundaries legal' },
  { label: 'Help', detail: 'Guides and answers', href: '/help', keywords: 'docs faq support' },
  { label: 'Contact', detail: 'Reach support', href: '/contact', keywords: 'support email message' },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [settlements, setSettlements] = useState<SettlementHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSettlements([]);
      setActiveIndex(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSettlements([]);
      return undefined;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/settlements/search?q=${encodeURIComponent(trimmed)}`);
        if (!response.ok) {
          setSettlements([]);
          return;
        }
        const rows = (await response.json()) as SettlementHit[];
        setSettlements(Array.isArray(rows) ? rows.slice(0, 6) : []);
      } catch {
        setSettlements([]);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const items = useMemo<PaletteItem[]>(() => {
    const needle = query.trim().toLowerCase();
    const pages = PAGES
      .filter((page) => !needle
        || page.label.toLowerCase().includes(needle)
        || page.keywords.includes(needle))
      .slice(0, needle ? 5 : 7)
      .map((page) => ({
        key: `page-${page.href}`,
        group: 'Pages' as const,
        label: page.label,
        detail: page.detail,
        href: page.href,
      }));
    const hits = settlements.map((settlement) => ({
      key: `settlement-${settlement.id}`,
      group: 'Settlements' as const,
      label: settlement.caseName,
      detail: `${settlement.defendant}${settlement.proofRequired ? ' · proof required' : ''}`,
      href: `/settlements/${settlement.id}`,
    }));
    return [...pages, ...hits];
  }, [query, settlements]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, items.length - 1)));
  }, [items.length]);

  const select = useCallback((item: PaletteItem | undefined) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  }, [router]);

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      select(items[activeIndex]);
    }
  }

  if (!open) return null;

  let renderedGroup: string | null = null;

  return (
    <div
      className="cmdk-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="cmdk-panel" role="dialog" aria-modal="true" aria-label="Search ClaimBot">
        <div className="cmdk-input-row">
          <Search aria-hidden="true" size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search pages and settlements…"
            aria-label="Search pages and settlements"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>
        <div className="cmdk-results" role="listbox" aria-label="Search results">
          {items.length === 0 && (
            <div className="cmdk-empty">
              <FileSearch aria-hidden="true" size={18} />
              <span>No results. Try a settlement name, defendant, or page.</span>
            </div>
          )}
          {items.map((item, index) => {
            const groupHeading = item.group !== renderedGroup ? item.group : null;
            renderedGroup = item.group;
            return (
              <div key={item.key}>
                {groupHeading && <div className="cmdk-group">{groupHeading}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`cmdk-item ${index === activeIndex ? 'active' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(item)}
                >
                  <span className="cmdk-item-label">{item.label}</span>
                  <span className="cmdk-item-detail">{item.detail}</span>
                  <ArrowRight aria-hidden="true" size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="cmdk-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span>Search never files a claim.</span>
        </div>
      </div>
    </div>
  );
}
