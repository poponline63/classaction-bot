import 'dotenv/config';
import { getDatabaseSchemaReadiness } from '../src/lib/database-schema-readiness';

async function main() {
  const readiness = await getDatabaseSchemaReadiness();

  if (!readiness.ok) {
    console.error('[validate-database-schema] failed');
    for (const failure of readiness.failures) {
      console.error(`- ${failure.label}: ${failure.detail}`);
    }
    console.error('next step: npm run db:migrate');
    process.exit(1);
  }

  console.log('[validate-database-schema] ok');
  for (const item of readiness.items) {
    console.log(`- ${item.label}: ${item.status}`);
  }
}

main().catch((error) => {
  console.error('[validate-database-schema] failed');
  console.error(error);
  process.exit(1);
});
