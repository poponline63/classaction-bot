import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const scriptPath = path.join(process.cwd(), 'scripts', 'push-hosted-env.cjs');

function tempWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claimbot-hosted-env-'));
  fs.writeFileSync(path.join(dir, '.env.launch.local'), [
    'CLAIMBOT_SESSION_SECRET=a-long-generated-session-secret-for-hosted-env-tests',
    'CLAIMBOT_BILLING_SYNC_SECRET=a-long-generated-billing-secret-for-hosted-env-tests',
    '',
  ].join('\n'));
  return dir;
}

function writeHostedEnv(dir: string, extra: string[] = []) {
  fs.writeFileSync(path.join(dir, '.env.hosted.local'), [
    'DATABASE_URL=libsql://claimbot-test.turso.io',
    'DATABASE_AUTH_TOKEN=a-hosted-database-token-for-tests',
    'CLAIM_FILER_MODE=shadow',
    'CLAIM_FILER_MAX_PER_DAY=20',
    'SCRAPER_USER_AGENT=ClaimBot/0.1 (+https://claimbot.example/contact)',
    'CLAIMBOT_SUPPORT_EMAIL=support@claimbot.example',
    'CLAIMBOT_DISABLE_AUTH=false',
    'CLAIMBOT_ENFORCE_CSP=true',
    'CLAIMBOT_FEATURE_SETTLEMENT_SEARCH=true',
    'CLAIMBOT_FEATURE_LIVE_FILING=false',
    ...extra,
    '',
  ].join('\n'));
}

function runHostedEnvDoctor(dir: string, args: string[]) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      NODE_ENV: 'test',
      PATH: process.env.PATH ?? '',
      SystemRoot: process.env.SystemRoot ?? '',
      ComSpec: process.env.ComSpec ?? '',
    } as NodeJS.ProcessEnv,
  });
}

describe('push-hosted-env bootstrap doctor', () => {
  it('allows prerequisite hosted runtime env before final launch proof values exist', () => {
    const dir = tempWorkspace();
    writeHostedEnv(dir);

    const result = runHostedEnvDoctor(dir, ['--check', '--bootstrap']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[hosted-env-bootstrap-doctor] ok');
    expect(result.stdout).toContain('Bootstrap mode only proves prerequisite hosted runtime env can be pushed');
    expect(result.stdout).toContain('CLAIMBOT_WORKER_RUNTIME_RECEIPT is not ready yet');
    expect(result.stdout).toContain('CLAIMBOT_LEGAL_REVIEW_ACK is not ready yet');
    expect(result.stdout).toContain('CLAIMBOT_BILLING_PRO_MONTHLY_URL is not ready yet');
  });

  it('keeps final launch env doctor blocked until proof values exist', () => {
    const dir = tempWorkspace();
    writeHostedEnv(dir);

    const result = runHostedEnvDoctor(dir, ['--check']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CLAIMBOT_WORKER_RUNTIME_RECEIPT is missing or still a placeholder');
    expect(result.stderr).toContain('CLAIMBOT_LEGAL_REVIEW_ACK is missing or still a placeholder');
    expect(result.stderr).toContain('CLAIMBOT_BILLING_PRO_MONTHLY_URL is missing or still a placeholder');
  });

  it('still rejects invalid proof values during bootstrap', () => {
    const dir = tempWorkspace();
    writeHostedEnv(dir, [
      'CLAIMBOT_WORKER_RUNTIME=scheduled-worker',
      'CLAIMBOT_WORKER_RUNTIME_RECEIPT=pending',
    ]);

    const result = runHostedEnvDoctor(dir, ['--check', '--bootstrap']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CLAIMBOT_WORKER_RUNTIME_RECEIPT must be exactly "verified"');
  });
});
