import { describe, expect, it } from 'vitest';
import { parseListingHtml } from '../../src/lib/scraper/classaction-org';

describe('classaction.org scraper', () => {
  it('parses numeric listing deadlines', () => {
    const rows = parseListingHtml(`
      <div class="settlement-card" id="example-case">
        <h3>Example Receipts Class Action Settlement</h3>
        <a href="https://example-settlement.com/">Visit Official Settlement Website</a>
        <p>17 Days Left • Settlement Payout $102.45 Deadline 6/9/35 Proof Required? No</p>
        <p>If you made a purchase at Example using a card between March 5, 2019 and July 19, 2019, you may be included in this settlement.</p>
      </div>
    `);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.deadline?.toISOString().slice(0, 10)).toBe('2035-06-09');
    expect(rows[0]?.claimFormUrl).toBe('https://example-settlement.com/');
  });
});
