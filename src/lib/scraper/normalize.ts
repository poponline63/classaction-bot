// Settlement normalization + canonical key computation.
//
// This is the ONE file that absolutely must have unit tests. The whole dedup
// story rides on it. See tests/unit/normalize.test.ts.

import crypto from 'node:crypto';
import type {
  Administrator,
  CaptchaType,
  SettlementCategory,
  SettlementSource,
} from '@db/schema';

// -----------------------------------------------------------------------------
// Types — the raw scraper output shape (before DB insert)
// -----------------------------------------------------------------------------

export interface RawSettlement {
  source: SettlementSource;
  sourceUrl: string;
  caseName: string;
  defendant: string;
  defendantAliases?: string[];
  category?: SettlementCategory;
  classDefinition: string;
  classPeriodStart?: Date | null;
  classPeriodEnd?: Date | null;
  deadline?: Date | null;
  proofRequired?: boolean;
  payoutEstimate?: string | null;
  payoutStructure?: string | null;
  claimFormUrl?: string | null;
  administrator?: Administrator;
  captchaType?: CaptchaType;
  raw?: unknown;
}

export interface NormalizedSettlement extends RawSettlement {
  canonicalKey: string;
  defendantNormalized: string;
  defendantAliases: string[];
  category: SettlementCategory;
  administrator: Administrator;
  captchaType: CaptchaType;
}

// -----------------------------------------------------------------------------
// Defendant name normalization
// -----------------------------------------------------------------------------

const MOJIBAKE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u00e2\u20ac\u2122/g, '\u2019'],
  [/\u00e2\u20ac\u02dc/g, '\u2018'],
  [/\u00e2\u20ac\u0153/g, '\u201c'],
  [/\u00e2\u20ac\u009d/g, '\u201d'],
  [/\u00e2\u20ac\u201c/g, '\u2013'],
  [/\u00e2\u20ac\u201d/g, '\u2014'],
  [/\u00e2\u20ac\u00a2/g, '\u2022'],
  [/\u00e2\u201e\u00a2/g, '\u2122'],
  [/\u00c2\u00ae/g, '\u00ae'],
  [/\u00c2\u00a9/g, '\u00a9'],
  [/\u00c2\u00a0/g, ' '],
];

export function cleanScrapedText(value: string): string {
  let cleaned = value;
  for (const [pattern, replacement] of MOJIBAKE_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

export function cleanScrapedJson(value: unknown): unknown {
  if (typeof value === 'string') return cleanScrapedText(value);
  if (Array.isArray(value)) return value.map(cleanScrapedJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cleanScrapedJson(entry)]),
    );
  }
  return value;
}

const CORPORATE_SUFFIXES = [
  'inc', 'incorporated', 'corp', 'corporation', 'llc', 'l l c',
  'llp', 'lp', 'ltd', 'limited', 'co', 'company', 'plc', 'gmbh',
  'ag', 'sa', 'nv', 'bv', 'pty', 'holdings', 'group', 'usa',
  'international', 'global', 'worldwide',
];

// Strip punctuation, lowercase, collapse whitespace, strip corp suffixes.
export function normalizeDefendant(name: string): string {
  if (!name) return '';
  let s = cleanScrapedText(name)
    .toLowerCase()
    // remove trademark / registered / copyright marks
    .replace(/[®™©]/g, '')
    // collapse punctuation to spaces (keep alphanumerics only)
    .replace(/[^a-z0-9\s]/g, ' ')
    // collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // strip corporate suffixes from the end, iteratively (e.g., "acme inc usa")
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of CORPORATE_SUFFIXES) {
      const re = new RegExp(`\\s+${suffix}$`);
      if (re.test(s)) {
        s = s.replace(re, '');
        changed = true;
      }
    }
  }

  return s.trim();
}

// -----------------------------------------------------------------------------
// Levenshtein distance for alias dedup
// -----------------------------------------------------------------------------

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) matrix[i]![0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0]![j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,       // deletion
        matrix[i]![j - 1]! + 1,       // insertion
        matrix[i - 1]![j - 1]! + cost, // substitution
      );
    }
  }
  return matrix[a.length]![b.length]!;
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

