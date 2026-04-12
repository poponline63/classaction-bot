import 'dotenv/config';
import { db, schema } from '../src/db/client';
import { desc } from 'drizzle-orm';

async function main() {
  const rows = await db.select().from(schema.settlements).orderBy(desc(schema.settlements.discoveredAt));
  console.log('Total:', rows.length, '\n');
  for (const r of rows) {
    const proof = r.proofRequired ? 'PROOF-REQUIRED' : 'NO-PROOF';
    const period = r.classPeriodStart
      ? r.classPeriodStart.toISOString().slice(0,10) + ' to ' + (r.classPeriodEnd?.toISOString().slice(0,10) ?? '?')
      : 'no period';
    const payout = r.payoutEstimate ?? 'unknown';
    console.log(`${r.caseName}`);
    console.log(`  ${r.category} | ${proof} | payout: ${payout}`);
    console.log(`  period: ${period}`);
    console.log(`  form: ${r.claimFormUrl ?? 'none'}`);
    console.log(`  def: ${r.classDefinition.slice(0, 120)}`);
    console.log();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
