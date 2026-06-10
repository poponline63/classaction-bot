import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db, schema } from '@db/client';
import { currentUserId } from '@lib/auth/current-user';
import { triggerAutoPipeline } from '@lib/auto-pipeline';
import { isClientFeatureEnabled } from '@lib/features';
import { writeAudit } from '@lib/audit';

function digest(value: string) {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export async function POST(req: Request) {
  if (!isClientFeatureEnabled('CLAIMBOT_FEATURE_BREACH_IMPORT')) {
    return NextResponse.json({ error: 'data breach intake is disabled' }, { status: 403 });
  }

  const userId = await currentUserId();
  const fd = await req.formData();
  const breachName = (fd.get('breachName') as string).trim();
  const email = (fd.get('email') as string).trim();
  const breachDate = (fd.get('breachDate') as string) || null;

  if (!breachName || !email) return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  if (!email.includes('@')) return NextResponse.json({ error: 'email is invalid' }, { status: 400 });
  if (breachDate && Number.isNaN(Date.parse(breachDate))) {
    return NextResponse.json({ error: 'breach date is invalid' }, { status: 400 });
  }

  const inserted = await db.insert(schema.dataBreachExposure).values({
    userId, breachName, email, breachDate: breachDate ? new Date(breachDate) : null, source: 'manual', dataClassesJson: [],
  }).onConflictDoNothing().returning({ id: schema.dataBreachExposure.id });
  if (inserted[0]) {
    await writeAudit({
      userId,
      eventType: 'BREACH_ADDED',
      entityType: 'breach',
      entityId: inserted[0].id,
      actor: 'user',
      payload: {
        breachNameDigest: digest(breachName),
        emailDigest: digest(email),
        breachDatePresent: Boolean(breachDate),
        source: 'manual',
        note: 'Breach intake audit stores digests and presence flags only; raw exposure facts remain in data_breach_exposure.',
      },
    });
  }
  await triggerAutoPipeline(userId);
  return NextResponse.json({ ok: true });
}
