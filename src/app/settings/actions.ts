'use server';

import { setSetting } from '@lib/settings';
import type { SettingKey } from '@db/schema';
import { SETTING_KEYS } from '@db/schema';
import { revalidatePath } from 'next/cache';

export async function saveSettings(formData: FormData) {
  for (const key of SETTING_KEYS) {
    if (key === 'setup_completed') continue; // don't overwrite from settings form
    const value = formData.get(key);
    if (value != null) {
      await setSetting(key as SettingKey, String(value).trim());
    }
  }
  revalidatePath('/settings');
}
