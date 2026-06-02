// Integration tests for preflight.ts against a throwaway SQLite database.
//
// Critical: ESM imports are hoisted, so we must use DYNAMIC imports for any
// module that reads DATABASE_URL — otherwise @db/client runs against the
// live DB file before our tempfile override can take effect.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { eq } from 'drizzle-orm';

// Tempfile first — before any imports that touch the DB
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-preflight-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;
process.env.SINGLE_USER_EMAIL = 'preflight-test@example.com';
process.env.CLAIM_FILER_MAX_PER_DAY = '20';
delete process.env.CLAIMBOT_DEV_SUBSCRIPTION_PLAN;
delete process.env.CLAIMBOT_DEV_SUBSCRIPTION_STATUS;

// Lazy-loaded handles — populated in beforeAll after env is set
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let preflight: (claimId: number) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let normalizeDefendant: (s: string) => string;

interface SeededIds {
  userId: number;
  settlementId: number;
  matchId: number;
  authorizationId: number;
  claimId: number;
  purchaseId: number;
}

async function seedWorld(overrides: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settlement?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auth?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  match?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  claim?: any;
  purchaseDate?: Date;
  purchaseMerchant?: string;
} = {}): Promise<SeededIds> {
  // FK-safe cleanup
  await db.delete(schema.claims);
  await db.delete(schema.matches);
  await db.delete(schema.purchases);
  await db.delete(schema.dataBreachExposure);
  await db.delete(schema.classAuthorizations);
  await db.delete(schema.settlements);
  await db.delete(schema.formTemplates);
  await db.delete(schema.jobs);
  await db.delete(schema.auditLog);
  await db.delete(schema.profile);
  await db.delete(schema.users);

  const users = await db
    .insert(schema.users)
    .values({
      email: 'preflight-test@example.com',
      displayName: 'test',
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
      ...overrides.user,
    })
    .returning();
  const userId = users[0].id;

  const settlements = await db
    .insert(schema.settlements)
    .values({
      canonicalKey: `test-${Date.now()}-${Math.random()}`,
      source: 'manual',
      sourceUrl: 'https://example.com/s',
      caseName: 'Acme Class Action',
      defendant: 'Acme Inc.',
      defendantAliases: ['ACME'],
      category: 'CONSUMER_PRODUCT_PURCHASE',
      classDefinition: 'All persons who purchased Acme products.',
      classPeriodStart: new Date('2023-01-01'),
      classPeriodEnd: new Date('2023-12-31'),
      deadline: new Date('2099-12-31'),
      proofRequired: false,
      claimFormUrl: 'https://example.com/claim',
      administrator: 'unknown',
      ...overrides.settlement,
    })
    .returning();
  const settlementId = settlements[0].id;

  const auths = await db
    .insert(schema.classAuthorizations)
    .values({
      userId,
      category: 'CONSUMER_PRODUCT_PURCHASE',
      enabled: true,
      attestationText: 'I attest under penalty of perjury.',
      attestationVersion: 1,
      authorizedAt: new Date(),
      ...overrides.auth,
    })
    .returning();
  const authorizationId = auths[0].id;

  const purchaseMerchant = overrides.purchaseMerchant ?? 'Acme';
  const purchases = await db
    .insert(schema.purchases)
    .values({
      userId,
      merchant: purchaseMerchant,
      merchantNormalized: normalizeDefendant(purchaseMerchant),
      productName: 'Widget',
      category: 'CONSUMER_PRODUCT_PURCHASE',
      purchaseDate: overrides.purchaseDate ?? new Date('2023-06-15'),
      amount: 25,
      source: 'manual',
    })
    .returning();
  const purchaseId = purchases[0].id;

  const matches = await db
    .insert(schema.matches)
    .values({
      userId,
      settlementId,
      verdict: 'ELIGIBLE',
      confidence: 0.95,
      reasoningJson: {},
      requiredCategory: 'CONSUMER_PRODUCT_PURCHASE',
      ...overrides.match,
    })
    .returning();
  const matchId = matches[0].id;

  const claims = await db
    .insert(schema.claims)
    .values({
      userId,
      settlementId,
      matchId,
      classAuthorizationId: authorizationId,
      status: 'QUEUED',
      ...overrides.claim,
    })
    .returning();
  const claimId = claims[0].id;

  return { userId, settlementId, matchId, authorizationId, claimId, purchaseId };
}

beforeAll(async () => {
  // Dynamic imports so the tempfile DATABASE_URL is in place first
  const clientMod = await import('../../src/db/client');
  db = clientMod.db;
  schema = clientMod.schema;
  const preflightMod = await import('../../src/lib/claim-filer/preflight');
  preflight = preflightMod.preflight;
  const normalizeMod = await import('../../src/lib/scraper/normalize');
  normalizeDefendant = normalizeMod.normalizeDefendant;

  const { migrate } = await import('drizzle-orm/libsql/migrator');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
});

afterAll(() => {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

beforeEach(() => {
  process.env.CLAIM_FILER_MAX_PER_DAY = '20';
});

// -----------------------------------------------------------------------------
// Happy path
// -----------------------------------------------------------------------------

describe('preflight — happy path', () => {
  it('passes when everything is valid', async () => {
    const { claimId } = await seedWorld();
    const r = await preflight(claimId);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ctx.claim.id).toBe(claimId);
      expect(r.ctx.preflightAttestationText).toContain('perjury');
    }
  });
});

// -----------------------------------------------------------------------------
// Abort scenarios
// -----------------------------------------------------------------------------

