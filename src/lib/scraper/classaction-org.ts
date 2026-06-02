// Scraper for https://www.classaction.org/settlements
//
// The index page renders each settlement as a `div.settlement-card` with:
//   - a unique `id` slug
//   - an `<h3>` with the case name
//   - a "Visit Official Settlement Website" anchor to the admin site
//   - a "You may be included..." paragraph that gives us the class definition
//     and often the class period
//
// We parse all cards from that single page - no follow-up detail fetches.

import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { z } from 'zod';
import { politeFetch } from './http';
import { normalize, type RawSettlement } from './normalize';

const BASE = 'https://www.classaction.org';
const LISTING_URL = `${BASE}/settlements`;

const ParsedSettlement = z.object({
  sourceUrl: z.string().url(),
  caseName: z.string().min(3),
  defendant: z.string().min(1),
  classDefinition: z.string().min(10),
  classPeriodStart: z.date().nullable().optional(),
  classPeriodEnd: z.date().nullable().optional(),
  deadline: z.date().nullable().optional(),
  proofRequired: z.boolean().optional(),
  payoutEstimate: z.string().nullable().optional(),
  claimFormUrl: z.string().url().nullable().optional(),
});

function parseDateOrNull(text: string | undefined): Date | null {
  if (!text) return null;
  const cleaned = text.replace(/(\d+)(st|nd|rd|th)/gi, '$1').trim();
  const numeric = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    const rawYear = Number(numeric[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

// Derive defendant from a case name like "RevitaLash Serum Class Action Settlement"
function extractDefendant(caseName: string): string {
  let name = caseName
    // Strip common suffixes first
    .replace(/\bclass action\b.*$/i, '')
    .replace(/\bsettlement\b.*$/i, '')
    .trim();

  // Strip the description after " - " (e.g., "Hyundai, Kia - Vehicle Theft" → "Hyundai, Kia")
  // Only if there's meaningful text before the dash (at least 2 chars)
  const dashIdx = name.indexOf(' - ');
  if (dashIdx > 2) {
    name = name.slice(0, dashIdx).trim();
  }

  // Strip other common descriptors that aren't part of the company name
  name = name
    .replace(/\bunwanted (calls|texts)\b.*$/i, '')
    .replace(/\bdata (breach|privacy)\b.*$/i, '')
    .replace(/\b(employee|labor) wages?\b.*$/i, '')
    .replace(/\bjob (postings?|application)\b.*$/i, '')
    .replace(/\boverdraft fees?\b.*$/i, '')
    .replace(/\bCOVID\b.*$/i, '')
    .trim();

  return name;
}

export function parseCard(
  $: cheerio.CheerioAPI,
  card: AnyNode,
  fallbackSlug: string,
): RawSettlement | null {
  const $card = $(card);

  const caseName = $card.find('h3').first().text().trim();
  if (!caseName) return null;

  // Extract the admin site URL - it's the anchor whose text is the title OR
  // the "Visit Official Settlement Website" link.
  let claimFormUrl: string | null = null;
  $card.find('a').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href || !href.startsWith('http')) return;
    if (href.includes('classaction.org')) return;
    if (!claimFormUrl) claimFormUrl = href;
  });

  // The card has one descriptive paragraph that starts with "You may be
  // included in this settlement if..." Grab it.
  let classDefinition = '';
  $card.find('p').each((_i, el) => {
    const t = $(el).text().trim();
    if (/you may be included/i.test(t)) {
      classDefinition = t;
      return false;
    }
    return;
  });
  if (!classDefinition) {
    // fallback to the first <p> in the card
    classDefinition = $card.find('p').first().text().trim();
  }
  if (!classDefinition) return null;

  // Class period detection ("between MONTH DAY, YEAR and MONTH DAY, YEAR")
  const cpMatch = classDefinition.match(
    /between\s+(\w+ \d{1,2},? \d{4})\s+and\s+(\w+ \d{1,2},? \d{4})/i,
  );
  const classPeriodStart = parseDateOrNull(cpMatch?.[1]);
  const classPeriodEnd = parseDateOrNull(cpMatch?.[2]);

  // Deadline detection - the index cards rarely carry a reliable claim
  // deadline (it lives on the administrator site). We only accept a date
  // if (a) it appears directly adjacent to a deadline-style phrase and
  // (b) it is in the future. Otherwise we leave deadline null and let
  // the enrichment pass fill it in from the admin site.
  const datePattern = String.raw`(?:\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})|\w+ \d{1,2},? \d{4})`;
  const deadlineRe = new RegExp(
    String.raw`(?:claim (?:filing )?deadline|deadline to file|file (?:your )?claim by|must (?:be )?filed? by|filing must be|submission deadline|deadline)\s*:?\s*(?:is|of|by)?[^.\n]*?\b(${datePattern})\b`,
    'i',
  );
  const deadlineMatch = $card.text().match(deadlineRe);
  let deadline = parseDateOrNull(deadlineMatch?.[1]);
  if (deadline && deadline.getTime() < Date.now()) {
    // Scraped a past date - almost certainly a class period endpoint, not
    // the real claim deadline. Drop it.
    deadline = null;
  }

  // Proof required
  const proofRequired =
    /proof of (purchase|claim)|valid receipt|receipts? required/i.test(
      $card.text(),
    );

  // Payout
  const payoutMatch = $card
    .text()
    .match(
      /(?:\$[\d,]+(?:\.\d{2})?(?:\s*[-–]\s*\$[\d,]+(?:\.\d{2})?)?|up to \$[\d,]+(?:\.\d{2})?)/,
    );
  const payoutEstimate = payoutMatch ? payoutMatch[0] : null;

  const defendant = extractDefendant(caseName) || caseName;

  // For the sourceUrl we use an anchor that points back to classaction.org's
  // card - the slug id on the wrapper div. Fall back to the listing page if
  // nothing specific is found.
  const sourceUrl = fallbackSlug
    ? `${BASE}/settlements#${fallbackSlug}`
    : LISTING_URL;

  const candidate = {
    sourceUrl,
    caseName,
    defendant,
    classDefinition,
    classPeriodStart,
    classPeriodEnd,
    deadline,
    proofRequired,
    payoutEstimate,
    claimFormUrl,
  };

  const parsed = ParsedSettlement.safeParse(candidate);
  if (!parsed.success) return null;

  return {
    source: 'classaction_org',
    sourceUrl: parsed.data.sourceUrl,
    caseName: parsed.data.caseName,
    defendant: parsed.data.defendant,
    classDefinition: parsed.data.classDefinition,
    classPeriodStart: parsed.data.classPeriodStart ?? null,
    classPeriodEnd: parsed.data.classPeriodEnd ?? null,
    deadline: parsed.data.deadline ?? null,
    proofRequired: parsed.data.proofRequired ?? false,
    payoutEstimate: parsed.data.payoutEstimate ?? null,
    claimFormUrl: parsed.data.claimFormUrl ?? null,
    raw: candidate,
  };
}

export function parseListingHtml(html: string): RawSettlement[] {
  const $ = cheerio.load(html);
  const out: RawSettlement[] = [];
  $('div.settlement-card').each((_i, el) => {
    const slug = $(el).attr('id') ?? '';
    const parsed = parseCard($, el, slug);
    if (parsed) out.push(parsed);
  });
  return out;
}

// ---------- Public entrypoint ----------

export async function scrapeClassActionOrg() {
  const html = await politeFetch(LISTING_URL);
  const raws = parseListingHtml(html);
  const normalized = raws.map((r) => normalize(r));
  return normalized;
}
