// Run drizzle migrations from ./drizzle/migrations.
import 'dotenv/config';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from '../src/db/client';
import { ensureSingleUser } from '../src/db/seed';

async function main() {
  console.log('[migrate] running migrations');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
  const uid = await ensureSingleUser();
  console.log(`[migrate] done. single user id = ${uid}`);
}

main().catch((err) => {
  console.error('[migrate] fatal:', err);
  process.exit(1);
});
