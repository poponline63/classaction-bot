// Simple key/value settings backed by the settings table.
// Used by the setup wizard and settings page so users do not need to hand-edit
// env files for common runtime configuration.

import { db, schema } from '@db/client';
import type { SettingKey } from '@db/schema';
import { eq } from 'drizzle-orm';

export async function getSetting(key: SettingKey): Promise<string | null> {
  const rows = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(schema.settings);
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export async function getSettingOrEnv(
  key: SettingKey,
  envVar: string,
): Promise<string | null> {
  const dbVal = await getSetting(key);
  if (dbVal) return dbVal;
  return process.env[envVar] ?? null;
}
