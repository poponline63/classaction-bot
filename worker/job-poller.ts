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

async function handleJob(job: Job) {
  console.log(`[job-poller] handling ${job.type} #${job.id}`);
  try {
    await db
      .update(schema.jobs)
      .set({
        status: 'running',
        lockedBy: WORKER_ID,
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
  }
}

async function tick() {
  const now = new Date();
  const pending = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.status, 'pending'), lte(schema.jobs.runAfter, now)))
    .orderBy(schema.jobs.priority, schema.jobs.runAfter)
    .limit(1);
  const next = pending[0];
  if (!next) return;
  await handleJob(next);
}

export function startJobPoller() {
  console.log('[job-poller] starting');
  const loop = async () => {
    try {
      await tick();
    } catch (err) {
      console.error('[job-poller] tick error:', (err as Error).message);
    } finally {
      setTimeout(loop, POLL_INTERVAL_MS);
    }
  };
  loop();
}
