import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@db/client';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function normalizeForJson(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeForJson(item));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalizeForJson(item)]),
    );
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return String(value);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeForJson(value));
}

export function sha256Digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function summarizeWorkerJob(job: typeof schema.jobs.$inferSelect) {
  const payload = (job.payloadJson ?? {}) as {
    claimId?: number;
    automationMode?: string;
    workerCadence?: string;
  };
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    runAfter: job.runAfter,
    lockedAt: job.lockedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    lastError: job.lastError,
    payload: {
      claimId: payload.claimId ?? null,
      automationMode: payload.automationMode ?? null,
      workerCadence: payload.workerCadence ?? null,
    },
  };
}

export async function buildClaimAuditExport(userId: number, claimId: number) {
  const rows = await db
    .select({
      claim: schema.claims,
      settlement: schema.settlements,
      match: schema.matches,
      authorization: schema.classAuthorizations,
    })
    .from(schema.claims)
    .innerJoin(schema.settlements, eq(schema.claims.settlementId, schema.settlements.id))
    .innerJoin(schema.matches, eq(schema.claims.matchId, schema.matches.id))
    .innerJoin(
      schema.classAuthorizations,
      eq(schema.claims.classAuthorizationId, schema.classAuthorizations.id),
    )
    .where(and(eq(schema.claims.id, claimId), eq(schema.claims.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const auditEvents = await db
    .select()
    .from(schema.auditLog)
    .where(and(
      eq(schema.auditLog.userId, userId),
      eq(schema.auditLog.entityType, 'claim'),
      eq(schema.auditLog.entityId, claimId),
    ))
    .orderBy(desc(schema.auditLog.occurredAt));
  const workerJobs = (await db
    .select()
    .from(schema.jobs)
    .where(and(
      eq(schema.jobs.userId, userId),
      eq(schema.jobs.type, 'file_claim'),
    ))
    .orderBy(desc(schema.jobs.createdAt)))
    .filter((job) => {
      const payload = (job.payloadJson ?? {}) as { claimId?: number };
      return payload.claimId === claimId;
    });
  const workerJobIds = new Set(workerJobs.map((job) => job.id));
  const workerAuditEvents = workerJobIds.size === 0
    ? []
    : (await db
      .select()
      .from(schema.auditLog)
      .where(and(
        eq(schema.auditLog.userId, userId),
        eq(schema.auditLog.entityType, 'job'),
      ))
      .orderBy(desc(schema.auditLog.occurredAt)))
      .filter((event) => event.entityId != null && workerJobIds.has(event.entityId));
  const workerJobSummaries = workerJobs.map(summarizeWorkerJob);

  const exportBody = {
    format: 'claimbot.claim-audit-export.v1',
    generatedAt: new Date(),
    safetyBoundary: {
      noLegalAdvice: true,
      noEligibilityGuarantee: true,
      proofRequiredClaimsStayManual: true,
      userAuthorizationRequired: true,
      paidAutomationWorkerAudited: true,
    },
    claim: row.claim,
    settlement: row.settlement,
    match: row.match,
    authorization: {
      id: row.authorization.id,
      category: row.authorization.category,
      enabled: row.authorization.enabled,
      authorizedAt: row.authorization.authorizedAt,
      revokedAt: row.authorization.revokedAt,
      attestationText: row.authorization.attestationText,
      attestationVersion: row.authorization.attestationVersion,
      scopeConstraintsJson: row.authorization.scopeConstraintsJson,
    },
    artifacts: {
      emptyFormScreenshot: row.claim.screenshotEmptyFormPath,
      filledFormScreenshot: row.claim.screenshotFilledFormPath,
      confirmationScreenshot: row.claim.screenshotConfirmationPath,
      pdfReceipt: row.claim.pdfReceiptPath,
    },
    workerLifecycle: {
      workerJobType: 'file_claim',
      jobEnqueueEventType: 'JOB_ENQUEUED',
      jobCompletionEventType: 'JOB_COMPLETED',
      automationMode: workerJobSummaries[0]?.payload.automationMode ?? null,
      workerCadence: workerJobSummaries[0]?.payload.workerCadence ?? null,
      latestJob: workerJobSummaries[0] ?? null,
      jobs: workerJobSummaries,
      auditEvents: workerAuditEvents,
      boundary: 'Worker lifecycle evidence is claim-scoped and proves queue/retry state only; preflight, proof, authorization, and live-mode gates still control external submission.',
    },
    auditEvents,
  };

  return {
    ...exportBody,
    digest: {
      algorithm: 'sha256',
      value: sha256Digest(exportBody),
      note: 'Recompute this digest over the export without the digest field to detect accidental changes.',
    },
  };
}
