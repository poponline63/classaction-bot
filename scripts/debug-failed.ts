import 'dotenv/config';
import { db, schema } from '../src/db/client';
import { like } from 'drizzle-orm';

async function main() {
  const terms = ['Kia', 'Hyundai', 'Sealy', 'G.Skill'];
  for (const t of terms) {
    const rows = await db.select().from(schema.settlements)
      .where(like(schema.settlements.caseName, `%${t}%`));
    for (const r of rows) {
      console.log(r.caseName);
      console.log('  form:', r.claimFormUrl ?? 'NONE');
      console.log('  proof:', r.proofRequired);
      console.log('  category:', r.category);
      console.log('  deadline:', r.deadline?.toISOString() ?? 'none');
      console.log();
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
