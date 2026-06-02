import { NextResponse } from 'next/server';
import { currentUserId } from '@lib/auth/current-user';
import { buildNetlifyLaunchDoctorExport } from '@lib/netlify-launch-doctor-receipt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  await currentUserId();
  const receipt = buildNetlifyLaunchDoctorExport();

  return new NextResponse(JSON.stringify(receipt, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="claimbot-netlify-launch-doctor.json"',
      'Cache-Control': 'no-store',
    },
  });
}
