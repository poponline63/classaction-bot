import 'dotenv/config';
import { db, schema } from '../src/db/client';
import { like } from 'drizzle-orm';

async function main() {
  for (const t of ['Kia', 'Hyundai', 'Sealy', 'G.Skill']) {
    const rows = await db.select({
      d: schema.settlements.defendant,
      n: schema.settlements.caseName,
      a: schema.settlements.defendantAliases
    }).from(schema.settlements).where(like(schema.settlements.caseName, `%${t}%`));
    for (const r of rows) {
      console.log(`${r.n}`);
      console.log(`  defendant: "${r.d}"`);
      console.log(`  aliases: ${JSON.stringify(r.a)}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
