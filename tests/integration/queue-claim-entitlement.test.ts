import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-queue-entitlement-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;
process.env.SINGLE_USER_EMAIL = 'queue-entitlement-test@example.com';
delete process.env.CLAIMBOT_DEV_SUBSCRIPTION_PLAN;
delete process.env.CLAIMBOT_DEV_SUBSCRIPTION_STATUS;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
let queueClaim: (matchId: number, expectedUserId?: number) => Promise<{
  claimId: number;
  jobId: number | null;
  jobReused: boolean;
} | { error: string }>;

const mocks = vi.hoisted(() => ({
  buildClientPreviewChecklist: vi.fn(),
}));

vi.mock('@lib/client-preview-checklist', () => ({
  buildClientPreviewChecklist: mocks.buildClientPreviewChecklist,
}));

async function clearDb() {
  await db.delete(schema.claims);
  await db.delete(schema.jobs);
  await db.delete(schema.auditLog);
  await db.delete(schema.matches);
  await db.delete(schema.classAuthorizations);
  await db.delete(schema.settlements);
  await db.delete(schema.users);
}

async function seedQueueableMatch(subscription: {
  plan?: 'free' | 'plus' | 'pro' | 'founding';
  status?: 'inactive' | 'trialing' | 'active' | 'past_due' | 'cancelled';
} = {}) {
  const users = await db
    .insert(schema.users)
    .values({
      email: 'queue-entitlement-test@example.com',
      displayName: 'Queue Entitlement Test',
      subscriptionPlan: subscription.plan ?? 'free',
      subscriptionStatus: subscription.status ?? 'inactive',
    })
    .returning();
  const userId = users[0].id;

  const settlements = await db
    .insert(schema.settlements)
    .values({
      canonicalKey: `queue-entitlement-${Date.now()}-${Math.random()}`,
      source: 'manual',
      sourceUrl: 'https://example.com/source',
      caseName: 'Queue Entitlement Settlement',
      defendant: 'Acme',
      defendantAliases: [],
      category: 'CONSUMER_PRODUCT_PURCHASE',
      classDefinition: 'All eligible Acme customers.',
      proofRequired: false,
      claimFormUrl: 'https://example.com/claim',
      administrator: 'unknown',
    })
    .returning();
  const settlementId = settlements[0].id;

  const authorizations = await db
    .insert(schema.classAuthorizations)
    .values({
      userId,
      category: 'CONSUMER_PRODUCT_PURCHASE',
      enabled: true,
      attestationText: 'I authorize filing for this category when my saved facts support the claim.',
      attestationVersion: 1,
      authorizedAt: new Date(),
    })
    .returning();

  const matches = await db
    .insert(schema.matches)
    .values({
      userId,
      settlementId,
      verdict: 'ELIGIBLE',
      confidence: 0.92,
      reasoningJson: {},
      requiredCategory: 'CONSUMER_PRODUCT_PURCHASE',
    })
    .returning();

  return { userId, settlementId, authorizationId: authorizations[0].id, matchId: matches[0].id };
}

beforeAll(async () => {
  const clientMod = await import('../../src/db/client');
  db = clientMod.db;
  schema = clientMod.schema;
  const filerMod = await import('../../src/lib/claim-filer/filer');
  queueClaim = filerMod.queueClaim;

  const { migrate } = await import('drizzle-orm/libsql/migrator');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
});

beforeEach(async () => {
  await clearDb();
  mocks.buildClientPreviewChecklist.mockResolvedValue({
    accountScope: { accountId: 1, scope: 'account-scoped', matcherReceiptRequired: true },
    summary: {
      clientPreviewReady: true,
      readyCount: 11,
      blockedCount: 0,
      reviewCount: 0,
      totalCount: 11,
      launchPacketReadyCount: 15,
      launchPacketTotalCount: 15,
      nextStep: null,
    },
    items: [],
    launchPacketStack: { rows: [] },
    exports: {
      clientPreviewChecklist: '/api/audit/client-preview-checklist',
      launchHandoff: '/api/audit/launch-handoff',
    },
  });
});

