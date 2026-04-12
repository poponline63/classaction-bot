// Filing progress events — emitted by the filer so the live viewer
// can show users what the bot is doing in real-time.
//
// Architecture: in-memory EventEmitter. The SSE endpoint subscribes to
// events for a specific claimId and streams them as JSON chunks.

import { EventEmitter } from 'node:events';

export interface ProgressEvent {
  claimId: number;
  type:
    | 'status'       // status change (preflight, navigating, filling, submitting, done)
    | 'screenshot'   // a new screenshot was taken
    | 'field'        // a field was just filled
    | 'error'        // something went wrong
    | 'done';        // filing complete
  message: string;
  screenshot?: string;   // base64 PNG data URL (only for 'screenshot' type)
  fieldName?: string;    // which field was filled (only for 'field' type)
  fieldValue?: string;   // what was typed (only for 'field' type)
  filledCount?: number;  // total fields filled so far
  totalFields?: number;  // total fillable fields found
  timestamp: number;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export function emitProgress(event: Omit<ProgressEvent, 'timestamp'>) {
  const full: ProgressEvent = { ...event, timestamp: Date.now() };
  emitter.emit(`claim:${event.claimId}`, full);
}

export function onProgress(
  claimId: number,
  handler: (event: ProgressEvent) => void,
): () => void {
  const key = `claim:${claimId}`;
  emitter.on(key, handler);
  return () => emitter.off(key, handler);
}

// Helper to capture a progress screenshot and emit it
import type { Page } from 'playwright';

export async function emitScreenshot(
  page: Page,
  claimId: number,
  message: string,
) {
  try {
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    emitProgress({
      claimId,
      type: 'screenshot',
      message,
      screenshot: dataUrl,
    });
  } catch {
    // screenshot failures are non-fatal for progress
  }
}
