import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-audit-export-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;
process.env.SINGLE_USER_EMAIL = 'claim-audit-export@example.com';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
let buildClaimAuditExport: (userId: number, claimId: number) => Promise<{
  digest: { algorithm: string; value: string };
  safetyBoundary: { userAuthorizationRequired: boolean; paidAutomationWorkerAudited: boolean };
  auditEvents: Array<{ eventType: string }>;
  workerLifecycle: {
    workerJobType: string;
    latestJob: { id: number; status: string; payload: { automationMode: string | null; workerCadence: string | null } } | null;
    jobs: Array<{ id: number }>;
    auditEvents: Array<{ eventType: string }>;
  };
  claim: { id: number };
  authorization: { attestationText: string };
} | null>;

async function clearDb() {
  await db.delete(schema.claims);
  await db.delete(schema.jobs);
  await db.delete(schema.auditLog);
  await db.delete(schema.matches);
  await db.delete(schema.classAuthorizations);
  await db.delete(schema.settlements);
  await db.delete(schema.users);
}

async function seedClaim() {
  const users = await db
    .insert(schema.users)
    .values({ email: 'claim-audit-export@example.com', displayName: 'Audit Export Test' })
    .returning();
  const userId = users[0].id;

  const settlements = await db
    .insert(schema.settlements)
    .values({
      canonicalKey: `audit-export-${Date.now()}-${Math.random()}`,
      source: 'manual',
      sourceUrl: 'https://example.com/source',
      caseName: 'Audit Export Settlement',
      defendant: 'Example Co',
      category: 'CONSUMER_PRODUCT_PURCHASE',
      classDefinition: 'All eligible Example Co purchasers.',
      proofRequired: false,
      claimFormUrl: 'https://example.com/claim',
      administrator: 'unknown',
    })
    .returning();

  const authorizations = await db
    .insert(schema.classAuthorizations)
    .values({
      userId,
      category: 'CONSUMER_PRODUCT_PURCHASE',
      enabled: true,
      authorizedAt: new Date('2026-05-25T09:00:00.000Z'),
      attestationText: 'I authorize no-proof claims only when my saved facts support the claim.',
      attestationVersion: 1,
    })
    .returning();

  const matches = await db
    .insert(schema.matches)
    .values({
      userId,
      settlementId: settlements[0].id,
      verdict: 'ELIGIBLE',
      confidence: 0.91,
      reasoningJson: { matched: ['merchant'] },
      requiredCategory: 'CONSUMER_PRODUCT_PURCHASE',
    })
    .returning();

  const claims = await db
    .insert(schema.claims)
    .values({
      userId,
      settlementId: settlements[0].id,
      matchId: matches[0].id,
      classAuthorizationId: authorizations[0].id,
      status: 'QUEUED',
      screenshotEmptyFormPath: 'artifacts/empty.png',
    })
    .returning();

  await db.insert(schema.auditLog).values({
    userId,
    eventType: 'CLAIM_QUEUED',
    entityType: 'claim',
    entityId: claims[0].id,
    payloadJson: { claimId: claims[0].id },
    actor: 'user',
    occurredAt: new Date('2026-05-25T10:00:00.000Z'),
  });
  const jobs = await db
    .insert(schema.jobs)
    .values({
      userId,
      type: 'file_claim',
      status: 'pending',
      payloadJson: {
        claimId: claims[0].id,
        automationMode: 'full_guarded',
        workerCadence: 'automatic_polling',
      },
      priority: 50,
    })
    .returning();
  await db.insert(schema.auditLog).values({
    userId,
    eventType: 'JOB_ENQUEUED',
    entityType: 'job',
    entityId: jobs[0].id,
    payloadJson: {
      type: 'file_claim',
      claimId: claims[0].id,
      automationMode: 'full_guarded',
      workerCadence: 'automatic_polling',
    },
    actor: 'system',
    occurredAt: new Date('2026-05-25T10:01:00.000Z'),
  });

  return { userId, claimId: claims[0].id };
}

beforeAll(async () => {
  const clientMod = await import('../../src/db/client');
  db = clientMod.db;
  schema = clientMod.schema;
  const exportMod = await import('../../src/lib/audit/claim-export');
  buildClaimAuditExport = exportMod.buildClaimAuditExport;

  const { migrate } = await import('drizzle-orm/libsql/migrator');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
});

beforeEach(async () => {
  await clearDb();
});

afterAll(() => {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('buildClaimAuditExport', () => {
  it('returns a digest-backed user-scoped claim audit package', async () => {
    const { userId, claimId } = await seedClaim();

    const auditExport = await buildClaimAuditExport(userId, claimId);

    expect(auditExport?.claim.id).toBe(claimId);
    expect(auditExport?.authorization.attestationText).toContain('no-proof claims only');
    expect(auditExport?.auditEvents).toHaveLength(1);
    expect(auditExport?.auditEvents[0]?.eventType).toBe('CLAIM_QUEUED');
    expect(auditExport?.safetyBoundary.userAuthorizationRequired).toBe(true);
    expect(auditExport?.safetyBoundary.paidAutomationWorkerAudited).toBe(true);
    expect(auditExport?.workerLifecycle).toMatchObject({
      workerJobType: 'file_claim',
      jobEnqueueEventType: 'JOB_ENQUEUED',
      automationMode: 'full_guarded',
      workerCadence: 'automatic_polling',
    });
    expect(auditExport?.workerLifecycle.latestJob).toMatchObject({
      status: 'pending',
      payload: {
        automationMode: 'full_guarded',
        workerCadence: 'automatic_polling',
      },
    });
    expect(auditExport?.workerLifecycle.auditEvents[0]?.eventType).toBe('JOB_ENQUEUED');
    expect(auditExport?.digest.algorithm).toBe('sha256');
    expect(auditExport?.digest.value).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not export claims for another user id', async () => {
    const { claimId } = await seedClaim();

    await expect(buildClaimAuditExport(999_999, claimId)).resolves.toBeNull();
  });
});
