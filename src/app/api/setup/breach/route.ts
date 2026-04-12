import { NextResponse } from 'next/server';
import { db, schema } from '@db/client';
import { currentUserId } from '@lib/auth/current-user';

export async function POST(req: Request) {
  const userId = await currentUserId();
  const fd = await req.formData();
  const breachName = (fd.get('breachName') as string).trim();
  const email = (fd.get('email') as string).trim();
  const breachDate = (fd.get('breachDate') as string) || null;

  if (!breachName || !email) return NextResponse.json({ error: 'missing fields' }, { status: 400 });

  await db.insert(schema.dataBreachExposure).values({
    userId, breachName, email, breachDate: breachDate ? new Date(breachDate) : null, source: 'manual', dataClassesJson: [],
  }).onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
