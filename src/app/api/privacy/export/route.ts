import { NextResponse } from 'next/server';
import { currentUserId } from '@lib/auth/current-user';
import { writeAudit } from '@lib/audit';
import { buildPrivacyExport } from '@lib/privacy/export';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const userId = await currentUserId();
  const privacyExport = await buildPrivacyExport(userId);

  await writeAudit({
    userId,
    eventType: 'PRIVACY_EXPORT_CREATED',
    entityType: 'user',
    entityId: userId,
    actor: 'user',
    payload: {
      format: privacyExport.format,
      digest: privacyExport.digest.value,
      counts: privacyExport.counts,
      note: 'Privacy export generated for authenticated account.',
    },
  });

  return new NextResponse(JSON.stringify(privacyExport, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="claimbot-privacy-export.json"',
      'Cache-Control': 'no-store',
    },
  });
}
