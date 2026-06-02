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
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${url}`);
  }
  return res.text();
}
