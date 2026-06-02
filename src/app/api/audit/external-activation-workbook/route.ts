import { NextResponse } from 'next/server';
import { currentUserId } from '@lib/auth/current-user';
import { buildExternalActivationWorkbook } from '@lib/external-activation-workbook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const userId = await currentUserId();
  const workbook = await buildExternalActivationWorkbook(userId);

  return new NextResponse(JSON.stringify(workbook, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="claimbot-external-activation-workbook.json"',
      'Cache-Control': 'no-store',
    },
  });
}
