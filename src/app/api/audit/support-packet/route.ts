import { NextResponse } from 'next/server';
import { currentUserId } from '@lib/auth/current-user';
import { buildAuditSupportPacket } from '@lib/audit/support-packet';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = await currentUserId();
  const packet = await buildAuditSupportPacket(userId, {
    actor: url.searchParams.get('actor') ?? undefined,
    entity: url.searchParams.get('entity') ?? undefined,
    severity: url.searchParams.get('severity') ?? undefined,
  });

  return new NextResponse(JSON.stringify(packet, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="claimbot-audit-support-packet.json"',
      'Cache-Control': 'no-store',
    },
  });
}