afterAll(() => {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('queueClaim paid automation entitlement', () => {
  it('queues eligible authorized claims for free users within the monthly allowance', async () => {
    const { matchId } = await seedQueueableMatch();

    const result = await queueClaim(matchId);

    expect(result).toMatchObject({ jobReused: false });
    expect(result).toHaveProperty('claimId');
    expect(await db.select().from(schema.claims)).toHaveLength(1);
    expect(await db.select().from(schema.jobs)).toHaveLength(1);
  });

  it('blocks free users once the monthly claim allowance is used up', async () => {
    const { userId, matchId } = await seedQueueableMatch();
    const { FREE_MONTHLY_CLAIM_LIMIT } = await import('../../src/lib/billing/entitlements');

    // Burn the entire monthly allowance with already-queued claims.
    for (let i = 0; i < FREE_MONTHLY_CLAIM_LIMIT; i++) {
      const settlements = await db
        .insert(schema.settlements)
        .values({
          canonicalKey: `queue-limit-${i}-${Date.now()}-${Math.random()}`,
          source: 'manual',
          sourceUrl: 'https://example.com/source',
          caseName: `Queue Limit Settlement ${i}`,
          defendant: 'Acme',
          defendantAliases: [],
          category: 'CONSUMER_PRODUCT_PURCHASE',
          classDefinition: 'All eligible Acme customers.',
          proofRequired: false,
          claimFormUrl: 'https://example.com/claim',
          administrator: 'unknown',
        })
        .returning();
      const matches = await db
        .insert(schema.matches)
        .values({
          userId,
          settlementId: settlements[0].id,
          verdict: 'ELIGIBLE',
          confidence: 0.92,
          reasoningJson: {},
          requiredCategory: 'CONSUMER_PRODUCT_PURCHASE',
        })
        .returning();
      const queued = await queueClaim(matches[0].id);
      expect(queued).toHaveProperty('claimId');
    }
    await db.delete(schema.auditLog);

    const result = await queueClaim(matchId);

    expect(result).toEqual({
      error: `free monthly claim limit reached (${FREE_MONTHLY_CLAIM_LIMIT}/${FREE_MONTHLY_CLAIM_LIMIT} this month) - paid plans remove the cap`,
    });
    expect(await db.select().from(schema.claims)).toHaveLength(FREE_MONTHLY_CLAIM_LIMIT);
    const auditRows = await db.select().from(schema.auditLog);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      eventType: 'CLAIM_QUEUE_BLOCKED',
      entityType: 'match',
      entityId: matchId,
      actor: 'user',
    });
    expect(auditRows[0].payloadJson).toMatchObject({
      gate: 'free-monthly-claim-limit',
    });
  });

  it('queues eligible authorized no-proof claims for active Pro users', async () => {
    const { matchId } = await seedQueueableMatch({ plan: 'pro', status: 'active' });

    const result = await queueClaim(matchId);

    expect(result).toMatchObject({ jobReused: false });
    expect(result).toHaveProperty('claimId');
    expect(result).toHaveProperty('jobId');
    expect(await db.select().from(schema.claims)).toHaveLength(1);
    const jobs = await db.select().from(schema.jobs);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payloadJson).toMatchObject({
      claimId: 'claimId' in result ? result.claimId : 0,
      automationMode: 'full_guarded',
      workerCadence: 'automatic_polling',
    });
    const auditRows = await db.select().from(schema.auditLog);
    expect(auditRows.map((row: { eventType: string }) => row.eventType)).toEqual([
      'JOB_ENQUEUED',
      'CLAIM_QUEUED',
    ]);
    expect(auditRows[0].payloadJson).toMatchObject({
      type: 'file_claim',
      automationMode: 'full_guarded',
      workerCadence: 'automatic_polling',
      source: 'new-claim',
    });
    expect(auditRows[1].payloadJson).toMatchObject({
      jobId: jobs[0].id,
      automationMode: 'full_guarded',
      workerCadence: 'automatic_polling',
    });
  });

  it('rearms an existing queued claim when the worker job is missing', async () => {
    const { matchId } = await seedQueueableMatch({ plan: 'pro', status: 'active' });
    const first = await queueClaim(matchId);
    if (!('claimId' in first)) throw new Error('expected first queue to create claim');
    await db.delete(schema.jobs);
    await db.delete(schema.auditLog);

    const second = await queueClaim(matchId);

    expect(second).toMatchObject({
      claimId: first.claimId,
      jobReused: false,
    });
    const jobs = await db.select().from(schema.jobs);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payloadJson).toMatchObject({
      claimId: first.claimId,
      automationMode: 'full_guarded',
    });
    const auditRows = await db.select().from(schema.auditLog);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      eventType: 'JOB_ENQUEUED',
      entityType: 'job',
      entityId: jobs[0].id,
      actor: 'system',
    });
    expect(auditRows[0].payloadJson).toMatchObject({
      claimId: first.claimId,
      source: 'existing-claim-rearmed',
    });
  });

  it('blocks active Pro users until client-preview launch proof is ready', async () => {
    mocks.buildClientPreviewChecklist.mockResolvedValueOnce({
      accountScope: { accountId: 1, scope: 'account-scoped', matcherReceiptRequired: true },
      summary: {
        clientPreviewReady: false,
        readyCount: 6,
        blockedCount: 5,
        reviewCount: 0,
        totalCount: 11,
        launchPacketReadyCount: 10,
        launchPacketTotalCount: 15,
        nextStep: {
          label: 'Operator account settings',
          nextAction: 'Run npm run operator:packet, finish Netlify/account setup, push non-placeholder env values, and rerun npm run netlify:doctor.',
        },
      },
      items: [
        {
          key: 'hosted-deployment-preview',
          label: 'Hosted deployment and preview promotion proof',
          owner: 'deployment',
          status: 'blocked',
          nextAction: 'Deploy to Netlify.',
          evidence: ['data/preview-promotion-packet.md'],
        },
      ],
      launchPacketStack: { rows: [] },
      exports: {
        clientPreviewChecklist: '/api/audit/client-preview-checklist',
        launchHandoff: '/api/audit/launch-handoff',
      },
    });
    const { matchId } = await seedQueueableMatch({ plan: 'pro', status: 'active' });

    const result = await queueClaim(matchId);

    expect(result).toEqual({
      error: 'account readiness required - Account readiness: Confirm the support contact, source contact, hosted site, and sign-in settings in account status.',
    });
    expect(await db.select().from(schema.claims)).toHaveLength(0);
    expect(await db.select().from(schema.jobs)).toHaveLength(0);
    const auditRows = await db.select().from(schema.auditLog);
    expect(auditRows[0].payloadJson).toMatchObject({
      gate: 'client-preview-checklist',
    });
  });

  it('does not queue a match when the expected user id belongs to another account', async () => {
    const { matchId, userId } = await seedQueueableMatch({ plan: 'pro', status: 'active' });

    const result = await queueClaim(matchId, userId + 1);

    expect(result).toEqual({ error: 'match not found' });
    expect(await db.select().from(schema.claims)).toHaveLength(0);
    expect(await db.select().from(schema.jobs)).toHaveLength(0);
    expect(await db.select().from(schema.auditLog)).toHaveLength(0);
  });
});
