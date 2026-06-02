import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { eq } from 'drizzle-orm';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'classaction-claim-route-ownership-'));
const TMP_DB = path.join(TMP_DIR, 'test.db');
process.env.DATABASE_URL = `file:${TMP_DB}`;
process.env.SINGLE_USER_EMAIL = 'claim-route-current@example.com';
delete process.env.CLAIMBOT_DEV_SUBSCRIPTION_PLAN;
delete process.env.CLAIMBOT_DEV_SUBSCRIPTION_STATUS;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
let postFileClaim: (req: Request, ctx: { params: { id: string } }) => Promise<Response>;
let getClaimStream: (req: Request, ctx: { params: { id: string } }) => Promise<Response>;
let otherUserClaimId: number;
let currentUserFailedClaimId: number;
let currentUserQueuedClaimId: number;

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

async function seedOtherUserClaim() {
  const currentUsers = await db
    .insert(schema.users)
    .values({
      email: 'claim-route-current@example.com',
      displayName: 'Current User',
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
    })
    .returning();
  const currentUserId = currentUsers[0].id;
  const otherUsers = await db
    .insert(schema.users)
    .values({
      email: 'claim-route-other@example.com',
      displayName: 'Other User',
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
    })
    .returning();
  const otherUserId = otherUsers[0].id;

  const settlements = await db
    .insert(schema.settlements)
    .values({
      canonicalKey: `claim-route-ownership-${Date.now()}`,
      source: 'manual',
      sourceUrl: 'https://example.com/source',
      caseName: 'Claim Route Ownership Settlement',
      defendant: 'Example Co',
      category: 'CONSUMER_PRODUCT_PURCHASE',
      classDefinition: 'All Example Co purchasers.',
      proofRequired: false,
      claimFormUrl: 'https://example.com/claim',
      administrator: 'unknown',
    })
    .returning();

  const queuedSettlements = await db
    .insert(schema.settlements)
    .values({
      canonicalKey: `claim-route-ownership-queued-${Date.now()}`,
      source: 'manual',
      sourceUrl: 'https://example.com/queued-source',
      caseName: 'Claim Route Queued Settlement',
      defendant: 'Example Co',
      category: 'CONSUMER_PRODUCT_PURCHASE',
      classDefinition: 'All Example Co queued purchasers.',
      proofRequired: false,
      claimFormUrl: 'https://example.com/queued-claim',
      administrator: 'unknown',
    })
    .returning();

  const authorizations = await db
    .insert(schema.classAuthorizations)
    .values({
      userId: otherUserId,
      category: 'CONSUMER_PRODUCT_PURCHASE',
      enabled: true,
      attestationText: 'I authorize this category for supported no-proof claims.',
      attestationVersion: 1,
      authorizedAt: new Date(),
    })
    .returning();

  const matches = await db
    .insert(schema.matches)
    .values({
      userId: otherUserId,
      settlementId: settlements[0].id,
      verdict: 'ELIGIBLE',
      confidence: 0.95,
      reasoningJson: {},
      requiredCategory: 'CONSUMER_PRODUCT_PURCHASE',
    })
    .returning();

  const claims = await db
    .insert(schema.claims)
    .values({
      userId: otherUserId,
      settlementId: settlements[0].id,
      matchId: matches[0].id,
      classAuthorizationId: authorizations[0].id,
      status: 'QUEUED',
    })
    .returning();

  otherUserClaimId = claims[0].id;

  const currentAuthorizations = await db
    .insert(schema.classAuthorizations)
    .values({
      userId: currentUserId,
      category: 'CONSUMER_PRODUCT_PURCHASE',
      enabled: true,
      attestationText: 'I authorize this category for supported no-proof claims.',
      attestationVersion: 1,
      authorizedAt: new Date(),
    })
    .returning();

  const currentMatches = await db
    .insert(schema.matches)
    .values({
      userId: currentUserId,
      settlementId: settlements[0].id,
      verdict: 'ELIGIBLE',
      confidence: 0.95,
      reasoningJson: {},
      requiredCategory: 'CONSUMER_PRODUCT_PURCHASE',
    })
    .returning();

  const currentClaims = await db
    .insert(schema.claims)
    .values({
      userId: currentUserId,
      settlementId: settlements[0].id,
      matchId: currentMatches[0].id,
      classAuthorizationId: currentAuthorizations[0].id,
      status: 'FAILED',
      lastError: 'previous run needs review',
    })
    .returning();

  currentUserFailedClaimId = currentClaims[0].id;

  const currentQueuedMatches = await db
    .insert(schema.matches)
    .values({
      userId: currentUserId,
      settlementId: queuedSettlements[0].id,
      verdict: 'ELIGIBLE',
      confidence: 0.95,
      reasoningJson: {},
      requiredCategory: 'CONSUMER_PRODUCT_PURCHASE',
    })
    .returning();

  const currentQueuedClaims = await db
    .insert(schema.claims)
    .values({
      userId: currentUserId,
      settlementId: queuedSettlements[0].id,
      matchId: currentQueuedMatches[0].id,
      classAuthorizationId: currentAuthorizations[0].id,
      status: 'QUEUED',
    })
    .returning();

  currentUserQueuedClaimId = currentQueuedClaims[0].id;
}

