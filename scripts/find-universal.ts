import 'dotenv/config';
import { db, schema } from '../src/db/client';

async function main() {
  const rows = await db.select().from(schema.settlements);

  // Broad eligibility: look for settlements with very wide class definitions
  // and no proof required
  for (const r of rows) {
    if (r.proofRequired || !r.claimFormUrl) continue;
    const def = r.classDefinition.toLowerCase();
    const broad =
      /all (persons|individuals|consumers|people|u\.s\.|united states)/.test(def) ||
      /anyone who/.test(def) ||
      /if you (bought|purchased) beef/.test(def) ||
      /if you (used|accessed|visited|logged)/.test(def) ||
      /if you were (enrolled|charged|billed|a subscriber)/.test(def) ||
      /if you (made|placed|ordered) .*(order|purchase|booking)/.test(def) ||
      /if you (received|got) .*(call|text|voicemail|email)/.test(def) ||
      /if you (paid|were charged)/.test(def);
    if (broad) {
      console.log(`${r.caseName}`);
      console.log(`  payout: ${r.payoutEstimate ?? '?'}`);
      console.log(`  cat: ${r.category}`);
      console.log(`  def: ${r.classDefinition.slice(0, 160)}`);
      console.log(`  form: ${r.claimFormUrl}`);
      console.log();
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
