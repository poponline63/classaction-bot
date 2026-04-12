import { NextResponse } from 'next/server';
import { refreshHibp } from '@lib/hibp/refresh';
import { currentUserId } from '@lib/auth/current-user';

export const dynamic = 'force-dynamic';

export async function POST() {
  const userId = await currentUserId();
  const result = await refreshHibp(userId);
  return NextResponse.json(result);
}
