import 'dotenv/config';
import { ensureSingleUser } from '../src/db/seed';
import { readLatestMatcherRunReceipt } from '../src/lib/audit/support-packet';
import { runMatcher } from '../src/lib/matcher/run-matcher';

async function main() {
  const userId = await ensureSingleUser();
  const result = await runMatcher(userId);
  const receipt = await readLatestMatcherRunReceipt(userId);
  const errorCount = result.errors.length;

  const summary = {
    ok: receipt.exists && receipt.errorCount === 0,
    eventType: receipt.eventType,
    auditEventId: receipt.auditEventId,
    occurredAt: receipt.occurredAt,
    settlementsProcessed: result.settlementsProcessed,
    matchesInserted: result.matchesInserted,
    matchesUpdated: result.matchesUpdated,
    verdictsChanged: result.verdictsChanged,
    verdictCounts: result.verdictCounts,
    errorCount,
    note: 'Non-secret matcher receipt summary. Profile facts, purchases, breaches, and matcher traces are not printed.',
  };

  console.log(JSON.stringify(summary, null, 2));

  if (errorCount > 0) {
    console.error('[matcher-receipt] matcher completed with errors; inspect the account support packet before client preview.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[matcher-receipt] failed');
  console.error(error);
  process.exit(1);
});
