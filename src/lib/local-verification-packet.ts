import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export type LocalVerificationCommandResult = {
  key: string;
  label: string;
  command: string;
  required: boolean;
  ok: boolean;
  durationMs: number;
};

export type LocalVerificationPacketSummary = {
  exists: boolean;
  ready: boolean;
  generatedAt: string | null;
  passed: number;
  total: number;
  requiredFailures: number;
  guardFailures: number;
  totalDurationMs: number;
  boundary: string;
  path: string;
  commands: LocalVerificationCommandResult[];
  staleSourceFiles: string[];
  guardEvidence: {
    customerRenderedCopyGuard: {
      ready: boolean;
      source: string;
      command: string;
      enforcedBy: string;
      forbiddenSerializedText: string[];
      note: string;
    };
  };
};

type LocalVerificationSourceEvidence = {
  path?: string;
  exists?: boolean;
  modifiedAt?: string | null;
};

const defaultBoundary =
  'Local verification has not been generated yet. Run npm run local:verify before treating localhost checks as current launch evidence.';

const defaultGuardEvidence: LocalVerificationPacketSummary['guardEvidence'] = {
  customerRenderedCopyGuard: {
    ready: false,
    source: 'scripts/smoke-webapp.cjs',
    command: 'npm run smoke:hosted:local',
    enforcedBy: 'forbiddenCustomerHtmlText + page.content()',
    forbiddenSerializedText: [],
    note: 'Rendered customer-copy guard evidence has not been generated yet.',
  },
};

function findStaleSourceFiles(
  root: string,
  generatedAt: string | null | undefined,
  sourceEvidence: LocalVerificationSourceEvidence[] | undefined,
) {
  if (!generatedAt || !Array.isArray(sourceEvidence)) return [];
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedAtMs)) return [];

  const stale = new Set<string>();
  for (const item of sourceEvidence) {
    if (!item?.path || item.exists === false) continue;
    try {
      const absolutePath = path.join(root, item.path);
      const modifiedAtMs = statSync(absolutePath).mtime.getTime();
      if (modifiedAtMs > generatedAtMs + 1000) {
        stale.add(item.path);
      }
    } catch {
      stale.add(item.path);
    }
  }

  return Array.from(stale);
}

export function readLocalVerificationPacket(root = process.cwd()): LocalVerificationPacketSummary {
  const packetPath = path.join(root, 'data', 'local-verification-packet.json');
  if (!existsSync(packetPath)) {
    return {
      exists: false,
      ready: false,
      generatedAt: null,
      passed: 0,
      total: 0,
      requiredFailures: 0,
      guardFailures: 0,
      totalDurationMs: 0,
      boundary: defaultBoundary,
      path: 'data/local-verification-packet.md',
      commands: [],
      staleSourceFiles: [],
      guardEvidence: defaultGuardEvidence,
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(packetPath, 'utf8')) as {
      generatedAt?: string;
      readiness?: { ready?: boolean; failureCount?: number; note?: string };
      summary?: { total?: number; passed?: number; requiredFailures?: number; guardFailures?: number; totalDurationMs?: number };
      commandResults?: LocalVerificationCommandResult[];
      sourceEvidence?: LocalVerificationSourceEvidence[];
      guardEvidence?: LocalVerificationPacketSummary['guardEvidence'];
    };

    const commands = Array.isArray(parsed.commandResults) ? parsed.commandResults : [];
    const guardEvidence = parsed.guardEvidence?.customerRenderedCopyGuard
      ? parsed.guardEvidence
      : defaultGuardEvidence;
    const staleSourceFiles = findStaleSourceFiles(root, parsed.generatedAt, parsed.sourceEvidence);
    const staleBoundary = staleSourceFiles.length > 0
      ? ` Local verification packet is stale because ${staleSourceFiles.slice(0, 3).join(', ')}${staleSourceFiles.length > 3 ? `, and ${staleSourceFiles.length - 3} more source files` : ''} changed after it was generated. Rerun npm run local:verify.`
      : '';

    return {
      exists: true,
      ready: Boolean(parsed.readiness?.ready) && staleSourceFiles.length === 0,
      generatedAt: parsed.generatedAt ?? null,
      passed: Number(parsed.summary?.passed ?? commands.filter((command) => command.ok).length),
      total: Number(parsed.summary?.total ?? commands.length),
      requiredFailures: Number(parsed.summary?.requiredFailures ?? parsed.readiness?.failureCount ?? 0) + staleSourceFiles.length,
      guardFailures: Number(parsed.summary?.guardFailures ?? (guardEvidence.customerRenderedCopyGuard.ready ? 0 : 1)),
      totalDurationMs: Number(parsed.summary?.totalDurationMs ?? 0),
      boundary: `${parsed.readiness?.note ?? defaultBoundary}${staleBoundary}`,
      path: 'data/local-verification-packet.md',
      commands,
      staleSourceFiles,
      guardEvidence,
    };
  } catch {
    return {
      exists: true,
      ready: false,
      generatedAt: null,
      passed: 0,
      total: 0,
      requiredFailures: 1,
      guardFailures: 1,
      totalDurationMs: 0,
      boundary: 'Local verification packet exists, but ClaimBot could not parse it. Regenerate it with npm run local:verify.',
      path: 'data/local-verification-packet.md',
      commands: [],
      staleSourceFiles: [],
      guardEvidence: defaultGuardEvidence,
    };
  }
}

export function formatLocalVerificationDuration(totalDurationMs: number) {
  if (totalDurationMs <= 0) return 'not recorded';
  const totalSeconds = Math.round(totalDurationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
