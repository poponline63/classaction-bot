import { NextResponse } from 'next/server';
import { currentUserId } from '@lib/auth/current-user';
import { buildClientPreviewChecklist } from '@lib/client-preview-checklist';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const userId = await currentUserId();
  const checklist = await buildClientPreviewChecklist(userId);

  return new NextResponse(JSON.stringify(checklist, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="claimbot-client-preview-checklist.json"',
      'Cache-Control': 'no-store',
    },
  });
}
