import { describe, it, expect } from 'vitest';
import {
  normalizeDefendant,
  cleanScrapedJson,
  cleanScrapedText,
  levenshtein,
  similarity,
  inferCategory,
  detectAdministrator,
  computeCanonicalKey,
  normalize,
} from '../../src/lib/scraper/normalize';

describe('scraped text cleanup', () => {
  it('repairs common UTF-8 mojibake from settlement sources', () => {
    expect(cleanScrapedText('Trader Joe\u00e2\u20ac\u2122s - Receipts')).toBe('Trader Joe\u2019s - Receipts');
    expect(cleanScrapedText('Amount $5 \u00e2\u20ac\u201c $10')).toBe('Amount $5 \u2013 $10');
    expect(cleanScrapedText('17 Days Left \u00e2\u20ac\u00a2 Settlement')).toBe('17 Days Left \u2022 Settlement');
  });

  it('repairs nested raw JSON text without changing non-string values', () => {
    expect(cleanScrapedJson({
      title: 'Tom\u00e2\u20ac\u2122s',
      nested: ['A\u00e2\u20ac\u201cB', 3, null],
    })).toEqual({
      title: 'Tom\u2019s',
      nested: ['A\u2013B', 3, null],
    });
  });
});

describe('normalizeDefendant', () => {
  it('strips corporate suffixes', () => {
    expect(normalizeDefendant('Acme Corp.')).toBe('acme');
    expect(normalizeDefendant('Acme, Inc.')).toBe('acme');
    expect(normalizeDefendant('Acme LLC')).toBe('acme');
    expect(normalizeDefendant('Acme International Holdings, Inc.')).toBe('acme');
  });

  it('lowercases and collapses whitespace', () => {
    expect(normalizeDefendant('  HUGE   Company  ')).toBe('huge');
  });

  it('strips trademark marks', () => {
    expect(normalizeDefendant('RevitaLash® Cosmetics, Inc.')).toBe('revitalash cosmetics');
  });

  it('returns empty for empty input', () => {
    expect(normalizeDefendant('')).toBe('');
  });

  it('handles punctuation nuke', () => {
    expect(normalizeDefendant("O'Reilly's Auto-Parts, LLC")).toBe('o reilly s auto parts');
  });
});

describe('levenshtein / similarity', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('similarity is in 0..1 and 1.0 for equal strings', () => {
    expect(similarity('acme', 'acme')).toBe(1);
    expect(similarity('acme', 'acm')).toBeGreaterThan(0.7);
    expect(similarity('foo', 'bar')).toBeLessThan(0.5);
  });
});

describe('inferCategory', () => {
  it('detects data breach', () => {
    expect(inferCategory('A data breach exposed customer PII')).toBe('DATA_BREACH');
  });
  it('detects robocall / TCPA', () => {
    expect(inferCategory('Defendant sent unsolicited robocalls in violation of TCPA')).toBe(
      'ROBOCALL_TCPA',
    );
  });
  it('detects employment / wage', () => {
    expect(inferCategory('Unpaid overtime and off-the-clock work')).toBe('EMPLOYMENT');
  });
  it('falls back to UNKNOWN', () => {
    expect(inferCategory('something unrelated')).toBe('UNKNOWN');
  });
});

describe('detectAdministrator', () => {
  it('detects epiq from url', () => {
    expect(detectAdministrator('https://claims.epiqglobal.com/foo')).toBe('epiq');
  });
  it('detects verita from url', () => {
    expect(detectAdministrator('https://verita-foo.com/claim')).toBe('verita');
  });
  it('returns unknown when no match', () => {
    expect(detectAdministrator('https://example.com')).toBe('unknown');
    expect(detectAdministrator(null)).toBe('unknown');
    expect(detectAdministrator(undefined)).toBe('unknown');
  });
});

describe('computeCanonicalKey', () => {
  it('is deterministic for the same inputs', () => {
    const a = computeCanonicalKey('acme', new Date('2024-01-01'), new Date('2024-12-31'));
    const b = computeCanonicalKey('acme', new Date('2024-01-01'), new Date('2024-12-31'));
    expect(a).toBe(b);
  });

  it('differs when defendant differs', () => {
    const a = computeCanonicalKey('acme', new Date('2024-01-01'), new Date('2024-12-31'));
    const b = computeCanonicalKey('widget', new Date('2024-01-01'), new Date('2024-12-31'));
    expect(a).not.toBe(b);
  });

  it('differs when class period differs', () => {
    const a = computeCanonicalKey('acme', new Date('2024-01-01'), new Date('2024-12-31'));
    const b = computeCanonicalKey('acme', new Date('2025-01-01'), new Date('2025-12-31'));
    expect(a).not.toBe(b);
  });

  it('handles null class period', () => {
    const a = computeCanonicalKey('acme', null, null);
    expect(a).toHaveLength(64);
  });
});

describe('normalize()', () => {
  it('produces identical canonical keys for the same case from two sources', () => {
    const classPeriodStart = new Date('2023-01-01');
    const classPeriodEnd = new Date('2023-12-31');
    const a = normalize({
      source: 'classaction_org',
      sourceUrl: 'https://www.classaction.org/settlements/acme',
      caseName: 'Acme Inc. Class Action',
      defendant: 'Acme, Inc.',
      classDefinition: 'All persons who purchased Acme products between 2023-01-01 and 2023-12-31',
      classPeriodStart,
      classPeriodEnd,
    });
    const b = normalize({
      source: 'top_class_actions',
      sourceUrl: 'https://topclassactions.com/acme',
      caseName: 'Acme Corporation Settlement',
      defendant: 'Acme Corp.',
      classDefinition: 'All persons who purchased Acme products between 2023-01-01 and 2023-12-31',
      classPeriodStart,
      classPeriodEnd,
    });
    expect(a.canonicalKey).toBe(b.canonicalKey);
  });

  it('dedupes alias list with edit distance', () => {
    const n = normalize({
      source: 'manual',
      sourceUrl: 'https://example.com',
      caseName: 'Test',
      defendant: 'Acme',
      defendantAliases: ['Acme Inc', 'Acme Corp', 'ACME', 'Acme.'],
      classDefinition: 'test class definition long enough',
    });
    expect(n.defendantAliases.length).toBeLessThanOrEqual(2);
  });

  it('infers category from case + class definition', () => {
    const n = normalize({
      source: 'manual',
      sourceUrl: 'https://example.com',
      caseName: 'Acme Data Breach Settlement',
      defendant: 'Acme',
      classDefinition: 'All persons whose data was exposed in the Acme data breach',
    });
    expect(n.category).toBe('DATA_BREACH');
  });

  it('cleans display fields before returning normalized settlements', () => {
    const n = normalize({
      source: 'manual',
      sourceUrl: 'https://example.com',
      caseName: 'Trader Joe\u00e2\u20ac\u2122s Settlement',
      defendant: 'Trader Joe\u00e2\u20ac\u2122s',
      classDefinition: 'People who bought Trader Joe\u00e2\u20ac\u2122s products.',
      payoutEstimate: '$5 \u00e2\u20ac\u201c $10',
      raw: { caseName: 'Trader Joe\u00e2\u20ac\u2122s Settlement' },
    });

    expect(n.caseName).toBe('Trader Joe\u2019s Settlement');
    expect(n.defendant).toBe('Trader Joe\u2019s');
    expect(n.classDefinition).toBe('People who bought Trader Joe\u2019s products.');
    expect(n.payoutEstimate).toBe('$5 \u2013 $10');
    expect(n.raw).toEqual({ caseName: 'Trader Joe\u2019s Settlement' });
  });
});
