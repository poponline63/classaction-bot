import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { db, schema } from '@db/client';
import { writeAudit } from '@lib/audit';
import { normalizeDefendant } from '@lib/scraper/normalize';
import { setSetting } from '@lib/settings';

const outputDir = path.join(process.cwd(), 'data');
const outputPath = path.join(outputDir, 'worker-file-claim-smoke-seed.json');

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function clean(value: string | undefined) {
  return value?.trim() ?? '';
}

function smokeFormUrl() {
  const explicit = clean(readArg('form-url')) || clean(process.env.CLAIMBOT_WORKER_SMOKE_FORM_URL);
  if (explicit) return explicit;

  const base = clean(process.env.SMOKE_BASE_URL).replace(/\/+$/, '');
  if (base) return `${base}/smoke/claim-form`;

  return '';
}

function isLocalHost(url: URL) {
  return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
}

function assertAllowed(formUrl: URL) {
  const allowed = hasFlag('allow') || process.env.CLAIMBOT_WORKER_SMOKE_SEED === 'allow';
  if (!allowed) {
    throw new Error('Refusing to seed a file_claim smoke job until CLAIMBOT_WORKER_SMOKE_SEED=allow or --allow is provided.');
  }

  const httpAllowed = hasFlag('allow-http') || isLocalHost(formUrl);
  if (formUrl.protocol !== 'https:' && !httpAllowed) {
    throw new Error('Hosted worker smoke form URL must be HTTPS. Use --allow-http only for localhost development.');
  }
}

function describeUrl(url: URL) {
  return {
    protocol: url.protocol.replace(':', ''),
    host: url.host,
    pathname: url.pathname,
    https: url.protocol === 'https:',
    local: isLocalHost(url),
  };
}

