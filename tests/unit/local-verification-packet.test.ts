import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readLocalVerificationPacket } from '../../src/lib/local-verification-packet';

describe('readLocalVerificationPacket', () => {
  it('reads rendered customer-copy guard evidence from the local verification packet', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-local-verification-'));
    try {
      fs.mkdirSync(path.join(root, 'data'), { recursive: true });
      fs.writeFileSync(path.join(root, 'data/local-verification-packet.json'), `${JSON.stringify({
        generatedAt: '2026-05-30T00:00:00.000Z',
        readiness: {
          ready: true,
          note: 'local checks passed',
        },
        summary: {
          total: 1,
          passed: 1,
          requiredFailures: 0,
          guardFailures: 0,
          totalDurationMs: 1234,
        },
        commandResults: [
          {
            key: 'local-hosted-smoke',
            label: 'Local hosted strict smoke suite',
            command: 'npm run smoke:hosted:local',
            required: true,
            ok: true,
            durationMs: 1234,
          },
        ],
        guardEvidence: {
          customerRenderedCopyGuard: {
            ready: true,
            source: 'scripts/smoke-webapp.cjs',
            command: 'npm run smoke:hosted:local',
            enforcedBy: 'forbiddenCustomerHtmlText + page.content()',
            forbiddenSerializedText: ['CLAIMBOT_', 'DATABASE_URL', '/api/audit', 'Codex can', 'execution boundary', 'operator-owned'],
            note: 'Normal customer pages fail on internal serialized text.',
          },
        },
      })}\n`);

      const packet = readLocalVerificationPacket(root);

      expect(packet.ready).toBe(true);
      expect(packet.guardFailures).toBe(0);
      expect(packet.guardEvidence.customerRenderedCopyGuard).toMatchObject({
        ready: true,
        source: 'scripts/smoke-webapp.cjs',
        command: 'npm run smoke:hosted:local',
      });
      expect(packet.guardEvidence.customerRenderedCopyGuard.forbiddenSerializedText).toContain('DATABASE_URL');
      expect(packet.guardEvidence.customerRenderedCopyGuard.forbiddenSerializedText).toContain('Codex can');
      expect(packet.guardEvidence.customerRenderedCopyGuard.forbiddenSerializedText).toContain('execution boundary');
      expect(packet.guardEvidence.customerRenderedCopyGuard.forbiddenSerializedText).toContain('operator-owned');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('defaults old packets to blocked customer-copy guard evidence', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-local-verification-old-'));
    try {
      fs.mkdirSync(path.join(root, 'data'), { recursive: true });
      fs.writeFileSync(path.join(root, 'data/local-verification-packet.json'), `${JSON.stringify({
        generatedAt: '2026-05-30T00:00:00.000Z',
        readiness: {
          ready: true,
          note: 'old packet',
        },
        summary: {
          total: 0,
          passed: 0,
          requiredFailures: 0,
          totalDurationMs: 0,
        },
        commandResults: [],
      })}\n`);

      const packet = readLocalVerificationPacket(root);

      expect(packet.guardFailures).toBe(1);
      expect(packet.guardEvidence.customerRenderedCopyGuard.ready).toBe(false);
      expect(packet.guardEvidence.customerRenderedCopyGuard.source).toBe('scripts/smoke-webapp.cjs');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('blocks packets when tracked source files changed after generation', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-local-verification-stale-'));
    try {
      fs.mkdirSync(path.join(root, 'data'), { recursive: true });
      fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
      const sourcePath = path.join(root, 'scripts/smoke-webapp.cjs');
      fs.writeFileSync(sourcePath, 'console.log("new smoke guard");\n');
      fs.utimesSync(sourcePath, new Date('2026-05-30T00:00:00.000Z'), new Date('2026-05-30T00:05:00.000Z'));
      fs.writeFileSync(path.join(root, 'data/local-verification-packet.json'), `${JSON.stringify({
        generatedAt: '2026-05-30T00:00:00.000Z',
        readiness: {
          ready: true,
          note: 'local checks passed',
        },
        summary: {
          total: 1,
          passed: 1,
          requiredFailures: 0,
          guardFailures: 0,
          totalDurationMs: 1234,
        },
        commandResults: [
          {
            key: 'local-hosted-smoke',
            label: 'Local hosted strict smoke suite',
            command: 'npm run smoke:hosted:local',
            required: true,
            ok: true,
            durationMs: 1234,
          },
        ],
        sourceEvidence: [
          {
            path: 'scripts/smoke-webapp.cjs',
            exists: true,
            bytes: 32,
            modifiedAt: '2026-05-29T23:00:00.000Z',
          },
        ],
        guardEvidence: {
          customerRenderedCopyGuard: {
            ready: true,
            source: 'scripts/smoke-webapp.cjs',
            command: 'npm run smoke:hosted:local',
            enforcedBy: 'forbiddenCustomerHtmlText + page.content()',
            forbiddenSerializedText: ['CLAIMBOT_'],
            note: 'Normal customer pages fail on internal serialized text.',
          },
        },
      })}\n`);

      const packet = readLocalVerificationPacket(root);

      expect(packet.ready).toBe(false);
      expect(packet.requiredFailures).toBe(1);
      expect(packet.staleSourceFiles).toEqual(['scripts/smoke-webapp.cjs']);
      expect(packet.boundary).toContain('Local verification packet is stale');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
