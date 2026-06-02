import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { ensureSingleUser } from '../src/db/seed';
import {
  buildLaunchHandoffReport,
  markdownLaunchHandoffReport,
} from '../src/lib/launch-handoff-report';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'launch-handoff-report.json');
const markdownPath = path.join(outputDir, 'launch-handoff-report.md');

async function main() {
  const userId = await ensureSingleUser();
  const report = await buildLaunchHandoffReport(userId);
  const markdown = markdownLaunchHandoffReport(report);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);

  console.log('[launch-handoff] wrote non-secret operator handoff');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Account scope: ClaimBot account #${report.accountScope.accountId}`);
  console.log(`Client preview ready: ${report.summary.clientPreviewReady ? 'yes' : 'no'}`);
  console.log(`Blockers: ${report.summary.blockerCount}`);
  console.log(`Warnings: ${report.summary.warningCount}`);
  console.log(`Codex-owned product work ready: ${report.summary.codexProductReady ? 'yes' : 'no'}`);
  console.log(`External product blockers: ${report.summary.externalProductBlockerCount}`);
  console.log(`Launch packets ready: ${report.summary.launchPacketReadyCount}/${report.summary.launchPacketTotalCount}`);
  console.log('No secret values were printed.');
}

main().catch((error) => {
  console.error('[launch-handoff] failed');
  console.error(error);
  process.exit(1);
});
