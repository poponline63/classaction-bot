// Fix all defendant fields by re-extracting from case name.
// Also delete orphaned duplicates (old entries with bad canonicalKeys).
import 'dotenv/config';
import { db, schema } from '../src/db/client';
import { sql } from 'drizzle-orm';

function extractDefendant(caseName: string): string {
  let name = caseName
    .replace(/\bclass action\b.*$/i, '')
    .replace(/\bsettlement\b.*$/i, '')
    .trim();
  const dashIdx = name.indexOf(' - ');
  if (dashIdx > 2) {
    name = name.slice(0, dashIdx).trim();
  }
  name = name
    .replace(/\bunwanted (calls|texts)\b.*$/i, '')
    .replace(/\bdata (breach|privacy)\b.*$/i, '')
    .replace(/\b(employee|labor) wages?\b.*$/i, '')
    .replace(/\bjob (postings?|application)\b.*$/i, '')
    .replace(/\boverdraft fees?\b.*$/i, '')
    .replace(/\bCOVID\b.*$/i, '')
    .trim();
  return name;
}

async function main() {
  const all = await db.select().from(schema.settlements);
  let fixed = 0;
  for (const s of all) {
    const newDef = extractDefendant(s.caseName);
    if (newDef !== s.defendant) {
      await db.update(schema.settlements)
        .set({ defendant: newDef })
        .where(sql`id = ${s.id}`);
      console.log(`Fixed: "${s.defendant}" → "${newDef}"`);
      fixed++;
    }
  }
  console.log(`\nFixed ${fixed} defendants`);

  // Remove duplicates: keep the row with the newest discoveredAt for each caseName
  const dupes = await db.all(sql`
    DELETE FROM settlements WHERE id NOT IN (
      SELECT MAX(id) FROM settlements GROUP BY case_name
    )
  `);
  const remaining = await db.select({ n: sql<number>`count(*)` }).from(schema.settlements);
  console.log(`Deduped. ${remaining[0]?.n} settlements remaining.`);
}
main().catch(e => { console.error(e); process.exit(1); });
