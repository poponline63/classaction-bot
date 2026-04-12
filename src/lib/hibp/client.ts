// HaveIBeenPwned v3 API client.
// Docs: https://haveibeenpwned.com/API/v3
//
// Requires an API key (HIBP_API_KEY in .env.local) — $3.95/month as of now.
// Rate limit: 10 requests per 10 seconds per key. We throttle to ~1/sec.

import { fetch } from 'undici';

const API = 'https://haveibeenpwned.com/api/v3';
const UA = 'ClassActionBot/0.1';

export interface HibpBreach {
  Name: string;          // machine-readable id
  Title: string;         // display title
  Domain: string;
  BreachDate: string;    // YYYY-MM-DD
  AddedDate: string;     // ISO 8601
  PwnCount: number;
  Description: string;
  DataClasses: string[];
  IsVerified: boolean;
  IsSensitive: boolean;
}

let lastRequestAt = 0;
const MIN_INTERVAL_MS = 1500;

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastRequestAt));
  if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

function apiKey(): string {
  const k = process.env.HIBP_API_KEY;
  if (!k) throw new Error('HIBP_API_KEY not set');
  return k;
}

// List all breaches for an account. Returns [] if unseen, null if no key.
export async function breachedAccount(email: string): Promise<HibpBreach[] | null> {
  if (!process.env.HIBP_API_KEY) return null;
  await throttle();
  const url = `${API}/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false&includeUnverified=true`;
  const res = await fetch(url, {
    headers: {
      'hibp-api-key': apiKey(),
      'user-agent': UA,
    },
  });
  if (res.status === 404) return [];   // email not in any breach
  if (res.status === 429) {
    // Rate limited — back off and try once
    await new Promise<void>((r) => setTimeout(r, 5000));
    return breachedAccount(email);
  }
  if (!res.ok) throw new Error(`HIBP ${res.status} on ${url}`);
  return (await res.json()) as HibpBreach[];
}
