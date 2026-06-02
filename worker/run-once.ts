import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { runDueJobs } from './job-poller';
import { buildWorkerSmokeReceipt } from './smoke-receipt';
import { closeAll as closeBrowsers } from '../src/lib/claim-filer/browser-pool';

function readLimit() {
  const arg = process.argv.find((item) => item.startsWith('--limit='));
  const raw = arg?.slice('--limit='.length) ?? process.env.CLAIMBOT_WORKER_ONCE_LIMIT ?? '5';
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

function receiptPath() {
  const configured = process.env.CLAIMBOT_WORKER_SMOKE_RECEIPT_PATH || 'data/worker-smoke-receipt.json';
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function databaseKind() {
  const raw = process.env.DATABASE_URL ?? '';
  if (raw.startsWith('libsql://')) return 'libsql';
  if (raw.startsWith('postgres://') || raw.startsWith('postgresql://')) return 'postgres';
  if (raw.startsWith('file:')) return 'local-file';
  if (raw.length > 0) return 'configured';
  return 'missing';
}

function runtimeKind() {
  if (process.env.GITHUB_ACTIONS === 'true') return 'github-actions-scheduler';
  if (process.env.NETLIFY === 'true') return 'netlify-runtime';
  return 'local-worker-once';
}

function writeSmokeReceipt(payload: Record<string, unknown>) {
  const target = receiptPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  return target;
}

async function main() {
  const limit = readLimit();
  const receipt = await runDueJobs({
    limit,
    workerId: `worker-once-${process.pid}`,
  });

  const smokeReceipt = buildWorkerSmokeReceipt({
    generatedAt: new Date().toISOString(),
    runtime: runtimeKind(),
    database: {
      configured: Boolean(process.env.DATABASE_URL),
      kind: databaseKind(),
      authTokenPresent: Boolean(process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN),
    },
    receipt,
  });
  const writtenReceiptPath = writeSmokeReceipt(smokeReceipt);

  console.log('[worker-once] receipt');
  console.log(JSON.stringify(receipt, null, 2));
  console.log(`[worker-once] status: ${smokeReceipt.status}`);
  console.log(`[worker-once] detail: ${smokeReceipt.statusDetail}`);
  console.log(`[worker-once] wrote non-secret smoke receipt: ${path.relative(process.cwd(), writtenReceiptPath)}`);

  if (smokeReceipt.status === 'fail') {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('[worker-once] failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBrowsers().catch(() => undefined);
  });
