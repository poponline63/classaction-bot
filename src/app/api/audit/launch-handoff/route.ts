import { NextResponse } from 'next/server';
import { currentUserId } from '@lib/auth/current-user';
import { buildLaunchHandoffReport } from '@lib/launch-handoff-report';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const userId = await currentUserId();
  const report = await buildLaunchHandoffReport(userId);

  return new NextResponse(JSON.stringify(report, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="claimbot-launch-handoff-report.json"',
      'Cache-Control': 'no-store',
    },
  });
}
