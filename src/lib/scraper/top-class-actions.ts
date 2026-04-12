// Scraper for https://topclassactions.com/lawsuit-settlements/open-lawsuit-settlements/
//
// TCA has a more structured post layout. Each settlement post has a title,
// "Who's Eligible" section, deadline block, and a "Visit Official Settlement
// Website" link that points to the admin form.

import * as cheerio from 'cheerio';
import { z } from 'zod';
import { politeFetch } from './http';
import { normalize, type RawSettlement } from './normalize';

const BASE = 'https://topclassactions.com';
const LISTING_URL = `${BASE}/lawsuit-settlements/open-lawsuit-settlements/`;

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
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

export function parseListingHtml(html: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];
  $('article a, h2 a, .entry-title a').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    if (!href.includes('topclassactions.com')) return;
    if (!/\/lawsuit-settlements\//i.test(href)) return;
    if (/open-lawsuit-settlements\/?$/.test(href)) return;
    if (!urls.includes(href)) urls.push(href);
  });
  return urls;
}

export function parseDetailHtml(
  url: string,
  html: string,
): RawSettlement | null {
  const $ = cheerio.load(html);
  const caseName = $('h1').first().text().trim();
  if (!caseName) return null;

  const defendant = caseName
    .replace(/\$[\d,.]+\s+.*$/i, '')
    .replace(/class action.*/i, '')
    .replace(/settlement.*/i, '')
    .trim();

  let classDefinition = '';
  $('h2, h3, strong').each((_i, el) => {
    const h = $(el).text().toLowerCase();
    if (h.includes('who') && (h.includes('eligible') || h.includes('included'))) {
      classDefinition = $(el).nextAll('p').first().text().trim();
      return false;
    }
    return;
  });
  if (!classDefinition) {
    classDefinition = $('.entry-content p, article p').first().text().trim();
  }

  const bodyText = $('.entry-content, article, main').text();

  const deadlineMatch = bodyText.match(
    /(?:claim form|submission|deadline)[^.]*?(\w+ \d{1,2},? \d{4})/i,
  );
  const deadline = parseDateOrNull(deadlineMatch?.[1]);

  const cpMatch = bodyText.match(
    /between\s+(\w+ \d{1,2},? \d{4})\s+and\s+(\w+ \d{1,2},? \d{4})/i,
  );
  const classPeriodStart = parseDateOrNull(cpMatch?.[1]);
  const classPeriodEnd = parseDateOrNull(cpMatch?.[2]);

  const proofRequired =
    /proof of purchase|valid receipt|receipts required/i.test(bodyText);

  const payoutMatch = bodyText.match(
    /(?:\$[\d,]+(?:\.\d{2})?(?:\s*[-–]\s*\$[\d,]+(?:\.\d{2})?)?|up to \$[\d,]+(?:\.\d{2})?)/,
  );
  const payoutEstimate = payoutMatch ? payoutMatch[0] : null;

  let claimFormUrl: string | null = null;
  $('a').each((_i, el) => {
    const t = $(el).text().toLowerCase().trim();
    const href = $(el).attr('href');
    if (!href || !href.startsWith('http')) return;
    if (
      t.includes('official settlement') ||
      t.includes('file a claim') ||
      t.includes('submit claim') ||
      t.includes('claim form')
    ) {
      claimFormUrl = href;
      return false;
    }
    return;
  });

  const candidate = {
    sourceUrl: url,
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
    source: 'top_class_actions',
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

export async function scrapeTopClassActions() {
  const listingHtml = await politeFetch(LISTING_URL);
  const urls = parseListingHtml(listingHtml);

  const normalized = [];
  for (const url of urls) {
    try {
      const detailHtml = await politeFetch(url);
      const raw = parseDetailHtml(url, detailHtml);
      if (!raw) continue;
      normalized.push(normalize(raw));
    } catch (err) {
      console.error(`[tca] failed ${url}: ${(err as Error).message}`);
    }
  }
  return normalized;
}
