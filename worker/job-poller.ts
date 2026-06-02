// Poll the jobs table every 10s. Claim a pending job by updating its status
// to 'running' and recording the worker id in `lockedBy`. For MVP we run a
// single worker so contention is not yet a concern, but the lock fields are
// wired up so it stays correct when we scale.

import { db, schema } from '@db/client';
import type { Job } from '@db/schema';
import { and, eq, lte } from 'drizzle-orm';
import { writeAudit } from '@lib/audit';
import { runIngest } from '@lib/scraper/ingest';
import { fileClaim } from '@lib/claim-filer/filer';
import { runMatcher } from '@lib/matcher/run-matcher';

const WORKER_ID = `worker-${process.pid}`;
const POLL_INTERVAL_MS = 10_000;

export type WorkerRunReceipt = {
  workerId: string;
  limit: number;
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  jobTypes: Partial<Record<Job['type'], {
    processed: number;
    succeeded: number;
    failed: number;
    retried: number;
  }>>;
};

async function handleJob(job: Job, workerId = WORKER_ID): Promise<'succeeded' | 'failed' | 'retried'> {
  console.log(`[job-poller] handling ${job.type} #${job.id}`);
  try {
    await db
      .update(schema.jobs)
      .set({
        status: 'running',
        lockedBy: workerId,
        lockedAt: new Date(),
        attempts: job.attempts + 1,
      })
      .where(eq(schema.jobs.id, job.id));

    switch (job.type) {
      case 'scrape_ingest':
        await runIngest();
        break;
      case 'run_matcher':
        await runMatcher(job.userId);
        break;
      case 'file_claim': {
        const payload = (job.payloadJson ?? {}) as { claimId?: number };
        if (!payload.claimId) throw new Error('file_claim job missing claimId');
        const result = await fileClaim(payload.claimId);
        if (result.status === 'FAILED') {
          throw new Error(result.reason ?? 'filer failed');
        }
        break;
      }
      default:
        throw new Error(`unknown job type: ${job.type}`);
    }

    await db
      .update(schema.jobs)
      .set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(schema.jobs.id, job.id));

    await writeAudit({
      userId: job.userId,
      eventType: 'JOB_COMPLETED',
      entityType: 'job',
      entityId: job.id,
      payload: { type: job.type },
      actor: 'system',
    });
    return 'succeeded';
  } catch (err) {
    const msg = (err as Error).message;
    const failed = job.attempts + 1 >= job.maxAttempts;
    await db
      .update(schema.jobs)
      .set({
        status: failed ? 'failed' : 'pending',
        lastError: msg,
        lockedBy: null,
        lockedAt: null,
      })
      .where(eq(schema.jobs.id, job.id));
    console.error(
      `[job-poller] job #${job.id} ${failed ? 'failed' : 'retrying'}: ${msg}`,
    );
    return failed ? 'failed' : 'retried';
  }
}

async function tick(workerId = WORKER_ID): Promise<{ type: Job['type']; result: 'succeeded' | 'failed' | 'retried' } | null> {
  const now = new Date();
  const pending = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.status, 'pending'), lte(schema.jobs.runAfter, now)))
    .orderBy(schema.jobs.priority, schema.jobs.runAfter)
    .limit(1);
  const next = pending[0];
  if (!next) return null;
  const result = await handleJob(next, workerId);
  return { type: next.type, result };
}

function incrementJobType(
  receipt: WorkerRunReceipt,
  type: Job['type'],
  result: 'succeeded' | 'failed' | 'retried',
) {
  const current = receipt.jobTypes[type] ?? {
    processed: 0,
    succeeded: 0,
    failed: 0,
    retried: 0,
  };
  current.processed++;
  if (result === 'succeeded') current.succeeded++;
  if (result === 'failed') current.failed++;
  if (result === 'retried') current.retried++;
  receipt.jobTypes[type] = current;
}

export async function runDueJobs(options: {
  limit?: number;
  workerId?: string;
} = {}): Promise<WorkerRunReceipt> {
  const limit = Math.max(1, Math.min(Number(options.limit ?? 1), 25));
  const workerId = options.workerId ?? WORKER_ID;
  const receipt: WorkerRunReceipt = {
    workerId,
    limit,
    processed: 0,
    succeeded: 0,
    failed: 0,
    retried: 0,
    jobTypes: {},
  };

  for (let index = 0; index < limit; index++) {
    const tickResult = await tick(workerId);
    if (!tickResult) break;
    receipt.processed++;
    if (tickResult.result === 'succeeded') receipt.succeeded++;
    if (tickResult.result === 'failed') receipt.failed++;
    if (tickResult.result === 'retried') receipt.retried++;
    incrementJobType(receipt, tickResult.type, tickResult.result);
  }

  return receipt;
}

export function startJobPoller() {
  console.log('[job-poller] starting');
  const loop = async () => {
    try {
      await runDueJobs({ limit: 1, workerId: WORKER_ID });
    } catch (err) {
      console.error('[job-poller] tick error:', (err as Error).message);
    } finally {
      setTimeout(loop, POLL_INTERVAL_MS);
    }
  };
  loop();
}
