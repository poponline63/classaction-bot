import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { launchPacketArtifacts } from './hosted-remediation';

type MatcherReceiptStatus = {
  exists: boolean;
  errorCount: number | null;
  occurredAt?: string | Date | null;
};

export type LaunchPacketArtifactRow = {
  label: string;
  path: string;
  owner: string;
  proof: string;
  command: string;
  ready: boolean;
  tone: 'pass' | 'warn';
  statusLabel: string;
  statusDetail: string;
  missingInputs: string[];
  nextAction: string;
  updatedAtLabel: string;
};

function formatTimestamp(value: Date | string | null | undefined) {
  if (!value) return 'No timestamp recorded';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Timestamp unreadable';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function companionJsonPath(relativePath: string) {
  return relativePath.endsWith('.md')
    ? relativePath.replace(/\.md$/, '.json')
    : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function blockedCheckStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => {
      const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : 'Blocked launch check';
      const detail = typeof item.detail === 'string' && item.detail.trim() ? item.detail.trim() : 'No detail recorded.';
      return `${label}: ${detail}`;
    });
}

function blockedCheckAlreadyCovered(check: string, existing: Set<string>) {
  const label = check.split(':', 1)[0]?.toLowerCase() ?? check.toLowerCase();
  const existingText = Array.from(existing).join('\n').toLowerCase();

  if (existingText.includes(label)) return true;
  if (label.includes('netlify authentication') && existingText.includes('not authenticated')) return true;
  if (label.includes('deployed preview url') && existingText.includes('smoke_base_url is not a deployed https preview url')) return true;
  if (label.includes('preview site alignment') && existingText.includes('does not belong to confirmed netlify site slug')) return true;

  return false;
}

function collectMissingInputs(packet: {
  approvalBoundary?: Record<string, unknown>;
  blockedChecks?: unknown;
  blockers?: unknown;
  readiness?: Record<string, unknown>;
}) {
  const missing = new Set<string>();

  for (const item of stringArray(packet.blockers)) {
    missing.add(item);
  }

  for (const item of blockedCheckStrings(packet.blockedChecks)) {
    if (blockedCheckAlreadyCovered(item, missing)) continue;
    missing.add(item);
  }

  for (const item of stringArray(packet.approvalBoundary?.readyRequires)) {
    missing.add(item);
  }

  for (const item of stringArray(packet.readiness?.missingRequiredEnvKeys)) {
    missing.add(item);
  }

  const requiredOptions = packet.readiness?.requiredOptionStatus;
  if (Array.isArray(requiredOptions)) {
    for (const option of requiredOptions) {
      if (!option || typeof option !== 'object') continue;
      const value = option as Record<string, unknown>;
      if (value.configured === true) continue;
      const envKey = typeof value.envKey === 'string' ? value.envKey : null;
      const label = typeof value.label === 'string' ? value.label : null;
      if (envKey && label) missing.add(`${label}: ${envKey}`);
      else if (envKey) missing.add(envKey);
    }
  }

  const legalAckEnvName = packet.approvalBoundary?.legalAckEnvName;
  const requiredValue = packet.approvalBoundary?.requiredValueAfterReview;
  if (typeof legalAckEnvName === 'string' && typeof requiredValue === 'string') {
    missing.add(`${legalAckEnvName}=${requiredValue} after legal/compliance review`);
  }

  return Array.from(missing);
}

function summarizeMissingInputs(missingInputs: string[]) {
  if (missingInputs.length === 0) return '';
  const visible = missingInputs.slice(0, 3).join('; ');
  const extra = missingInputs.length > 3 ? `; +${missingInputs.length - 3} more` : '';
  return ` Missing inputs: ${visible}${extra}.`;
}

