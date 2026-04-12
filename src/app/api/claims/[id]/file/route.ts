// POST /api/claims/[id]/file
//
// Manually run the filer on an existing claim. The claim must already be
// in QUEUED status. In practice this is used by the /claims/[id] page
// "Re-run" button and by dev scripts.

import { NextResponse } from 'next/server';
import { fileClaim } from '@lib/claim-filer/filer';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const result = await fileClaim(id);
  return NextResponse.json(result);
}
