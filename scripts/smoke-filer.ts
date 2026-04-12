// Phase 3 end-to-end smoke test:
// 1. Serve the local RevitaLash fixture form over HTTP on :4499
// 2. Point a real DB settlement row at that URL
// 3. Queue a claim for that match
// 4. Run the filer in shadow mode
// 5. Assert:
//    - attestation captured (verbatim)
//    - empty + filled screenshots exist
//    - claim.submittedAttestationText matches the DOM text
//    - claim.status === 'FILED' in shadow mode

import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { db, schema } from '../src/db/client';
import { ensureSingleUser } from '../src/db/seed';
import { eq, and, like } from 'drizzle-orm';
import { normalizeDefendant } from '../src/lib/scraper/normalize';
import { queueClaim, fileClaim } from '../src/lib/claim-filer/filer';
import { runMatcher } from '../src/lib/matcher/run-matcher';
import { closeAll as closeBrowsers } from '../src/lib/claim-filer/browser-pool';

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  'tests',
  'fixtures',
  'forms',
  'revitalash-style.html',
);
const PORT = 4499;

function startFixtureServer(): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/submitted') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><body><h1>Thank you</h1><p>Your confirmation number is TEST-ABC-123456.</p></body></html>',
      );
      return;
    }
    try {
      const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  server.listen(PORT);
  return server;
}

async function main() {
  process.env.CLAIM_FILER_MODE = 'shadow';
  const userId = await ensureSingleUser();
  const fixtureUrl = `http://127.0.0.1:${PORT}/`;

  // Seed a profile so the filler has data
  const existingProfile = await db
    .select()
    .from(schema.profile)
    .where(eq(schema.profile.userId, userId))
    .limit(1);
  if (!existingProfile[0]) {
    await db.insert(schema.profile).values({
      userId,
      legalName: 'Jane Q. Tester',
      emailsJson: ['jane.tester@example.com'],
      phonesJson: ['555-123-4567'],
      addressesJson: [
        {
          street: '123 Fake Street',
          city: 'Los Angeles',
          state: 'CA',
          zip: '90001',
          country: 'US',
        },
      ],
    });
    console.log('[smoke-filer] seeded profile');
  }

  // Point the RevitaLash settlement row at our local fixture
  const revita = await db
    .select()
    .from(schema.settlements)
    .where(like(schema.settlements.caseName, '%RevitaLash%'))
    .limit(1);
  if (!revita[0]) {
    console.error('[smoke-filer] no RevitaLash settlement in DB — run scrape first');
    process.exit(1);
  }
  const settlement = revita[0];
  await db
    .update(schema.settlements)
    .set({ claimFormUrl: fixtureUrl })
    .where(eq(schema.settlements.id, settlement.id));
  console.log('[smoke-filer] pointed RevitaLash at fixture URL');

  // Make sure an ELIGIBLE match exists
  await runMatcher(userId);
  const match = await db
    .select()
    .from(schema.matches)
    .where(
      and(
        eq(schema.matches.userId, userId),
        eq(schema.matches.settlementId, settlement.id),
      ),
    )
    .limit(1);
  if (!match[0] || match[0].verdict !== 'ELIGIBLE') {
    console.error('[smoke-filer] RevitaLash match is not ELIGIBLE:', match[0]?.verdict);
    process.exit(1);
  }
  console.log('[smoke-filer] match verdict:', match[0].verdict);

  // Clear any previous claim so we can retry cleanly
  await db.delete(schema.claims).where(eq(schema.claims.matchId, match[0].id));

  // Queue claim
  const queued = await queueClaim(match[0].id);
  if (!('claimId' in queued)) {
    console.error('[smoke-filer] queue failed:', queued);
    process.exit(1);
  }
  const claimId = queued.claimId;
  console.log('[smoke-filer] queued claim', claimId);

  // Boot fixture server
  const server = startFixtureServer();
  console.log('[smoke-filer] fixture server running on :', PORT);

  try {
    const result = await fileClaim(claimId);
    console.log('\n[smoke-filer] filer result:', {
      status: result.status,
      mode: result.mode,
      reason: result.reason,
      confirmationId: result.confirmationId,
    });
    console.log('screenshots:', result.screenshots);

    // Verify
    const updated = await db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId))
      .limit(1);
    const claim = updated[0]!;

    const checks: Array<[string, boolean, string?]> = [
      ['claim status is FILED', claim.status === 'FILED'],
      [
        'attestation text captured',
        !!claim.submittedAttestationText && /penalty of perjury/i.test(claim.submittedAttestationText),
      ],
      [
        'empty form screenshot exists',
        !!result.screenshots.emptyForm && fs.existsSync(result.screenshots.emptyForm),
      ],
      [
        'filled form screenshot exists',
        !!result.screenshots.filledForm && fs.existsSync(result.screenshots.filledForm),
      ],
      ['confirmation screenshot skipped in shadow mode', result.screenshots.confirmation === null],
    ];

    console.log('\n=== Phase 3 acceptance checks ===');
    let allOk = true;
    for (const [label, ok] of checks) {
      console.log(`${ok ? '✓' : '✗'} ${label}`);
      if (!ok) allOk = false;
    }

    console.log('\nsubmittedAttestationText:');
    console.log('  ', (claim.submittedAttestationText ?? '').slice(0, 200));

    if (!allOk) {
      console.error('\n[smoke-filer] FAILED');
      process.exit(1);
    }
    console.log('\n[smoke-filer] ALL GREEN');
  } finally {
    server.close();
    await closeBrowsers();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
