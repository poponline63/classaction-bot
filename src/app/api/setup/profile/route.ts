import { NextResponse } from 'next/server';
import { db, schema } from '@db/client';
import { eq } from 'drizzle-orm';
import { currentUserId } from '@lib/auth/current-user';

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

  const existing = await db.select().from(schema.profile).where(eq(schema.profile.userId, userId)).limit(1);
  if (existing[0]) {
    await db.update(schema.profile).set({
      legalName, dateOfBirth: dob ? new Date(dob) : null, emailsJson: emails, phonesJson: phones, addressesJson: addresses as never, updatedAt: new Date(),
    }).where(eq(schema.profile.id, existing[0].id));
  } else {
    await db.insert(schema.profile).values({
      userId, legalName, dateOfBirth: dob ? new Date(dob) : null, emailsJson: emails, phonesJson: phones, addressesJson: addresses as never,
    });
  }
  return NextResponse.json({ ok: true });
}
