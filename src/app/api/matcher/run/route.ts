import { NextResponse } from 'next/server';
import { runMatcher } from '@lib/matcher/run-matcher';
import { currentUserId } from '@lib/auth/current-user';

export const dynamic = 'force-dynamic';

export async function POST() {
  const userId = await currentUserId();
  const result = await runMatcher(userId);
  return NextResponse.json(result);
}