describe('preflight — abort scenarios', () => {
  it('1. CLAIM_NOT_FOUND when the claim id does not exist', async () => {
    await seedWorld();
    const r = await preflight(99_999);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('CLAIM_NOT_FOUND');
  });

  it('2. CLAIM_NOT_QUEUED when claim is already FILED', async () => {
    const { claimId } = await seedWorld({ claim: { status: 'FILED', filedAt: new Date() } });
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('CLAIM_NOT_QUEUED');
  });

  it('3. CLAIM_NOT_QUEUED when claim has FAILED', async () => {
    const { claimId } = await seedWorld({ claim: { status: 'FAILED', lastError: 'boom' } });
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('CLAIM_NOT_QUEUED');
  });

  it('4. AUTHORIZATION_DISABLED when the auth is disabled', async () => {
    const { claimId } = await seedWorld({ auth: { enabled: false } });
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('AUTHORIZATION_DISABLED');
  });

  it('4b. AUTOMATION_PLAN_REQUIRED when a queued claim user no longer has paid automation access', async () => {
    const { claimId } = await seedWorld({
      user: {
        subscriptionPlan: 'plus',
        subscriptionStatus: 'active',
      },
    });
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('AUTOMATION_PLAN_REQUIRED');
      expect(r.detail).toContain('active Pro or Founding access');
    }
  });

  it('5. AUTHORIZATION_REVOKED when the auth was revoked', async () => {
    const { claimId } = await seedWorld({
      auth: { enabled: true, revokedAt: new Date() },
    });
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('AUTHORIZATION_REVOKED');
  });

  it('6. CATEGORY_MISMATCH when auth category differs from settlement', async () => {
    const { claimId } = await seedWorld({
      auth: { category: 'DATA_BREACH' },
    });
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('CATEGORY_MISMATCH');
  });

  it('7. DEADLINE_PASSED when settlement deadline is in the past', async () => {
    const { claimId } = await seedWorld({
      settlement: { deadline: new Date('2000-01-01') },
    });
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('DEADLINE_PASSED');
  });

  it('8. PROOF_REQUIRED blocks auto-filing regardless of verdict', async () => {
    const { claimId } = await seedWorld({
      settlement: { proofRequired: true },
    });
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('PROOF_REQUIRED');
  });

  it('9. NO_CLAIM_FORM_URL when settlement has no claim form URL', async () => {
    const { claimId } = await seedWorld({
      settlement: { claimFormUrl: null },
    });
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NO_CLAIM_FORM_URL');
  });

  it('10. MATCHER_VERDICT_NOT_ELIGIBLE when purchase drifted outside class period', async () => {
    const { claimId } = await seedWorld({
      purchaseDate: new Date('2010-06-15'),
    });
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('MATCHER_VERDICT_NOT_ELIGIBLE');
  });

  it('11. MATCHER_VERDICT_NOT_ELIGIBLE when user has no qualifying purchases', async () => {
    const { claimId } = await seedWorld({
      purchaseMerchant: 'Wayne Enterprises',
    });
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('MATCHER_VERDICT_NOT_ELIGIBLE');
  });

  it('12. SETTLEMENT_NOT_FOUND when claim references a missing settlement', async () => {
    const { claimId } = await seedWorld();
    await db.run('PRAGMA foreign_keys = OFF');
    await db
      .update(schema.claims)
      .set({ settlementId: 99_999 })
      .where(eq(schema.claims.id, claimId));
    await db.run('PRAGMA foreign_keys = ON');
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('SETTLEMENT_NOT_FOUND');
  });

  it('13. MATCH_NOT_FOUND when claim references a missing match', async () => {
    const { claimId } = await seedWorld();
    await db.run('PRAGMA foreign_keys = OFF');
    await db
      .update(schema.claims)
      .set({ matchId: 99_999 })
      .where(eq(schema.claims.id, claimId));
    await db.run('PRAGMA foreign_keys = ON');
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('MATCH_NOT_FOUND');
  });

  it('14. RATE_LIMIT_EXCEEDED when N claims already filed today', async () => {
    process.env.CLAIM_FILER_MAX_PER_DAY = '1';
    const { userId, authorizationId, claimId } = await seedWorld();
    const s2 = await db
      .insert(schema.settlements)
      .values({
        canonicalKey: `rate-limit-${Date.now()}`,
        source: 'manual',
        sourceUrl: 'https://example.com/rl',
        caseName: 'Rate Limit Filler',
        defendant: 'Filler Inc',
        classDefinition: 'x'.repeat(20),
        classPeriodStart: new Date('2023-01-01'),
        classPeriodEnd: new Date('2023-12-31'),
        deadline: new Date('2099-12-31'),
      })
      .returning();
    const m2 = await db
      .insert(schema.matches)
      .values({
        userId,
        settlementId: s2[0].id,
        verdict: 'ELIGIBLE',
        confidence: 0.95,
        reasoningJson: {},
      })
      .returning();
    await db.insert(schema.claims).values({
      userId,
      settlementId: s2[0].id,
      matchId: m2[0].id,
      classAuthorizationId: authorizationId,
      status: 'FILED',
      filedAt: new Date(),
    });

    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('15. DEADLINE_PASSED beats PROOF_REQUIRED (deadline checked first)', async () => {
    const { claimId } = await seedWorld({
      settlement: {
        deadline: new Date('2000-01-01'),
        proofRequired: true,
      },
    });
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('DEADLINE_PASSED');
  });

  it('16. AUTHORIZATION_DISABLED beats matcher verdict check', async () => {
    const { claimId } = await seedWorld({
      auth: { enabled: false },
      purchaseMerchant: 'totally unrelated',
    });
    const r = await preflight(claimId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('AUTHORIZATION_DISABLED');
  });
});
