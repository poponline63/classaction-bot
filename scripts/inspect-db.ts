// Dev helper: dump DB state so we can verify Phase 1 ingestion.
import 'dotenv/config';
import { db, schema } from '../src/db/client';

async function main() {
  const rows = await db.select().from(schema.settlements);
  console.log(`settlements: ${rows.length}`);
  for (const r of rows) {
    console.log(
      ` - #${r.id} [${r.source}] ${r.caseName} | defendant=${r.defendant} | category=${r.category} | proof=${r.proofRequired} | deadline=${r.deadline?.toISOString().slice(0, 10) ?? '—'}`,
    );
  }
  const audit = await db.select().from(schema.auditLog);
  console.log(`\naudit events: ${audit.length}`);
  for (const a of audit) {
    console.log(` - ${a.eventType} ${a.entityType}#${a.entityId} actor=${a.actor}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
