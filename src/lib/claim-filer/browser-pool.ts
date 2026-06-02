// Browser pool: one persistent Chromium context per administrator domain.
//
// Each context stores cookies, local storage, and Turnstile fingerprints to
// `data/browser-profiles/{admin}/`. The first few claims against a given
// admin build up the fingerprint; subsequent claims look like a returning
// user, which is how we survive Cloudflare Turnstile passively. CapSolver can
// remain a fallback when the passive strategy misses.
//
// Contexts are opened lazily and cached. Call `closeAll()` on shutdown so
// libraries like `better-sqlite3` / `@libsql/client` don't see leaked file
// handles during PM2 restarts.

import { chromium, type BrowserContext } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import type { Administrator } from '@db/schema';
import { getRuntimeDataDir } from '@lib/runtime-data-dir';

const PROFILE_ROOT = path.resolve(getRuntimeDataDir(), 'browser-profiles');

const cache = new Map<Administrator, BrowserContext>();

function profileDir(admin: Administrator): string {
  const dir = path.join(PROFILE_ROOT, admin);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export interface BrowserPoolOpts {
  headless?: boolean;
}

// Launch a persistent context for the given administrator. Subsequent calls
// return the same context so cookies/fingerprints accumulate.
export async function getContext(
  admin: Administrator,
  opts: BrowserPoolOpts = {},
): Promise<BrowserContext> {
  const cached = cache.get(admin);
  if (cached) return cached;

  // Inject a no-op __name stub into every page in this context. tsx/esbuild
  // adds __name() wrappers around functions we serialize into page.evaluate,
  // but the browser has no such helper. The init script runs before any
  // page code, so __name is always defined when our eval payload runs.
  // See https://github.com/microsoft/playwright/issues/34471
  const ctx = await chromium.launchPersistentContext(profileDir(admin), {
    headless: opts.headless ?? true,
    viewport: { width: 1280, height: 800 },
    // Identify as a normal-looking desktop Chrome. This is not a stealth layer;
    // add a plugin only when a settlement administrator requires it.
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    // Pretend to have a realistic accept-language header
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  // Install the __name stub before any navigation occurs.
  await ctx.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__name = (fn: unknown) => fn;
  });

  cache.set(admin, ctx);
  return ctx;
}

// Warm up a context by visiting the admin's home page once. Harmless in
// shadow mode; critical for passive Turnstile handling.
export async function warmUp(admin: Administrator, homeUrl: string): Promise<void> {
  const ctx = await getContext(admin);
  const page = await ctx.newPage();
  try {
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // small idle pause to let JS settle
    await page.waitForTimeout(1500);
  } catch {
    // warm-up failures are non-fatal
  } finally {
    await page.close();
  }
}

// Close all cached contexts. Call on worker shutdown.
export async function closeAll(): Promise<void> {
  for (const [admin, ctx] of cache.entries()) {
    try {
      await ctx.close();
    } catch (err) {
      console.error(`[browser-pool] failed to close ${admin}:`, (err as Error).message);
    }
  }
  cache.clear();
}
