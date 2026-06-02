'use client';

import { ChevronRight, HelpCircle, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

export type PricingFaq = {
  question: string;
  answer: string;
  category: 'billing' | 'safety' | 'automation';
};

const CATEGORY_FILTERS = [
  { label: 'All questions', value: 'all' },
  { label: 'Billing', value: 'billing' },
  { label: 'Safety', value: 'safety' },
  { label: 'Automation', value: 'automation' },
] as const;

type CategoryFilter = (typeof CATEGORY_FILTERS)[number]['value'];

function matchesCategory(faq: PricingFaq, filter: CategoryFilter) {
  return filter === 'all' || faq.category === filter;
}

export default function PricingFaqBrowser({ faqs }: { faqs: PricingFaq[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(faqs[0]?.question ?? null);

  const filteredFaqs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return faqs.filter((faq) => {
      if (!matchesCategory(faq, filter)) return false;
      if (!normalized) return true;
      return [faq.question, faq.answer, faq.category].some((value) =>
        value.toLowerCase().includes(normalized),
      );
    });
  }, [faqs, filter, query]);

  return (
    <section className="claim-packet-browser pricing-faq-browser" aria-label="Pricing FAQ browser">
      <header className="claim-packet-browser-head">
        <div>
          <div className="eyebrow">Pricing FAQ</div>
          <h2>Common questions before paying for automation</h2>
          <p>
            Search billing, automation, and safety answers before choosing a paid plan.
            This browser explains plan boundaries without changing subscription state.
          </p>
        </div>
        <span className="tag blue">{filteredFaqs.length}/{faqs.length} answers</span>
      </header>

      <div className="claim-packet-browser-controls">
        <label className="status-search-field">
          <Search aria-hidden="true" size={15} />
          <span className="sr-only">Search pricing questions</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pricing questions..."
          />
        </label>
        <div className="status-filter-tabs" role="group" aria-label="Pricing FAQ filter">
          {CATEGORY_FILTERS.map((item) => (
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

      <div className="claim-packet-browser-list">
        {filteredFaqs.map((faq) => {
          const isExpanded = expanded === faq.question;
          return (
            <article className="card claim-packet-browser-card" key={faq.question}>
              <button
                className="claim-packet-browser-toggle"
                type="button"
                aria-expanded={isExpanded}
                onClick={() => setExpanded(isExpanded ? null : faq.question)}
              >
                <div className="claim-packet-browser-title">
                  <span className={`status-tracker-icon ${faq.category === 'billing' ? 'blue' : faq.category === 'automation' ? 'purple' : 'green'}`} aria-hidden="true">
                    <HelpCircle size={18} />
                  </span>
                  <div>
                    <h2>{faq.question}</h2>
                    <p>{faq.category} boundary</p>
                  </div>
                </div>
                <ChevronRight className={isExpanded ? 'expanded' : undefined} aria-hidden="true" size={18} />
              </button>
              {isExpanded && (
                <div className="claim-packet-browser-expanded">
                  <p className="muted pricing-faq-answer">{faq.answer}</p>
                  <div className="notice status-boundary-note">
                    <ShieldCheck aria-hidden="true" size={18} />
                    <div>
                      <strong>FAQ is read-only</strong>
                      <p>
                        Reading pricing answers never starts checkout, changes plan access,
                        queues claims, or enables live filing.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
