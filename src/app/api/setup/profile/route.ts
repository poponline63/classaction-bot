import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db, schema } from '@db/client';
import { eq } from 'drizzle-orm';
import { currentUserId } from '@lib/auth/current-user';
import { triggerAutoPipeline } from '@lib/auto-pipeline';
import { writeAudit } from '@lib/audit';

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function POST(req: Request) {
  const userId = await currentUserId();
  const fd = await req.formData();
  const legalName = (fd.get('legalName') as string)?.trim() || null;
  const dob = (fd.get('dateOfBirth') as string) || null;
  const emailsRaw = (fd.get('emails') as string) ?? '';
  const phonesRaw = (fd.get('phones') as string) ?? '';
  const addressesRaw = (fd.get('addressesJson') as string) ?? '[]';

  const emails = emailsRaw.split(/[\n,]/).map(e => e.trim()).filter(Boolean);
  const phones = phonesRaw.split(/[\n,]/).map(p => p.trim()).filter(Boolean);
  let addresses: unknown = [];
  try { addresses = JSON.parse(addressesRaw); if (!Array.isArray(addresses)) addresses = []; } catch { addresses = []; }

  if (!legalName) return NextResponse.json({ error: 'legal name is required' }, { status: 400 });
  if (emails.length + phones.length === 0) {
    return NextResponse.json({ error: 'at least one email or phone number is required' }, { status: 400 });
  }
  if (dob && Number.isNaN(Date.parse(dob))) {
    return NextResponse.json({ error: 'date of birth is invalid' }, { status: 400 });
  }

  const existing = await db.select().from(schema.profile).where(eq(schema.profile.userId, userId)).limit(1);
  let profileId: number;
  const updatedAt = new Date();
  if (existing[0]) {
    profileId = existing[0].id;
    await db.update(schema.profile).set({
      legalName, dateOfBirth: dob ? new Date(dob) : null, emailsJson: emails, phonesJson: phones, addressesJson: addresses as never, updatedAt,
    }).where(eq(schema.profile.id, existing[0].id));
  } else {
    const inserted = await db.insert(schema.profile).values({
      userId, legalName, dateOfBirth: dob ? new Date(dob) : null, emailsJson: emails, phonesJson: phones, addressesJson: addresses as never,
    }).returning({ id: schema.profile.id });
    profileId = inserted[0]!.id;
  }
  await writeAudit({
    userId,
    eventType: 'PROFILE_UPDATED',
    entityType: 'profile',
    entityId: profileId,
    actor: 'user',
    payload: {
      operation: existing[0] ? 'updated' : 'created',
      hasLegalName: Boolean(legalName),
      hasDateOfBirth: Boolean(dob),
      emailCount: emails.length,
      phoneCount: phones.length,
      addressCount: Array.isArray(addresses) ? addresses.length : 0,
      profileFactsDigest: digest({
        legalNamePresent: Boolean(legalName),
        dateOfBirthPresent: Boolean(dob),
        emails,
        phones,
        addresses,
      }),
      note: 'Profile intake audit stores counts and digests only; raw profile facts remain in the profile table.',
    },
  });
  triggerAutoPipeline(userId);
  return NextResponse.json({ ok: true });
}
