import 'dotenv/config';
import { db, schema } from '../src/db/client';
import { eq, desc } from 'drizzle-orm';

async function main() {
  const claims = await db.select({
    claim: schema.claims,
    settlement: schema.settlements,
  }).from(schema.claims)
    .innerJoin(schema.settlements, eq(schema.claims.settlementId, schema.settlements.id))
    .orderBy(desc(schema.claims.queuedAt));

  for (const { claim, settlement } of claims) {
    console.log(`\nClaim #${claim.id} — ${settlement.caseName}`);
    console.log(`  status: ${claim.status}`);
    console.log(`  error: ${claim.lastError ?? 'none'}`);
    console.log(`  form URL: ${settlement.claimFormUrl ?? 'NONE'}`);
    console.log(`  proof required: ${settlement.proofRequired}`);
    console.log(`  category: ${settlement.category}`);

    const audit = await db.select().from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, claim.id))
      .orderBy(desc(schema.auditLog.occurredAt))
      .limit(5);
    for (const a of audit) {
      console.log(`  audit: ${a.eventType} — ${JSON.stringify(a.payloadJson)}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