beforeAll(async () => {
  mocks.buildClientPreviewChecklist.mockResolvedValue({
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
    launchPacketStack: {
      rows: [
        {
          label: 'Preview promotion packet',
          path: 'data/preview-promotion-packet.md',
          owner: 'deployment',
          command: 'npm run preview:packet',
          ready: false,
          statusLabel: 'Packet blocked',
          statusDetail: 'Preview promotion readiness is still blocked.',
          missingInputs: ['HTTPS deployed preview URL assigned to SMOKE_BASE_URL'],
        },
      ],
    },
    exports: {
      clientPreviewChecklist: '/api/audit/client-preview-checklist',
      launchHandoff: '/api/audit/launch-handoff',
    },
  });

  const clientMod = await import('../../src/db/client');
  db = clientMod.db;
  schema = clientMod.schema;

  const { migrate } = await import('drizzle-orm/libsql/migrator');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
  await clearDb();
  await seedOtherUserClaim();

  const fileRoute = await import('../../src/app/api/claims/[id]/file/route');
  postFileClaim = fileRoute.POST;
  const streamRoute = await import('../../src/app/api/claims/[id]/stream/route');
  getClaimStream = streamRoute.GET;
});

afterAll(() => {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('claim-specific API ownership gates', () => {
  it('does not allow the current user to file or stream another user claim', async () => {
    const fileResponse = await postFileClaim(
      new Request('http://localhost/api/claims/1/file', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-claimbot-boundary-ack': 'single-claim-full-guarded-automation:v1',
        },
        body: JSON.stringify({}),
      }),
      { params: { id: String(otherUserClaimId) } },
    );
    expect(fileResponse.status).toBe(404);
    await expect(fileResponse.json()).resolves.toEqual({ error: 'claim not found' });

    const streamResponse = await getClaimStream(
      new Request('http://localhost/api/claims/1/stream'),
      { params: { id: String(otherUserClaimId) } },
    );
    expect(streamResponse.status).toBe(404);
    await expect(streamResponse.text()).resolves.toBe('Claim not found');
  });

  it('rejects non-runnable claim statuses before the filer can mutate them', async () => {
    const response = await postFileClaim(
      new Request('http://localhost/api/claims/1/file', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-claimbot-boundary-ack': 'single-claim-full-guarded-automation:v1',
        },
        body: JSON.stringify({}),
      }),
      { params: { id: String(currentUserFailedClaimId) } },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: 'claim is not runnable',
      status: 'FAILED',
      runnableStatuses: ['QUEUED', 'PREFLIGHT'],
    });

    const rows = await db
      .select({ status: schema.claims.status })
      .from(schema.claims)
      .where(eq(schema.claims.id, currentUserFailedClaimId))
      .limit(1);
    expect(rows[0].status).toBe('FAILED');
  });

  it('locks runnable current-user filer runs behind client-preview readiness', async () => {
    const response = await postFileClaim(
      new Request('http://localhost/api/claims/1/file', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-claimbot-boundary-ack': 'single-claim-full-guarded-automation:v1',
        },
        body: JSON.stringify({}),
      }),
      { params: { id: String(currentUserQueuedClaimId) } },
    );
    const body = await response.json();

    expect(response.status).toBe(423);
    expect(body).toMatchObject({
      error: 'account readiness required',
      required: 'claimbot.account-readiness.v1',
      summary: {
        ready: false,
        readyCount: 6,
        blockedCount: 5,
        readinessStatusReadyCount: 10,
        readinessStatusTotalCount: 15,
      },
      blockedRequirements: expect.arrayContaining([
        expect.objectContaining({
          key: 'published-site',
          status: 'blocked',
        }),
      ]),
      blockedPackets: expect.arrayContaining([
        expect.objectContaining({
          label: 'Published site readiness',
          owner: 'Hosted readiness',
          missingInputs: ['Published site readiness'],
        }),
      ]),
    });
    expect(JSON.stringify(body)).not.toContain('/api/audit');
    expect(JSON.stringify(body)).not.toContain('npm run');
    expect(JSON.stringify(body)).not.toContain('data/preview-promotion-packet.md');
    expect(JSON.stringify(body)).not.toContain('account-scoped');
    expect(JSON.stringify(body)).not.toContain('accountScope');
    expect(JSON.stringify(body)).not.toContain('Packet blocked');
    expect(JSON.stringify(body)).not.toContain('launchPacketReadyCount');
    expect(JSON.stringify(body)).not.toContain('the matching readiness');

    const rows = await db
      .select({ status: schema.claims.status })
      .from(schema.claims)
      .where(eq(schema.claims.id, currentUserQueuedClaimId))
      .limit(1);
    expect(rows[0].status).toBe('QUEUED');
  });

  it('arms an audited file_claim worker job instead of running single-claim automation inline', async () => {
    mocks.buildClientPreviewChecklist.mockResolvedValueOnce({
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
      fullAutomationLaunchBlockers: { rows: [], summary: { ready: true, blockedCount: 0, note: 'ready' } },
      exports: {
        clientPreviewChecklist: '/api/audit/client-preview-checklist',
        launchHandoff: '/api/audit/launch-handoff',
      },
    });

    const response = await postFileClaim(
      new Request('http://localhost/api/claims/1/file', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-claimbot-boundary-ack': 'single-claim-full-guarded-automation:v1',
        },
        body: JSON.stringify({}),
      }),
      { params: { id: String(currentUserQueuedClaimId) } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      claimId: currentUserQueuedClaimId,
      jobReused: false,
      automationMode: 'full_guarded',
      workerCadence: 'automatic_polling',
    });
    expect(body.jobId).toEqual(expect.any(Number));

    const jobs = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, body.jobId))
      .limit(1);
    expect(jobs[0]).toMatchObject({
      userId: 1,
      type: 'file_claim',
      status: 'pending',
    });
    expect(jobs[0].payloadJson).toMatchObject({
      claimId: currentUserQueuedClaimId,
      automationMode: 'full_guarded',
      workerCadence: 'automatic_polling',
    });

    const auditRows = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, body.jobId));
    expect(auditRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: 'JOB_ENQUEUED',
        entityType: 'job',
      }),
    ]));
  });
});
