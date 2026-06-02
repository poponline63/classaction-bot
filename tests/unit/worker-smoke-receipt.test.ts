import { describe, expect, it } from 'vitest';
import { buildWorkerSmokeReceipt, evaluateWorkerSmokeReceipt } from '../../worker/smoke-receipt';

const baseReceipt = {
  workerId: 'worker-test',
  limit: 5,
  processed: 1,
  succeeded: 1,
  failed: 0,
  retried: 0,
  jobTypes: {
    file_claim: {
      processed: 1,
      succeeded: 1,
      failed: 0,
      retried: 0,
    },
  },
};

describe('worker smoke receipt evaluation', () => {
  it('passes only when at least one due job completes without retry or failure', () => {
    const evaluation = evaluateWorkerSmokeReceipt(baseReceipt);

    expect(evaluation).toMatchObject({
      status: 'pass',
      fileClaimProofUsable: true,
      issues: [],
      warnings: [],
    });
  });

  it('warns when the worker starts but no due jobs prove completion', () => {
    const evaluation = evaluateWorkerSmokeReceipt({
      ...baseReceipt,
      processed: 0,
      succeeded: 0,
      jobTypes: {},
    });

    expect(evaluation.status).toBe('warn');
    expect(evaluation.fileClaimProofUsable).toBe(false);
    expect(evaluation.warnings.join(' ')).toContain('No due jobs were available');
  });

  it('fails when any due job retries or fails', () => {
    expect(evaluateWorkerSmokeReceipt({
      ...baseReceipt,
      processed: 2,
      succeeded: 1,
      retried: 1,
      jobTypes: {
        file_claim: {
          processed: 2,
          succeeded: 1,
          failed: 0,
          retried: 1,
        },
      },
    })).toMatchObject({
      status: 'fail',
      fileClaimProofUsable: false,
    });

    expect(evaluateWorkerSmokeReceipt({
      ...baseReceipt,
      processed: 2,
      succeeded: 1,
      failed: 1,
      jobTypes: {
        file_claim: {
          processed: 2,
          succeeded: 1,
          failed: 1,
          retried: 0,
        },
      },
    })).toMatchObject({
      status: 'fail',
      fileClaimProofUsable: false,
    });
  });

  it('warns when only non-filing jobs complete because paid launch proof needs file_claim', () => {
    const evaluation = evaluateWorkerSmokeReceipt({
      ...baseReceipt,
      jobTypes: {
        run_matcher: {
          processed: 1,
          succeeded: 1,
          failed: 0,
          retried: 0,
        },
      },
    });

    expect(evaluation.status).toBe('warn');
    expect(evaluation.fileClaimProofUsable).toBe(false);
    expect(evaluation.warnings.join(' ')).toContain('No file_claim job completed');
  });

  it('builds a non-secret receipt with the stricter launch-proof boundary', () => {
    const receipt = buildWorkerSmokeReceipt({
      generatedAt: '2026-05-27T00:00:00.000Z',
      runtime: 'github-actions-scheduler',
      database: {
        configured: true,
        kind: 'libsql',
        authTokenPresent: true,
      },
      receipt: baseReceipt,
    });

    expect(receipt).toMatchObject({
      format: 'claimbot.worker-smoke-receipt.v1',
      status: 'pass',
      fileClaimProofUsable: true,
      launchProofUsable: true,
      approvalBoundary: {
        nonSecretReceipt: true,
        doesNotPrintDatabaseUrl: true,
        requiresDueJobCompletionForLaunchProof: true,
        requiresFileClaimCompletionForLaunchProof: true,
        requiresHostedDatabaseForLaunchProof: true,
      },
    });
  });

  it('does not treat local storage file_claim success as hosted launch proof', () => {
    const receipt = buildWorkerSmokeReceipt({
      generatedAt: '2026-05-27T00:00:00.000Z',
      runtime: 'local-worker-once',
      database: {
        configured: true,
        kind: 'local-file',
        authTokenPresent: false,
      },
      receipt: baseReceipt,
    });

    expect(receipt).toMatchObject({
      status: 'pass',
      fileClaimProofUsable: true,
      launchProofUsable: false,
    });
    expect(receipt.warnings.join(' ')).toContain('not run against hosted storage');
  });
});
