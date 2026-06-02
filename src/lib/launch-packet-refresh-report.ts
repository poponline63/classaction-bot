import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type LaunchPacketRefreshCommandResult = {
  key: string;
  label: string;
  command: string;
  ok: boolean;
  durationMs: number;
};

export type LaunchPacketRefreshReportSummary = {
  exists: boolean;
  ready: boolean;
  generatedAt: string | null;
  passed: number;
  total: number;
  failed: number;
  totalDurationMs: number;
  boundary: string;
  path: string;
  commands: LaunchPacketRefreshCommandResult[];
};

const defaultBoundary =
  'Launch packet refresh has not been generated yet. Run npm run launch:refresh:packets to refresh non-secret packet evidence.';

export function readLaunchPacketRefreshReport(root = process.cwd()): LaunchPacketRefreshReportSummary {
  const reportPath = path.join(root, 'data', 'launch-packet-refresh-report.json');
  if (!existsSync(reportPath)) {
    return {
      exists: false,
      ready: false,
      generatedAt: null,
      passed: 0,
      total: 0,
      failed: 0,
      totalDurationMs: 0,
      boundary: defaultBoundary,
      path: 'data/launch-packet-refresh-report.md',
      commands: [],
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(reportPath, 'utf8')) as {
      generatedAt?: string;
      boundary?: string;
      summary?: {
        total?: number;
        passed?: number;
        failed?: number;
        totalDurationMs?: number;
      };
      results?: LaunchPacketRefreshCommandResult[];
    };
    const commands = Array.isArray(parsed.results) ? parsed.results : [];
    const total = Number(parsed.summary?.total ?? commands.length);
    const failed = Number(parsed.summary?.failed ?? commands.filter((command) => !command.ok).length);

    return {
      exists: true,
      ready: failed === 0 && total > 0,
      generatedAt: parsed.generatedAt ?? null,
      passed: Number(parsed.summary?.passed ?? commands.filter((command) => command.ok).length),
      total,
      failed,
      totalDurationMs: Number(parsed.summary?.totalDurationMs ?? 0),
      boundary: parsed.boundary ?? defaultBoundary,
      path: 'data/launch-packet-refresh-report.md',
      commands,
    };
  } catch {
    return {
      exists: true,
      ready: false,
      generatedAt: null,
      passed: 0,
      total: 0,
      failed: 1,
      totalDurationMs: 0,
      boundary: 'Launch packet refresh report exists, but ClaimBot could not parse it. Regenerate it with npm run launch:refresh:packets.',
      path: 'data/launch-packet-refresh-report.md',
      commands: [],
    };
  }
}
