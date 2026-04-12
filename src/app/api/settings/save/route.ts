import { NextResponse } from 'next/server';
import { setSetting } from '@lib/settings';
import type { SettingKey } from '@db/schema';
import { SETTING_KEYS } from '@db/schema';

export async function POST(req: Request) {
  const fd = await req.formData();
  for (const key of SETTING_KEYS) {
    if (key === 'setup_completed') continue;
    const value = fd.get(key);
    if (value != null) {
      await setSetting(key as SettingKey, String(value).trim());
    }
  }
  return NextResponse.json({ ok: true });
}
