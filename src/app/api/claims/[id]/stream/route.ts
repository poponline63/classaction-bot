// GET /api/claims/[id]/stream
// Server-Sent Events endpoint for live filing progress.
// The claim detail page connects to this and shows the user
// real-time screenshots as the bot fills the form.

import { onProgress, type ProgressEvent } from '@lib/claim-filer/progress';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const claimId = Number(params.id);
  if (!Number.isFinite(claimId)) {
    return new Response('Invalid claim ID', { status: 400 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', claimId })}\n\n`),
      );

      // Subscribe to progress events for this claim
      unsubscribe = onProgress(claimId, (event: ProgressEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
          // Close the stream when filing is done
          if (event.type === 'done' || event.type === 'error') {
            setTimeout(() => {
              try { controller.close(); } catch { /* already closed */ }
            }, 1000);
          }
        } catch {
          // Stream already closed by client
        }
      });
    },
    cancel() {
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
