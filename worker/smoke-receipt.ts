import type { WorkerRunReceipt } from './job-poller';

export type WorkerSmokeStatus = 'pass' | 'warn' | 'fail';

export interface WorkerSmokeDatabase {
  configured: boolean;
  kind: string;
  authTokenPresent: boolean;
}

export function evaluateWorkerSmokeReceipt(receipt: WorkerRunReceipt) {
  const issues: string[] = [];
  const warnings: string[] = [];
  const fileClaim = receipt.jobTypes.file_claim;

  if (receipt.failed > 0) {
    issues.push(`${receipt.failed} due job${receipt.failed === 1 ? '' : 's'} failed.`);
  }
  if (receipt.retried > 0) {
    issues.push(`${receipt.retried} due job${receipt.retried === 1 ? '' : 's'} retried instead of completing.`);
  }
  if (receipt.processed === 0) {
    warnings.push('No due jobs were available, so this proves the worker can start but not that it can complete a file_claim job.');
  }
  if (receipt.processed > 0 && receipt.succeeded === 0 && issues.length === 0) {
    warnings.push('Due jobs were processed, but none completed successfully.');
  }
  if (receipt.processed > 0 && (fileClaim?.succeeded ?? 0) === 0 && issues.length === 0) {
    warnings.push('No file_claim job completed, so this is not paid full-automation launch proof.');
  }

  const status: WorkerSmokeStatus = issues.length > 0
    ? 'fail'
    : warnings.length > 0
      ? 'warn'
      : 'pass';

  return {
    status,
    fileClaimProofUsable: status === 'pass' && (fileClaim?.succeeded ?? 0) > 0,
    issues,
    warnings,
    statusDetail: status === 'pass'
      ? `Worker completed ${fileClaim?.succeeded ?? 0} file_claim job${fileClaim?.succeeded === 1 ? '' : 's'} without retry or failure.`
      : [...issues, ...warnings].join(' '),
  };
}

export function buildWorkerSmokeReceipt(args: {
  generatedAt: string;
  runtime: string;
  database: WorkerSmokeDatabase;
  receipt: WorkerRunReceipt;
}) {
  const evaluation = evaluateWorkerSmokeReceipt(args.receipt);
  const hostedDatabaseBacked = args.database.configured
    && args.database.kind !== 'missing'
    && args.database.kind !== 'local-file';
  const launchProofUsable = evaluation.fileClaimProofUsable && hostedDatabaseBacked;

  return {
    format: 'claimbot.worker-smoke-receipt.v1',
    generatedAt: args.generatedAt,
    status: evaluation.status,
    statusDetail: evaluation.statusDetail,
    fileClaimProofUsable: evaluation.fileClaimProofUsable,
    launchProofUsable,
    issues: evaluation.issues,
    warnings: hostedDatabaseBacked
      ? evaluation.warnings
      : [
        ...evaluation.warnings,
        'This worker smoke did not run against hosted storage, so it is not hosted launch proof.',
      ],
    runtime: args.runtime,
    database: args.database,
    receipt: args.receipt,
    approvalBoundary: {
      nonSecretReceipt: true,
      doesNotPrintDatabaseUrl: true,
      doesNotApproveLaunchByItself: true,
      requiresDueJobCompletionForLaunchProof: true,
      requiresFileClaimCompletionForLaunchProof: true,
      requiresHostedDatabaseForLaunchProof: true,
      nextProof: 'Record CLAIMBOT_WORKER_RUNTIME and CLAIMBOT_WORKER_RUNTIME_RECEIPT=verified only after this smoke ran against the hosted database and completed at least one due file_claim job without retry or failure.',
    },
  };
}
