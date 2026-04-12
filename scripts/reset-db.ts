// Truncate every table (in FK-safe order) without deleting the DB file.
import 'dotenv/config';
import { db, schema } from '../src/db/client';

async function main() {
  await db.delete(schema.claims);
  await db.delete(schema.matches);
  await db.delete(schema.purchases);
  await db.delete(schema.dataBreachExposure);
  await db.delete(schema.classAuthorizations);
  await db.delete(schema.settlements);
  await db.delete(schema.formTemplates);
  await db.delete(schema.profile);
  await db.delete(schema.auditLog);
  await db.delete(schema.jobs);
  // keep users row so single-user id stays stable
  console.log('[reset-db] tables truncated');
}
main().catch((e) => { console.error(e); process.exit(1); });
