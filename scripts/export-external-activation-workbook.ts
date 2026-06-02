import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { ensureSingleUser } from '../src/db/seed';
import {
  buildExternalActivationWorkbook,
  markdownExternalActivationWorkbook,
} from '../src/lib/external-activation-workbook';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'external-activation-workbook.json');
const markdownPath = path.join(outputDir, 'external-activation-workbook.md');

async function main() {
  const userId = await ensureSingleUser();
  const packet = await buildExternalActivationWorkbook(userId);
  const markdown = markdownExternalActivationWorkbook(packet);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[external-activation-workbook] wrote non-secret activation workbook');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Account scope: ClaimBot account #${packet.accountScope.accountId}`);
  console.log(`Blocked workstreams: ${packet.readiness.blockedWorkstreamCount}/${packet.readiness.workstreamCount}`);
  console.log(`Codex-owned product work ready: ${packet.clientPreviewChecklistSummary.codexProductReady ? 'yes' : 'no'}`);
  console.log(`External product blockers: ${packet.clientPreviewChecklistSummary.externalProductBlockerCount}`);
  console.log(`Launch packets ready: ${packet.readiness.launchPacketReadyCount}/${packet.readiness.launchPacketTotalCount}`);
  console.log('No secret values were printed.');
}

main().catch((error) => {
  console.error('[external-activation-workbook] failed');
  console.error(error);
  process.exit(1);
});