async function main() {
  const rawFormUrl = smokeFormUrl();
  if (!rawFormUrl) {
    throw new Error('Set SMOKE_BASE_URL or CLAIMBOT_WORKER_SMOKE_FORM_URL before seeding the worker file_claim smoke job.');
  }

  const formUrl = new URL(rawFormUrl);
  assertAllowed(formUrl);

  await setSetting('claim_filer_mode', 'shadow');

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const email = `claimbot-worker-smoke+${stamp}@example.com`;

  const users = await db.insert(schema.users).values({
    email,
    displayName: 'ClaimBot Worker Smoke',
    subscriptionPlan: 'pro',
    subscriptionStatus: 'active',
    subscriptionUpdatedAt: new Date(),
  }).returning();
  const user = users[0];
  if (!user) throw new Error('Failed to create smoke user.');

  await db.insert(schema.profile).values({
    userId: user.id,
    legalName: 'Worker Smoke Tester',
    emailsJson: ['worker-smoke@example.com'],
    phonesJson: ['555-010-9000'],
    addressesJson: [{
      street: '100 Smoke Test Lane',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85001',
      country: 'US',
    }],
  });

  const settlements = await db.insert(schema.settlements).values({
    canonicalKey: `claimbot-worker-file-claim-smoke-${stamp}`,
    source: 'manual',
    sourceUrl: formUrl.origin,
    caseName: 'ClaimBot Hosted Worker Smoke Fixture',
    defendant: 'ClaimBot Smoke Fixture',
    defendantAliases: ['ClaimBot Worker Smoke'],
    category: 'CONSUMER_PRODUCT_PURCHASE',
    classDefinition: 'Synthetic ClaimBot smoke users who need a hosted worker file_claim proof run.',
    classPeriodStart: new Date('2024-01-01T00:00:00.000Z'),
    classPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
    deadline: new Date('2027-12-31T00:00:00.000Z'),
    proofRequired: false,
    claimFormUrl: formUrl.toString(),
    administrator: 'unknown',
    captchaType: 'none',
    status: 'ENRICHED',
  }).returning();
  const settlement = settlements[0];
  if (!settlement) throw new Error('Failed to create smoke settlement.');

  await db.insert(schema.purchases).values({
    userId: user.id,
    merchant: 'ClaimBot Smoke Fixture',
    merchantNormalized: normalizeDefendant('ClaimBot Smoke Fixture'),
    productName: 'Hosted worker smoke product',
    category: 'CONSUMER_PRODUCT_PURCHASE',
    purchaseDate: new Date('2025-01-15T00:00:00.000Z'),
    amount: 1,
    source: 'manual',
  });

  const authorizations = await db.insert(schema.classAuthorizations).values({
    userId: user.id,
    category: 'CONSUMER_PRODUCT_PURCHASE',
    enabled: true,
    authorizedAt: new Date(),
    attestationText: 'I authorize ClaimBot to run this synthetic hosted worker file_claim smoke in shadow mode only.',
    attestationVersion: 1,
    scopeConstraintsJson: {
      smokeOnly: true,
      liveSubmissionForbidden: true,
    },
  }).returning();
  const authorization = authorizations[0];
  if (!authorization) throw new Error('Failed to create smoke authorization.');

  const matches = await db.insert(schema.matches).values({
    userId: user.id,
    settlementId: settlement.id,
    verdict: 'ELIGIBLE',
    confidence: 0.99,
    reasoningJson: {
      source: 'hosted-worker-file-claim-smoke-seed',
      synthetic: true,
      proofBoundary: 'worker-runtime-only',
    },
    matchedFieldsJson: ['synthetic-smoke-fixture'],
    requiredCategory: 'CONSUMER_PRODUCT_PURCHASE',
  }).returning();
  const match = matches[0];
  if (!match) throw new Error('Failed to create smoke match.');

  const claims = await db.insert(schema.claims).values({
    userId: user.id,
    settlementId: settlement.id,
    matchId: match.id,
    classAuthorizationId: authorization.id,
    status: 'QUEUED',
  }).returning();
  const claim = claims[0];
  if (!claim) throw new Error('Failed to create smoke claim.');

  const jobs = await db.insert(schema.jobs).values({
    userId: user.id,
    type: 'file_claim',
    payloadJson: {
      claimId: claim.id,
      automationMode: 'full_guarded',
      workerCadence: 'automatic_polling',
      smoke: 'hosted-worker-file-claim',
    },
    priority: 1,
    runAfter: new Date(Date.now() - 1000),
    maxAttempts: 1,
  }).returning();
  const job = jobs[0];
  if (!job) throw new Error('Failed to create smoke worker job.');

  await writeAudit({
    userId: user.id,
    eventType: 'CLAIM_QUEUED',
    entityType: 'claim',
    entityId: claim.id,
    payload: {
      matchId: match.id,
      settlementId: settlement.id,
      jobId: job.id,
      automationMode: 'full_guarded',
      workerCadence: 'automatic_polling',
      smoke: 'hosted-worker-file-claim',
    },
    actor: 'system',
  });

  await writeAudit({
    userId: user.id,
    eventType: 'JOB_ENQUEUED',
    entityType: 'job',
    entityId: job.id,
    payload: {
      type: 'file_claim',
      claimId: claim.id,
      matchId: match.id,
      settlementId: settlement.id,
      automationMode: 'full_guarded',
      workerCadence: 'automatic_polling',
      smoke: 'hosted-worker-file-claim',
    },
    actor: 'system',
  });

  const receipt = {
    format: 'claimbot.worker-file-claim-smoke-seed.v1',
    generatedAt: new Date().toISOString(),
    status: 'pass',
    mode: 'shadow',
    formUrl: describeUrl(formUrl),
    seeded: {
      userId: user.id,
      settlementId: settlement.id,
      matchId: match.id,
      authorizationId: authorization.id,
      claimId: claim.id,
      jobId: job.id,
      jobType: 'file_claim',
      jobStatus: job.status,
      runAfter: job.runAfter.toISOString(),
    },
    approvalBoundary: {
      syntheticSmokeOnly: true,
      nonSecretReceipt: true,
      liveSubmissionForbidden: true,
      workerRuntimeProofStillRequires: 'Run npm run worker:once against this same database and preserve data/worker-smoke-receipt.json with file_claim succeeded > 0.',
    },
    nextCommands: [
      'npm run worker:once -- --limit=1',
      'npm run worker:packet',
      'npm run launch:handoff',
    ],
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);

  console.log('[worker-file-claim-smoke-seed] wrote non-secret seed receipt');
  console.log(`JSON: ${path.relative(process.cwd(), outputPath)}`);
  console.log('Status: pass');
  console.log(`Seeded file_claim job: ${job.id}`);
  console.log(`Claim: ${claim.id}`);
  console.log(`Form host: ${formUrl.host}`);
  console.log('Next: npm run worker:once -- --limit=1');
  console.log('No secret values were printed.');
}

main().catch((error) => {
  console.error('[worker-file-claim-smoke-seed] failed');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
