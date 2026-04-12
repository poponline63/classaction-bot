import 'dotenv/config';
import { db, schema } from '../src/db/client';

async function main() {
  const rows = await db.select().from(schema.settlements);
  const withDeadline = rows.filter((r) => r.deadline).length;
  const withClassPeriod = rows.filter((r) => r.classPeriodStart).length;
  const noProof = rows.filter((r) => !r.proofRequired).length;
  const categorized = rows.filter((r) => r.category !== 'UNKNOWN').length;
  const knownAdmin = rows.filter((r) => r.administrator !== 'unknown').length;

  console.log('total settlements:', rows.length);
  console.log('  with deadline:  ', withDeadline);
  console.log('  with class period:', withClassPeriod);
  console.log('  no proof required:', noProof);
  console.log('  categorized:    ', categorized);
  console.log('  known admin:    ', knownAdmin);

  const catCounts = new Map<string, number>();
  for (const r of rows) catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1);
  console.log('\ncategory breakdown:');
  for (const [cat, n] of [...catCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${n}`);
  }

  console.log('\nfirst 8 samples:');
  for (const r of rows.slice(0, 8)) {
    const start = r.classPeriodStart?.toISOString().slice(0, 10) ?? '—';
    const end = r.classPeriodEnd?.toISOString().slice(0, 10) ?? '—';
    console.log(
      ` - ${r.caseName.slice(0, 55)} | ${r.category} | ${start} → ${end} | admin:${r.administrator}`,
    );
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
