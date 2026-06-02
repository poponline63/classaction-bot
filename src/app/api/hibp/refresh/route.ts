import { NextResponse } from 'next/server';
import { refreshHibp } from '@lib/hibp/refresh';
import { currentUserId } from '@lib/auth/current-user';
import { isClientFeatureEnabled } from '@lib/features';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (!isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT')) {
    return NextResponse.json({ error: 'data breach refresh is disabled' }, { status: 403 });
  }

  const userId = await currentUserId();
  const result = await refreshHibp(userId);
  return NextResponse.json(result);
}