function booleanReadinessFromPacket(packet: unknown): { ready: boolean; label: string; missingInputs: string[] } | null {
  if (!packet || typeof packet !== 'object') return null;
  const value = packet as {
    approvalBoundary?: Record<string, unknown>;
    blockers?: unknown;
    ready?: unknown;
    readiness?: Record<string, unknown>;
    summary?: Record<string, unknown>;
  };
  const missingInputs = collectMissingInputs(value);

  const approvalChecks: Array<[string, string]> = [
    ['hostedDatabaseReady', 'Hosted database readiness'],
    ['operatorSetupReady', 'Operator setup readiness'],
    ['workerRuntimeReady', 'Worker runtime readiness'],
    ['previewPromotionReady', 'Preview promotion readiness'],
    ['currentLegalAckRecorded', 'Legal review acknowledgement'],
    ['paidAutomationSaleReady', 'Paid automation checkout readiness'],
    ['billingReady', 'Billing activation readiness'],
  ];

  for (const [key, label] of approvalChecks) {
    if (typeof value.approvalBoundary?.[key] === 'boolean') {
      return {
        ready: Boolean(value.approvalBoundary[key]),
        label,
        missingInputs,
      };
    }
  }

  if (typeof value.ready === 'boolean') {
    return {
      ready: Boolean(value.ready),
      label: 'Doctor readiness',
      missingInputs,
    };
  }

  if (typeof value.readiness?.ready === 'boolean') {
    return {
      ready: Boolean(value.readiness.ready),
      label: 'Packet readiness',
      missingInputs,
    };
  }

  if (typeof value.readiness?.ok === 'boolean') {
    return {
      ready: Boolean(value.readiness.ok),
      label: 'Packet readiness',
      missingInputs,
    };
  }

  if (typeof value.summary?.clientPreviewReady === 'boolean') {
    return {
      ready: Boolean(value.summary.clientPreviewReady),
      label: 'Client preview readiness',
      missingInputs,
    };
  }

  return null;
}

function packetReadinessStatus(relativePath: string, root: string) {
  const jsonRelativePath = companionJsonPath(relativePath);
  if (!jsonRelativePath) return null;
  const absoluteJsonPath = path.join(root, jsonRelativePath);
  if (!existsSync(absoluteJsonPath)) return null;

  try {
    const readiness = booleanReadinessFromPacket(JSON.parse(readFileSync(absoluteJsonPath, 'utf8')));
    if (!readiness) return null;

    return {
      ready: readiness.ready,
      tone: readiness.ready ? 'pass' as const : 'warn' as const,
      statusLabel: readiness.ready ? 'Packet ready' : 'Packet blocked',
      statusDetail: readiness.ready
        ? `${readiness.label} is clear in the non-secret JSON companion.`
        : `${readiness.label} is still blocked inside the non-secret JSON companion; review the packet before treating this artifact as launch-ready.${summarizeMissingInputs(readiness.missingInputs)}`,
      missingInputs: readiness.ready ? [] : readiness.missingInputs,
    };
  } catch {
    return {
      ready: false,
      tone: 'warn' as const,
      statusLabel: 'Packet unreadable',
      statusDetail: 'The markdown artifact exists, but the non-secret JSON companion could not be parsed.',
      missingInputs: ['Regenerate the packet JSON companion with the matching packet command.'],
    };
  }
}

function fileArtifactStatus(relativePath: string, root = process.cwd()) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    return {
      ready: false,
      tone: 'warn' as const,
      statusLabel: 'Packet missing',
      statusDetail: 'Run the matching packet command to create this non-secret artifact.',
      missingInputs: ['Generate this packet artifact before launch review.'],
      updatedAtLabel: 'Not generated',
    };
  }

  const stat = statSync(absolutePath);
  const readiness = packetReadinessStatus(relativePath, root);
  if (readiness) {
    return {
      ...readiness,
      updatedAtLabel: formatTimestamp(stat.mtime),
    };
  }

  return {
    ready: true,
    tone: 'pass' as const,
    statusLabel: 'Packet present',
    statusDetail: 'The non-secret artifact exists; review its contents for remaining external blockers.',
    missingInputs: [],
    updatedAtLabel: formatTimestamp(stat.mtime),
  };
}

