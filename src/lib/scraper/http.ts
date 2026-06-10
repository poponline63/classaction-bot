// Polite HTTP client: rate-limited, identifies itself honestly, respects 429.
// We use `undici` (built into Node) rather than shipping a second HTTP lib.

import { fetch } from 'undici';
import { getScraperUserAgent } from './user-agent';

const USER_AGENT = getScraperUserAgent();

const BASE_DELAY_MS = Number(process.env.SCRAPER_RATE_LIMIT_MS ?? 3000);

let lastRequestAt = 0;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function jitter(): number {
  // Spread requests 2-5s around the base delay
  return BASE_DELAY_MS + Math.floor(Math.random() * 2000) - 1000;
}

export async function politeFetch(
  url: string,
  init: Parameters<typeof fetch>[1] = {},
): Promise<string> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  const wait = Math.max(0, jitter() - elapsed);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 429) {
    // Rate limited — back off aggressively
    await sleep(30_000);
    throw new Error(`rate limited: ${url}`);
  }
  if (res.status === 403) {
    // Some settlement listing sites fingerprint plain HTTP clients and return
    // 403 even for polite, honestly-identified requests. Retry once through a
    // real browser engine before giving up.
    return browserFetch(url);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${url}`);
  }
  return res.text();
}

// Browser-engine fallback. Playwright is already a project dependency for the
// claim filer; import it lazily so serverless runtimes that never hit a 403
// fallback do not pay for (or fail on) the import.
const BROWSER_FETCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

let sharedBrowserPromise: Promise<import('playwright').Browser> | null = null;

async function getSharedBrowser() {
  if (!sharedBrowserPromise) {
    sharedBrowserPromise = import('playwright').then(({ chromium }) => chromium.launch({ headless: true }));
  }
  return sharedBrowserPromise;
}

export async function closeScraperBrowser() {
  if (!sharedBrowserPromise) return;
  const pending = sharedBrowserPromise;
  sharedBrowserPromise = null;
  try {
    const browser = await pending;
    await browser.close();
  } catch {
    // Browser already gone; nothing to clean up.
  }
}

async function browserFetch(url: string): Promise<string> {
  const browser = await getSharedBrowser();
  const context = await browser.newContext({
    userAgent: BROWSER_FETCH_USER_AGENT,
    locale: 'en-US',
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (!response || response.status() >= 400) {
      throw new Error(`HTTP ${response?.status() ?? 'no-response'} on ${url} (browser fallback)`);
    }
    // Give bot-check interstitials a moment to settle before reading the DOM.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    return await page.content();
  } finally {
    await context.close();
  }
}
