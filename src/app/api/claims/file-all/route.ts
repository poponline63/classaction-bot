// POST /api/claims/file-all
// Runs matcher + auto-files all eligible claims. One-click button.

import { NextResponse } from 'next/server';
import { currentUserId } from '@lib/auth/current-user';
import { runMatcher } from '@lib/matcher/run-matcher';
import { autoFileEligible } from '@lib/claim-filer/auto-file';

export const dynamic = 'force-dynamic';

export async function POST() {
  const userId = await currentUserId();

  // Re-run matcher first to catch any new data
  const match = await runMatcher(userId);

  // Auto-file everything eligible
  const filed = await autoFileEligible(userId);

  return NextResponse.json({
    matched: match.verdictCounts.ELIGIBLE ?? 0,
    queued: filed.queued,
    alreadyClaimed: filed.alreadyClaimed,
    skippedProof: filed.skippedProof,
    skippedNoAuth: filed.skippedNoAuth,
    errors: filed.errors,
  });
}
