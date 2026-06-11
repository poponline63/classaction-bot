import { ChevronDown } from 'lucide-react';

export type FaqItem = { q: string; a: string };

// Native <details> accordion — no client JS, accessible, zero layout shift.
export default function MktFaq({ items }: { items: FaqItem[] }) {
  return (
    <div className="mkt-faq-list">
      {items.map((item) => (
        <details className="mkt-faq-item" key={item.q}>
          <summary>
            {item.q}
            <ChevronDown size={20} aria-hidden="true" />
          </summary>
          <div className="mkt-faq-answer">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
