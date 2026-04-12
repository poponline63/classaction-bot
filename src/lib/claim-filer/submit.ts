// =============================================================================
// Submit handler — clicks submit, waits for navigation, extracts the
// confirmation id, writes the screenshot triad to
// data/evidence/{claimId}/.
// =============================================================================
// In shadow mode (CLAIM_FILER_MODE !== 'live'), we stop BEFORE clicking
// submit and return the filled-form screenshot + planned submit action.
// The claim transitions to FILED only in live mode.
// =============================================================================

import type { Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

export type FilerMode = 'shadow' | 'live';

export function currentMode(): FilerMode {
  // Default is now LIVE — the bot actually submits claims.
  // Set CLAIM_FILER_MODE=shadow to preview without submitting.
  return process.env.CLAIM_FILER_MODE === 'shadow' ? 'shadow' : 'live';
}

export interface EvidencePaths {
  emptyForm: string;
  filledForm: string;
  confirmation: string | null;
}

export function evidenceDir(claimId: number): string {
  const dir = path.resolve(
    process.env.DATA_DIR || path.join(process.cwd(), 'data'),
    'evidence',
    String(claimId),
  );
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function captureEmptyForm(page: Page, claimId: number): Promise<string> {
  const file = path.join(evidenceDir(claimId), 'empty.png');
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

export async function captureFilledForm(page: Page, claimId: number): Promise<string> {
  const file = path.join(evidenceDir(claimId), 'filled.png');
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

export async function captureConfirmation(page: Page, claimId: number): Promise<string> {
  const file = path.join(evidenceDir(claimId), 'confirmation.png');
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

// Find the submit button. Prefer `type=submit`, then buttons whose label
// contains "submit", "file claim", "send", "agree".
export async function findSubmitButton(page: Page) {
  const candidates = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit")',
    'button:has-text("File Claim")',
    'button:has-text("Send")',
    'button:has-text("Continue")',
    'button:has-text("I Agree")',
  ];
  for (const sel of candidates) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        return loc;
      }
    } catch {
      continue;
    }
  }
  return null;
}

// Extract a confirmation id from the post-submit page. Heuristic: look for
// common phrases followed by an alphanumeric token.
export async function extractConfirmationId(page: Page): Promise<string | null> {
  const text = await page.evaluate(() => document.body.innerText);
  const patterns = [
    /confirmation\s*(?:number|id|code)\s*[:#]?\s*([A-Z0-9-]{6,})/i,
    /claim\s*(?:number|id|#)\s*[:#]?\s*([A-Z0-9-]{6,})/i,
    /reference\s*(?:number|id|#)\s*[:#]?\s*([A-Z0-9-]{6,})/i,
    /tracking\s*(?:number|id|#)\s*[:#]?\s*([A-Z0-9-]{6,})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}
