import { NextResponse } from 'next/server';
import { currentUserId } from '@lib/auth/current-user';
import { buildClaimAuditExport } from '@lib/audit/claim-export';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function safeFilenamePart(value: string | null | undefined) {
  return (value ?? 'claim')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'claim';
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const claimId = Number(params.id);
  if (!Number.isFinite(claimId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const userId = await currentUserId();
  const auditExport = await buildClaimAuditExport(userId, claimId);
  if (!auditExport) {
    return NextResponse.json({ error: 'claim not found' }, { status: 404 });
  }

  const filename = `claimbot-audit-${claimId}-${safeFilenamePart(auditExport.settlement.caseName)}.json`;
  return new NextResponse(JSON.stringify(auditExport, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
