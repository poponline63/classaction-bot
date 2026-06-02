import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { ensureSingleUser } from '../src/db/seed';
import {
  buildClientPreviewChecklist,
  markdownClientPreviewChecklist,
} from '../src/lib/client-preview-checklist';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'client-preview-checklist.json');
const markdownPath = path.join(outputDir, 'client-preview-checklist.md');

async function main() {
  const userId = await ensureSingleUser();
  const packet = await buildClientPreviewChecklist(userId);
  const markdown = markdownClientPreviewChecklist(packet);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[client-preview-checklist] wrote non-secret client preview checklist');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Client preview ready: ${packet.summary.clientPreviewReady ? 'yes' : 'no'}`);
  console.log(`Account scope: ClaimBot account #${packet.accountScope.accountId}`);
  console.log(`Product requirements ready: ${packet.summary.readyCount}/${packet.summary.totalCount}`);
  console.log(`Codex-owned product work ready: ${packet.summary.codexProductReady ? 'yes' : 'no'}`);
  console.log(`External product blockers: ${packet.summary.externalProductBlockerCount}`);
  console.log(`Launch packets ready: ${packet.summary.launchPacketReadyCount}/${packet.summary.launchPacketTotalCount}`);
  console.log('No secret values were printed.');
}

main().catch((error) => {
  console.error('[client-preview-checklist] failed');
  console.error(error);
  process.exit(1);
});
