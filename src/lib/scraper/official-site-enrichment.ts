import * as cheerio from 'cheerio';
import { fetch } from 'undici';
import { eq } from 'drizzle-orm';
import { db, schema } from '@db/client';
import type { Administrator } from '@db/schema';
import { ensureSingleUser } from '@db/seed';
import { writeAudit } from '@lib/audit';
import { detectAdministrator } from './normalize';
import { getScraperUserAgent } from './user-agent';

export type SourceEnrichmentOptions = {
  concurrency?: number;
  dryRun?: boolean;
  limit?: number;
  timeoutMs?: number;
};

export type SourceEnrichmentResult = {
  checked: number;
  updated: number;
  administratorUpdated: number;
  deadlineUpdated: number;
  skipped: number;
  errors: string[];
};

const ADMIN_TEXT_PATTERNS: Array<[Administrator, RegExp]> = [
  ['epiq', /epiqglobal|epiqsystems|epiq class action|ecar-dc\.epiqglobal/i],
  ['simpluris', /simpluris|simpluris settlement administration/i],
  ['verita', /veritaglobal|verita-/i],
  ['angeion', /angeiongroup|angeion/i],
  ['kcc', /kccllc|kroll settlement administration|kroll restructuring administration|kroll/i],
  ['gilardi', /gilardi/i],
  ['atticus', /atticusadmin|atticus administration/i],
  ['jnd', /jnd legal administration|jndla|jnd\./i],
];

const USER_AGENT = getScraperUserAgent();

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function detectAdministratorFromOfficialSite(
  url: string | null | undefined,
  html?: string | null,
): Administrator {
  const urlAdmin = detectAdministrator(url);
  if (urlAdmin !== 'unknown') return urlAdmin;

  const haystack = `${url ?? ''}\n${html ?? ''}`;
  for (const [admin, pattern] of ADMIN_TEXT_PATTERNS) {
    if (pattern.test(haystack)) return admin;
  }
  return 'unknown';
}

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

function isReasonableDeadline(date: Date, now: Date) {
  const oneDayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const fiveYearsAhead = now.getTime() + 5 * 365 * 24 * 60 * 60 * 1000;
  return date.getTime() >= oneDayAgo && date.getTime() <= fiveYearsAhead;
}

export function extractClaimDeadlineFromOfficialSite(
  html: string,
  now = new Date(),
): Date | null {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  const text = $.text().replace(/\s+/g, ' ').trim();
  const datePattern = String.raw`(\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})|[A-Z][a-z]+ \d{1,2},? \d{4})`;
  const contexts = [
    String.raw`(?:claim form deadline|claim deadline|deadline to (?:submit|file)(?: a)? claim|file (?:a |your )?claim by|submit (?:a |your )?claim(?: form)? by)[^.!?]{0,180}?${datePattern}`,
    String.raw`${datePattern}[^.!?]{0,120}?(?:claim form deadline|claim deadline|deadline to (?:submit|file)(?: a)? claim)`,
  ].map((source) => new RegExp(source, 'gi'));

  for (const pattern of contexts) {
    for (const match of text.matchAll(pattern)) {
      const candidate = match[1] && /\d/.test(match[1])
        ? match[1]
        : match[2];
      const parsed = parseDateOrNull(candidate);
      if (parsed && isReasonableDeadline(parsed, now)) return parsed;
    }
  }

  return null;
}

export function candidateOfficialSiteUrls(rawUrl: string) {
  const candidates = new Set<string>();
  candidates.add(rawUrl);

  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith('www.')) {
      parsed.hostname = hostname.slice(4);
      candidates.add(parsed.toString());
    } else {
      parsed.hostname = `www.${hostname}`;
      candidates.add(parsed.toString());
    }

    if (hostname === 'zonoliteatticinsulation.com' || hostname === 'www.zonoliteatticinsulation.com') {
      candidates.add('https://www.zonoliteatticinsulation.com/s/faqs');
    }
  } catch {
    // Keep the original URL only. The fetch step will report the invalid URL.
  }

  return [...candidates];
}

async function fetchOfficialSite(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    const html = await response.text();
    return { status: response.status, html, finalUrl: response.url };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOfficialSiteWithFallbacks(url: string, timeoutMs: number) {
  const errors: string[] = [];
  for (const candidateUrl of candidateOfficialSiteUrls(url)) {
    try {
      return await fetchOfficialSite(candidateUrl, timeoutMs);
    } catch (error) {
      const cause = (error as Error & { cause?: Error }).cause?.message;
      errors.push(`${candidateUrl}: ${(error as Error).message}${cause ? ` (${cause})` : ''}`);
    }
  }

  throw new Error(`fetch failed after ${errors.length} attempt${errors.length === 1 ? '' : 's'}: ${errors.join('; ')}`);
}

export async function enrichOfficialSettlementSites(
  options: SourceEnrichmentOptions = {},
): Promise<SourceEnrichmentResult> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  const timeoutMs = options.timeoutMs ?? 12_000;
  const dryRun = options.dryRun ?? false;
  const rows = await db.select({
    id: schema.settlements.id,
    caseName: schema.settlements.caseName,
    claimFormUrl: schema.settlements.claimFormUrl,
    administrator: schema.settlements.administrator,
    deadline: schema.settlements.deadline,
  }).from(schema.settlements);
  const candidates = rows
    .filter((row) => row.claimFormUrl && (row.administrator === 'unknown' || !row.deadline))
    .slice(0, options.limit ?? rows.length);
  const result: SourceEnrichmentResult = {
    checked: 0,
    updated: 0,
    administratorUpdated: 0,
    deadlineUpdated: 0,
    skipped: rows.length - candidates.length,
    errors: [],
  };
  const userId = dryRun ? null : await ensureSingleUser();
  let cursor = 0;

  async function worker(workerId: number) {
    while (cursor < candidates.length) {
      const row = candidates[cursor++];
      if (!row?.claimFormUrl) continue;
      await sleep(workerId * 150);
      result.checked++;
      try {
        const fetched = await fetchOfficialSiteWithFallbacks(row.claimFormUrl, timeoutMs);
        const administrator = detectAdministratorFromOfficialSite(row.claimFormUrl, fetched.html);
        const deadline = row.deadline ?? extractClaimDeadlineFromOfficialSite(fetched.html);
        const patch: {
          administrator?: Administrator;
          deadline?: Date;
          status?: 'ENRICHED';
          updatedAt?: Date;
        } = {};

        if (row.administrator === 'unknown' && administrator !== 'unknown') {
          patch.administrator = administrator;
        }
        if (!row.deadline && deadline) {
          patch.deadline = deadline;
        }
        if (patch.administrator || patch.deadline) {
          patch.status = 'ENRICHED';
          patch.updatedAt = new Date();
          if (!dryRun) {
            await db.update(schema.settlements).set(patch).where(eq(schema.settlements.id, row.id));
          }
          result.updated++;
          if (patch.administrator) result.administratorUpdated++;
          if (patch.deadline) result.deadlineUpdated++;
        }
      } catch (error) {
        result.errors.push(`${row.id} ${row.caseName}: ${(error as Error).message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_value, index) => worker(index)));

  if (!dryRun && userId) {
    await writeAudit({
      userId,
      eventType: 'SOURCE_ENRICHMENT_COMPLETED',
      entityType: 'system',
      entityId: 0,
      payload: result,
      actor: 'scraper',
    });
  }

  return result;
}
