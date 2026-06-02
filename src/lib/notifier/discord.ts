// Discord webhook notifier. One function per event type we care about.
// Fire-and-forget — never block ingest on webhook failure.

import type { IngestResult } from '@lib/scraper/ingest';
import { getSettingOrEnv } from '@lib/settings';

async function post(content: string, embeds?: unknown[]) {
  const url = await getSettingOrEnv('discord_webhook_url', 'DISCORD_WEBHOOK_URL');
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, embeds }),
    });
  } catch (err) {
    console.error('[notifier] discord webhook failed:', (err as Error).message);
  }
}

export async function notifyDailySummary(result: IngestResult) {
  const lines = [
    `**Class Action Bot — daily scrape**`,
    `Scraped: **${result.scraped}**  •  New: **${result.inserted}**  •  Updated: **${result.updated}**`,
  ];
  if (result.errors.length > 0) {
    lines.push(`Errors: ${result.errors.length}`);
  }
  await post(lines.join('\n'));
}

export async function notifyClaimFiled(args: {
  mode: 'shadow' | 'live';
  caseName: string;
  confirmationId: string | null;
  payoutEstimate: string | null;
}) {
  const title = args.mode === 'live' ? 'Claim filed' : 'Claim prepared in shadow mode';
  const confirmation = args.mode === 'live'
    ? `Confirmation: ${args.confirmationId ?? '(pending)'}`
    : 'Confirmation: not submitted in shadow mode';
  await post(
    `**${title}** — ${args.caseName}\n` +
      confirmation +
      (args.payoutEstimate ? `  •  Est. payout: ${args.payoutEstimate}` : ''),
  );
}

export async function notifyClaimFailed(args: {
  caseName: string;
  reason: string;
}) {
  await post(`**Claim failed** — ${args.caseName}\nReason: ${args.reason}`);
}
