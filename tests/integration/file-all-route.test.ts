import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QUEUE_BOUNDARY_ACK, QUEUE_TRUST_LOCK_ACK } from '../../src/lib/claim-filer/request-boundary';
import { POST } from '../../src/app/api/claims/file-all/route';

const mocks = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  runMatcher: vi.fn(),
  queueEligibleClaims: vi.fn(),
  buildClientPreviewChecklist: vi.fn(),
}));

vi.mock('@lib/auth/current-user', () => ({
  currentUserId: mocks.currentUserId,
}));

vi.mock('@lib/matcher/run-matcher', () => ({
  runMatcher: mocks.runMatcher,
}));

vi.mock('@lib/claim-filer/claim-queue', () => ({
  queueEligibleClaims: mocks.queueEligibleClaims,
}));

vi.mock('@lib/client-preview-checklist', () => ({
  buildClientPreviewChecklist: mocks.buildClientPreviewChecklist,
}));

function jsonRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/claims/file-all', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/claims/file-all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserId.mockResolvedValue(42);
    mocks.runMatcher.mockResolvedValue({ verdictCounts: { ELIGIBLE: 3 } });
    mocks.queueEligibleClaims.mockResolvedValue({
      queued: 2,
      jobsEnqueued: 2,
      jobsReused: 0,
      alreadyClaimed: 1,
      skippedProof: 4,
      skippedNoForm: 5,
      skippedNoAuth: 0,
      skippedNoPlan: 0,
      errors: [],
    });
    mocks.buildClientPreviewChecklist.mockResolvedValue({
      accountScope: { userId: 42 },
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
      launchPacketStack: {
        rows: [],
      },
      exports: {
        json: '/api/audit/client-preview-checklist',
        launchHandoff: '/api/audit/launch-handoff',
      },
    });
  });

  it('requires a queue boundary acknowledgement', async () => {
    const response = await POST(jsonRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: 'queue boundary acknowledgement required',
      requiredAck: QUEUE_BOUNDARY_ACK,
    });
  });

  it('requires a queue trust lock after the boundary acknowledgement', async () => {
    const response = await POST(jsonRequest({ queueBoundaryAck: QUEUE_BOUNDARY_ACK }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: 'queue trust lock acknowledgement required',
      requiredAck: QUEUE_TRUST_LOCK_ACK,
    });
  });

  it('locks bulk queueing until the account client-preview checklist is ready', async () => {
    mocks.buildClientPreviewChecklist.mockResolvedValueOnce({
      accountScope: { userId: 42 },
      summary: {
        clientPreviewReady: false,
        readyCount: 6,
        blockedCount: 5,
        reviewCount: 0,
        totalCount: 11,
        launchPacketReadyCount: 9,
        launchPacketTotalCount: 15,
        nextStep: {
          key: 'billing',
          label: 'Billing checkout and sync',
          owner: 'business',
          nextAction: 'Connect paid checkout and billing sync receipt.',
        },
      },
      items: [
        {
          key: 'pricing-billing',
          label: 'Pricing and paid automation billing gates',
          owner: 'business',
          status: 'blocked',
          nextAction: 'Connect paid checkout and billing sync receipt.',
          evidence: ['data/billing-activation-packet.md'],
        },
        {
          key: 'hosted-deployment-preview',
          label: 'Hosted deployment and preview promotion proof',
          owner: 'deployment',
          status: 'blocked',
          nextAction: 'Deploy preview and record the promotion receipt.',
          evidence: ['data/preview-promotion-packet.md'],
        },
      ],
      launchPacketStack: {
        rows: [
          {
            label: 'Billing activation packet',
            path: 'data/billing-activation-packet.md',
            owner: 'business',
            command: 'npm run billing:packet',
            ready: false,
            statusLabel: 'Packet blocked',
            statusDetail: 'Packet readiness is still blocked.',
            missingInputs: ['CLAIMBOT_BILLING_PLUS_MONTHLY_URL'],
          },
        ],
      },
      exports: {
        json: '/api/audit/client-preview-checklist',
        launchHandoff: '/api/audit/launch-handoff',
      },
    });

    const response = await POST(jsonRequest({
      queueBoundaryAck: QUEUE_BOUNDARY_ACK,
      queueTrustLock: QUEUE_TRUST_LOCK_ACK,
    }));
    const body = await response.json();

    expect(response.status).toBe(423);
    expect(body).toMatchObject({
      error: 'account readiness required',
      required: 'claimbot.account-readiness.v1',
      accountReadiness: {
        note: 'Match evidence is checked for this account before automation runs.',
      },
      summary: {
        ready: false,
        readyCount: 6,
        blockedCount: 5,
        totalCount: 11,
        readinessStatusReadyCount: 9,
        readinessStatusTotalCount: 15,
      },
    });
    expect(body.exports).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('/api/audit');
    expect(JSON.stringify(body)).not.toContain('npm run');
    expect(JSON.stringify(body)).not.toContain('data/billing-activation-packet.md');
    expect(JSON.stringify(body)).not.toContain('account-scoped');
    expect(JSON.stringify(body)).not.toContain('accountScope');
    expect(JSON.stringify(body)).not.toContain('Packet blocked');
    expect(JSON.stringify(body)).not.toContain('launchPacketReadyCount');
    expect(JSON.stringify(body)).not.toContain('the matching readiness');
    expect(body.blockedRequirements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'paid-plan',
        label: 'Paid-plan readiness',
        owner: 'Business readiness',
        status: 'blocked',
        readinessStatusCount: 1,
      }),
    ]));
    expect(body.blockedPackets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Paid-plan readiness',
        owner: 'Business readiness',
        statusLabel: 'Readiness needed',
        missingInputs: ['Paid-plan checkout readiness'],
      }),
    ]));
    expect(mocks.runMatcher).not.toHaveBeenCalled();
    expect(mocks.queueEligibleClaims).not.toHaveBeenCalled();
  });

  it('runs matcher and queues only after the client-preview checklist is ready', async () => {
    const response = await POST(jsonRequest({
      queueBoundaryAck: QUEUE_BOUNDARY_ACK,
      queueTrustLock: QUEUE_TRUST_LOCK_ACK,
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.buildClientPreviewChecklist).toHaveBeenCalledWith(42);
    expect(mocks.runMatcher).toHaveBeenCalledWith(42);
    expect(mocks.queueEligibleClaims).toHaveBeenCalledWith(42);
    expect(body).toMatchObject({
      matched: 3,
      queued: 2,
      jobsEnqueued: 2,
      jobsReused: 0,
      alreadyClaimed: 1,
      skippedProof: 4,
      skippedNoForm: 5,
      skippedNoAuth: 0,
      skippedNoPlan: 0,
      errors: [],
      automationMode: 'full_guarded',
    });
    expect(body.workerCadence).toContain('paid command is fully automated after this point');
    expect(body.workerCadence).toContain('worker continues');
    expect(body.boundary).toContain('Manual stops are hard blockers only');
  });
});
