import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expectedSafeNetlifyEnvKeys } from '../../src/lib/netlify-project-setup-receipt';

const roots: string[] = [];
const repoRoot = process.cwd();
const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const scriptPath = path.join(repoRoot, 'scripts', 'record-netlify-project-setup.ts');

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-netlify-recorder-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.netlify'), { recursive: true });
  fs.writeFileSync(path.join(root, '.netlify', 'state.json'), JSON.stringify({
    siteId: '40fd46c0-14d2-41b2-8538-b918109b7dcb',
    siteName: 'claimbot-app',
    adminUrl: 'https://app.netlify.com/projects/claimbot-app',
  }, null, 2));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('record-netlify-project-setup', () => {
  it('writes a non-secret receipt with operator-confirmed Identity proof', () => {
    const root = makeTempRoot();
    const result = spawnSync(process.execPath, [
      tsxCli,
      scriptPath,
      '--identity-enabled',
      '--registration',
      'invite-only',
      '--email-confirmation',
      '--safe-env-confirmed',
      '--evidence',
      'Identity enabled, invite-only registration, and email confirmation confirmed in Netlify dashboard Project configuration > Identity.',
    ], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAIMBOT_SESSION_SECRET: 'do-not-print-this-session-secret',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[netlify-project-setup] wrote non-secret setup receipt');
    expect(result.stdout).not.toContain('do-not-print-this-session-secret');

    const receipt = JSON.parse(fs.readFileSync(path.join(root, 'data', 'netlify-project-setup-receipt.json'), 'utf8'));
    expect(receipt).toMatchObject({
      format: 'claimbot.netlify-project-setup-receipt.v1',
      siteName: 'claimbot-app',
      dashboardUrl: 'https://app.netlify.com/projects/claimbot-app',
      identity: {
        enabled: true,
        registration: 'invite-only',
        emailConfirmation: true,
        evidence: 'Identity enabled, invite-only registration, and email confirmation confirmed in Netlify dashboard Project configuration > Identity.',
      },
    });
    expect(receipt.configuredSafeEnvKeys).toEqual([...expectedSafeNetlifyEnvKeys]);
  });

  it('rejects weak Identity proof before writing a ready receipt', () => {
    const root = makeTempRoot();
    const result = spawnSync(process.execPath, [
      tsxCli,
      scriptPath,
      '--identity-enabled',
      '--registration',
      'open',
      '--evidence',
      'Looks good.',
    ], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Identity proof is incomplete');
    expect(fs.existsSync(path.join(root, 'data', 'netlify-project-setup-receipt.json'))).toBe(false);
  });

  it('fails until a confirmed Netlify site target is available', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-netlify-recorder-'));
    roots.push(root);
    const result = spawnSync(process.execPath, [
      tsxCli,
      scriptPath,
      '--identity-enabled',
      '--registration',
      'invite-only',
      '--email-confirmation',
      '--evidence',
      'Identity enabled, invite-only registration, and email confirmation confirmed in Netlify dashboard Project configuration > Identity.',
    ], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing confirmed Netlify site metadata');
  });
});