function matcherArtifactStatus(receipt: MatcherReceiptStatus | null | undefined) {
  if (!receipt?.exists) {
    return {
      ready: false,
      tone: 'warn' as const,
      statusLabel: 'Receipt missing',
      statusDetail: 'Run the matcher and export the receipt before relying on client-facing match results.',
      missingInputs: ['Run the matcher receipt export for the current client account.'],
      updatedAtLabel: 'No matcher receipt',
    };
  }

  const hasErrors = receipt.errorCount !== 0;
  return {
    ready: !hasErrors,
    tone: hasErrors ? 'warn' as const : 'pass' as const,
    statusLabel: hasErrors ? 'Errors need review' : 'Receipt ready',
    statusDetail: hasErrors
      ? 'The latest MATCHER_RUN_COMPLETED receipt exists but reports run errors.'
      : 'The latest matcher receipt exists with zero run errors.',
    missingInputs: hasErrors ? ['Review matcher errors and rerun the matcher receipt export.'] : [],
    updatedAtLabel: formatTimestamp(receipt.occurredAt),
  };
}

export function getLaunchPacketArtifactRows(receipt?: MatcherReceiptStatus | null, root = process.cwd()): LaunchPacketArtifactRow[] {
  return launchPacketArtifacts.map((artifact) => {
    const status = artifact.path === 'audit:MATCHER_RUN_COMPLETED'
      ? matcherArtifactStatus(receipt)
      : fileArtifactStatus(artifact.path, root);

    const row = {
      ...artifact,
      ...status,
    };

    return {
      ...row,
      nextAction: getLaunchPacketNextAction(row),
    };
  });
}

export function summarizeLaunchPacketArtifactRows(rows: LaunchPacketArtifactRow[]) {
  const readyRows = rows.filter((row) => row.ready);
  const blockedRows = rows.filter((row) => !row.ready);

  return {
    ready: rows.length > 0 && blockedRows.length === 0,
    readyCount: readyRows.length,
    totalCount: rows.length,
    blockedCount: blockedRows.length,
    readyLabels: readyRows.map((row) => row.label),
    blockedLabels: blockedRows.map((row) => row.label),
    note: 'Packet stack readiness is based on each non-secret packet JSON companion when available; generated markdown alone is not treated as launch-ready proof.',
  };
}

export function getLaunchPacketNextAction(row: Pick<LaunchPacketArtifactRow, 'path' | 'ready' | 'command' | 'missingInputs'>) {
  if (row.ready) {
    return `Keep this packet current by rerunning ${row.command} after any related account, billing, legal, worker, or deploy change.`;
  }

  if (row.path === 'data/hosted-database-packet.md') {
    return 'Connect the hosted database, run hosted migrations and source import checks, then regenerate the hosted database packet.';
  }
  if (row.path === 'data/operator-setup-packet.md') {
    return 'Confirm support contact, source contact, hosted access, security posture, worker proof, and Identity settings, then regenerate the operator packet.';
  }
  if (row.path === 'data/worker-runtime-packet.md') {
    return 'Run a hosted worker smoke on the same hosted database, save the receipt, then regenerate the worker runtime packet.';
  }
  if (row.path === 'data/billing-activation-packet.md') {
    return 'Activate checkout links and protected payment confirmation after legal and worker gates are clear, then regenerate the billing packet.';
  }
  if (row.path === 'data/legal-review-packet.md') {
    return 'Complete legal/compliance review, record the review acknowledgement in the hosted environment, then regenerate the legal packet.';
  }
  if (row.path === 'data/netlify-launch-doctor.md') {
    return 'Log in to Netlify, confirm the linked site, set hosted values and preview URL, then rerun the Netlify doctor.';
  }
  if (row.path === 'data/preview-promotion-packet.md') {
    return 'Deploy an HTTPS preview for the confirmed site, run deployed smokes, save the promotion receipt, then regenerate the preview packet.';
  }
  if (row.path === 'audit:MATCHER_RUN_COMPLETED') {
    return 'Run the matcher receipt export for the current account and confirm it reports zero run errors.';
  }

  const firstMissingInput = row.missingInputs[0];
  return firstMissingInput
    ? `Resolve the first missing input, "${firstMissingInput}", then rerun ${row.command}.`
    : `Rerun ${row.command} and review the packet JSON companion for the remaining blocker.`;
}
