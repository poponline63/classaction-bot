import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-mode-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;

let currentMode: () => Promise<'shadow' | 'live'>;
let setSetting: (key: 'claim_filer_mode' | 'claim_filer_live_ack', value: string) => Promise<void>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;

beforeAll(async () => {
  const clientMod = await import('../../src/db/client');
  db = clientMod.db;
  schema = clientMod.schema;
  const settingsMod = await import('../../src/lib/settings');
  setSetting = settingsMod.setSetting;
  const submitMod = await import('../../src/lib/claim-filer/submit');
  currentMode = submitMod.currentMode;

  const { migrate } = await import('drizzle-orm/libsql/migrator');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
});

beforeEach(async () => {
  delete process.env.CLAIM_FILER_MODE;
  delete process.env.CLAIM_FILER_LIVE_ACK;
  delete process.env.CLAIMBOT_FEATURE_LIVE_FILING;
  await db.delete(schema.settings);
});

afterAll(() => {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('currentMode live-mode acknowledgement', () => {
  it('defaults to shadow', async () => {
    await expect(currentMode()).resolves.toBe('shadow');
  });

  it('treats env live without acknowledgement as shadow', async () => {
    process.env.CLAIM_FILER_MODE = 'live';
    await expect(currentMode()).resolves.toBe('shadow');
  });

  it('keeps env live in shadow when the live filing feature is disabled', async () => {
    process.env.CLAIM_FILER_MODE = 'live';
    process.env.CLAIM_FILER_LIVE_ACK = 'reviewed';
    await expect(currentMode()).resolves.toBe('shadow');
  });

  it('allows env live with reviewed acknowledgement and live feature enabled', async () => {
    process.env.CLAIMBOT_FEATURE_LIVE_FILING = 'true';
    process.env.CLAIM_FILER_MODE = 'live';
    process.env.CLAIM_FILER_LIVE_ACK = 'reviewed';
    await expect(currentMode()).resolves.toBe('live');
  });

  it('treats DB live without acknowledgement as shadow', async () => {
    await setSetting('claim_filer_mode', 'live');
    await expect(currentMode()).resolves.toBe('shadow');
  });

  it('allows DB live with reviewed acknowledgement and live feature enabled', async () => {
    process.env.CLAIMBOT_FEATURE_LIVE_FILING = 'true';
    await setSetting('claim_filer_mode', 'live');
    await setSetting('claim_filer_live_ack', 'reviewed');
    await expect(currentMode()).resolves.toBe('live');
  });
});
