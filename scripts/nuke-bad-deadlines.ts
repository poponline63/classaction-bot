// Null out any deadlines in the past — those are almost certainly
// class-period endpoints that the pre-fix scraper shoved into the deadline
// column. The real deadline will be repopulated by a fresh scrape.

import 'dotenv/config';
import { db, schema } from '../src/db/client';
import { lt } from 'drizzle-orm';

async function main() {
  const res = await db
    .update(schema.settlements)
    .set({ deadline: null })
    .where(lt(schema.settlements.deadline, new Date()))
    .returning({ id: schema.settlements.id });
  console.log(`[nuke] nulled ${res.length} past deadlines`);
}
main().catch((e) => { console.error(e); process.exit(1); });
