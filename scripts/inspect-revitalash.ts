import 'dotenv/config';
import { db, schema } from '../src/db/client';
import { like } from 'drizzle-orm';

async function main() {
  const rows = await db
    .select()
    .from(schema.settlements)
    .where(like(schema.settlements.caseName, '%RevitaLash%'));
  for (const r of rows) {
    console.log('caseName:', r.caseName);
    console.log('defendant:', r.defendant);
    console.log('classPeriodStart:', r.classPeriodStart);
    console.log('classPeriodEnd:', r.classPeriodEnd);
    console.log('deadline:', r.deadline);
    console.log('classDefinition:', r.classDefinition);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
