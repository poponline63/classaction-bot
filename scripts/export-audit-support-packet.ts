import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { ensureSingleUser } from '../src/db/seed';
import { buildAuditSupportPacket, type AuditSupportFilters } from '../src/lib/audit/support-packet';

const outputDir = path.join(process.cwd(), 'data');
const jsonPath = path.join(outputDir, 'audit-support-packet.json');
const markdownPath = path.join(outputDir, 'audit-support-packet.md');

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();

  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return '';
  return process.argv[index + 1]?.trim() ?? '';
}

function parseOptionalNumber(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function filterValue(name: keyof AuditSupportFilters) {
  const value = getArgValue(name);
  return value.length > 0 ? value : undefined;
}

function eventSummary(event: Record<string, unknown>) {
  return {
    id: typeof event.id === 'number' ? event.id : null,
    eventType: typeof event.eventType === 'string' ? event.eventType : 'UNKNOWN',
    actor: typeof event.actor === 'string' ? event.actor : 'unknown',
    entityType: typeof event.entityType === 'string' ? event.entityType : 'unknown',
    occurredAt: event.occurredAt instanceof Date
      ? event.occurredAt.toISOString()
      : typeof event.occurredAt === 'string'
        ? event.occurredAt
        : null,
  };
}

async function main() {
  const explicitUserId = parseOptionalNumber(getArgValue('user-id'));
  const userId = explicitUserId ?? await ensureSingleUser();
  const filters: AuditSupportFilters = {
    actor: filterValue('actor'),
    entity: filterValue('entity'),
    severity: filterValue('severity'),
  };
  const packet = await buildAuditSupportPacket(userId, filters);
  const launchEvidence = packet.launchEvidence;
  const supportReadiness = {
    ready: true,
    requiredForClientPreview: true,
    eventCount: packet.eventCount,
    checkpoint: packet.checkpoint.short,
    digestAlgorithm: packet.digest.algorithm,
    launchEvidenceReady: launchEvidence.readiness.ok,
    launchEvidenceFailures: launchEvidence.readiness.failureCount,
    launchPacketReadyCount: launchEvidence.launchPacketStack.summary.readyCount,
    launchPacketTotalCount: launchEvidence.launchPacketStack.summary.totalCount,
    fullAutomationBlockedCount: launchEvidence.fullAutomationLaunchBlockers.summary.blockedCount,
    note: 'Local support packet export succeeded. Launch blockers inside the packet still need review before client preview or paid automation promotion.',
  };
  const eventSummaries = (packet.events as Array<Record<string, unknown>>)
    .slice(0, 50)
    .map(eventSummary);

  const markdown = [
    '# ClaimBot Audit Support Packet',
    '',
    `Generated: ${packet.exportedAt instanceof Date ? packet.exportedAt.toISOString() : String(packet.exportedAt)}`,
    '',
    'This local operator export writes the full account support packet JSON to the ignored data directory and keeps this markdown summary to non-secret counts, readiness, digest, and event metadata.',
    '',
    '## Current Gate',
    '',
    `Support packet export: ${supportReadiness.ready ? 'ready' : 'blocked'}`,
    `Account id: ${packet.accountId}`,
    `Events exported: ${packet.eventCount}`,
    `Checkpoint: ${packet.checkpoint.short}`,
    `Digest: ${packet.digest.algorithm}:${packet.digest.value.slice(0, 16)}...`,
    `Launch evidence ready: ${supportReadiness.launchEvidenceReady ? 'yes' : 'no'}`,
    `Launch evidence failures: ${supportReadiness.launchEvidenceFailures}`,
    `Launch packets: ${supportReadiness.launchPacketReadyCount}/${supportReadiness.launchPacketTotalCount}`,
    `Paid automation blockers: ${supportReadiness.fullAutomationBlockedCount}`,
    `Boundary: ${supportReadiness.note}`,
    '',
    '## Applied Filters',
    '',
    `- Actor: ${packet.appliedFilters.actor ?? 'all'}`,
    `- Entity: ${packet.appliedFilters.entity ?? 'all'}`,
    `- Severity: ${packet.appliedFilters.severity ?? 'all'}`,
    '',
    '## Event Summary',
    '',
    ...(eventSummaries.length > 0
      ? eventSummaries.map((event) => `- ${event.occurredAt ?? 'unknown time'} ${event.eventType} (${event.actor} -> ${event.entityType}) id=${event.id ?? 'n/a'}`)
      : ['- No audit events matched the selected filters.']),
    packet.eventCount > eventSummaries.length
      ? `- ${packet.eventCount - eventSummaries.length} additional event summaries are available in the JSON packet.`
      : '',
    '',
    '## JSON Companion',
    '',
    `- ${path.relative(process.cwd(), jsonPath).replace(/\\/g, '/')}: full support packet JSON with digest and launch evidence.`,
    '',
    '## Commands',
    '',
    '- `npm run audit:support:packet`',
    '- `npm run audit:support:packet -- --user-id=1`',
    '- `npm run audit:support:packet -- --severity=attention`',
    '',
  ].filter((line) => line !== '').join('\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(markdownPath, `${markdown}\n`);

  console.log('[audit-support-packet] wrote local audit support packet');
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Markdown: ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`Events exported: ${packet.eventCount}`);
  console.log(`Launch packets: ${supportReadiness.launchPacketReadyCount}/${supportReadiness.launchPacketTotalCount}`);
  console.log(`Launch evidence ready: ${supportReadiness.launchEvidenceReady ? 'yes' : 'no'}`);
  console.log('No secret values were printed. Full account audit details are only in the ignored JSON packet.');
}

main().catch((error) => {
  console.error('[audit-support-packet] failed');
  console.error(error);
  process.exit(1);
});
