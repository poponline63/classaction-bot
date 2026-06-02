import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const outputDir = path.join(process.cwd(), 'data');
const outputPath = path.join(outputDir, 'local-worker-file-claim-smoke-receipt.json');
const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'forms', 'revitalash-style.html');

function normalizePlaywrightBrowsersPath() {
  const raw = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!raw?.startsWith(':USERPROFILE')) return;
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(os.homedir(), raw.slice(':USERPROFILE'.length));
}

function startFixtureServer() {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/submitted') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body><h1>Thank you</h1><p>Your confirmation number is LOCAL-WORKER-123.</p></body></html>');
      return;
    }

    try {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(fs.readFileSync(fixturePath, 'utf8'));
    } catch (error) {
      res.writeHead(500);
      res.end(error instanceof Error ? error.message : 'fixture read failed');
    }
  });

  return server;
}

async function listen(server: http.Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('fixture server did not return a TCP address');
  }
  return `http://127.0.0.1:${address.port}/`;
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-worker-file-claim-'));
  const tempDbPath = path.join(tempRoot, 'worker-file-claim.db');
  process.env.DATABASE_URL = `file:${tempDbPath}`;
  process.env.DATA_DIR = path.join(tempRoot, 'data');
  process.env.CLAIM_FILER_MODE = 'shadow';
  process.env.CLAIMBOT_BROWSER_HEADLESS = 'true';
  process.env.SINGLE_USER_EMAIL = 'worker-file-claim-smoke@example.com';
  delete process.env.CLAIM_FILER_LIVE_ACK;
  normalizePlaywrightBrowsersPath();

  const server = startFixtureServer();
  let fixtureUrl = '';

  try {
    fixtureUrl = await listen(server);

    const [{ db, schema }, { migrate }, { eq }, { normalizeDefendant }, { runDueJobs }, { buildWorkerSmokeReceipt }, { closeAll }] = await Promise.all([
      import('../src/db/client'),
      import('drizzle-orm/libsql/migrator'),
      import('drizzle-orm'),
      import('../src/lib/scraper/normalize'),
      import('../worker/job-poller'),
      import('../worker/smoke-receipt'),
      import('../src/lib/claim-filer/browser-pool'),
    ]);

    await migrate(db, { migrationsFolder: './drizzle/migrations' });

    const users = await db.insert(schema.users).values({
      email: 'worker-file-claim-smoke@example.com',
      displayName: 'Worker File Claim Smoke',
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
    }).returning();
    const userId = users[0]!.id;

    await db.insert(schema.profile).values({
      userId,
      legalName: 'Jane Q Tester',
      emailsJson: ['jane.tester@example.com'],
      phonesJson: ['555-123-4567'],
      addressesJson: [{
        street: '123 Fake Street',
        city: 'Los Angeles',
        state: 'CA',
        zip: '90001',
        country: 'US',
      }],
    });

    const settlements = await db.insert(schema.settlements).values({
      canonicalKey: `local-worker-file-claim-${Date.now()}`,
      source: 'manual',
      sourceUrl: fixtureUrl,
      caseName: 'RevitaLash Serum Local Worker Filing Smoke',
      defendant: 'RevitaLash',
      defendantAliases: ['RevitaLash Serum'],
      category: 'CONSUMER_PRODUCT_PURCHASE',
      classDefinition: 'All California consumers who purchased RevitaLash lash or brow serums.',
      classPeriodStart: new Date('2017-01-01T00:00:00.000Z'),
      classPeriodEnd: new Date('2025-12-29T00:00:00.000Z'),
      deadline: new Date('2027-12-31T00:00:00.000Z'),
      proofRequired: false,
      claimFormUrl: fixtureUrl,
      administrator: 'unknown',
      captchaType: 'none',
      status: 'ENRICHED',
    }).returning();
    const settlementId = settlements[0]!.id;

    await db.insert(schema.purchases).values({
      userId,
      merchant: 'RevitaLash',
      merchantNormalized: normalizeDefendant('RevitaLash'),
      productName: 'RevitaLash Serum',
      category: 'CONSUMER_PRODUCT_PURCHASE',
      purchaseDate: new Date('2020-06-15T00:00:00.000Z'),
      amount: 89,
      source: 'manual',
    });

    const authorizations = await db.insert(schema.classAuthorizations).values({
      userId,
      category: 'CONSUMER_PRODUCT_PURCHASE',
      enabled: true,
      authorizedAt: new Date(),
      attestationText: 'I authorize ClaimBot to prepare and file supported no-proof consumer product claims when my saved facts support eligibility.',
      attestationVersion: 1,
    }).returning();

    const matches = await db.insert(schema.matches).values({
      userId,
      settlementId,
      verdict: 'ELIGIBLE',
      confidence: 0.95,
      reasoningJson: {
        source: 'local-worker-file-claim-smoke',
      },
      requiredCategory: 'CONSUMER_PRODUCT_PURCHASE',
    }).returning();

    const claims = await db.insert(schema.claims).values({
      userId,
      settlementId,
      matchId: matches[0]!.id,
      classAuthorizationId: authorizations[0]!.id,
      status: 'QUEUED',
    }).returning();
    const claimId = claims[0]!.id;

    const jobs = await db.insert(schema.jobs).values({
      userId,
      type: 'file_claim',
      payloadJson: {
        claimId,
        automationMode: 'full_guarded',
        workerCadence: 'automatic_polling',
        smoke: 'local-worker-file-claim',
      },
      priority: 1,
      maxAttempts: 1,
    }).returning();
    const jobId = jobs[0]!.id;

    const workerReceipt = await runDueJobs({
      limit: 1,
      workerId: 'local-worker-file-claim-smoke',
    });

    const claimRows = await db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId))
      .limit(1);
    const jobRows = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, jobId))
      .limit(1);
    const auditRows = await db
      .select({ eventType: schema.auditLog.eventType })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.userId, userId));

    const claim = claimRows[0]!;
    const job = jobRows[0]!;
    const smokeReceipt = buildWorkerSmokeReceipt({
      generatedAt: new Date().toISOString(),
      runtime: 'local-shadow-worker-file-claim',
      database: {
        configured: true,
        kind: 'local-file',
        authTokenPresent: false,
      },
      receipt: workerReceipt,
    });

    const acceptance = {
      claimFiledInShadowMode: claim.status === 'FILED',
      jobSucceeded: job.status === 'succeeded',
      attestationCaptured: Boolean(claim.submittedAttestationText?.toLowerCase().includes('penalty of perjury')),
      emptyScreenshotExists: Boolean(claim.screenshotEmptyFormPath && fs.existsSync(claim.screenshotEmptyFormPath)),
      filledScreenshotExists: Boolean(claim.screenshotFilledFormPath && fs.existsSync(claim.screenshotFilledFormPath)),
      confirmationSkippedInShadowMode: claim.screenshotConfirmationPath === null,
      expectedAuditEventsPresent: ['CLAIM_PREFLIGHT_PASSED', 'CLAIM_FILING_STARTED', 'CLAIM_FILED', 'JOB_COMPLETED']
        .every((eventType) => auditRows.some((row) => row.eventType === eventType)),
    };

    const ok = Object.values(acceptance).every(Boolean)
      && smokeReceipt.status === 'pass'
      && smokeReceipt.fileClaimProofUsable === true
      && smokeReceipt.launchProofUsable === false;

    const receipt = {
      format: 'claimbot.local-worker-file-claim-smoke-receipt.v1',
      generatedAt: new Date().toISOString(),
      status: ok ? 'pass' : 'fail',
      workerSmoke: smokeReceipt,
      fixture: {
        localFixtureServed: true,
        claimFormUrlShape: 'http://127.0.0.1:<port>/',
      },
      result: {
        userId,
        settlementId,
        matchId: matches[0]!.id,
        claimId,
        jobId,
        claimStatus: claim.status,
        jobStatus: job.status,
        workerProcessed: workerReceipt.processed,
        workerSucceeded: workerReceipt.succeeded,
        fileClaimSucceeded: workerReceipt.jobTypes.file_claim?.succeeded ?? 0,
      },
      acceptance,
      approvalBoundary: {
        nonSecretReceipt: true,
        localCodePathProofOnly: true,
        doesNotPrintProfileFacts: true,
        doesNotPrintDatabaseUrl: true,
        doesNotApproveHostedLaunchByItself: true,
        hostedLaunchStillRequires: 'Run npm run worker:once against hosted storage after a paid command creates a due file_claim job, then preserve the hosted worker smoke artifact.',
      },
    };

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);

    console.log('[local-worker-file-claim-receipt] wrote non-secret local worker file_claim receipt');
    console.log(`JSON: ${path.relative(process.cwd(), outputPath)}`);
    console.log(`Status: ${receipt.status}`);
    console.log(`Claim status: ${claim.status}`);
    console.log(`Job status: ${job.status}`);
    console.log(`File claim succeeded: ${workerReceipt.jobTypes.file_claim?.succeeded ?? 0}`);
    console.log('No profile facts, database URLs, or secret values were printed.');

    await closeAll();
    if (!ok) process.exitCode = 1;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore temp cleanup failures
    }
  }
}

main().catch((error) => {
  console.error('[local-worker-file-claim-receipt] failed');
  console.error(error);
  process.exit(1);
});