// -----------------------------------------------------------------------------
// Category inference from case text (rough, overridden by explicit category)
// -----------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Array<[SettlementCategory, RegExp]> = [
  ['DATA_BREACH', /\b(data breach|data incident|cybersecurity|pii|personal information exposed|security breach|ransomware)\b/i],
  ['ROBOCALL_TCPA', /\b(tcpa|robocall|auto[- ]?dialer|text message|unsolicited call|junk fax)\b/i],
  ['AUTO_DEFECT', /\b(vehicle|automobile|transmission|engine|airbag|recall|defective|emissions|fuel economy)\b/i],
  ['SUBSCRIPTION_SERVICE', /\b(subscription|auto[- ]?renew|cancel(led|lation)|membership|free trial)\b/i],
  ['DECEPTIVE_ADVERTISING', /\b(false advertising|misleading|deceptive|mislabel|label claim|"natural"|"organic")\b/i],
  ['EMPLOYMENT', /\b(wage|overtime|misclassif|employment|employee|flsa|break|off[- ]?the[- ]?clock)\b/i],
  ['CONSUMER_PRODUCT_PURCHASE', /\b(purchase|consumer|product|bought|warranty|refund)\b/i],
];

export function inferCategory(text: string): SettlementCategory {
  if (!text) return 'UNKNOWN';
  for (const [cat, re] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return cat;
  }
  return 'UNKNOWN';
}

// -----------------------------------------------------------------------------
// Administrator detection from URL
// -----------------------------------------------------------------------------

const ADMIN_PATTERNS: Array<[Administrator, RegExp]> = [
  ['epiq', /epiqglobal|epiq11|epiqsystems/i],
  ['simpluris', /simpluris/i],
  ['verita', /veritaglobal|verita-/i],
  ['angeion', /angeiongroup|angeion/i],
  ['kcc', /kccllc|kcc\./i],
  ['gilardi', /gilardi/i],
  ['atticus', /atticusadmin/i],
  ['jnd', /jndla|jnd\./i],
];

export function detectAdministrator(url: string | null | undefined): Administrator {
  if (!url) return 'unknown';
  for (const [admin, re] of ADMIN_PATTERNS) {
    if (re.test(url)) return admin;
  }
  return 'unknown';
}

// -----------------------------------------------------------------------------
// Canonical key: SHA-256 of (defendant_normalized | class_period_start |
// class_period_end). Same case scraped from two sources → same key → dedup.
// Two different cases for the same defendant in different years → diff keys.
// -----------------------------------------------------------------------------

export function computeCanonicalKey(
  defendantNormalized: string,
  classPeriodStart: Date | null | undefined,
  classPeriodEnd: Date | null | undefined,
): string {
  const start = classPeriodStart ? classPeriodStart.toISOString().slice(0, 10) : '';
  const end = classPeriodEnd ? classPeriodEnd.toISOString().slice(0, 10) : '';
  const material = `${defendantNormalized}|${start}|${end}`;
  return crypto.createHash('sha256').update(material).digest('hex');
}

// -----------------------------------------------------------------------------
// Main normalize pass — raw scraper output → DB-ready NormalizedSettlement
// -----------------------------------------------------------------------------

export function normalize(raw: RawSettlement): NormalizedSettlement {
  const caseName = cleanScrapedText(raw.caseName);
  const defendant = cleanScrapedText(raw.defendant);
  const classDefinition = cleanScrapedText(raw.classDefinition);
  const payoutEstimate = raw.payoutEstimate ? cleanScrapedText(raw.payoutEstimate) : raw.payoutEstimate;
  const defendantNormalized = normalizeDefendant(defendant);
  const aliases = (raw.defendantAliases ?? [])
    .map((a) => normalizeDefendant(cleanScrapedText(a)))
    .filter((a) => a.length > 0);

  // dedupe alias list — any alias within levenshtein 2 of another is a dup
  const uniqueAliases: string[] = [];
  for (const a of aliases) {
    if (uniqueAliases.some((u) => levenshtein(u, a) <= 2)) continue;
    uniqueAliases.push(a);
  }

  const category: SettlementCategory =
    raw.category ?? inferCategory(`${caseName} ${classDefinition}`);

  const administrator: Administrator =
    raw.administrator ?? detectAdministrator(raw.claimFormUrl);

  const canonicalKey = computeCanonicalKey(
    defendantNormalized,
    raw.classPeriodStart,
    raw.classPeriodEnd,
  );

  return {
    ...raw,
    caseName,
    defendant,
    classDefinition,
    payoutEstimate,
    defendantAliases: uniqueAliases,
    defendantNormalized,
    category,
    administrator,
    captchaType: raw.captchaType ?? 'unknown',
    canonicalKey,
    raw: cleanScrapedJson(raw.raw),
  };
}
